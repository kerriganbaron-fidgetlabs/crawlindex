import { AGENTS } from './agents';
import { publicClient } from './supabase';
import type { DailyStats } from './queries';

/**
 * Monthly report data.
 *
 * The prose around these numbers is templated rather than model-written, for the same
 * reason no model touches a score: a report that gets cited has to say the same thing
 * every time it is regenerated. A sentence that drifts between renders is not a citable
 * source.
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
  changeCounts: Record<string, number>;
  notableChanges: Array<{ domain: string; summary: string; changed_at: string; kind: string }>;
};

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Months that have at least one day of data, newest first. */
export async function getReportMonths(): Promise<string[]> {
  const { data, error } = await publicClient()
    .from('daily_stats')
    .select('day')
    .order('day', { ascending: false })
    .limit(1000);
  if (error) return [];
  const months = new Set((data ?? []).map((r: { day: string }) => r.day.slice(0, 7)));
  return [...months];
}

export async function getMonthReport(month: string): Promise<MonthReport | null> {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const db = publicClient();

  const { data: rows, error } = await db
    .from('daily_stats')
    .select('*')
    .gte('day', `${month}-01`)
    .lte('day', `${month}-31`)
    .order('day', { ascending: true });
  if (error || !rows?.length) return null;

  const series = rows as DailyStats[];
  const first = series[0];
  const last = series[series.length - 1];

  const { data: changeRows } = await db
    .from('changes')
    .select('domain, summary, changed_at, kind')
    .gte('changed_at', `${month}-01T00:00:00Z`)
    .lte('changed_at', `${month}-31T23:59:59Z`)
    .order('changed_at', { ascending: false })
    .limit(500);

  const changeCounts: Record<string, number> = {};
  for (const c of changeRows ?? []) changeCounts[c.kind] = (changeCounts[c.kind] ?? 0) + 1;

  const bots = AGENTS.map((a) => {
    const blocked = last.per_bot?.[a.token] ?? 0;
    return {
      token: a.token,
      operator: a.operator,
      tier: a.tier,
      blocked,
      delta: blocked - (first.per_bot?.[a.token] ?? 0),
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
      blockingAnyTier1: last.blocking_any_tier1 - first.blocking_any_tier1,
      llmsTxt: last.llms_txt_count - first.llms_txt_count,
      agentsMd: last.agents_md_count - first.agents_md_count,
      meanScore:
        last.avg_score !== null && first.avg_score !== null
          ? Number((last.avg_score - first.avg_score).toFixed(2))
          : null,
    },
    bots,
    changeCounts,
    // Crawler-policy reversals are the interesting ones. Score drift is noise by comparison.
    notableChanges: (changeRows ?? []).filter((c) => c.kind === 'access' || c.kind === 'surface').slice(0, 40),
  };
}

/** "rose by 12" / "fell by 3" / "did not change". Used so the prose never contradicts the table. */
export function movement(delta: number, unit = ''): string {
  if (delta === 0) return `did not change${unit ? ` ${unit}` : ''}`;
  const dir = delta > 0 ? 'rose' : 'fell';
  return `${dir} by ${Math.abs(delta).toLocaleString()}${unit ? ` ${unit}` : ''}`;
}
