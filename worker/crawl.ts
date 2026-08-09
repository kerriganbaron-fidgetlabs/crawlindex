/**
 * The nightly crawl.
 *
 * Reads the least-recently-observed domains, probes them, scores them, records only the
 * changes, and refreshes the daily rollup. Designed to be killed and restarted at any
 * point: work is claimed by ordering on `observed_at`, and every domain is written as
 * soon as it is measured rather than batched to the end.
 *
 *   pnpm crawl                    # default slice
 *   pnpm crawl --limit 500 --concurrency 12
 *   pnpm crawl --domains a.com,b.com
 */

import { AGENTS } from '../lib/agents';
import { mapPool, normaliseDomain, pruneGate } from '../lib/http';
import { PROBE_VERSION, probeDomain } from '../lib/probe';
import { RUBRIC_VERSION, scoreObservation } from '../lib/score';
import { REGISTRY_VERSION } from '../lib/agents';
import type { Observation, Score } from '../lib/types';
import { assertWrote, serviceClient } from './env';

type ExistingRow = {
  domain: string;
  observed_at: string | null;
  probe_version: string | null;
  score: number | null;
  reachable: boolean | null;
  consecutive_failures: number;
  tier1_blocked: string[];
  llms_txt: boolean;
  agents_md: boolean;
  cloaking: boolean;
};

/** Hard failures tolerated before a domain stops being part of the published population. */
const DEMOTE_AFTER_FAILURES = 3;

type Change = {
  domain: string;
  kind: 'score' | 'access' | 'surface' | 'reachability';
  summary: string;
  before: unknown;
  after: unknown;
};

/** Only movements worth telling someone about. A one-point drift is noise. */
const SCORE_NOISE_FLOOR = 3;

function diff(prev: ExistingRow | undefined, obs: Observation, score: Score): Change[] {
  // A domain's first observation is its baseline, not a change. Without this guard every
  // site that already blocks a crawler would announce itself as "now blocks GPTBot" on
  // the night we first look at it, and the change feed would be worthless.
  if (!prev || !prev.observed_at) return [];

  // Comparing across probe versions attributes our own methodology changes to the site.
  // Skip one night rather than publish a change nobody made.
  if (prev.probe_version !== obs.probeVersion) return [];
  const out: Change[] = [];

  if (prev.reachable !== null && prev.reachable !== obs.reachable) {
    out.push({
      domain: obs.domain,
      kind: 'reachability',
      summary: obs.reachable ? 'Came back online.' : `Went unreachable: ${obs.error ?? 'no response'}.`,
      before: { reachable: prev.reachable },
      after: { reachable: obs.reachable, error: obs.error },
    });
  }

  const before = new Set(prev.tier1_blocked ?? []);
  const after = new Set(obs.tier1Blocked);
  const newlyBlocked = [...after].filter((t) => !before.has(t));
  const newlyAllowed = [...before].filter((t) => !after.has(t));
  if (newlyBlocked.length || newlyAllowed.length) {
    const parts: string[] = [];
    if (newlyBlocked.length) parts.push(`now blocks ${newlyBlocked.join(', ')}`);
    if (newlyAllowed.length) parts.push(`now allows ${newlyAllowed.join(', ')}`);
    out.push({
      domain: obs.domain,
      kind: 'access',
      summary: `${obs.domain} ${parts.join('; ')}.`,
      before: { tier1Blocked: [...before] },
      after: { tier1Blocked: [...after] },
    });
  }

  if (prev.llms_txt !== obs.llmsTxt.present || prev.agents_md !== obs.agentsMd.present) {
    const bits: string[] = [];
    if (prev.llms_txt !== obs.llmsTxt.present) bits.push(`llms.txt ${obs.llmsTxt.present ? 'added' : 'removed'}`);
    if (prev.agents_md !== obs.agentsMd.present) bits.push(`agents.md ${obs.agentsMd.present ? 'added' : 'removed'}`);
    out.push({
      domain: obs.domain,
      kind: 'surface',
      summary: `${obs.domain}: ${bits.join(', ')}.`,
      before: { llmsTxt: prev.llms_txt, agentsMd: prev.agents_md },
      after: { llmsTxt: obs.llmsTxt.present, agentsMd: obs.agentsMd.present },
    });
  }

  if (
    prev.score !== null &&
    score.total !== null &&
    Math.abs(prev.score - score.total) >= SCORE_NOISE_FLOOR
  ) {
    const delta = score.total - prev.score;
    out.push({
      domain: obs.domain,
      kind: 'score',
      summary: `Score ${delta > 0 ? 'rose' : 'fell'} ${Math.abs(delta)} points to ${score.total}.`,
      before: { score: prev.score },
      after: { score: score.total },
    });
  }

  return out;
}

