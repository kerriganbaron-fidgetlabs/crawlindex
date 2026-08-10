import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, REGISTRY_VERSION } from './agents';
import {
  allChanges,
  allStats,
  DATA_DIR,
  leaderboard,
  networkCohorts,
  platformCohorts,
  type Cohort,
  type DailyStats,
} from './dataset';
import { networkLabel, platformLabel } from './fingerprints';
import { PROBE_VERSION } from './probe';
import { RUBRIC_VERSION } from './score';

/**
 * Monthly reports.
 *
 * Prose around these numbers is templated, not model-written, for the same reason no model
 * touches a score: a report that gets cited has to say the same thing every time it is
 * rendered.
 *
 * ## Why a month gets frozen
 *
 * The first version of this file computed a past month's cross-tabs from the LIVE dataset
 * and pulled its change list out of a rolling four-thousand-record window. July's report
 * therefore said something different in September, and eventually lost its own changes
 * entirely as the window scrolled past them. A document that rewrites itself is not a
 * record of a month and is not citable, which was the entire point of publishing it.
 *
 * So a completed month is sealed. The crawl writes `data/reports/YYYY-MM.json` the first
 * time it runs after that month ends, containing every figure the page needs, and that
 * file is never rewritten. The month in progress is still computed live and is labelled as
 * moving. `frozen` on the returned object is what the page reads to decide which of those
 * two things it is looking at.
 */

export type FrozenReport = {
  month: string;
  /** When the seal was applied. Not the same as the last measurement day. */
  frozenAt: string;
  /** Versions in force when the month was sealed, so a citation stays interpretable. */
  probeVersion: string;
  rubricVersion: string;
  registryVersion: string;
  days: DailyStats[];
  platforms: Cohort[];
  networks: Cohort[];
  changes: Array<{ domain: string; summary: string; changedAt: string; kind: string }>;
  /** Top and bottom of the leaderboard as it stood. Ten each, enough to be a record. */
  best: Array<{ domain: string; score: number; grade: string }>;
  worst: Array<{ domain: string; score: number; grade: string }>;
};

export type MonthReport = {
  month: string;
  label: string;
  first: DailyStats;
  last: DailyStats;
  days: number;
  /** All daily stats in the month, oldest first. Drives the sparklines. */
  series: DailyStats[];
  /** True when this is a sealed record rather than a month still being measured. */
  frozen: boolean;
  frozenAt: string | null;
  versions: { probe: string; rubric: string; registry: string };
  deltas: {
    blockingAnyTier1: number;
    llmsTxt: number;
    agentsMd: number;
    meanScore: number | null;
  };
  bots: Array<{ token: string; operator: string; tier: 1 | 2; blocked: number; delta: number; share: number }>;
  platforms: Cohort[];
  networks: Cohort[];
  best: Array<{ domain: string; score: number; grade: string }>;
  worst: Array<{ domain: string; score: number; grade: string }>;
  notableChanges: Array<{ domain: string; summary: string; changedAt: string; kind: string }>;
};

export const REPORTS_DIR = join(DATA_DIR, 'reports');

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The month a day string falls in. */
export const monthOf = (day: string): string => day.slice(0, 7);

let frozenCache: Map<string, FrozenReport> | null = null;

function frozenReports(): Map<string, FrozenReport> {
  if (frozenCache) return frozenCache;
  const m = new Map<string, FrozenReport>();
  let names: string[] = [];
  try {
    names = readdirSync(REPORTS_DIR);
  } catch {
    // No sealed months yet. Normal on a fresh clone and before the first month rolls.
    frozenCache = m;
    return m;
  }
  for (const name of names) {
    if (!/^\d{4}-\d{2}\.json$/.test(name)) continue;
    try {
      const r = JSON.parse(readFileSync(join(REPORTS_DIR, name), 'utf8')) as FrozenReport;
      if (r?.month && Array.isArray(r.days) && r.days.length) m.set(r.month, r);
    } catch {
      // A corrupt seal must not take the site down. The month falls back to live figures.
    }
  }
  frozenCache = m;
  return m;
}

export const getFrozenReport = (month: string): FrozenReport | null => frozenReports().get(month) ?? null;

