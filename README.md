# CrawlIndex

**The open index of how the web treats AI agents.** https://crawlindex.org

A nightly crawler measures thousands of the most-visited domains and publishes, for each
one: which AI crawlers it blocks, whether it serves `llms.txt` or `agents.md`, whether it
hands a crawler something different from what it hands a browser, and a deterministic 0 to
100 readiness score. Aggregates, per-crawler pages, monthly reports and cross-tabs by CDN,
platform and TLD are all derived from the same data.

**The whole dataset is free.** CC BY 4.0, no key, no signup, no rate limit:
[`/data/domains.jsonl`](https://crawlindex.org/data/domains.jsonl).

Research and data by [Fidget Labs BV](https://fidgetlabs.io), Breda, Netherlands.

---

## Why it exists

Publishers are deciding, one robots.txt at a time, whether AI systems may read the web.
Those decisions are unannounced, changed silently, trivial to check individually and
invisible in aggregate. This measures them on a schedule and keeps the receipts.

The finding that makes the dataset worth having is not "who blocks GPTBot". It is **who
decided**. Most operators never formed a view; their CDN or their publishing platform
shipped a default and they inherited it. Grouping blocking rates by edge network and
platform makes that visible, and nobody else publishes it.

## The rules that make the numbers trustworthy

Enforced by `tests/`, not by convention. Do not relax them.

1. **No model in the scoring path.** `scoreObservation` is a pure function over archived
   evidence. Language models are used nowhere in measurement, scoring, or report prose.
2. **Unobservable is `null`, never 0**, and excluded from every aggregate.
3. **A measurement *we* failed to take is never charged to the site.** When the control
   request meets a bot wall, body-derived checks are marked unavailable and the total is
   renormalised, flagged `partial`, and kept out of leaderboards.
4. **A change must be the site's, not ours.** Nothing is reported as a change across a
   probe version or a crawl-location change. Improving our own detection, or moving where
   the crawler runs, must never be published as somebody else changing their policy.
5. **`robots.txt` is read first.** A group naming `CrawlIndexBot` and denying it is an
   opt-out that costs one request and takes effect on the next crawl.

A blanket `User-agent: * / Disallow: /` is deliberately *not* treated as an opt-out. We
fetch no pages, but the stated policy is still reported, because dropping the most
restrictive operators from an index about restrictiveness would bias every figure.

## How it runs

```
GitHub Actions (02:30 UTC)
  -> pnpm test          fail here and nothing is published
  -> pnpm seed          Mondays only, refreshes Tranco ranks
  -> pnpm crawl         ~40 min, writes data/
  -> pnpm build         a dataset that cannot build is not published
  -> opens a PR, merges it
       -> Vercel deploys main
```

No database. No server. No secrets in the published site. `main` requires a pull request
with no bypass, so the bot opens one like everyone else, which also makes `git log` a dated
changelog of how the web's AI policy moved.

Cost: nothing. Public repositories get unlimited Actions minutes, the dataset is files in
git, and the site is static.

## Layout

```
lib/
  agents.ts        version-pinned AI crawler registry
  robots.ts        RFC 9309 parser, group-aware, longest-match
  probe.ts         the 5-request probe
  fingerprints.ts  platform and CDN detection from bytes already fetched
  score.ts         the rubric, a pure function
  dataset.ts       reads data/, recomputes every score on load
  report.ts        monthly reports, templated so they stay citable
worker/
  seed.ts          Tranco corpus plus pinned domains
  crawl.ts         nightly pass, change detection, daily rollup
  store.ts         atomic reads and writes of data/
  probe-cli.ts     probe one domain, print it, write nothing
data/               the product. JSON Lines, sorted, git-diffable
app/                Next.js site, static JSON API, SVG badges, llms.txt, agents.md
```

## Running it

```
pnpm install
pnpm seed            # build the corpus
pnpm crawl           # measure it
pnpm dev
```

```
pnpm probe nytimes.com stripe.com   # no writes, prints observation and score
pnpm test                           # robots semantics, score determinism, fingerprints
```

## Licence

Two things, two licences. **Data** in `data/` is CC BY 4.0, yours to use with attribution.
**Code** is all rights reserved, published so the methodology is auditable rather than for
reuse. See [LICENSE](LICENSE).

## Support

There is none, by design. See [CONTRIBUTING.md](CONTRIBUTING.md). To leave the index,
disallow `CrawlIndexBot` in your robots.txt; that works immediately and needs nobody's
attention.
