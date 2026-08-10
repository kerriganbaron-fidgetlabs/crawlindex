# CrawlIndex handover

**Last updated:** 2026-08-10, end of the v2 build session.
**Status:** Live at https://crawlindex.org, public, self-running, EUR 0/month.
**Audience:** whoever touches this next, human or agent. Probably nobody, which is the point.

> **v2, 2026-08-10.** Design doc: `docs/superpowers/specs/2026-08-10-crawlindex-v2-design.md`.
> Section 9 below summarises what changed and the two bugs it fixed. Probe is now 3.0.0 and
> the rubric 2.0.0, so **the first crawl after this deploy re-scores the whole corpus and
> suppresses change detection for one night.** That is intended.
>
> **v2.1, 2026-08-10.** Section 10. Fixes a live bug that made most of the published change
> feed fiction, adds a run-health gate, and rebuilds the score distribution, the badge and
> `/check`. **`data/changes.jsonl` and `data/stats.json` were deliberately emptied**: every
> figure measured before this point was provisional and is not worth preserving.

---

## 1. What this is, and what it is not

CrawlIndex is a public measurement project: a nightly crawl of the most-visited domains on
the web, publishing how each one treats AI crawlers and agents, with the full dataset free
under CC BY 4.0.

**It is not an income project.** That was the original brief and it failed on the evidence.
Section 3 records why, so nobody re-runs the experiment.

What it *is*: a genuinely useful open dataset, a credibility asset for Fidget Labs, and a
demonstration that a public good can be built so it costs nothing and needs nobody.

---

## 2. The original goal and how we got here

The brief was to find and build an income stream needing no operator input, with its own
marketing, seeded at EUR 250, aiming at passive profitability.

Options investigated and rejected, with evidence:

| Option | Why not |
|---|---|
| Paid MCP servers, x402 | Infrastructure shipped (Cloudflare Monetization Gateway, Stripe Machine Payments) but revenue did not. One operator publicly reported zero conversions across 169M x402 payments. |
| Shopify app, AI readiness | Shopify ships `/llms.txt`, `/agents.md` and `.well-known/ucp` natively, and 6+ apps already own the category. |
| Shopify app, anything | 30+ day review waits against an 8-10 day SLA, 1-star reviews triggered by Shopify's own billing behaviour, "most installs never turn into revenue". It is a support business. |
| Apify actors | ~54,000 listings, creator pays compute, scrapers break constantly. Fails the no-oversight test. |
| Gumroad / Lemon Squeezy | Median creator earns ~$72/month. A checkout, not a channel. |

CrawlIndex was built on the reasoning that its distribution was structural (SEO, badge
backlinks, citable reports). That reasoning had a hole, described next.

---

## 3. Why it is not a business, and do not try again

**The reasoning error:** selection optimised for *"is the distribution structural"* and
never asked *"will anyone pay"*. The research to answer the second question was available
the whole time and was not run until after the build. That is the same failure that
produced three other live products with no paying customers.

**The evidence against monetising this specifically:**

- **Nobody pays for crawler-policy data.** HasData's AI Crawler Block Index and
  Originality.ai's GPTBot studies are content marketing for their real products.
  NeuralCrawl shows no business at all. It is a study category, not a product category.
- **The one profitable comparable proves the opposite point.** BuiltWith is ~$14M ARR with
  effectively one employee, selling *prospecting lists*. Buyers trace "sites using Shopify"
  to sales revenue. "Who blocks GPTBot" traces to nothing.
- **Search demand is thin.** Tens to low hundreds a month for brand queries, low thousands
  for head terms, already split across a dozen free `llms.txt` checkers.
- **The badge loop will not fire.** SSL Labs badges work because security is a trust signal
  *buyers* care about. No merchant's customer cares about an agent-readiness score.

**Do not bolt Stripe onto this.** There is no buyer with budget and urgency.

`Global_CLAUDE.md` already says it: *"Path is consulting margin and product revenue, not
speculative passive products."* That was right before the question was asked.

---

## 4. How it runs, and why nothing needs maintaining

