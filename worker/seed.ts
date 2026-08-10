/**
 * Build the domain corpus from the Tranco list, plus pinned domains.
 *
 * Tranco is the right source: a research-grade ranking combining five providers, built to
 * resist the manipulation and day-to-day churn that make Alexa-style lists useless for
 * longitudinal work. The index only means anything if the population is stable enough to
 * compare month over month.
 *
 * Seeding never destroys observations. It writes `corpus.json` only; `domains.jsonl` is
 * the crawler's business.
 *
 *   pnpm seed
 *   pnpm seed --count 20000
 */

import { isIndexable, PINNED_DOMAINS } from '../lib/corpus-rules';
import { normaliseDomain } from '../lib/http';
import { isEntrypoint } from './entrypoint';
import { readCorpus, writeCorpus, type CorpusEntry } from './store';

const TRANCO_LATEST = 'https://tranco-list.eu/api/lists/date/latest';

// The rules moved to `lib/corpus-rules.ts`. This file calls main() on load, so anything
// another module needs from it cannot live here: importing it to reach one predicate
// would kick off a live Tranco fetch and a corpus rewrite as a side effect.
export { EXCLUDE_PATTERNS, isIndexable, PINNED_DOMAINS } from '../lib/corpus-rules';

async function fetchTranco(count: number): Promise<{ listId: string; rows: Array<{ domain: string; rank: number }> }> {
  const metaRes = await fetch(TRANCO_LATEST);
  if (!metaRes.ok) throw new Error(`Tranco list metadata failed: HTTP ${metaRes.status}`);
  const meta = (await metaRes.json()) as { list_id: string; available: boolean };
  if (!meta.available) throw new Error('Tranco reports the latest list is not available yet.');

  // Over-fetch: filtering removes a meaningful slice of the head of the list.
  const res = await fetch(`https://tranco-list.eu/download/${meta.list_id}/${Math.min(1_000_000, count * 3)}`);
  if (!res.ok) throw new Error(`Tranco download failed: HTTP ${res.status}`);
  const csv = await res.text();

  const rows: Array<{ domain: string; rank: number }> = [];
  for (const line of csv.split('\n')) {
    const [rankRaw, domainRaw] = line.trim().split(',');
    if (!rankRaw || !domainRaw) continue;
    const domain = normaliseDomain(domainRaw);
    if (!isIndexable(domain)) continue;
    rows.push({ domain, rank: Number(rankRaw) });
    if (rows.length >= count) break;
  }
  return { listId: meta.list_id, rows };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--count');
  const count = i >= 0 ? Number(args[i + 1]) : 5000;
  if (!Number.isFinite(count) || count < 1) throw new Error('--count must be a positive number');

  const existing = new Map(readCorpus().map((e) => [e.domain, e]));
  const now = new Date().toISOString();

  console.log(`Fetching Tranco top ${count} after filtering...`);
  let ranked: Array<{ domain: string; rank: number }> = [];
  try {
    const { listId, rows } = await fetchTranco(count);
    ranked = rows;
    console.log(`Tranco list ${listId}: ${rows.length} indexable domains.`);
  } catch (e) {
    // A seeding failure must not wipe the corpus or fail the nightly run. The crawler can
    // work perfectly well from yesterday's list.
    console.error(`Tranco fetch failed, keeping the existing corpus: ${e instanceof Error ? e.message : e}`);
    if (!existing.size) throw e;
  }

  const next = new Map<string, CorpusEntry>();

  for (const { domain, rank } of ranked) {
    const prev = existing.get(domain);
    next.set(domain, {
      domain,
      rank,
      firstSeen: prev?.firstSeen ?? now,
      source: 'tranco',
      consecutiveFailures: prev?.consecutiveFailures ?? 0,
      excluded: prev?.excluded ?? null,
    });
  }

  /**
   * Carry every pinned entry through, not only the hardcoded ones.
   *
   * This rebuild starts from Tranco, so anything absent from the ranking disappears unless
   * it is explicitly kept. Domains submitted through a GitHub issue are, almost by
   * definition, not in the top five thousand: without this the Monday reseed would
   * silently delete every submission ever accepted, and the site would keep promising
   * people a permanent page it had quietly thrown away.
   */
  for (const prev of existing.values()) {
    if (!prev.pinned) continue;
    if (!isIndexable(prev.domain)) continue;
    next.set(prev.domain, {
      ...prev,
      pinned: true,
      source: prev.source ?? 'submitted',
      firstSeen: prev.firstSeen ?? now,
    });
  }

  // The publisher's own properties are added last, so they always survive, ranked or not.
  for (const domain of PINNED_DOMAINS) {
    const prev = existing.get(domain);
    next.set(domain, {
      domain,
      rank: prev?.rank ?? null,
      firstSeen: prev?.firstSeen ?? now,
      pinned: true,
      source: 'pinned',
      consecutiveFailures: prev?.consecutiveFailures ?? 0,
      excluded: prev?.excluded ?? null,
    });
  }

  // Retro-apply the exclusion rules. The infrastructure pattern list grows as crawls
  // surface new cases, and entries added under an older list must be dropped.
  let dropped = 0;
  for (const [domain] of next) {
    if (!isIndexable(domain)) {
      next.delete(domain);
      dropped++;
    }
  }

  writeCorpus([...next.values()]);
  console.log(
    `Corpus: ${next.size} domains (${PINNED_DOMAINS.length} pinned)${dropped ? `, ${dropped} dropped as infrastructure` : ''}.`,
  );
}

// Run only when invoked directly. Without this guard, importing anything from this file
// starts a live Tranco fetch and rewrites the corpus as an import side effect, which is
// exactly how the intake worker nearly ended up racing the seeder over one file.
if (isEntrypoint(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
