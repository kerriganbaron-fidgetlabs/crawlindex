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

The second finding is the **policy gap**. robots.txt is a published promise; what a server
does when a crawler carrying an AI user agent actually knocks is a separate fact. Every
other index in this category publishes the first. This one has measured both on every
domain since the first crawl, and roughly one site in seven permits GPTBot in robots.txt
and refuses it at the server.

## The rules that make the numbers trustworthy

Enforced by `tests/`, not by convention. Do not relax them.

1. **No model in the scoring path.** `scoreObservation` is a pure function over archived
   evidence. Language models are used nowhere in measurement, scoring, or report prose.
2. **Unobservable is `null`, never 0**, and excluded from every aggregate.
3. **A measurement *we* failed to take is never charged to the site.** When the control
   request meets a bot wall, body-derived checks are marked unavailable and the total is
   renormalised, flagged `partial`, and kept out of leaderboards. This covers the quiet
   case too: a homepage answering 200 with 2KB and no readable text is an anti-automation
   stub, not a page, and scoring it once put twenty regional Amazon domains at the bottom
   of the leaderboard on the strength of a placeholder none of them served to a person.
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
  -> pnpm intake        adds submitted domains from GitHub issues
  -> pnpm crawl         ~50 min, writes data/
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
  probe.ts         the 6-request probe
  corpus-rules.ts  which domains belong in the index. Pure, no side effects
  fingerprints.ts  platform and CDN detection from bytes already fetched
  score.ts         the rubric, a pure function, plus the stub-response rule
  facets.ts        policy posture, access archetype, the policy gap, percentile
  entities.ts      one row per operator in ranked views. A view, never a filter
  dataset.ts       reads data/, recomputes every score and facet on load
  report.ts        monthly reports, sealed on month roll so they stay citable
  badge.ts         the tiered award mark, rendered as self-contained SVG
  glossary.ts      one definition per term, used by three surfaces at once
worker/
  seed.ts          Tranco corpus plus pinned domains
  intake.ts        domain submissions, read from GitHub issues
  crawl.ts         nightly pass, change detection, daily rollup, report sealing
  store.ts         atomic reads and writes of data/
  probe-cli.ts     probe one domain, print it, write nothing
  entrypoint.ts    guards main() so importing a worker never runs it
data/               the product. JSON Lines, sorted, git-diffable
  reports/          sealed monthly reports. Written once, never rewritten
app/                Next.js site, static JSON API, SVG marks, llms.txt, agents.md
components/         charts (hand-rolled SVG), motion, search, inline definitions
```

Every score line, facet and chart recomputes from archived evidence on load. No model runs
in the scoring path, and nothing on a page is animated into existence: the server renders
the true value and motion is only ever added on top of it.

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
