-- Self-maintaining corpus hygiene.
--
-- Tranco ranks by traffic, so its head is full of DNS, CDN and telemetry hosts that have
-- no homepage anyone would read. A static exclusion list catches most of them and will
-- always miss some, and this index has to keep itself clean without a human curating it.
--
-- So: anything that fails at the transport layer repeatedly stops being part of the
-- published population. `indexable = false` removes a domain from pages, leaderboards
-- and every aggregate, but keeps the row and its evidence so the demotion is auditable
-- and reversible if the host comes back.

alter table domains
  add column if not exists indexable            boolean not null default true,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists excluded_reason      text;

create index if not exists domains_indexable_idx on domains (indexable) where indexable;
create index if not exists domains_public_score_idx
  on domains (score desc nulls last) where indexable and score is not null;
