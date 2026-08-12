/**
 * Reading and writing `data/`. The only place that touches the dataset files.
 *
 * Writes are atomic: everything is written to a temporary file in the same directory and
 * renamed over the target. A crawl killed mid-write must never leave a half-written
 * dataset that the next build would happily deploy.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Observation } from '../lib/types';
import type { ChangeRecord, DailyStats, Meta, StoredRecord } from '../lib/dataset';

export const DATA_DIR = join(process.cwd(), 'data');

export type CorpusEntry = {
  domain: string;
  rank: number | null;
  firstSeen: string;
  /** Pinned domains stay in the corpus whatever the ranking says. */
  pinned?: boolean;
  /**
   * How the domain got here. `submitted` entries came in through a GitHub issue and are
   * always pinned, because the Monday reseed rebuilds from Tranco and a submitted domain
   * is usually not in the ranking.
   */
  source?: 'tranco' | 'pinned' | 'submitted';
  consecutiveFailures?: number;
  excluded?: string | null;
};

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function writeAtomic(file: string, contents: string) {
  ensureDir();
  const target = join(DATA_DIR, file);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, target);
}

function readTextOr(file: string, fallback: string): string {
  try {
    return readFileSync(join(DATA_DIR, file), 'utf8');
  } catch {
    return fallback;
  }
}

function parseLines<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as T);
    } catch {
      /* skip a corrupt line rather than lose the file */
    }
  }
  return out;
}

// --- corpus ----------------------------------------------------------------

export const readCorpus = (): CorpusEntry[] =>
  JSON.parse(readTextOr('corpus.json', '[]')) as CorpusEntry[];

export function writeCorpus(entries: CorpusEntry[]) {
  const sorted = [...entries].sort((a, b) => a.domain.localeCompare(b.domain));
  writeAtomic('corpus.json', JSON.stringify(sorted, null, 1) + '\n');
}

// --- observations ----------------------------------------------------------

export const readRecords = (): StoredRecord[] => parseLines<StoredRecord>(readTextOr('domains.jsonl', ''));

/**
 * One record per line, sorted by domain, keys in a stable order.
 *
 * All three properties exist to keep the nightly git commit small. An unsorted or
 * unstable-key file rewrites every line every night and turns a 4MB dataset into
 * gigabytes of history over a year.
 */
export function writeRecords(records: StoredRecord[]) {
  const sorted = [...records].sort((a, b) => a.domain.localeCompare(b.domain));
  const lines = sorted.map((r) =>
    JSON.stringify({
      domain: r.domain,
      rank: r.rank,
      firstSeen: r.firstSeen,
      obs: stableObs(r.obs as Observation),
    }),
  );
  writeAtomic('domains.jsonl', lines.join('\n') + '\n');
}

/**
 * Re-emit an observation with a fixed key order, dropping `access`.
 *
 * `access` is fully implied by tier1Blocked and tier2Blocked, so storing it would add
 * ~600 bytes per record for zero information. `lib/dataset.ts` rebuilds it on load.
 */
function stableObs(o: Observation) {
  return {
    domain: o.domain,
    observedAt: o.observedAt,
    registryVersion: o.registryVersion,
    probeVersion: o.probeVersion,
    vantage: o.vantage,
    reachable: o.reachable,
    httpStatus: o.httpStatus,
    finalUrl: o.finalUrl,
    error: o.error,
    optedOut: o.optedOut,
    https: o.https,
    control: o.control,
    robots: o.robots,
    tier1Blocked: o.tier1Blocked,
    tier2Blocked: o.tier2Blocked,
    cloaking: o.cloaking,
    llmsTxt: o.llmsTxt,
    agentsMd: o.agentsMd,
    structured: o.structured,
    content: o.content,
    signals: o.signals,
    stack: o.stack,
    security: o.security,
  };
}

// --- changes ---------------------------------------------------------------

/** Rolling window. The feed is a "what moved recently" surface, not an archive; git
 *  history holds the full record for anyone who wants it. */
const MAX_CHANGES = 4000;

export const readChanges = (): ChangeRecord[] => parseLines<ChangeRecord>(readTextOr('changes.jsonl', ''));

export function appendChanges(fresh: ChangeRecord[]) {
  const all = [...readChanges(), ...fresh]
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, MAX_CHANGES);
  // Oldest first on disk so appends touch the end of the file and diff small.
  const lines = [...all].reverse().map((c) => JSON.stringify(c));
  writeAtomic('changes.jsonl', lines.join('\n') + '\n');
}

// --- stats -----------------------------------------------------------------

export const readStats = (): DailyStats[] => JSON.parse(readTextOr('stats.json', '[]')) as DailyStats[];

/**
 * Write a day's snapshot.
 *
 * **Refuses to replace a fuller snapshot with a thinner one for the same day**, unless
 * forced. Any second run on the same UTC date used to overwrite the first unconditionally,
 * so a `pnpm crawl --limit 100` smoke test, a manual re-run, or a `workflow_dispatch` with a
 * small limit silently replaced the night's real figures with a 100-domain slice. The only
 * recovery was git history, and nothing said it had happened.
 *
 * A quarantined day is always allowed to be replaced: getting a clean measurement over a
 * suspect one is the point of the re-run.
 */
export function upsertStats(entry: DailyStats, opts: { force?: boolean } = {}) {
  const all = readStats();
  const existing = all.find((s) => s.day === entry.day);

  if (existing && !opts.force && !existing.suspect) {
    const wasFuller = (existing.observed ?? 0) > entry.observed;
    if (wasFuller) {
      console.error(
        `Refusing to overwrite the ${entry.day} snapshot: the stored one measured ` +
          `${existing.observed.toLocaleString()} domains and this run measured ${entry.observed.toLocaleString()}. ` +
          `Pass --force if replacing it is genuinely what you want.`,
      );
      return;
    }
  }

  const next = all.filter((s) => s.day !== entry.day);
  next.push(entry);
  next.sort((a, b) => a.day.localeCompare(b.day));
  writeAtomic('stats.json', JSON.stringify(next, null, 1) + '\n');
}

/**
 * Replace the whole series.
 *
 * Only `worker/reassess.ts` uses this, to rewrite health verdicts after the gate itself
 * changes. Deliberately separate from `upsertStats`, which guards a single day against
 * being downgraded: that guard is about protecting measurements, and this rewrites
 * judgements about measurements. Conflating the two would let a bulk write bypass the
 * downgrade protection.
 */
export function writeStatsSeries(series: DailyStats[]) {
  const sorted = [...series].sort((a, b) => a.day.localeCompare(b.day));
  writeAtomic('stats.json', JSON.stringify(sorted, null, 1) + '\n');
}

// --- sealed monthly reports -------------------------------------------------

/**
 * Write a month's report and never touch it again.
 *
 * The refusal to overwrite is the whole feature. A monthly report that can be regenerated
 * is a template over today's data, which is what this replaced: July's figures used to
 * change in September because the cross-tabs were read live and the change list came from
 * a rolling window that had scrolled past them.
 *
 * Returns false when a seal already exists, which is the normal case on every crawl after
 * the first one of a new month.
 */
export function writeFrozenReport(month: string, contents: unknown): boolean {
  const dir = join(DATA_DIR, 'reports');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const target = join(dir, `${month}.json`);
  if (existsSync(target)) return false;

  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(contents, null, 1) + '\n', 'utf8');
  renameSync(tmp, target);
  return true;
}

// --- meta ------------------------------------------------------------------

export function writeMeta(meta: Meta) {
  writeAtomic('meta.json', JSON.stringify(meta, null, 2) + '\n');
}