```
GitHub Actions, 02:30 UTC daily
  pnpm test     -> broken rubric publishes nothing
  pnpm seed     -> Mondays only, refreshes Tranco ranks and re-applies exclusions
  pnpm intake   -> adds submitted domains from GitHub issues
  pnpm crawl    -> ~50 min, writes data/
  pnpm verify:rescore -> archived records must rescore to their published values
  pnpm build    -> a dataset that cannot build is not published
  opens a PR and merges it
    -> Vercel deploys main
```

Every failure mode was designed out rather than monitored:

- **No database.** The dataset is JSON Lines in `data/`, committed. Nothing to pause,
  expire, exhaust a free tier, or fall over at 3am. Git history is the provenance, which is
  a feature for a public dataset rather than a workaround.
- **No secrets in the site.** No API keys, no service-role tokens, nothing to rotate. The
  Action uses only the built-in `GITHUB_TOKEN`.
- **No server.** Every page, JSON endpoint and badge is a static file. There is no runtime
  that can be slow or down. The single exception is `/check`, which runs a live probe.
- **Failure is safe.** A crawl that dies writes nothing, so the previously published
  dataset stays deployed. A seed failure keeps yesterday's corpus. A corrupt data line is
  skipped rather than crashing the build.
- **The corpus maintains itself.** Hosts failing three consecutive crawls are demoted with
  a recorded reason; the Monday re-seed refreshes ranks and retro-applies exclusion rules.
- **Cost is structurally zero.** Public repo means unlimited Actions minutes; static site
  on an existing Vercel plan; no database.

### Costs, measured not guessed

| Item | Cost |
|---|---|
| Supabase | **Deleted 2026-08-09.** Was ~EUR 20/mo. Project `hhwvttuhnhqkehcvouxv` is gone; the dataset lives in git. |
| GitHub Actions | EUR 0. Public repos get unlimited minutes. A full pass is ~40 min. |
| Vercel | EUR 0 incremental, rides the existing plan. Static output, so no function cost. |
| Domain | ~$9/yr, `crawlindex.org`, registered to 2027-08-09, auto-renew on. |
| Electricity | EUR 0. The crawl no longer runs on the Builder machine. |

**If the repo is ever made private again**, Actions stops being free: ~40 min/night is
~1,200 of the 2,000 free monthly minutes. Revisit the schedule if that happens.

---

## 5. Design decisions worth understanding before changing anything

### The five rules

They are in the README and enforced by `tests/`. The two least obvious:

**A measurement we failed to take is never charged to the site.** Reddit scored 3/100 in an
early run because our own crawler hit a JavaScript proof-of-work wall. Publishing that
would have been a lie about Reddit. Bot-wall responses now mark body-derived lines
unavailable and renormalise the total over what remains.

**A change must be the site's, not ours.** Change detection refuses to diff across a probe
version or a vantage change. Both were real incidents: a probe improvement nearly published
"example.com now blocks GPTBot" for sites that had done nothing, and moving the crawler from
Windows to GitHub's runners produced 25 phantom changes per 150 domains.

### Blanket blocks are not opt-outs

A site with `User-agent: * / Disallow: /` is telling every crawler to stay out, and we
honour that by fetching no pages. But it is **not** the same as naming `CrawlIndexBot`.
Treating it as an opt-out silently deleted the 163 most restrictive operators from an index
whose subject is restrictiveness. Only a group that names the token is an opt-out.

### Why records archive observations, not scores

`data/domains.jsonl` stores the evidence; `lib/dataset.ts` recomputes every score on load.
That guarantees a leaderboard can never disagree with a detail page, and it means a rubric
change re-scores history instead of orphaning it. `access` is omitted on disk because it is
fully implied by the blocked lists, saving ~600 bytes a record.

### Why JSON Lines, sorted, with stable key order

All three keep the nightly git commit small. An unsorted or unstable-key file rewrites every
line every night and turns a 4MB dataset into gigabytes of history within a year.

---

## 5b. Repository settings that the pipeline depends on

These are not in code, so they are invisible until they break something. All three were
discovered by the pipeline failing.

- **Actions may create and approve pull requests.** `default_workflow_permissions: write`
  and `can_approve_pull_request_reviews: true` on
  `/repos/.../actions/permissions/workflow`. Off by default; without it the nightly run
  crawls successfully and then dies at `gh pr create`.
- **Ruleset `protect main`** (id 20608407) requires a pull request with zero approvals and
  no bypass actors. Zero approvals is what lets the bot merge its own PR. Requiring one
  would stall the pipeline forever.
