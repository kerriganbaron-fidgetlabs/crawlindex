/**
 * Run health: is tonight's crawl plausible against last night's?
 *
 * ## Why this exists
 *
 * Every existing guard protects against the crawl *failing*. Nothing protected against the
 * crawl *succeeding in a changed world*. If a CDN starts refusing GitHub's IP range, several
 * hundred origins become unreachable, drop out of `observed`, and the surviving
 * subpopulation is published as the headline with tonight's date on it. Every process exits
 * zero. The workflow is green. The numbers are wrong and nothing says so.
 *
 * A pre-flight check of a vendor status page cannot see this, which is the point: the
 * infrastructure is healthy, the measurement environment is not.
 *
 * ## Quarantine, not refusal
 *
 * A suspect run still writes its observations, because the evidence is exactly what you need
 * to diagnose it. What it does not get to do is enter the record: no change records, excluded
 * from trends, and `buildFrozenReport` refuses to seal it. That last one is the part that
 * matters, because a sealed report is the one artefact a later re-crawl cannot correct.
 *
 * Pure function over two snapshots so it is testable without running a crawl.
 */

import type { DailyStats } from './dataset';

/**
 * Thresholds. Deliberately loose: this is a tripwire for a broken night, not a detector of
 * genuine movement in the web. A false quarantine costs one re-run; a false pass publishes a
 * wrong number under this project's name, which is the whole thing it is trying not to do.
 */
export const HEALTH_THRESHOLDS = {
  /** Percentage points the reachability rate may fall before the run is suspect. */
  reachabilityDropPoints: 15,
  /** Proportion `observed` may move in either direction. */
  observedDrift: 0.2,
  /** Proportion the published population may shrink. Growth is never suspicious. */
  totalDomainsShrink: 0.1,
  /** Points the mean score may move in either direction. */
  meanScoreDrift: 5,
  /**
   * Share of the population that may produce a score change in one night.
   *
   * This is the tripwire that would have caught the `access: {}` rescoring bug on the first
   * night it ran: it emitted score changes for 18.8% of the corpus, and a fifth of the web
   * does not change its AI policy overnight.
   */
  scoreChangeShare: 0.1,
} as const;

export type HealthVerdict = {
  suspect: boolean;
  reasons: string[];
};

const pctDrop = (from: number, to: number) => (from === 0 ? 0 : (from - to) / from);

/**
 * Compare a finished run against the last known-good one.
 *
 * `previous` is null on the very first crawl, and after the dataset reset there will be a
 * night with nothing to compare against. That is not suspicious, it is just the beginning of
 * a series, so the gate no-ops rather than tripping.
 */
export function assessRun(
  previous: DailyStats | null,
  next: DailyStats,
  opts: { attempted: number; succeeded: number; scoreChanges: number },
): HealthVerdict {
  const reasons: string[] = [];
  const t = HEALTH_THRESHOLDS;

  // Absolute checks, meaningful with no baseline at all.
  if (next.observed === 0) {
    reasons.push('Nothing was observed. The crawl reached no site it could score.');
  }

  const share = next.observed > 0 ? opts.scoreChanges / next.observed : 0;
  if (share > t.scoreChangeShare) {
    reasons.push(
      `${opts.scoreChanges.toLocaleString()} score changes across ${next.observed.toLocaleString()} measured sites (${(share * 100).toFixed(1)}%). A fifth of the web does not change its AI policy overnight, so this is far more likely to be a scoring fault than a real movement.`,
    );
  }

  if (!previous) {
    // First run of a series. Only the absolute checks above can speak.
    return { suspect: reasons.length > 0, reasons };
  }

  const prevRate = previous.totalDomains > 0 ? previous.observed / previous.totalDomains : 0;
  const nextRate = opts.attempted > 0 ? opts.succeeded / opts.attempted : 0;
  // Only compare rates when the previous run actually recorded its attempt count. Older
  // snapshots predate the field and would otherwise read as a collapse from zero.
  if (previous.attempted && prevRate > 0) {
    const prevSucceedRate = previous.attempted > 0 ? (previous.succeeded ?? 0) / previous.attempted : 0;
    const drop = (prevSucceedRate - nextRate) * 100;
    if (drop > t.reachabilityDropPoints) {
      reasons.push(
        `Reachability fell ${drop.toFixed(1)} points, from ${(prevSucceedRate * 100).toFixed(1)}% to ${(nextRate * 100).toFixed(1)}%. A drop this size is usually a network blocking our crawler rather than a thousand sites going down at once.`,
      );
    }
  }

  const observedMove = Math.abs(next.observed - previous.observed) / Math.max(1, previous.observed);
  if (observedMove > t.observedDrift) {
    reasons.push(
      `Measured population moved ${(observedMove * 100).toFixed(1)}%, from ${previous.observed.toLocaleString()} to ${next.observed.toLocaleString()}.`,
    );
  }

  const shrink = pctDrop(previous.totalDomains, next.totalDomains);
  if (shrink > t.totalDomainsShrink) {
    reasons.push(
      `Published population shrank ${(shrink * 100).toFixed(1)}%, from ${previous.totalDomains.toLocaleString()} to ${next.totalDomains.toLocaleString()}. Check whether a cohort was demoted in one sweep.`,
    );
  }

  if (previous.meanScore !== null && next.meanScore !== null) {
    const move = Math.abs(next.meanScore - previous.meanScore);
    if (move > t.meanScoreDrift) {
      reasons.push(
        `Mean score moved ${move.toFixed(2)} points, from ${previous.meanScore} to ${next.meanScore}.`,
      );
    }
  }

  return { suspect: reasons.length > 0, reasons };
}

/**
 * The most recent day fit to be quoted.
 *
 * The site reads this rather than the literal last entry, so a quarantined night shows
 * yesterday's figures with a banner instead of publishing numbers we already doubt.
 */
export function lastTrustworthy(stats: DailyStats[]): DailyStats | null {
  for (let i = stats.length - 1; i >= 0; i--) {
    if (!stats[i].suspect) return stats[i];
  }
  return null;
}
