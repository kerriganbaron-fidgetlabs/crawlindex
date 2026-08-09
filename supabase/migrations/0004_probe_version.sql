-- Record which probe produced each stored row.
--
-- Change detection compares a new observation against the last one. If the probe changed
-- in between, differences may be ours rather than the site's, and the change feed would
-- report "example.com now blocks GPTBot" when all that really happened is that we got
-- better at detecting bot walls. The feed's only value is that an entry means the site
-- did something, so a version mismatch must suppress the comparison rather than publish
-- a change we caused.

alter table domains add column if not exists probe_version text;

create index if not exists domains_probe_version_idx on domains (probe_version);
