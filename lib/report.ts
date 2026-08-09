import { AGENTS } from './agents';
import { allChanges, allStats, networkCohorts, platformCohorts, type Cohort, type DailyStats } from './dataset';
import { networkLabel, platformLabel } from './fingerprints';

/**
 * Monthly report data.
 *
 * Prose around these numbers is templated, not model-written, for the same reason no
 * model touches a score: a report that gets cited has to say the same thing every time it
 * is regenerated. A sentence that drifts between renders is not a citable source.
 *
 * Reports appear automatically. `getReportMonths` derives the list from whatever days
 * exist in the stats series, so the moment a crawl runs in a new month, that month's
 * report exists, is linked, and is in the sitemap. Nobody has to publish anything.
 */

export type MonthReport = {
  month: string;
  label: string;
  first: DailyStats;
  last: DailyStats;
  days: number;
  deltas: {
    blockingAnyTier1: number;
    llmsTxt: number;
    agentsMd: number;
    meanScore: number | null;
  };
  bots: Array<{ token: string; operator: string; tier: 1 | 2; blocked: number; delta: number; share: number }>;
  platforms: Cohort[];
  networks: Cohort[];
  notableChanges: Array<{ domain: string; summary: string; changedAt: string; kind: string }>;
};

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Every month with at least one crawl. No human curation, no publish step. */
export function getReportMonths(): string[] {
  const months = new Set(allStats().map((s) => s.day.slice(0, 7)));
  return [...months].sort().reverse();
}

export function getMonthReport(month: string): MonthReport | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const series = allStats().filter((s) => s.day.startsWith(month));
  if (!series.length) return null;

  const first = series[0];
  const last = series[series.length - 1];

  const changes = allChanges().filter((c) => c.changedAt.startsWith(month));

  const bots = AGENTS.map((a) => {
    const blocked = last.perBot?.[a.token] ?? 0;
    return {
      token: a.token,
      operator: a.operator,
      tier: a.tier,
      blocked,
      delta: blocked - (first.perBot?.[a.token] ?? 0),
      share: last.observed ? (blocked / last.observed) * 100 : 0,
    };
  }).sort((x, y) => y.blocked - x.blocked);

  return {
    month,
    label: monthLabel(month),
    first,
    last,
    days: series.length,
    deltas: {
      blockingAnyTier1: last.blockingAnyTier1 - first.blockingAnyTier1,
      llmsTxt: last.llmsTxt - first.llmsTxt,
      agentsMd: last.agentsMd - first.agentsMd,
      meanScore:
        last.meanScore !== null && first.meanScore !== null
          ? Number((last.meanScore - first.meanScore).toFixed(2))
          : null,
    },
    bots,
    // Cross-tabs come from the live dataset rather than the daily snapshot: they describe
    // the current population, and recomputing keeps one source of truth.
    platforms: platformCohorts().slice(0, 12),
    networks: networkCohorts().slice(0, 10),
    notableChanges: changes.filter((c) => c.kind === 'access' || c.kind === 'surface').slice(0, 40),
  };
}

/** "rose by 12" / "fell by 3" / "did not change". Keeps prose from contradicting a table. */
export function movement(delta: number, unit = ''): string {
  if (delta === 0) return `did not change${unit ? ` ${unit}` : ''}`;
  return `${delta > 0 ? 'rose' : 'fell'} by ${Math.abs(delta).toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

export const cohortLabel = (kind: 'platform' | 'network', id: string) =>
  (kind === 'platform' ? platformLabel(id) : networkLabel(id)) ?? id;
