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
};

export type DailyStats = {
  day: string;
  totalDomains: number;
  observed: number;
  meanScore: number | null;
  blockingAnyTier1: number;
  blockingAllTier1: number;
  llmsTxt: number;
  agentsMd: number;
  refusedGptbot: number;
  paymentRequired: number;
  perBot: Record<string, number>;
  perPlatform?: Record<string, { total: number; blocking: number }>;
  perNetwork?: Record<string, { total: number; blocking: number }>;
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

/** Rebuild the per-token allow map from the blocked lists. Same information, less disk. */
function withAccess(obs: StoredRecord['obs']): Observation {
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
    rows.push({
      domain: rec.domain,
      rank: rec.rank ?? null,
      firstSeen: rec.firstSeen,
      tld: tldOf(rec.domain),
      obs,
      score: scoreObservation(obs),
    });
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

export const allDomains = (): DomainRow[] => load().rows;
export const getDomain = (d: string): DomainRow | null => load().byDomain.get(d) ?? null;
export const allStats = (): DailyStats[] => load().stats;
export const latestStats = (): DailyStats | null => {
  const s = load().stats;
  return s.length ? s[s.length - 1] : null;
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
