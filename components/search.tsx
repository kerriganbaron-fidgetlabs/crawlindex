'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * Domain search.
 *
 * Five thousand domains were indexed and there was no way to look one up. The leaderboard
 * showed a hundred rows and `/check` only helped if you already knew the exact hostname.
 * For an index, that is the single most important missing thing.
 *
 * Runs entirely in the browser against a static JSON file fetched once, on first use. No
 * server, no API route, no query ever leaves the reader's machine, and nothing is logged,
 * which matters for a site whose subject is surveillance of the web.
 *
 * Progressive enhancement: the markup is a real form pointed at `/search`, which works
 * with JavaScript off. The dialog upgrades it in place.
 */

type Row = [string, number, number, string, number];

const FLAG_BLOCKS = 1;
const FLAG_LLMS = 2;
const FLAG_GAP = 4;
const FLAG_PARTIAL = 8;

let cache: Row[] | null = null;
let inflight: Promise<Row[]> | null = null;

async function loadIndex(): Promise<Row[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch('/search-index.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { rows: Row[] }) => {
      cache = j.rows ?? [];
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Rank matches so the obvious answer is first.
 *
 * An exact hostname beats a prefix, a prefix beats a substring, and within a tier the
 * more-visited site wins. Without the rank tiebreak, typing "amazon" surfaces
 * `amazon-adsystem.com` above `amazon.com`, which reads as a broken search.
 */
function search(rows: Row[], q: string, limit = 12): Row[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];

  const scored: Array<{ row: Row; tier: number }> = [];
  for (const row of rows) {
    const d = row[0];
    let tier: number;
    if (d === needle) tier = 0;
    else if (d.startsWith(needle)) tier = 1;
    else if (d.includes(needle)) tier = 2;
    else continue;
    scored.push({ row, tier });
    if (scored.length > 4000) break; // pathological single-letter case, already guarded
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ra = a.row[1] || 1e9;
    const rb = b.row[1] || 1e9;
    return ra - rb;
  });
  return scored.slice(0, limit).map((s) => s.row);
}

function gradeClass(grade: string): string {
  if (grade === 'A' || grade === 'B') return 'text-good border-good';
  if (grade === 'C') return 'text-warn border-warn';
  if (grade === 'D' || grade === 'F') return 'text-bad border-bad';
  return 'text-muted border-rule';
}

export function SearchDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const listId = useId();

  // Only take over the plain form once we know the dialog will work.
  useEffect(() => {
    setEnhanced(typeof HTMLDialogElement !== 'undefined');
  }, []);

  const open = useCallback(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) d.showModal();
    loadIndex().then(setRows).catch(() => setFailed(true));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Command-K, or slash when the reader is not already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const results = rows ? search(rows, q) : [];
  useEffect(() => setActive(0), [q]);

  const go = (domain: string) => {
    window.location.href = `/site/${domain}`;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) go(results[active][0]);
      // Nothing matched, so let the live checker try it. It measures on the spot.
      else if (q.trim()) window.location.href = `/check?domain=${encodeURIComponent(q.trim())}`;
    }
  };

  return (
    <>
      {/*
        Without JavaScript this is the whole feature: a GET form to a real page. The
        button below replaces it only once the dialog is known to be available.
      */}
      {enhanced ? (
        <button
          type="button"
          onClick={open}
          className="flex items-center gap-2 text-sm text-muted border border-rule rounded px-2.5 py-1 hover:border-accent hover:text-accent"
          aria-label="Search the index. Press Control K or slash."
        >
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" strokeLinecap="round" />
          </svg>
          <span>Search</span>
          <kbd className="hidden sm:inline font-mono text-[10px] border border-rule rounded px-1 py-px">/</kbd>
        </button>
      ) : (
        <form method="get" action="/search" className="flex items-center gap-1.5">
          <label htmlFor="q-inline" className="sr-only">
            Search the index
          </label>
          <input
            id="q-inline"
            name="q"
            type="search"
            placeholder="Search a domain"
            className="text-sm border border-rule rounded px-2 py-1 bg-paper text-ink font-mono w-40"
          />
          <button type="submit" className="text-sm border border-rule rounded px-2 py-1 hover:border-accent">
            Go
          </button>
        </form>
      )}

      <dialog
        ref={dialogRef}
        className="cmdk m-0 w-full max-w-xl bg-paper text-ink border border-rule rounded-lg p-0 shadow-2xl fixed left-1/2 top-24 -translate-x-1/2"
        aria-label="Search the index"
        onClose={() => setQ('')}
      >
        <div className="p-3 border-b border-rule flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-muted shrink-0">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" strokeLinecap="round" />
          </svg>
          <label htmlFor="cmdk-input" className="sr-only">
            Domain name
          </label>
          <input
            id="cmdk-input"
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Type a domain, for example bbc.co.uk"
            className="flex-1 bg-transparent outline-none font-mono text-sm py-1"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          />
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="text-xs text-muted border border-rule rounded px-1.5 py-0.5 hover:border-accent hover:text-accent"
          >
            Esc
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {failed ? (
            <p className="p-4 text-sm text-muted">
              The index could not be loaded. <a href="/leaderboard" className="text-accent underline">Browse the leaderboard</a> instead.
            </p>
          ) : q.trim().length < 2 ? (
            <p className="p-4 text-sm text-muted">
              Search {rows ? `${rows.length.toLocaleString()} measured domains` : 'the index'}. A domain
              that is not here can still be measured live on the check page.
            </p>
          ) : results.length === 0 ? (
            <div className="p-4 text-sm">
              <p className="text-muted mb-2">Nothing in the index matches that.</p>
              <a
                href={`/check?domain=${encodeURIComponent(q.trim())}`}
                className="text-accent underline underline-offset-4"
              >
                Measure {q.trim()} live instead
              </a>
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label="Matching domains">
              {results.map(([domain, rank, score, grade, flags], i) => (
                <li
                  key={domain}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`border-b border-rule last:border-0 ${i === active ? 'bg-raised' : ''}`}
                >
                  <a
                    href={`/site/${domain}`}
                    onMouseEnter={() => setActive(i)}
                    className="flex items-center gap-3 px-3 py-2 no-underline"
                  >
                    <span className="font-mono text-sm flex-1 truncate">{domain}</span>
                    {flags & FLAG_GAP ? (
                      <span className="text-[10px] text-bad border border-bad rounded px-1">policy gap</span>
                    ) : null}
                    {flags & FLAG_LLMS ? (
                      <span className="text-[10px] text-muted border border-rule rounded px-1">llms.txt</span>
                    ) : null}
                    {flags & FLAG_BLOCKS ? (
                      <span className="text-[10px] text-muted border border-rule rounded px-1">blocks AI</span>
                    ) : null}
                    {rank ? <span className="tnum text-xs text-muted">#{rank}</span> : null}
                    <span className={`tnum text-xs font-semibold border rounded px-1.5 py-0.5 ${gradeClass(grade)}`}>
                      {score < 0 ? '--' : score}
                      {grade}
                      {flags & FLAG_PARTIAL ? '*' : ''}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}
