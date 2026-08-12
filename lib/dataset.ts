/**
 * The dataset. Files in `data/`, committed to the repository, no database.
 *
 * Why a repo and not Postgres. This index writes once a night and is read by a static
 * site. A database was costing real money to hold ~4,400 rows that change once every
 * 24 hours, and it added a service that can pause, expire credentials, or fall over at
 * 3am with nobody watching. Git gives the same data with better properties for a public
 * project: the history IS the provenance, every past state is diffable and permanently
 * citable, anyone can clone the whole dataset, and it costs nothing forever.
 *
 * Format is JSON Lines, sorted by domain, one record per line. That is deliberate:
 *  - Git diffs it line by line, so a nightly commit where 98% of records are unchanged
 *    adds kilobytes rather than rewriting a 4MB blob.
 *  - Consumers can stream it without parsing the whole file.
 *
 * Stored records archive the OBSERVATION, not the score. Scores are recomputed here on
 * load, which is the same rule the rubric states: a score must always be reproducible
 * from stored evidence. It also makes it impossible for a leaderboard to disagree with a
 * detail page, because both read one computation.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS } from './agents';
import {
  accessArchetype,
  percentileOf,
  policyGap,
  policyPosture,
  type AccessArchetype,
  type PolicyGap,
  type PolicyPosture,
} from './facets';
import { lastTrustworthy } from './health';
import { scoreObservation } from './score';
import { tldOf } from './probe';
import type { AccessMap, Observation, Score } from './types';

export const DATA_DIR = join(process.cwd(), 'data');

export type StoredRecord = {
  domain: string;
  rank: number | null;
  firstSeen: string;
  /** Archived evidence. `access` is omitted on disk and reconstructed on load. */
  obs: Omit<Observation, 'access'> & { access?: AccessMap };
};

export type DomainRow = {
  domain: string;
  rank: number | null;
  firstSeen: string;
  tld: string;
  obs: Observation;
  score: Score;
  /** Facets. Pure functions of `obs`, computed here for the same reason the score is. */
  posture: PolicyPosture;
  archetype: AccessArchetype;
  gap: PolicyGap;
  /**
   * Percentage of fully scored sites this one beats. Null when the site has no comparable
   * score, because a percentile over a renormalised partial is a different scale.
   */
  percentile: number | null;
};

export type DailyStats = {
  day: string;
  totalDomains: number;
  observed: number;
  meanScore: number | null;

  /**
   * Run shape. Added because a `--limit 200` slice was previously indistinguishable from a
   * full pass in `stats.json`: the snapshot recorded a corpus-sized `totalDomains` and an
   * `observed` count that was 98% yesterday's observations, dated today.
   *
   * Optional because snapshots written before this existed do not have them, and inventing
   * a value for a question that was never asked is the failure mode this project keeps
   * legislating against.
   */
  attempted?: number;
  succeeded?: number;
  /** Domains actually probed on this run, as opposed to carried forward unchanged. */
  crawled?: number;
  carried?: number;
  /** True when the run covered only a slice of the corpus. */
  partial?: boolean;

  /**
   * Quarantine. A suspect day is published as evidence but kept out of the record: no change
   * records, excluded from trends, and never sealed into a monthly report.
   */
  suspect?: boolean;
  suspectReasons?: string[];
  /**
   * This run tripped the gate and was accepted anyway, because the run before it tripped
   * for the same reasons and this one reproduced them. Recorded rather than hidden: a
   * baseline that moved is a fact about the series that a reader should be able to see.
   */
  baselineMoved?: boolean;
  blockingAnyTier1: number;
  blockingAllTier1: number;
  llmsTxt: number;
  agentsMd: number;
  refusedGptbot: number;
  paymentRequired: number;
  perBot: Record<string, number>;
  perPlatform?: Record<string, { total: number; blocking: number }>;
  perNetwork?: Record<string, { total: number; blocking: number }>;

  /**
   * Facets, snapshotted.
   *
   * These were computed live at render time while their denominators came from this
   * snapshot, so the homepage divided one population by a different one. Storing them
   * alongside makes every headline figure a single consistent reading, and as a side effect
   * turns each into a historical series the monthly sparklines can use.
   *
   * Optional for the same reason as the run-shape fields: older snapshots never measured
   * them and must not be given an invented zero.
   */
  policyGaps?: number;
  /** Stated policy against enforced behaviour, the four cells of the homepage quadrant. */
  quadrant?: { gap: number; openHonest: number; blockedHonest: number; declaredOnly: number };
  perPosture?: Record<string, number>;
  perArchetype?: Record<string, number>;
  /** Score distribution in ten-point buckets, index 0 is 0-9. */
  histogram?: number[];
  /**
   * Adoption counts for the signals added in probe 3.
   *
   * `signalsObserved` is the denominator and is the point of the group: it is how many
   * records were taken by a probe that looked for these at all. Null counts mean nobody has
   * asked yet, which is not the same fact as nobody publishing them, and reporting the two
   * identically is rule 2 with the sign flipped.
   */
  signalsObserved?: number;
  declaredLicence?: number | null;
  contentSignal?: number | null;
  agentCard?: number | null;
  dateline?: number | null;
  authorship?: number | null;
};