- **Squash merge and auto-delete branch enabled**, so data branches do not accumulate.
- **The repository must stay public** for Actions minutes to be free.

## 6. Known limits, stated honestly

- **Single vantage point.** Everything is measured from GitHub's US/EU runners. Origins
  serve differently by geography and IP reputation, so the index describes what an agent on
  that network sees. `vantage` is recorded on every record and change detection respects it,
  but the geographic bias is real and undisclosed nowhere else.
- **Cloaking detection is byte-size based.** `botBytes < browserBytes * 0.25` plus explicit
  refusals. Dynamic pages vary legitimately, so treat individual results as indicative and
  the aggregate as sound.
- **Fingerprints will drift.** Platforms and CDNs change their headers. A wrong label
  poisons a cross-tab, so the rule is: never guess, `null` is fine, and cohorts under 25
  sites are not published.
- **Forking cannot be disabled.** GitHub only permits that on org-owned *private* repos, and
  their terms grant fork rights on public repos regardless. The LICENSE reserves all code
  rights instead; forking copies bytes, not permission.
- **`/check` is the one dynamic route.** It needs `outputFileTracingIncludes` in
  `next.config.mjs` to read the dataset at runtime. Remove that and it breaks in production
  while working perfectly locally.

---

## 7. If you change something

- **Changing the rubric** means bumping `RUBRIC_VERSION`. Historical records keep the
  version they were scored under, and scores are recomputed from evidence on load, so a
  rubric change re-scores the whole history consistently. That is intended.
- **Changing the probe** means bumping `PROBE_VERSION`, which suppresses change detection
  for one night. That is intended too.
- **Adding a crawler token** means bumping `REGISTRY_VERSION`. Check
  `TIER1.length` assumptions if you add a tier-1 token.
- **Adding a fingerprint** needs a test in `tests/fingerprints.test.ts`, including a
  negative case proving it does not fire on prose that merely mentions the vendor.
- Run `pnpm test` before anything. Forty-eight tests, and they exist because each one
  corresponds to a real mistake that reached production or nearly did.

---

## 8. Open items

1. **Nothing is required.** The site runs indefinitely without intervention. Everything
   below is optional.
2. Reports publish themselves and now seal themselves. See section 9.
3. If a cross-tab ever looks implausible, the likely cause is a fingerprint misfiring.
   `pnpm probe <domain>` prints the detection for one site without writing anything.

---

## 9. What v2 changed, 2026-08-10

### Two real bugs

**The soft wall.** `amazon.com` was stored as HTTP 200, 2,167 bytes, `&nbsp;` title, zero
extractable text. `detectChallenge` looked for 402/403/429/451, vendor fingerprints and
auto-submitting forms, and a 200-with-nothing-in-it slipped through all of them. Eight
body-derived score lines were therefore charged to Amazon, it scored 8 out of 100, and
twenty regional Amazon domains occupied most of the bottom of the leaderboard. That is a
straight violation of design rule 3.

Fixed in two places on purpose. `detectChallenge` raises the new `ControlKind: 'unreadable'`
for fresh crawls, and `bodyIsStub()` in `lib/score.ts` re-derives the same condition from
archived evidence, so the four thousand records already on disk were corrected on load
rather than waiting for a re-crawl. Thresholds: under 5,000 bytes **and** under 100
characters of text, both required. tiktok.com ships 362KB with 22 characters and correctly
does not trip it.

**The self-rewriting reports.** `getMonthReport` read a past month's cross-tabs from the
live dataset and its change list from a rolling 4,000-record window, so July's report said
something different in September and eventually lost its own changes. A completed month is
now sealed to `data/reports/YYYY-MM.json` by the crawl and never rewritten; the month in
progress is computed live and labelled as moving. `writeFrozenReport` refuses to overwrite,
and that refusal is the feature.

### An import side effect worth remembering

`worker/*.ts` call `main()` at module scope. When `intake.ts` imported one predicate from
`seed.ts`, that started a live Tranco fetch and a second concurrent write to `corpus.json`
purely as an import side effect. The test suite caught it. Shared rules moved to
`lib/corpus-rules.ts`, which does nothing on load, and every worker now guards `main()`
with `isEntrypoint(import.meta.url)`.

### Rubric 2.0.0 and probe 3.0.0

