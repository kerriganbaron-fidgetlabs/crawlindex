-- Daily rollup as a single server-side aggregate.
--
-- The worker previously computed this with ~30 PostgREST round trips, one of which
-- pulled every score into Node to average it. PostgREST caps a response at `db-max-rows`
-- (1000) and truncates silently, so that average was quietly computed over the first
-- 1000 rows and would have drifted further from the truth as the corpus grew. Published
-- statistics cannot depend on a client-side row limit.
--
-- SECURITY INVOKER: this reads only data that is already public via RLS.

-- `tier1_total` is passed in rather than hardcoded: the crawler registry is versioned in
-- TypeScript, and a literal here would silently disagree with it the moment a tier-1
-- token is added.
create or replace function daily_rollup(tier1_total integer)
returns table (
  total_domains      integer,
  observed           integer,
  avg_score          numeric,
  blocking_any_tier1 integer,
  blocking_all_tier1 integer,
  llms_txt_count     integer,
  agents_md_count    integer,
  cloaking_count     integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::integer,
    count(score)::integer,
    round(avg(score)::numeric, 2),
    count(*) filter (where array_length(tier1_blocked, 1) > 0)::integer,
    count(*) filter (where coalesce(array_length(tier1_blocked, 1), 0) >= tier1_total)::integer,
    count(*) filter (where llms_txt)::integer,
    count(*) filter (where agents_md)::integer,
    count(*) filter (where cloaking)::integer
  from domains
  where indexable;
$$;

-- One row per crawler token with the number of indexable domains blocking it.
create or replace function bot_block_counts()
returns table (token text, blocked integer)
language sql
stable
security invoker
set search_path = public
as $$
  select t.token, count(*)::integer
  from domains d
  cross join lateral unnest(d.tier1_blocked || d.tier2_blocked) as t(token)
  where d.indexable
  group by t.token;
$$;

grant execute on function daily_rollup(integer) to anon, authenticated, service_role;
grant execute on function bot_block_counts() to anon, authenticated, service_role;
