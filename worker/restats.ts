/**
 * Rebuild the daily snapshot from archived evidence. No network, nothing re-measured.
 *
 * A score is a pure function over a stored observation, so the whole snapshot is derivable
 * from `data/domains.jsonl` at any time. That makes this the right tool for three jobs the
 * crawler is the wrong tool for:
 *
 *  - **A rubric change.** Bumping RUBRIC_VERSION re-scores history by design. Re-deriving is
 *    honest; re-crawling five thousand origins to discover numbers we could compute is not,
 *    and it charges other people's servers for our decision.
 *  - **Recovering a lost snapshot**, as after the provisional series was discarded.
 *  - **Local work**, where a full crawl is fifty minutes and a rebuild is a second.
 *
 * The timestamp comes from the archived observations, never from the clock. A derive step
 * that reads the current time cannot produce the same output twice, which forecloses ever
 * asserting that it does.
 *
 *   pnpm restats            # derive today's snapshot from what is on disk
 *   pnpm restats --dry-run  # print it, write nothing
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withAccess, type StoredRecord } from '../lib/dataset';
import { scoreObservation } from '../lib/score';
import { buildStats } from '../lib/stats';
import { isEntrypoint } from './entrypoint';
import { readCorpus, upsertStats } from './store';

function main() {
  const dryRun = process.argv.includes('--dry-run');

  let lines: string[];
  try {
    lines = readFileSync(join(process.cwd(), 'data', 'domains.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.trim());
  } catch {
    console.error('No data/domains.jsonl. Run `pnpm crawl` first.');
    process.exit(1);
  }

  const rows = [];
  let latestObservedAt = '';
  for (const line of lines) {
    let rec: StoredRecord;
    try {
      rec = JSON.parse(line) as StoredRecord;
    } catch {
      continue; // One corrupt line must not lose the rest.
    }
    const obs = withAccess(rec.obs);
    if (obs.observedAt > latestObservedAt) latestObservedAt = obs.observedAt;
    rows.push({ obs, score: scoreObservation(obs) });
  }

  if (!rows.length) {
    console.error('No parseable records. Nothing to derive.');
    process.exit(1);
  }

  // Dated from the evidence, not from the clock, so running this twice produces the same
  // snapshot and it lands on the day the measurements were actually taken.
  const day = latestObservedAt.slice(0, 10);
  const corpusSize = readCorpus().length;

  const stats = buildStats(
    rows,
    rows.length,
    // Everything here was carried from disk rather than probed just now, and the snapshot
    // should say so rather than implying a crawl happened.
    { attempted: 0, succeeded: 0, crawled: 0, carried: rows.length },
    day,
  );
  // `partial` means "this run covered a slice of the corpus". A full re-derive over every
  // archived record is not partial, whatever the carried count says.
  stats.partial = rows.length < corpusSize;

  console.log(
    `Derived ${day} from ${rows.length.toLocaleString()} archived records ` +
      `(corpus ${corpusSize.toLocaleString()}).`,
  );
  console.log(
    `  observed ${stats.observed.toLocaleString()}  mean ${stats.meanScore}  ` +
      `blocking ${stats.blockingAnyTier1.toLocaleString()}  gaps ${stats.policyGaps?.toLocaleString()}`,
  );

  if (dryRun) {
    console.log('\nDry run, nothing written.');
    return;
  }

  // Force, because re-deriving a day is the explicit intent of running this.
  upsertStats(stats, { force: true });
  console.log('Wrote data/stats.json.');
}

if (isEntrypoint(import.meta.url)) main();