export type ChangeRecord = {
  domain: string;
  changedAt: string;
  kind: 'score' | 'access' | 'surface' | 'reachability';
  summary: string;
};

export type Meta = {
  generatedAt: string;
  vantage: string;
  probeVersion: string;
  rubricVersion: string;
  registryVersion: string;
  crawl: { attempted: number; succeeded: number; failed: number; durationMs: number };
};

function readLines(file: string): string[] {
  try {
    return readFileSync(join(DATA_DIR, file), 'utf8').split('\n').filter((l) => l.trim());
  } catch {
    // A missing data file must degrade the site, never break the build. On a fresh clone
    // before the first crawl this is the normal case.
    return [];
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/**
 * Rebuild the per-token allow map from the blocked lists. Same information, less disk.
 *
 * **Exported because the crawler needs it and did not have it.** `stableObs` strips `access`
 * before writing, so any archived record read back through `readRecords()` has no access map
 * at all. `scoreObservation` tests `obs.access[token] !== false`, so an empty map reads as
 * "every crawler allowed" and silently hands the record a free 38 of 100 points.
 *
 * `worker/crawl.ts` did exactly that in two places, which inflated the previous score in
 * change detection and produced 682 fictional "score fell" records against 50 rises in a
 * single night. Anything that rescores an archived observation must come through here.
 */
export function withAccess(obs: StoredRecord['obs']): Observation {
  const blocked = new Set([...(obs.tier1Blocked ?? []), ...(obs.tier2Blocked ?? [])]);
  const access: AccessMap = {};
  for (const a of AGENTS) access[a.token] = !blocked.has(a.token);
  return { ...obs, access } as Observation;
}

let cache: {
  rows: DomainRow[];
  byDomain: Map<string, DomainRow>;
  stats: DailyStats[];
  changes: ChangeRecord[];
  meta: Meta | null;
} | null = null;

function load() {
  if (cache) return cache;

  const rows: DomainRow[] = [];
  for (const line of readLines('domains.jsonl')) {
    let rec: StoredRecord;
    try {
      rec = JSON.parse(line) as StoredRecord;
    } catch {
      continue; // One corrupt line must not take the site down.
    }
    const obs = withAccess(rec.obs);
    const score = scoreObservation(obs);
    rows.push({
      domain: rec.domain,
      rank: rec.rank ?? null,
      firstSeen: rec.firstSeen,
      tld: tldOf(rec.domain),
      obs,
      score,
      posture: policyPosture(obs),
      archetype: accessArchetype(obs),
      gap: policyGap(obs),
      percentile: null, // filled below, once the whole population is known
    });
  }

  // Percentile needs every score first. Comparable scores only: a partial assessment is
  // renormalised over fewer points, so ranking it against complete ones compares scales.
  const comparable = rows
    .filter((r) => r.score.total !== null && !r.score.partial)
    .map((r) => r.score.total as number)
    .sort((a, b) => a - b);
  for (const r of rows) {
    if (r.score.total !== null && !r.score.partial) {
      r.percentile = percentileOf(r.score.total, comparable);
    }
  }

  cache = {
    rows,
    byDomain: new Map(rows.map((r) => [r.domain, r])),
    stats: readJson<DailyStats[]>('stats.json', []),
    changes: readLines('changes.jsonl')
      .map((l) => {
        try {
          return JSON.parse(l) as ChangeRecord;
        } catch {
          return null;
        }
      })
      .filter((c): c is ChangeRecord => c !== null)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
    meta: readJson<Meta | null>('meta.json', null),
  };
  return cache;
}

/**
 * Drop the in-process cache.
 *
 * The site never needs this: it loads once per build and the files cannot change under
 * it. The crawler does, because it writes the dataset and then immediately reads it back
 * to decide whether a completed month needs sealing.
 */
export function resetDatasetCache(): void {
  cache = null;
}

export const allDomains = (): DomainRow[] => load().rows;
export const getDomain = (d: string): DomainRow | null => load().byDomain.get(d) ?? null;
export const allStats = (): DailyStats[] => load().stats;

/**
 * The last day fit to quote.
 *
 * Deliberately not "the last entry". A quarantined run still writes its snapshot, because
 * the evidence is what you need to diagnose it, but the site must not publish figures the
 * crawler itself flagged as implausible. A suspect night therefore shows the previous day's
 * numbers with a banner rather than fresh numbers nobody trusts.
 *
 * `latestStatsRaw()` is the unfiltered accessor, for the few places that need to know a
 * quarantine happened at all.
 */
export const latestStats = (): DailyStats | null => lastTrustworthy(load().stats);

export const latestStatsRaw = (): DailyStats | null => {
  const s = load().stats;
  return s.length ? s[s.length - 1] : null;
};

/** The current quarantine, if the most recent run was flagged. Null when all is well. */
export const activeQuarantine = (): DailyStats | null => {
  const latest = latestStatsRaw();
  return latest?.suspect ? latest : null;
};

/**
 * The most recent run tripped the gate and was accepted anyway, because the run before it
 * tripped the same way and this one reproduced it.
 *
 * Surfaced rather than swallowed. The escape hatch exists so a legitimate step change does
 * not freeze the site on stale data forever, but an automatic override that leaves no trace
 * is how a safety mechanism quietly stops meaning anything.
 */
export const acceptedBaselineMove = (): DailyStats | null => {
  const latest = latestStatsRaw();
  return latest?.baselineMoved ? latest : null;
};
export const allChanges = (): ChangeRecord[] => load().changes;
export const changesFor = (d: string): ChangeRecord[] => load().changes.filter((c) => c.domain === d);
export const getMeta = (): Meta | null => load().meta;

/** Domains with a full, comparable score. Partial results are renormalised over fewer
 *  points, so mixing them into a ranking compares two different scales. */
export const scoredRows = (): DomainRow[] =>
  load().rows.filter((r) => r.score.total !== null && !r.score.partial);

/** Everything with a score, partial or not. Correct denominator for prevalence stats. */
export const observedRows = (): DomainRow[] => load().rows.filter((r) => r.score.total !== null);

export function leaderboard(direction: 'top' | 'bottom', limit = 50): DomainRow[] {
  const rows = [...scoredRows()].sort((a, b) => {
    const d = (b.score.total ?? 0) - (a.score.total ?? 0);
    if (d !== 0) return direction === 'top' ? d : -d;
    return (a.rank ?? 1e9) - (b.rank ?? 1e9);
  });
  return rows.slice(0, limit);
}

export function blockersOf(token: string, limit = 100): DomainRow[] {
  return load()
    .rows.filter((r) => r.obs.tier1Blocked.includes(token) || r.obs.tier2Blocked.includes(token))
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
    .slice(0, limit);
}

export function countBlockersOf(token: string): number {
  return load().rows.filter(
    (r) => r.obs.tier1Blocked.includes(token) || r.obs.tier2Blocked.includes(token),
  ).length;
}

/**
 * Cross-tabulation: how a cohort of sites treats AI crawlers.
 *
 * This is the part of the dataset that says something nobody else is saying. Most sites
 * did not form an opinion on AI crawlers; their platform or their CDN formed one for them
 * and they inherited it by default. Grouping blocking rates by stack makes that visible.
 *
 * Cohorts below `minSize` are dropped rather than shown, because a 100% blocking rate
 * over three sites is noise presented as a finding.
 */
export type Cohort = {
  id: string;
  total: number;
  observed: number;
  blockingAny: number;
  blockingAll: number;
  llmsTxt: number;
  meanScore: number | null;
  blockingRate: number;
};

export const MIN_COHORT = 25;

export function cohortsBy(
  key: (r: DomainRow) => string | null,
  minSize = MIN_COHORT,
): Cohort[] {
  const groups = new Map<string, DomainRow[]>();
  for (const r of load().rows) {
    const k = key(r);
    if (!k) continue;
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }

  const out: Cohort[] = [];
  for (const [id, rows] of groups) {
    if (rows.length < minSize) continue;
    const observed = rows.filter((r) => r.score.total !== null);
    if (!observed.length) continue;
    const scored = observed.map((r) => r.score.total as number);
    const blockingAny = observed.filter((r) => r.obs.tier1Blocked.length > 0).length;
    out.push({
      id,
      total: rows.length,
      observed: observed.length,
      blockingAny,
      blockingAll: observed.filter((r) => r.obs.tier1Blocked.length >= 11).length,
      llmsTxt: observed.filter((r) => r.obs.llmsTxt.present).length,
      meanScore: scored.length ? Number((scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1)) : null,
      blockingRate: observed.length ? (blockingAny / observed.length) * 100 : 0,
    });
  }
  return out.sort((a, b) => b.observed - a.observed);
}

export const platformCohorts = () => cohortsBy((r) => r.obs.stack.platform);
export const networkCohorts = () => cohortsBy((r) => r.obs.stack.network);
export const tldCohorts = () => cohortsBy((r) => r.tld);

export function rowsInCohort(key: (r: DomainRow) => string | null, id: string, limit = 200): DomainRow[] {
  return load()
    .rows.filter((r) => key(r) === id)
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
    .slice(0, limit);
}

// --- facet aggregates -------------------------------------------------------

/** Count rows by a facet, over the observed population. Order is highest count first. */
export function facetCounts<T extends string>(key: (r: DomainRow) => T): Array<{ id: T; count: number }> {
  const m = new Map<T, number>();
  for (const r of observedRows()) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

/** Sites whose robots.txt permits GPTBot and whose server refuses it anyway. */
export const policyGaps = (limit = 200): DomainRow[] =>
  load()
    .rows.filter((r) => r.gap.gap)
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
    .slice(0, limit);

export const countPolicyGaps = (): number => load().rows.filter((r) => r.gap.gap).length;

/** Sites publishing a machine-readable licence or granular usage preferences. */
export const countWithSignal = (key: (o: Observation) => boolean): number =>
  observedRows().filter((r) => key(r.obs)).length;

/**
 * Score distribution in ten-point buckets, over comparable scores only.
 * Index 0 is 0-9, index 9 is 90-100.
 */
export function scoreHistogram(): number[] {
  const buckets = new Array(10).fill(0) as number[];
  for (const r of scoredRows()) {
    const t = r.score.total as number;
    buckets[Math.min(9, Math.floor(t / 10))]++;
  }
  return buckets;
}

/**
 * The search index. One compact tuple per domain, generated at build time and fetched by
 * the browser on first use.
 *
 * Tuples rather than objects because five thousand rows of `{"domain":...,"score":...}`
 * is several times the bytes for the same information, and this file is downloaded by
 * anyone who opens the search box.
 *
 * [domain, rank, score, grade, flags] where flags is a bitfield:
 *   1 blocks an answer-surface crawler
 *   2 publishes llms.txt
 *   4 policy gap
 *   8 partial assessment
 */
export type SearchTuple = [string, number, number, string, number];

export function searchIndex(): SearchTuple[] {
  return load().rows.map((r) => {
    let flags = 0;
    if (r.obs.tier1Blocked.length > 0) flags |= 1;
    if (r.obs.llmsTxt.present) flags |= 2;
    if (r.gap.gap) flags |= 4;
    if (r.score.partial) flags |= 8;
    return [r.domain, r.rank ?? 0, r.score.total ?? -1, r.score.grade ?? '', flags];
  });
}
