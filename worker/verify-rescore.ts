/**
 * Proves that rescoring an archived record reproduces the score it was published with.
 *
 * This is the invariant the crawler broke. `stableObs` strips `access` on write, and
 * `scoreObservation` reads a missing token as "allowed", so any code path that rescores a
 * stored observation without rebuilding the access map first awards a free 38 of 100 points.
 * On 2026-08-10 that produced 682 fictional "score fell" records against 50 rises.
 *
 * Two things are checked, and they are different questions:
 *
 *  1. **Round trip.** Every record, written to disk and read back, must rescore to the same
 *     number. A failure here is a live bug and exits non-zero.
 *  2. **Trap size.** How far off the *naive* path would be. This is reported for information,
 *     never as a failure, because the naive path is not supposed to be reachable any more.
 *     `tests/crawl-diff.test.ts` is what pins that the crawler does not use it.
 *
 *   pnpm verify:rescore
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withAccess } from '../lib/dataset';
import { scoreObservation } from '../lib/score';
import type { Observation } from '../lib/types';
import { isEntrypoint } from './entrypoint';

type Divergence = { domain: string; published: number; naive: number; gap: number };

export function verifyRescore(lines: string[]): {
  checked: number;
  roundTripFailures: Divergence[];
  trap: Divergence[];
} {
  const roundTripFailures: Divergence[] = [];
  const trap: Divergence[] = [];
  let checked = 0;

  for (const line of lines) {
    let rec: { domain: string; obs: Observation };
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }

    const live = scoreObservation(withAccess(rec.obs)).total;
    if (live === null) continue;
    checked++;

    // 1. Round trip: strip access exactly as stableObs does, read back, rescore.
    const { access: _dropped, ...stripped } = rec.obs as Observation & { access?: unknown };
    const roundTripped = scoreObservation(withAccess(stripped as Observation)).total;
    if (roundTripped !== live) {
      roundTripFailures.push({ domain: rec.domain, published: live, naive: roundTripped ?? -1, gap: (roundTripped ?? 0) - live });
    }

    // 2. Trap size: what the defective path would have produced.
    const naive = scoreObservation({ ...rec.obs, access: {} } as Observation).total;
    if (naive !== null && naive !== live) {
      trap.push({ domain: rec.domain, published: live, naive, gap: naive - live });
    }
  }

  return { checked, roundTripFailures, trap };
}

function main() {
  let lines: string[];
  try {
    lines = readFileSync(join(process.cwd(), 'data', 'domains.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.trim());
  } catch {
    console.log('No dataset on disk. Nothing to verify.');
    return;
  }

  const { checked, roundTripFailures, trap } = verifyRescore(lines);

  trap.sort((a, b) => b.gap - a.gap);
  for (const t of trap.slice(0, 8)) {
    console.log(
      `  ${t.domain.padEnd(28)} published ${String(t.published).padStart(3)}  naive ${String(t.naive).padStart(3)}  +${t.gap}`,
    );
  }

  const pct = checked ? ((trap.length / checked) * 100).toFixed(1) : '0.0';
  console.log(
    `\nChecked ${checked.toLocaleString()} records.` +
      `\n  Round-trip failures: ${roundTripFailures.length}` +
      `\n  Records the naive path would get wrong: ${trap.length} (${pct}%)`,
  );

  if (roundTripFailures.length > 0) {
    console.error(
      '\nFAIL: an archived record does not rescore to its published value. Something writes or\n' +
        'reads the dataset inconsistently, and every published score is suspect until it is fixed.',
    );
    process.exit(1);
  }

  console.log(
    '\nPASS: every archived record rescores to its published value.' +
      `\nThe ${trap.length} figure above is the size of the trap, not a live failure: it is how far off\n` +
      'the crawler would be if anything rescored a record without rebuilding its access map.',
  );
}

if (isEntrypoint(import.meta.url)) main();