/** Companion to `resetDatasetCache`, for the crawler reading back what it just wrote. */
export function resetReportCache(): void {
  frozenCache = null;
}

/**
 * Every month that has a report, sealed or in progress. Newest first.
 *
 * Still no publish step: a month appears the moment a crawl runs inside it, and turns
 * into a permanent record the first time a crawl runs after it ends.
 */
export function getReportMonths(): string[] {
  const months = new Set<string>([
    ...allStats().map((s) => monthOf(s.day)),
    ...frozenReports().keys(),
  ]);
  return [...months].sort().reverse();
}

/** The months that have ended and have measurements but no seal yet. */
export function unsealedMonths(today: string): string[] {
  const current = monthOf(today);
  const withData = new Set(allStats().map((s) => monthOf(s.day)));
  return [...withData].filter((m) => m < current && !frozenReports().has(m)).sort();
}

export function getMonthReport(month: string): MonthReport | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const sealed = getFrozenReport(month);

  // A sealed month reads only from its own file. Nothing about it may move again, which
  // includes the cross-tabs, the change list and the leaderboard extract.
  const series = sealed ? sealed.days : allStats().filter((s) => s.day.startsWith(month));
  if (!series.length) return null;

  const first = series[0];
  const last = series[series.length - 1];

  const changes = sealed
    ? sealed.changes
    : allChanges().filter((c) => c.changedAt.startsWith(month));

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

  const leaderExtract = (direction: 'top' | 'bottom') =>
    leaderboard(direction, 10).map((r) => ({
      domain: r.domain,
      score: r.score.total as number,
      grade: r.score.grade as string,
    }));

  return {
    month,
    label: monthLabel(month),
    first,
    last,
    days: series.length,
    series,
    frozen: Boolean(sealed),
    frozenAt: sealed?.frozenAt ?? null,
    versions: {
      probe: sealed?.probeVersion ?? PROBE_VERSION,
      rubric: sealed?.rubricVersion ?? RUBRIC_VERSION,
      registry: sealed?.registryVersion ?? REGISTRY_VERSION,
    },
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
    platforms: sealed ? sealed.platforms : platformCohorts().slice(0, 12),
    networks: sealed ? sealed.networks : networkCohorts().slice(0, 10),
    best: sealed ? sealed.best : leaderExtract('top'),
    worst: sealed ? sealed.worst : leaderExtract('bottom'),
    notableChanges: changes.filter((c) => c.kind === 'access' || c.kind === 'surface').slice(0, 40),
  };
}

/**
 * Build the object that gets sealed to disk. Called by the crawl, never by the site.
 *
 * Takes everything from the live dataset at the moment of sealing, which is correct
 * precisely once: the first crawl after the month ended, when the live dataset still
 * describes that month.
 */
export function buildFrozenReport(month: string, frozenAt: string): FrozenReport | null {
  const days = allStats().filter((s) => s.day.startsWith(month));
  if (!days.length) return null;

  return {
    month,
    frozenAt,
    probeVersion: PROBE_VERSION,
    rubricVersion: RUBRIC_VERSION,
    registryVersion: REGISTRY_VERSION,
    days,
    platforms: platformCohorts().slice(0, 12),
    networks: networkCohorts().slice(0, 10),
    changes: allChanges().filter((c) => c.changedAt.startsWith(month)),
    best: leaderboard('top', 10).map((r) => ({
      domain: r.domain,
      score: r.score.total as number,
      grade: r.score.grade as string,
    })),
    worst: leaderboard('bottom', 10).map((r) => ({
      domain: r.domain,
      score: r.score.total as number,
      grade: r.score.grade as string,
    })),
  };
}

/** "rose by 12" / "fell by 3" / "did not change". Keeps prose from contradicting a table. */
export function movement(delta: number, unit = ''): string {
  if (delta === 0) return `did not change${unit ? ` ${unit}` : ''}`;
  return `${delta > 0 ? 'rose' : 'fell'} by ${Math.abs(delta).toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

export const cohortLabel = (kind: 'platform' | 'network', id: string) =>
  (kind === 'platform' ? platformLabel(id) : networkLabel(id)) ?? id;
