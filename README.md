# CrawlIndex

The open index of how the web treats AI agents.

> **Read [`docs/HANDOVER.md`](docs/HANDOVER.md) first.** It records the goal this was built
> against, why it is **not** an income project, the measured costs, and the open decisions.

Live: https://crawlindex.vercel.app

A nightly crawler measures Tranco-ranked domains and publishes, per domain, which AI
crawlers they block, whether they serve `llms.txt` or `agents.md`, whether they hand a
crawler something different from what they hand a browser, and a deterministic 0 to 100
readiness score. Aggregate figures, per-crawler pages and a change feed are derived from
the same data.

## Why it exists

Publishers are deciding one robots.txt at a time whether AI systems may read the web.
Those decisions are unannounced, changed silently, trivial to check individually and
invisible in aggregate. This measures them on a schedule and keeps the receipts.

## The rules that make the numbers trustworthy

These are enforced by `tests/`, not by convention.

1. **No model in the scoring path.** `scoreObservation` is a pure function over recorded
   evidence. Language models are used nowhere in measurement or scoring.
2. **Unobservable is not zero.** A site that cannot be reached scores `null` and is
   excluded from every aggregate rather than counted as a failure.
3. **Our failures are not charged to the site.** When the control request meets a bot
   wall, everything derived from that HTML describes the wall. Those lines are marked
   unavailable and the total is renormalised over what remained, then flagged `partial`
   and kept out of leaderboards.
4. **Everything is versioned.** Every stored row records the registry, probe and rubric
   versions it was produced under, and archives the full observation so any score can be
   recomputed later.

`robots.txt` is read before anything else, so an operator who disallows `CrawlIndexBot`
costs their server one request and leaves the index on that crawl.

## Layout

```
lib/
  agents.ts     version-pinned AI crawler registry
  robots.ts     RFC 9309 parser, group-aware, longest-match
  probe.ts      the 5-request lite probe
  score.ts      the rubric, a pure function
  findings.ts   derived readings over stored observations
  queries.ts    read path for the site (paginates past PostgREST's 1000-row cap)
worker/
  seed.ts       Tranco corpus loader plus infrastructure filtering
  crawl.ts      nightly batch, change detection, daily rollup
  probe-cli.ts  probe one domain, print the result, write nothing
  nightly.cmd   Task Scheduler entry point
app/            Next.js site, JSON API, SVG badge, llms.txt, agents.md
supabase/       migrations
```

## Running it

```
pnpm install
cp .env.example .env.local     # fill in the Supabase URL plus anon and service role keys
pnpm seed --count 5000         # load the corpus
pnpm crawl --limit 6000        # measure it
pnpm dev
```

Useful during development:

```
pnpm probe nytimes.com stripe.com    # no writes, prints observation and score
pnpm test                            # robots semantics and score determinism
```

## Operations

- Nightly crawl runs on **GitHub Actions** at 02:30 UTC (`.github/workflows/nightly-crawl.yml`).
  It previously ran on the Builder machine via Task Scheduler; that made a hands-off project
  depend on the gaming PC being awake, so it was moved. A full pass is ~43 min on a hosted
  runner, which is ~1,300 of the 2,000 free private-repo minutes per month. Making the repo
  public removes that limit. The site reads Supabase through ISR, so a finished crawl is live
  within the hour and no deploy is involved.
- Re-seeding on Mondays refreshes Tranco ranks and demotes newly recognised
  infrastructure hosts.
- Domains that fail at the transport layer three crawls running are demoted out of the
  published population automatically, with the reason recorded.

## Licence

Code: proprietary, Fidget Labs BV. Published data: CC BY 4.0.
