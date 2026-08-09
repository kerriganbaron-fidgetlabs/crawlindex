-- CrawlIndex schema.
--
-- Shape notes:
--  * `domains` holds current state, one row per domain. The full observation is archived
--    as jsonb so any score can be recomputed from stored evidence at any later date.
--    Without that, a rubric change would silently orphan every historical number.
--  * `changes` is append-only and written only when something actually moved. Storing a
--    snapshot per domain per night would be mostly duplicate rows, and change-detection
--    is the thing worth selling anyway.
--  * `daily_stats` is a tiny pre-aggregated timeseries so the homepage and the monthly
--    report never scan the whole table.
--
-- Everything public is readable by `anon`. All writes go through the service role.

create table if not exists domains (
  domain            text primary key,
  rank              integer,
  category          text,
  first_seen        timestamptz not null default now(),
  observed_at       timestamptz,

  reachable         boolean,
  -- Our own control request was blocked. Body-derived findings were excluded.
  challenged        boolean not null default false,
  partial           boolean not null default false,

  score             integer,
  grade             text,

  tier1_blocked     text[] not null default '{}',
  tier2_blocked     text[] not null default '{}',
  blocks_any_ai     boolean not null default false,
  llms_txt          boolean not null default false,
  agents_md         boolean not null default false,
  cloaking          boolean not null default false,

  observation       jsonb,
  score_detail      jsonb,

  constraint score_range check (score is null or (score >= 0 and score <= 100))
);

create index if not exists domains_score_idx on domains (score desc nulls last);
create index if not exists domains_rank_idx on domains (rank asc nulls last);
create index if not exists domains_category_idx on domains (category);
create index if not exists domains_observed_idx on domains (observed_at desc);
create index if not exists domains_tier1_idx on domains using gin (tier1_blocked);
create index if not exists domains_tier2_idx on domains using gin (tier2_blocked);

-- Append-only log of real movements.
create table if not exists changes (
  id          bigserial primary key,
  domain      text not null references domains (domain) on delete cascade,
  changed_at  timestamptz not null default now(),
  kind        text not null check (kind in ('score', 'access', 'surface', 'reachability')),
  summary     text not null,
  before      jsonb,
  after       jsonb
);

create index if not exists changes_at_idx on changes (changed_at desc);
create index if not exists changes_domain_idx on changes (domain, changed_at desc);

-- One row per crawl. Provenance for every number the site publishes.
create table if not exists crawl_runs (
  id                bigserial primary key,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  attempted         integer not null default 0,
  succeeded         integer not null default 0,
  failed            integer not null default 0,
  changes_detected  integer not null default 0,
  registry_version  text,
  rubric_version    text,
  probe_version     text
);

create index if not exists crawl_runs_started_idx on crawl_runs (started_at desc);

-- Pre-aggregated daily rollup.
create table if not exists daily_stats (
  day                  date primary key,
  total_domains        integer not null,
  observed             integer not null,
  avg_score            numeric(5, 2),
  blocking_any_tier1   integer not null default 0,
  blocking_all_tier1   integer not null default 0,
  llms_txt_count       integer not null default 0,
  agents_md_count      integer not null default 0,
  cloaking_count       integer not null default 0,
  -- token -> number of observed domains blocking it
  per_bot              jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Row level security. The index is public data; the write path is not.
-- ---------------------------------------------------------------------------
alter table domains     enable row level security;
alter table changes     enable row level security;
alter table crawl_runs  enable row level security;
alter table daily_stats enable row level security;

drop policy if exists "public read domains"     on domains;
drop policy if exists "public read changes"     on changes;
drop policy if exists "public read crawl_runs"  on crawl_runs;
drop policy if exists "public read daily_stats" on daily_stats;

create policy "public read domains"     on domains     for select to anon, authenticated using (true);
create policy "public read changes"     on changes     for select to anon, authenticated using (true);
create policy "public read crawl_runs"  on crawl_runs  for select to anon, authenticated using (true);
create policy "public read daily_stats" on daily_stats for select to anon, authenticated using (true);

-- No insert/update/delete policies exist by design. The worker uses the service role,
-- which bypasses RLS. Anything else gets a silent zero-row write, which is why every
-- worker write asserts on returned rows rather than trusting a 2xx.
