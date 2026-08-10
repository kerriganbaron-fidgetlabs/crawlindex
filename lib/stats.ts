/**
 * The daily snapshot.
 *
 * ## Why this is one function in one file
 *
 * Everything the homepage quotes must come from here, computed over one population in a
 * single pass. It previously did not: the facet counts were recomputed live at render time
 * while their denominators came from this snapshot, so the published percentage was a ratio
 * of two different sets. The gap tile divided a count over every record in `domains.jsonl`
 * by a count of what one crawl happened to observe.
 *
 * Cohort tables, leaderboards and per-domain pages still recompute live, and that is
 * correct: they are views over the current dataset rather than a dated finding somebody
 * might cite. The rule is that anything with a date attached comes from here.
 *
 * Lives in `lib/` rather than in the crawler so it can also be run over archived evidence
 * with no network at all. See `worker/restats.ts` — a rubric change should be able to
 * re-derive the whole series without re-measuring the web.
 */

import { AGENTS, TIER1 } from './agents';
import type { DailyStats } from './dataset';
import { accessArchetype, policyGap, policyPosture } from './facets';
import type { Observation, Score } from './types';

export type ScoredRow = { obs: Observation; score: Score };

export type RunShape = {
  attempted: number;
  succeeded: number;
  /** Domains actually probed on this run, as opposed to carried forward unchanged. */
  crawled: number;
  carried: number;
};

export function buildStats(
  rows: ScoredRow[],
  totalCorpus: number,
  shape: RunShape,
  day = new Date().toISOString().slice(0, 10),
): DailyStats {
  const observed = rows.filter((r) => r.score.total !== null);
  const scores = observed.map((r) => r.score.total as number);
  // Comparable scores only, matching `scoredRows()`. A renormalised partial belongs to a
  // different scale and cannot share a histogram with complete ones.
  const comparable = rows.filter((r) => r.score.total !== null && !r.score.partial);

  const count = (key: (o: Observation) => string): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const r of observed) {
      const k = key(r.obs);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  };

  const histogram = new Array(10).fill(0) as number[];
  for (const r of comparable) histogram[Math.min(9, Math.floor((r.score.total as number) / 10))]++;

  const gaps = observed.filter((r) => policyGap(r.obs).gap).length;

  /**
   * Signal counts are taken over the records whose probe actually looked, not over every
   * observed record.
   *
   * Counting probe-2 records as "does not publish a licence" would report 0% adoption for a
   * question that was never asked, which is rule 2 with the sign flipped: unobservable must
   * not become zero. `signalsObserved` travels with the counts so a consumer can tell an
   * absence of adoption from an absence of measurement.
   */
  const withSignals = observed.filter((r) => r.obs.signals);
  const sig = (pick: (o: Observation) => boolean) =>
    withSignals.length ? withSignals.filter((r) => pick(r.obs)).length : null;

  const cohort = (key: (o: Observation) => string | null) => {
    const m: Record<string, { total: number; blocking: number }> = {};
    for (const r of observed) {
      const k = key(r.obs);
      if (!k) continue;
      m[k] ??= { total: 0, blocking: 0 };
      m[k].total++;
      if (r.obs.tier1Blocked.length > 0) m[k].blocking++;
    }
    return m;
  };

  const perBot: Record<string, number> = {};
  for (const a of AGENTS) {
    perBot[a.token] = rows.filter(
      (r) => r.obs.tier1Blocked.includes(a.token) || r.obs.tier2Blocked.includes(a.token),
    ).length;
  }

  return {
    day,
    totalDomains: totalCorpus,
    observed: observed.length,
    meanScore: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null,
    blockingAnyTier1: observed.filter((r) => r.obs.tier1Blocked.length > 0).length,
    blockingAllTier1: observed.filter((r) => r.obs.tier1Blocked.length >= TIER1.length).length,
    llmsTxt: observed.filter((r) => r.obs.llmsTxt.present).length,
    agentsMd: observed.filter((r) => r.obs.agentsMd.present).length,
    refusedGptbot: observed.filter((r) => r.obs.cloaking.detected).length,
    paymentRequired: rows.filter((r) => r.obs.control.kind === 'payment-required').length,
    perBot,
    perPlatform: cohort((o) => o.stack.platform),
    perNetwork: cohort((o) => o.stack.network),

    attempted: shape.attempted,
    succeeded: shape.succeeded,
    crawled: shape.crawled,
    carried: shape.carried,
    partial: shape.carried > 0,

    policyGaps: gaps,
    quadrant: {
      gap: gaps,
      openHonest: observed.filter((r) => r.obs.access['GPTBot'] !== false && !policyGap(r.obs).gap).length,
      blockedHonest: observed.filter(
        (r) => r.obs.access['GPTBot'] === false && r.obs.cloaking.botStatus >= 400,
      ).length,
      declaredOnly: observed.filter(
        (r) =>
          r.obs.access['GPTBot'] === false &&
          r.obs.cloaking.tested &&
          r.obs.cloaking.botStatus > 0 &&
          r.obs.cloaking.botStatus < 400,
      ).length,
    },
    perPosture: count(policyPosture),
    perArchetype: count(accessArchetype),
    histogram,

    signalsObserved: withSignals.length,
    declaredLicence: sig((o) => Boolean(o.signals?.licenseUrl || o.signals?.licenseLink)),
    contentSignal: sig((o) => Boolean(o.signals?.contentSignal)),
    agentCard: sig((o) => Boolean(o.signals?.agentCard)),
    dateline: sig((o) => Boolean(o.signals?.datePublished || o.signals?.dateModified)),
    authorship: sig((o) => Boolean(o.signals?.hasAuthor)),
  };
}
