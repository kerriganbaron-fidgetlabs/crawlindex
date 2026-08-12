/**
 * The nightly crawl.
 *
 * Reads the corpus, probes every domain, scores it, records only genuine changes, and
 * writes the dataset files. No database: the repository is the store, and the commit the
 * Action makes afterwards is both the deploy trigger and the provenance record.
 *
 * Safe to kill at any point. Nothing is written until the whole pass finishes, so a
 * half-finished crawl leaves yesterday's dataset intact and deployed rather than
 * publishing a partial one.
 *
 *   pnpm crawl
 *   pnpm crawl --limit 500 --concurrency 12
 *   pnpm crawl --domains fidgetlabs.io,markwright.app
 */

import { AGENTS, REGISTRY_VERSION, TIER1 } from '../lib/agents';
import {
  resetDatasetCache,
  withAccess,
  type ChangeRecord,
  type DailyStats,
  type StoredRecord,
} from '../lib/dataset';
import { assessRun, lastTrustworthy } from '../lib/health';
import { buildStats } from '../lib/stats';
import { buildFrozenReport, resetReportCache, unsealedMonths } from '../lib/report';
import { isEntrypoint } from './entrypoint';
import { mapPool, normaliseDomain, pruneGate } from '../lib/http';
import { currentVantage, PROBE_VERSION, probeDomain } from '../lib/probe';
import { RUBRIC_VERSION, scoreObservation } from '../lib/score';
import type { Observation, Score } from '../lib/types';
import {
  appendChanges,
  readCorpus,
  readRecords,
  readStats,
  upsertStats,
  writeCorpus,
  writeFrozenReport,
  writeMeta,
  writeRecords,
  type CorpusEntry,
} from './store';

/** Hard failures tolerated before a domain stops being part of the published population. */
const DEMOTE_AFTER_FAILURES = 3;

/** Only movements worth telling someone about. A one-point drift is noise. */
const SCORE_NOISE_FLOOR = 3;