Bands still total 45 / 25 / 30. Five lines added, existing weights trimmed to pay for them:
`declared-licence` (RSL `License:` in robots.txt), `content-signal`, `agent-card`,
`dateline`, `authorship`.

Everything new is derived from bytes already fetched except **one** extra request, to
`/.well-known/agent-card.json`. Six requests per domain now, up from five, so a full pass is
roughly 50 minutes rather than 40. Free either way on a public repo.

Checked against deployment reality before selection: `/.well-known/mcp.json` is not a
canonical path and A2A cards live at `agent-card.json`, so the intended MCP signal was
dropped. Cloudflare's `Content-Signal:` robots directive is real and free to read, and
tracking its spread measures this project's own central claim.

**Records predating probe 3 score the new lines `available: false`, never zero**, and
`partial` compares against `expectedMax` rather than 100. Without that, upgrading the probe
would have marked every archived record partial, emptied the leaderboard, and published a
fabricated decline for four thousand sites that did nothing.

### Facets, published beside the score rather than folded into it

`lib/facets.ts`: policy posture (deliberate / inherited / blanket / absent), access
archetype, and the **policy gap**, which is the strongest thing in the dataset and costs
nothing. robots.txt permitting GPTBot while the server refuses it was measurable from day
one and nobody had crossed the two halves. 533 sites, 14.7%, on the 2026-08-09 data.

Entity grouping (`lib/entities.ts`) collapses ranked lists to one row per operator. It is a
**view**: nothing leaves `allDomains()`, the API, the sitemap or the per-domain pages.

### The badge

Now an award with named tiers. Grade A is Agent Ready, B is Agent Friendly, and the seal
and card files are **generated only for those**, so a site scoring 41 gets a prioritised fix
list instead of a graphic nobody would embed. `/badge` explains all of it, which nothing on
the site previously did.

Route note that cost a build: `/badge/[slug]` and `/badge/[variant]/[slug]` cannot coexist.
Next refuses two differently-named dynamic segments at the same position, the build passes,
and then every route on the site throws at runtime. Variants use literal segments
(`/badge/seal/[slug]`) sharing one handler in `lib/badge-route.ts`.

### Everything else

Search (client-side over a static `/search-index.json`, with a no-JavaScript `/search`
page), domain submission through a GitHub issue form processed by `worker/intake.ts` with
no secret beyond `GITHUB_TOKEN`, a glossary wired into inline `<details>` definitions, a
`/coverage` page publishing the full funnel and every failure reason, a `/findings` page,
hand-rolled SVG charts, and motion primitives.

**The motion rule, which is not negotiable:** the server renders the true final value and
animation is only ever an enhancement on top of it. Rendering zero and counting up on scroll
produces a site that reads as broken to anyone who scrolls fast, prints, has JavaScript off,
or is a crawler. For an index whose whole value is that its numbers are correct, that is the
worst available failure and it looks fine to whoever built it.

Tests: 109, up from 48.

---

## 10. What v2.1 changed, 2026-08-10

Prompted by a review of the live site. Three of the six workstreams were cosmetic asks; the
first was not.

### The rescoring bug, which invalidated most of the published change feed

`worker/crawl.ts` rescored the previous night's record with `access: {}` in two places.
`stableObs` strips `access` on write, and `scoreObservation` reads a missing token as
*allowed*, so an archived record silently collected a free 38 of 100 points every time it was
rescored.

Measured against the committed dataset: **686 of 3,646 records, 18.8%, rescored differently.**
`1drv.ms` inflated by 84, which is exactly the published `"Score fell 82 points to 7"`. On
2026-08-10 the feed recorded **682 falls against 50 rises**. That asymmetry was the bug.

Fixed by exporting `withAccess()` from `lib/dataset.ts` and routing both call sites through
it. **Anything that rescores an archived observation must go through that function.**
`worker/verify-rescore.ts` (`pnpm verify:rescore`) is now a CI step: it fails the run if any
record does not rescore to its published value, and separately reports how far off the naive
path *would* be, currently 686 records, as a standing measure of the trap.

`tests/crawl-diff.test.ts` is new. It also pins the probe-version and vantage change
suppression rules, which had existed untested despite the vantage one having already produced
25 phantom changes per 150 domains in production.

### The health gate, and quarantine