function rowFor(obs: Observation, score: Score, prev: ExistingRow | undefined) {
  const failures = obs.reachable ? 0 : (prev?.consecutive_failures ?? 0) + 1;
  const demoted = failures >= DEMOTE_AFTER_FAILURES;

  // An operator who disallows CrawlIndexBot leaves the published index immediately. The
  // methodology page promises exactly this, so it has to happen on the first crawl that
  // sees the rule, not after a grace period.
  const excludedReason = obs.optedOut
    ? 'Opted out via robots.txt'
    : demoted
      ? `Unreachable on ${failures} consecutive crawls: ${obs.error ?? 'no response'}`
      : null;

  return {
    consecutive_failures: failures,
    probe_version: obs.probeVersion,
    indexable: !obs.optedOut && !demoted,
    excluded_reason: excludedReason,
    domain: obs.domain,
    observed_at: obs.observedAt,
    reachable: obs.reachable,
    challenged: obs.control.challenged,
    partial: score.partial,
    score: score.total,
    grade: score.grade,
    tier1_blocked: obs.tier1Blocked,
    tier2_blocked: obs.tier2Blocked,
    blocks_any_ai: obs.tier1Blocked.length > 0 || obs.tier2Blocked.length > 0,
    llms_txt: obs.llmsTxt.present,
    agents_md: obs.agentsMd.present,
    cloaking: obs.cloaking.detected,
    observation: obs,
    score_detail: score,
  };
}