export function diff(prev: StoredRecord | undefined, obs: Observation, score: Score): ChangeRecord[] {
  // A domain's first observation is its baseline, not a change. Without this guard every
  // site that already blocks a crawler would announce itself as "now blocks GPTBot" on
  // the night we first look at it, and the feed would be worthless.
  if (!prev) return [];

  // Comparing across probe versions attributes our own methodology changes to the site.
  // Comparing across vantage points attributes the network we happen to be crawling from
  // to the site: origins genuinely serve differently by geography and IP reputation, and
  // moving the crawler once produced 25 phantom "changes" per 150 domains before this
  // guard existed. Skip a night rather than publish a change nobody made.
  if (prev.obs.probeVersion !== obs.probeVersion) return [];
  if (prev.obs.vantage !== obs.vantage) return [];

  const out: ChangeRecord[] = [];
  const at = obs.observedAt;

  if (prev.obs.reachable !== obs.reachable) {
    out.push({
      domain: obs.domain,
      changedAt: at,
      kind: 'reachability',
      summary: obs.reachable ? 'Came back online.' : `Went unreachable: ${obs.error ?? 'no response'}.`,
    });
  }

  const before = new Set(prev.obs.tier1Blocked ?? []);
  const after = new Set(obs.tier1Blocked);
  const newlyBlocked = [...after].filter((t) => !before.has(t));
  const newlyAllowed = [...before].filter((t) => !after.has(t));
  if (newlyBlocked.length || newlyAllowed.length) {
    const parts: string[] = [];
    if (newlyBlocked.length) parts.push(`now blocks ${newlyBlocked.join(', ')}`);
    if (newlyAllowed.length) parts.push(`now allows ${newlyAllowed.join(', ')}`);
    out.push({ domain: obs.domain, changedAt: at, kind: 'access', summary: `${obs.domain} ${parts.join('; ')}.` });
  }

  if (prev.obs.llmsTxt.present !== obs.llmsTxt.present || prev.obs.agentsMd.present !== obs.agentsMd.present) {
    const bits: string[] = [];
    if (prev.obs.llmsTxt.present !== obs.llmsTxt.present) bits.push(`llms.txt ${obs.llmsTxt.present ? 'added' : 'removed'}`);
    if (prev.obs.agentsMd.present !== obs.agentsMd.present) bits.push(`agents.md ${obs.agentsMd.present ? 'added' : 'removed'}`);
    out.push({ domain: obs.domain, changedAt: at, kind: 'surface', summary: `${obs.domain}: ${bits.join(', ')}.` });
  }

  // MUST go through withAccess. The archived record has no access map on disk, and
  // scoreObservation reads a missing token as "allowed", so rescoring it raw awards a free
  // 38 points and reports the difference as the site having got worse overnight.
  const prevScore = scoreObservation(withAccess(prev.obs)).total;
  if (prevScore !== null && score.total !== null && Math.abs(prevScore - score.total) >= SCORE_NOISE_FLOOR) {
    const delta = score.total - prevScore;
    out.push({
      domain: obs.domain,
      changedAt: at,
      kind: 'score',
      summary: `Score ${delta > 0 ? 'rose' : 'fell'} ${Math.abs(delta)} points to ${score.total}.`,
    });
  }

  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const num = (flag: string, dflt: number) => {
    const i = args.indexOf(flag);
    return i >= 0 ? Number(args[i + 1]) : dflt;
  };
  const limit = num('--limit', 100_000);
  const concurrency = num('--concurrency', 20);
  /**
   * Bypass the health gate and allow a same-day snapshot to be replaced.
   *
   * The recovery path: once a quarantine is understood, or once a step change in the numbers
   * is known to be legitimate (a rubric bump re-scores the whole corpus, for instance), the
   * operator says so explicitly rather than the crawler guessing.
   */
  const force = args.includes('--force');
  const explicitIdx = args.indexOf('--domains');
  const explicit = explicitIdx >= 0 ? args[explicitIdx + 1].split(',').map(normaliseDomain) : null;

  const corpus = readCorpus();
  if (!corpus.length) throw new Error('Corpus is empty. Run `pnpm seed` first.');

  const prevRecords = readRecords();
  const prevByDomain = new Map(prevRecords.map((r) => [r.domain, r]));
  const corpusByDomain = new Map(corpus.map((c) => [c.domain, c]));

  const targets = (explicit ? corpus.filter((c) => explicit.includes(c.domain)) : corpus).slice(0, limit);

  const vantage = currentVantage();
  console.log(
    `Crawling ${targets.length} domains, concurrency ${concurrency}, vantage ${vantage}, probe ${PROBE_VERSION}.`,
  );

  const started = Date.now();
  const published: StoredRecord[] = [];
  const scoredRows: Array<{ obs: Observation; score: Score }> = [];
  const changes: ChangeRecord[] = [];
  const nextCorpus: CorpusEntry[] = [];

  let done = 0;
  let ok = 0;
  let failed = 0;
  let optedOut = 0;

  await mapPool(targets, concurrency, async (entry) => {
    let obs: Observation;
    try {
      obs = await probeDomain(entry.domain);
    } catch {
      failed++;
      done++;
      nextCorpus.push({ ...entry, consecutiveFailures: (entry.consecutiveFailures ?? 0) + 1 });
      return null;
    }

    const score = scoreObservation(obs);
    const failures = obs.reachable ? 0 : (entry.consecutiveFailures ?? 0) + 1;
    const demoted = failures >= DEMOTE_AFTER_FAILURES;

    // An operator who names CrawlIndexBot and denies it leaves the published index on
    // this crawl. The methodology page promises exactly that.
    const excluded = obs.optedOut
      ? 'Opted out via robots.txt'
      : demoted
        ? `Unreachable on ${failures} consecutive crawls: ${obs.error ?? 'no response'}`
        : null;

    nextCorpus.push({ ...entry, consecutiveFailures: failures, excluded });

    if (obs.optedOut) optedOut++;
    if (obs.reachable) ok++;
    else failed++;

    if (!excluded) {
      published.push({
        domain: entry.domain,
        rank: entry.rank,
        firstSeen: entry.firstSeen,
        obs,
      });
      scoredRows.push({ obs, score });
      changes.push(...diff(prevByDomain.get(entry.domain), obs, score));
    }

    done++;
    if (done % 50 === 0) {
      pruneGate();
      const rate = done / ((Date.now() - started) / 1000);
      process.stdout.write(`\r  ${done}/${targets.length}  ok:${ok} fail:${failed} changes:${changes.length}  ${rate.toFixed(1)}/s`);
    }
    return null;
  });

  const durationMs = Date.now() - started;
  console.log(
    `\rCrawled ${done}/${targets.length} in ${Math.round(durationMs / 1000)}s. ok:${ok} fail:${failed} optedOut:${optedOut} changes:${changes.length}`,
  );

  // A partial pass must not delete the rest of the dataset. When only a slice was
  // crawled, carry the untouched records through unchanged.
  const touched = new Set(targets.map((t) => t.domain));
  const carried = prevRecords.filter((r) => !touched.has(r.domain) && corpusByDomain.has(r.domain));
  const allRecords = [...published, ...carried];

  // Same rule as change detection: a carried record is an archived record, so its access map
  // has to be rebuilt before it can be scored. Getting this wrong inflated meanScore for
  // every untouched domain on any --limit or --domains run.
  const carriedRows = carried.map((r) => {
    const obs = withAccess(r.obs);
    return { obs, score: scoreObservation(obs) };
  });

  const stats = buildStats([...scoredRows, ...carriedRows], allRecords.length, {
    attempted: targets.length,
    succeeded: ok,
    crawled: published.length,
    carried: carried.length,
  });

  /**
   * The health gate.
   *
   * Compare against the last day we were willing to quote, not the last day on file, so a
   * second bad night in a row is measured against known-good figures rather than against
   * the first bad night.
   */
  const priorStats = readStats();
  const baseline = lastTrustworthy(priorStats);
  // The run immediately before this one, quarantined or not. Distinct from the baseline,
  // and it is what lets a legitimate step change escape a stuck quarantine.
  const lastRun = priorStats.length ? priorStats[priorStats.length - 1] : null;

  const verdict = force
    ? { suspect: false, reasons: [], baselineMoved: false }
    : assessRun(baseline, stats, {
        attempted: targets.length,
        succeeded: ok,
        scoreChanges: changes.filter((c) => c.kind === 'score').length,
        lastRun,
      });

  if (verdict.baselineMoved) {
    console.log(`\nBaseline moved. ${verdict.reasons.join(' ')}`);
    stats.baselineMoved = true;
    stats.suspectReasons = verdict.reasons;
  }

  if (verdict.suspect) {
    stats.suspect = true;
    stats.suspectReasons = verdict.reasons;
    console.error('\nRUN QUARANTINED. This day will not enter the record:');
    for (const r of verdict.reasons) console.error(`  - ${r}`);
    console.error(
      '\nObservations are still written, because they are the evidence needed to diagnose it.\n' +
        'No change records are appended and the day cannot be sealed into a monthly report.\n' +
        'Re-run with --force once the cause is understood, or after the next clean crawl.',
    );
  }

  writeRecords(allRecords);
  // A quarantined run does not get to write history. A change record is a claim about a
  // named site, and a run we do not trust must not make claims about anybody.
  if (changes.length && !verdict.suspect) appendChanges(changes);
  upsertStats(stats, { force });

  // Carry forward corpus entries the run did not touch.
  const seen = new Set(nextCorpus.map((c) => c.domain));
  writeCorpus([...nextCorpus, ...corpus.filter((c) => !seen.has(c.domain))]);

  writeMeta({
    generatedAt: new Date().toISOString(),
    vantage,
    probeVersion: PROBE_VERSION,
    rubricVersion: RUBRIC_VERSION,
    registryVersion: REGISTRY_VERSION,
    crawl: { attempted: targets.length, succeeded: ok, failed, durationMs },
  });

  console.log(`Dataset written: ${allRecords.length} published records.`);

  // --- seal any month that has ended ---------------------------------------
  // Read back what was just written, so the seal describes the state the month closed in.
  // A month is sealed once and then never touched, which is what makes a report citable
  // rather than a template over whatever the dataset happens to say later.
  resetDatasetCache();
  resetReportCache();
  const today = new Date().toISOString().slice(0, 10);
  const frozenAt = new Date().toISOString();
  for (const month of unsealedMonths(today)) {
    const report = buildFrozenReport(month, frozenAt);
    if (report && writeFrozenReport(month, report)) {
      console.log(`Sealed the ${month} report. It will not be regenerated.`);
    }
  }
}

// Guarded so `tests/crawl-diff.test.ts` can import `diff()` without launching a live crawl.
// Same reason as seed.ts and intake.ts: a worker that runs on import is a landmine.
if (isEntrypoint(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : e);
    process.exit(1);
  });
}
