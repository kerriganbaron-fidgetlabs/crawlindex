/**
 * Re-run the health gate over the stored series with the current code.
 *
 * Needed whenever the gate itself changes. A verdict is a function of the thresholds and
 * the logic in force when it ran, so tightening a threshold, adding a check, or fixing a
 * defect leaves historical verdicts describing rules that no longer exist.
 *
 * It was written for exactly that: the first version of the gate compared every run against
 * the last one that *passed*, which is right for a sustained fault and wrong for a one-time
 * step change. A rubric bump legitimately moved the mean 5.6 points, and the gate then
 * quarantined every subsequent night against a baseline that no longer existed. The fix
 * (`runsAgree`) lets a reproduced result establish a new baseline, and this replays it over
 * the days that were already marked.
 *
 * **Only touches the verdict.** Never the measurements. It cannot make a bad run look good,
 * only re-answer the question "did this run look plausible" with the current definition of
 * plausible.
 *
 *   pnpm reassess --dry-run   # print what would change
 *   pnpm reassess             # apply
 */

import { assessRun, lastTrustworthy } from '../lib/health';
import type { DailyStats } from '../lib/dataset';
import { isEntrypoint } from './entrypoint';
import { readChanges, readStats, writeStatsSeries } from './store';

export function reassessSeries(series: DailyStats[], changesByDay: Map<string, number>): DailyStats[] {
  const out: DailyStats[] = [];

  for (let i = 0; i < series.length; i++) {
    const day = { ...series[i] };
    // Rebuild the context each day from the days already re-judged, so a verdict that
    // changes early propagates correctly into the ones after it.
    const baseline = lastTrustworthy(out);
    const lastRun = out.length ? out[out.length - 1] : null;

    const verdict = assessRun(baseline, day, {
      attempted: day.attempted ?? 0,
      succeeded: day.succeeded ?? 0,
      scoreChanges: changesByDay.get(day.day) ?? 0,
      lastRun,
    });

    if (verdict.suspect) {
      day.suspect = true;
      day.suspectReasons = verdict.reasons;
      delete day.baselineMoved;
    } else {
      delete day.suspect;
      if (verdict.baselineMoved) {
        day.baselineMoved = true;
        day.suspectReasons = verdict.reasons;
      } else {
        delete day.suspectReasons;
        delete day.baselineMoved;
      }
    }
    out.push(day);
  }

  return out;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const series = readStats();
  if (!series.length) {
    console.log('No stats series on disk. Nothing to reassess.');
    return;
  }

  const changesByDay = new Map<string, number>();
  for (const c of readChanges()) {
    if (c.kind !== 'score') continue;
    const d = c.changedAt.slice(0, 10);
    changesByDay.set(d, (changesByDay.get(d) ?? 0) + 1);
  }

  const next = reassessSeries(series, changesByDay);

  let changed = 0;
  for (let i = 0; i < series.length; i++) {
    const was = series[i].suspect ? 'quarantined' : 'passed';
    const now = next[i].suspect ? 'quarantined' : next[i].baselineMoved ? 'accepted, baseline moved' : 'passed';
    const moved = was !== (next[i].suspect ? 'quarantined' : 'passed');
    if (moved || Boolean(series[i].baselineMoved) !== Boolean(next[i].baselineMoved)) changed++;
    console.log(`  ${next[i].day}  ${was.padEnd(12)} -> ${now}`);
    if (next[i].suspectReasons?.length && now !== 'passed') {
      for (const r of next[i].suspectReasons!) console.log(`      ${r}`);
    }
  }

  if (!changed) {
    console.log('\nNo verdict changed.');
    return;
  }
  if (dryRun) {
    console.log(`\n${changed} verdict(s) would change. Dry run, nothing written.`);
    return;
  }

  writeStatsSeries(next);
  console.log(`\n${changed} verdict(s) updated. Measurements untouched.`);
}

if (isEntrypoint(import.meta.url)) main();