async function refreshDailyStats(db: ReturnType<typeof serviceClient>) {
  const day = new Date().toISOString().slice(0, 10);
  const tier1Total = AGENTS.filter((a) => a.tier === 1).length;

  // One server-side aggregate. See migration 0003 for why this is not done client side.
  const { data: rollup, error: rollupErr } = await db.rpc('daily_rollup', { tier1_total: tier1Total });
  if (rollupErr) throw new Error(`daily_rollup failed: ${rollupErr.message}`);
  const r = Array.isArray(rollup) ? rollup[0] : rollup;
  if (!r) throw new Error('daily_rollup returned no rows.');

  const { data: botRows, error: botErr } = await db.rpc('bot_block_counts');
  if (botErr) throw new Error(`bot_block_counts failed: ${botErr.message}`);

  const perBot: Record<string, number> = {};
  for (const a of AGENTS) perBot[a.token] = 0;
  for (const row of (botRows ?? []) as Array<{ token: string; blocked: number }>) {
    if (row.token in perBot) perBot[row.token] = row.blocked;
  }

  const { data, error } = await db
    .from('daily_stats')
    .upsert(
      {
        day,
        total_domains: r.total_domains,
        observed: r.observed,
        avg_score: r.avg_score,
        blocking_any_tier1: r.blocking_any_tier1,
        blocking_all_tier1: r.blocking_all_tier1,
        llms_txt_count: r.llms_txt_count,
        agents_md_count: r.agents_md_count,
        cloaking_count: r.cloaking_count,
        per_bot: perBot,
      },
      { onConflict: 'day' },
    )
    .select('day');
  if (error) throw new Error(`daily_stats upsert failed: ${error.message}`);
  assertWrote(data, 'daily_stats upsert', 1);

  console.log(
    `
Daily stats ${day}: ${r.observed}/${r.total_domains} observed, avg ${r.avg_score ?? 'n/a'}, ` +
      `${r.blocking_any_tier1} blocking at least one answer-surface crawler.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const num = (flag: string, dflt: number) => {
    const i = args.indexOf(flag);
    return i >= 0 ? Number(args[i + 1]) : dflt;
  };
  const limit = num('--limit', 2000);
  const concurrency = num('--concurrency', 16);
  const explicitIdx = args.indexOf('--domains');
  const explicit = explicitIdx >= 0 ? args[explicitIdx + 1].split(',').map(normaliseDomain) : null;

  const db = serviceClient();

  const { data: run, error: runErr } = await db
    .from('crawl_runs')
    .insert({
      registry_version: REGISTRY_VERSION,
      rubric_version: RUBRIC_VERSION,
      probe_version: PROBE_VERSION,
    })
    .select('id')
    .single();
  if (runErr || !run) throw new Error(`could not open crawl run: ${runErr?.message}`);
  const runId = run.id as number;

  // Least-recently-observed first, never-observed before that.
  //
  // PostgREST caps a single response at `db-max-rows` (1000 on Supabase) and returns a
  // short list rather than an error, so a --limit above that has to be paged. Without
  // this the crawler silently works on the first 1000 rows forever and the rest of the
  // corpus is never measured.
  const COLS =
    'domain, observed_at, probe_version, score, reachable, consecutive_failures, tier1_blocked, llms_txt, agents_md, cloaking';
  const PAGE = 1000;
  const targets: ExistingRow[] = [];

  if (explicit) {
    const { data, error } = await db.from('domains').select(COLS).in('domain', explicit);
    if (error) throw new Error(`could not load targets: ${error.message}`);
    targets.push(...((data as unknown as ExistingRow[]) ?? []));
  } else {
    for (let from = 0; from < limit; from += PAGE) {
      const size = Math.min(PAGE, limit - from);
      const { data, error } = await db
        .from('domains')
        .select(COLS)
        .eq('indexable', true)
        .order('observed_at', { ascending: true, nullsFirst: true })
        .order('domain', { ascending: true })
        .range(from, from + size - 1);
      if (error) throw new Error(`could not load targets: ${error.message}`);
      if (!data?.length) break;
      targets.push(...(data as unknown as ExistingRow[]));
      if (data.length < size) break;
    }
  }

  if (!targets.length) {
    console.log('Nothing to crawl.');
    return;
  }

  const prevByDomain = new Map<string, ExistingRow>(targets.map((r) => [r.domain, r]));
  const domains = targets.map((r) => r.domain);

  console.log(`Crawling ${domains.length} domains at concurrency ${concurrency}...`);
  const started = Date.now();
  let done = 0;
  let succeeded = 0;
  let failed = 0;
  let changesDetected = 0;

  await mapPool(domains, concurrency, async (domain) => {
    let obs: Observation;
    try {
      obs = await probeDomain(domain);
    } catch (e) {
      failed++;
      done++;
      return null;
    }
    const score = scoreObservation(obs);

    const { data, error } = await db
      .from('domains')
      .update(rowFor(obs, score, prevByDomain.get(domain)))
      .eq('domain', domain)
      .select('domain');
    if (error || !data?.length) {
      failed++;
      done++;
      console.error(`\n  write failed for ${domain}: ${error?.message ?? 'zero rows'}`);
      return null;
    }

    const changes = diff(prevByDomain.get(domain), obs, score);
    if (changes.length) {
      const { error: chErr } = await db.from('changes').insert(changes).select('id');
      if (chErr) console.error(`\n  change log failed for ${domain}: ${chErr.message}`);
      else changesDetected += changes.length;
    }

    if (obs.reachable) succeeded++;
    else failed++;
    done++;
    if (done % 25 === 0) {
      pruneGate();
      const rate = done / ((Date.now() - started) / 1000);
      process.stdout.write(
        `\r  ${done}/${domains.length}  ok:${succeeded} fail:${failed} changes:${changesDetected}  ${rate.toFixed(1)}/s`,
      );
    }
    return null;
  });

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(
    `\rCrawled ${done}/${domains.length} in ${elapsed}s. ok:${succeeded} fail:${failed} changes:${changesDetected}`,
  );

  await db
    .from('crawl_runs')
    .update({
      finished_at: new Date().toISOString(),
      attempted: domains.length,
      succeeded,
      failed,
      changes_detected: changesDetected,
    })
    .eq('id', runId)
    .select('id');

  await refreshDailyStats(db);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
