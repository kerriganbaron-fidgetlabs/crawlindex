# CrawlIndex handover

**Last updated:** 2026-08-09, end of the final build session.
**Status:** Live at https://crawlindex.org, public, self-running, EUR 0/month.
**Audience:** whoever touches this next, human or agent. Probably nobody, which is the point.

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
  pnpm crawl    -> ~40 min, writes data/
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
2. Reports publish themselves: the first crawl in a new month creates that month's report,
   links it and adds it to the sitemap. No human step exists.
3. If a cross-tab ever looks implausible, the likely cause is a fingerprint misfiring.
   `pnpm probe <domain>` prints the detection for one site without writing anything.
