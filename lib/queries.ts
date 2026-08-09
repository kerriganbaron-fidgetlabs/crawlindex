import { publicClient } from './supabase';
import type { Observation, Score } from './types';

/**
 * Every public query filters `indexable`. Demoted infrastructure hosts stay in the table
 * for auditability but must never appear in a page, a leaderboard or a count.
 */

export type DomainSummary = {
  domain: string;
  rank: number | null;
  score: number | null;
  grade: string | null;
  partial: boolean;
  challenged: boolean;
  reachable: boolean | null;
  tier1_blocked: string[];
  tier2_blocked: string[];
  llms_txt: boolean;
  agents_md: boolean;
  cloaking: boolean;
  observed_at: string | null;
};

const SUMMARY_COLS =
  'domain, rank, score, grade, partial, challenged, reachable, tier1_blocked, tier2_blocked, llms_txt, agents_md, cloaking, observed_at';

export type DomainDetail = DomainSummary & {
  first_seen: string;
  observation: Observation | null;
  score_detail: Score | null;
  excluded_reason: string | null;
};

export async function getDomain(domain: string): Promise<DomainDetail | null> {
  const { data, error } = await publicClient()
    .from('domains')
    .select(`${SUMMARY_COLS}, first_seen, observation, score_detail, excluded_reason`)
    .eq('domain', domain)
    .eq('indexable', true)
    .maybeSingle();
  if (error) throw new Error(`getDomain(${domain}): ${error.message}`);
  return (data as DomainDetail) ?? null;
}

export type DailyStats = {
  day: string;
  total_domains: number;
  observed: number;
  avg_score: number | null;
  blocking_any_tier1: number;
  blocking_all_tier1: number;
  llms_txt_count: number;
  agents_md_count: number;
  cloaking_count: number;
  per_bot: Record<string, number>;
};

export async function getLatestStats(): Promise<DailyStats | null> {
  const { data, error } = await publicClient()
    .from('daily_stats')
    .select('*')
    .order('day', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestStats: ${error.message}`);
  return (data as DailyStats) ?? null;
}

export async function getStatsHistory(days = 60): Promise<DailyStats[]> {
  const { data, error } = await publicClient()
    .from('daily_stats')
    .select('*')
    .order('day', { ascending: false })
    .limit(days);
  if (error) throw new Error(`getStatsHistory: ${error.message}`);
  return ((data as DailyStats[]) ?? []).reverse();
}

export async function getLeaderboard(
  direction: 'top' | 'bottom',
  limit = 50,
): Promise<DomainSummary[]> {
  const { data, error } = await publicClient()
    .from('domains')
    .select(SUMMARY_COLS)
    .eq('indexable', true)
    .not('score', 'is', null)
    // A partial score is renormalised over fewer points, so it is not comparable
    // against a full one. Leaderboards use fully observed domains only.
    .eq('partial', false)
    .order('score', { ascending: direction === 'bottom' })
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`getLeaderboard: ${error.message}`);
  return (data as DomainSummary[]) ?? [];
}

/** Domains blocking a given crawler token, most-visited first. */
export async function getBlockersOf(token: string, tier: 1 | 2, limit = 100): Promise<DomainSummary[]> {
  const column = tier === 1 ? 'tier1_blocked' : 'tier2_blocked';
  const { data, error } = await publicClient()
    .from('domains')
    .select(SUMMARY_COLS)
    .eq('indexable', true)
    .contains(column, [token])
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`getBlockersOf(${token}): ${error.message}`);
  return (data as DomainSummary[]) ?? [];
}

export async function countBlockersOf(token: string, tier: 1 | 2): Promise<number> {
  const column = tier === 1 ? 'tier1_blocked' : 'tier2_blocked';
  const { count, error } = await publicClient()
    .from('domains')
    .select('domain', { count: 'exact', head: true })
    .eq('indexable', true)
    .contains(column, [token]);
  if (error) throw new Error(`countBlockersOf(${token}): ${error.message}`);
  return count ?? 0;
}

/** Domains that publish a machine surface file. The interesting short list, for now. */
export async function getPublishersOf(field: 'llms_txt' | 'agents_md', limit = 200): Promise<DomainSummary[]> {
  const { data, error } = await publicClient()
    .from('domains')
    .select(SUMMARY_COLS)
    .eq('indexable', true)
    .eq(field, true)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`getPublishersOf(${field}): ${error.message}`);
  return (data as DomainSummary[]) ?? [];
}

export type ChangeRow = {
  id: number;
  domain: string;
  changed_at: string;
  kind: 'score' | 'access' | 'surface' | 'reachability';
  summary: string;
};

export async function getRecentChanges(limit = 50): Promise<ChangeRow[]> {
  const { data, error } = await publicClient()
    .from('changes')
    .select('id, domain, changed_at, kind, summary')
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentChanges: ${error.message}`);
  return (data as ChangeRow[]) ?? [];
}

export async function getChangesFor(domain: string, limit = 25): Promise<ChangeRow[]> {
  const { data, error } = await publicClient()
    .from('changes')
    .select('id, domain, changed_at, kind, summary')
    .eq('domain', domain)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getChangesFor(${domain}): ${error.message}`);
  return (data as ChangeRow[]) ?? [];
}

/**
 * All indexable domains, for the sitemap.
 *
 * PostgREST caps a single response at `db-max-rows` (1000 on Supabase by default) and
 * silently returns a short list rather than erroring, so anything that must be complete
 * has to page explicitly. A sitemap quietly truncated to 1000 of 5000 pages is the exact
 * failure mode that would cap this index's search surface without anyone noticing.
 */
export async function getAllIndexedDomains(
  max = 200_000,
): Promise<Array<{ domain: string; observed_at: string | null }>> {
  const PAGE = 1000;
  const out: Array<{ domain: string; observed_at: string | null }> = [];
  const db = publicClient();

  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await db
      .from('domains')
      .select('domain, observed_at')
      .eq('indexable', true)
      .not('observed_at', 'is', null)
      .order('domain', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`getAllIndexedDomains: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function getLastCrawl(): Promise<{ finished_at: string | null; succeeded: number } | null> {
  const { data, error } = await publicClient()
    .from('crawl_runs')
    .select('finished_at, succeeded')
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}