Nothing compared one run against the last. A network refusing our crawler would collapse the
reachability rate, drop hundreds of origins out of the denominator, and publish the surviving
subset as tonight's headline with every process exiting zero.

`lib/health.ts` compares reachability, measured population, published population, mean score
and change volume against the last day that passed. A run failing any check is **quarantined**:
observations are still written, but no change records are appended, `buildFrozenReport`
excludes the day, and the site serves the last good day behind a banner. `latestStats()` now
returns the last non-suspect day; `latestStatsRaw()` is the unfiltered accessor.

The change-volume tripwire would have caught the rescoring bug on its first night.

`upsertStats` refuses to replace a fuller same-day snapshot with a thinner one unless forced,
so a `--limit 100` smoke test can no longer overwrite the night's real figures. `pnpm crawl
--force` and the workflow's `force` input are the recovery path.

### One population, one date

The homepage mixed three: the stored snapshot, a live recompute over `domains.jsonl`, and
`meta.json`. The policy-gap tile divided a live numerator by a snapshot denominator, so the
percentage was a ratio of two different sets.

`buildStats` moved to `lib/stats.ts` and now carries the facet counts too: gaps, the quadrant,
postures, archetypes, the histogram and the probe-3 signal counts. **Every dated finding reads
the snapshot; only views (leaderboards, cohort tables) recompute live.** There is a comment
block at the top of `app/page.tsx` saying which is which, because the distinction is invisible
and getting it wrong is what caused the defect.

`pnpm restats` re-derives the snapshot from archived evidence with no network. Correct tool
for a rubric change: re-crawling five thousand origins to recompute numbers we already hold
would charge other people's servers for our decision. It dates the snapshot from the
observations, never from the clock, so it is reproducible.

**Signal counts are `null`, not `0`, when no probe has looked**, with `signalsObserved` as
their denominator. Reporting 0% adoption for a question never asked is rule 2 with the sign
flipped, and the first version of `buildStats` did exactly that.

### The distribution, the badge, and /check

- **`components/distribution.tsx`** replaces a 384px-wide `aria-hidden` histogram with counts,
  a y-axis, a marked median, grade tinting, and ten focusable bands each revealing example
  domains. Every panel is server-rendered; the client only chooses which is visible.
  `/scores/[band]` gives each band a page. Grade boundaries are drawn at their real score
  positions (40/60/75/90), not at bucket edges, because 75 falls mid-bucket.
- **The badge** gets the site's own two-tone wordmark at a legible size, and three themes per
  variant. Theme rides in the filename (`x.light.svg`), not a route segment, because a
  `[theme]` segment beside `[slug]` builds fine and then 500s every route on the site.
- **`/check`** is rate limited, refuses private and loopback targets, and budgets the probe
  against `maxDuration` so a slow origin returns a partial result naming the skipped checks
  rather than a bare 504. A skipped check is recorded in `signals.skippedChecks` and scored
  unavailable, because charging a site for our own timeout is the same error as charging it
  for a bot wall.

### Costs, since they were asked

`/check` and `/search` are the only Vercel functions. **The nightly crawl runs on GitHub
Actions and costs nothing on Vercel.** At Fluid Compute rates, a check is about **$0.00007**
warm and **$0.00016** cold: roughly **$1 per 10,000 checks**. Organic use is irrelevant.

The exposure is abuse and it is memory-time rather than CPU, because the function spends its
life waiting on I/O. A tarpitting target holds a slot for the full 60s at ~$0.00035; sustained
10 req/s is ~$300/day.

### Two things left as operator configuration

1. **The rate limiter is per-instance.** `lib/guard.ts` says so in its own doc comment. It
   raises the cost of casual abuse and does not stop a determined attacker, because serverless
   functions scale horizontally and each instance keeps its own counters. **The real control is
   a Vercel Firewall rate-limit rule on `/check`**, which sees every request. That is dashboard
   configuration, not code, and it has not been applied.
2. **`/check` still traces the whole `data/**` tree** (~6MB) into its bundle and parses it on
   cold start, which is the dominant cost term. A build-time domain-and-score index would cut
   that by roughly 100x. Deliberately not done in this pass: it touches the redirect, the
   percentile and the histogram at once, and the money at stake is about a dollar per ten
   thousand checks.

Tests: 169.
