# CrawlIndex handover

**Written:** 2026-08-09, end of the session that built it.
**Status:** Live, running, and **not an income project**. Read "The verdict" before doing anything.
**Audience:** the next Claude agent, plus Kerrigan.

---

## 1. The original goal

Verbatim intent from Kerrigan:

> Review everything we have done together and determine the best path to creating an income
> stream not dependent on my inputs and then action it. [...] The stream needs to be able to
> manage autonomously with little or no oversight. Be able to generate passive income or active
> income if it's agent run. Have its own marketing or self-promotion outside of myself. I can
> seed you up to 250 euros for this project. Beyond that the goal is passive profitability.

Available: Ollama with Qwen3 on 8GB VRAM, the Fidget Labs Vercel account, Supabase, Docker
Desktop, and anything already built. Excluded: AtomDigit. Standing constraints from
`Global_CLAUDE.md`: no Upwork, no X/Twitter, no ongoing direct selling, no maintenance-heavy
regulatory products, no competing with hyperscalers in saturated categories.

**The finding that framed everything:** Markwright, imageclean.app and the Architecture & AI
Report are all live with working payment rails and have **zero paying customers between them**.
The bottleneck was never building. It was distribution. So selection was driven almost entirely
by "does marketing happen without Kerrigan."

---

## 2. What was investigated, and why each was rejected

| Option | Verdict | Evidence |
|---|---|---|
| Paid MCP servers, x402, agent payments | Rejected | Infrastructure is real (Cloudflare Monetization Gateway, Stripe Machine Payments, x402 Foundation) but revenue is not. One operator publicly reported zero conversions across 169M x402 payments. |
| Shopify app: AI readiness | Rejected | Shopify ships `/llms.txt`, `/agents.md` and `.well-known/ucp` **natively**, and 6+ apps already hold the category (Booster 5,226 reviews, Avada 354, SearchPie 2,317). |
| Apify Store actors | Rejected | ~54,000 listings, creator pays the compute out of earnings, and scrapers break when target sites change. Fails the no-oversight test outright. |
| Chrome Web Store | Deprioritised | Real organic discovery but no native payments since Google retired them, low ARPU, and Manifest V3 churn. |
| Gumroad / Lemon Squeezy | Rejected | Median Gumroad creator earns ~$72/month. Discovery is weak; it is a checkout, not a channel. |
| **Public measurement index** | **Chosen** | Reused the `fidget-ai-report` probe engine, near-zero marginal cost, and a confirmed gap: aggregate studies exist (NeuralCrawl, HasData) but no per-domain browsable index with history. |

**The reasoning error, stated plainly so it is not repeated.** Selection optimised for *"is the
distribution structural"* and never asked *"will anyone pay."* The research tools to answer the
second question were available the whole time and were not pointed at it until Kerrigan asked
after the build. That is the identical failure mode that produced three customer-less products.
**Validate demand before writing code.**

---

## 3. What got built

A public index of how the web treats AI agents. A nightly crawler measures Tranco-ranked
domains and publishes a deterministic 0-100 score per domain, per-crawler blocker lists, a
change feed, dated monthly reports, a JSON API and an embeddable SVG badge.

- **Live:** https://crawlindex.vercel.app
- **Repo:** `kerriganbaron-fidgetlabs/crawlindex` (private)
- **Supabase:** `hhwvttuhnhqkehcvouxv`, Frankfurt. Pooler host is **aws-0**-eu-central-1.
- **Vercel:** project `crawlindex`, scope `kerriganbaron-9965s-projects`.
- **Schedule:** GitHub Actions `.github/workflows/nightly-crawl.yml`, 02:30 UTC. The Windows
  scheduled task that originally ran this was **removed**; it made a hands-off project depend
  on the gaming PC being awake.

First full crawl: 4,378 indexable, 3,654 scored, mean 63.78. 665 block at least one
answer-surface crawler, 161 block all of them. 448 publish `llms.txt`, 27 publish `agents.md`.
Lighthouse 100/100/100/100 on every page checked. 30/30 unit tests.

### Four rules the code enforces, and why

These are the difference between a citable index and a discredited one. `tests/` pins all four.
Do not relax them.

1. **No model in the scoring path.** `scoreObservation` is a pure function over archived
   evidence. Prose is written afterwards, never as an input.
2. **Unobservable is `null`, never 0**, and excluded from aggregates.
3. **A measurement we failed to take is never charged to the site.** When the control request
   meets a bot wall, body-derived checks are marked unavailable and the total is renormalised,
   flagged `partial`, and kept out of leaderboards.
4. **`robots.txt` is read first.** A group naming `CrawlIndexBot` and denying it is an opt-out
   that costs the operator one request. The methodology page promises this, so it must stay true.

### Five bugs found during the build, all fixed

Each was caught because a number looked wrong, not because a test failed. Keep that habit.

1. **Reddit scored 3/100** because our own crawler hit a JavaScript proof-of-work wall.
   Publishing that would have been a lie about Reddit. Led to rule 3.
2. **Blanket blocks were treated as opt-outs.** A site with `User-agent: * / Disallow: /` was
   being dropped entirely, which silently deleted the **163 most restrictive operators** from an
   index whose subject *is* restrictiveness. Only a group that names `CrawlIndexBot` is an opt-out.
3. **PostgREST silently truncates reads at 1,000 rows** (`db-max-rows`). It hit the crawl queue,
   the sitemap, and a published average. Page with `.range()` or move it into SQL.
4. **Change detection compared across probe versions**, so improving our own bot-wall detection
   was about to publish "example.com now blocks GPTBot" for sites that had done nothing.
   `domains.probe_version` now suppresses the comparison on a mismatch.
5. **Node `fetch` hides every transport error** behind the string "fetch failed". The real cause
   is on `err.cause`. Unwrapped in `describeFetchError`.

### One known defect, not yet fixed

Moving the crawler from the Builder machine to GitHub's runners produced **25 "changes" across
150 domains on a same-day re-crawl**. Different network vantage point, different results:
cloaking detection compares response byte sizes, and some origins serve differently by geography
or IP reputation. The change feed will be polluted by any future move.

**The fix is the same shape as bug 4:** stamp each row with the vantage point that produced it
(`domains.vantage`, e.g. `builder-nl` / `gha-ubuntu`) and suppress diffing across a mismatch.
Roughly an hour. Do this before anyone relies on the change feed.

---

## 4. The verdict

**CrawlIndex is a good artifact and a bad business. It is out of the income column.**
Kerrigan reached this before the evidence did; the evidence agrees.

- **Nobody pays for crawler-policy data.** HasData's AI Crawler Block Index and Originality.ai's
  GPTBot studies are content marketing for their real products. NeuralCrawl shows no business.
  It is a study category, not a product category.
- **The one profitable comparable proves the opposite point.** BuiltWith is ~$14M ARR with
  effectively one employee, selling *prospecting lists*. Buyers trace "sites using Shopify" to
  sales revenue. "Who blocks GPTBot" traces to nothing.
- **Search demand is thin.** Tens to low hundreds per month for brand queries, low thousands for
  head terms, already split across a dozen free `llms.txt` checkers.
- **The badge growth loop will not fire.** SSL Labs badges work because security is a trust
  signal that *buyers* care about. No merchant's customer cares about an agent-readiness score.

**Do not try to monetise this by bolting on Stripe.** There is no buyer with budget and urgency.

---

## 5. Costs, measured

| Item | Real cost | Notes |
|---|---|---|
| Supabase project | **~EUR 20/mo** | The org is past the free-tier project allowance, so this project adds compute cost. This is the only real recurring cost and the one worth acting on. |
| Vercel | EUR 0 incremental | Rides the existing Pro plan. |
| GitHub Actions | EUR 0 today, but **65% of the allowance** | Measured: 150 domains in 97s wall. A full 5,050 pass is ~43 min, so ~1,300 of the 2,000 free private-repo minutes per month. An earlier estimate of 690 minutes was wrong; it used the faster Builder timing. |
| Electricity | EUR 0 now | Was non-zero when the crawl ran on the gaming PC. Removed. |

### Making the Actions cost genuinely zero

**Make the repo public.** Public repos get unlimited Actions minutes. The dataset is CC BY 4.0,
all credentials live in Actions secrets, and "open index" is the positioning anyway. One command,
removes the constraint permanently.

### Making the Supabase cost zero, three ways

1. **Fold the four tables into the existing `fidget-ai-report` Supabase project and delete the
   `crawlindex` one.** ~30 minutes, EUR 0 incremental, everything else unchanged. Thematically
   adjacent: same probe lineage, same subject. **Cheapest correct move.**
2. **Remove the database entirely.** This product genuinely does not need one: ~4,400 rows that
   change once a day. The Action can crawl, write sharded JSON into `public/data/`, diff against
   the currently deployed summary to keep change detection, and deploy. ~3-4 hours. Most elegant,
   and a fully static 4,400-page site is a better showcase than one with a database behind it.
3. **Leave it and sunset.** EUR 20/mo for three months is ~EUR 60, which is less than the agent
   time either rebuild costs. **If the plan is to shut it down anyway, this is the rational choice.**

---

## 6. Open items

1. **`crawlindex.org`** — Kerrigan chose to buy it ($8.49/yr). Blocked: Vercel domain
   registration needs registrant WHOIS details that exist nowhere on this machine. Needs street
   address, postcode, and a `+31` phone number. **Do not invent these.** After purchase: set
   `NEXT_PUBLIC_SITE_URL`, redeploy, and canonicals/sitemap/`llms.txt` all follow automatically.
2. **Vantage-point stamping** for change detection. See section 3.
3. **Repo visibility** decision. See section 5.
4. **Supabase** decision. See section 5.

---

## 7. Guidance for the next agent

**Do not keep building on CrawlIndex as an income play.** It is finished as a product. The only
work worth doing on it is the cost reduction in section 5 and the vantage-point fix, and only if
Kerrigan decides to keep it running.

**On the original goal, which is still unmet.** The honest structural finding: *fully passive +
self-marketing + profitable + no audience + no selling* has almost no real solutions. Every
candidate that survives the distribution test fails the passivity test. Shopify apps carry
30+ day review waits against an 8-10 day SLA, 1-star reviews triggered by Shopify's own billing
behaviour, and "most installs never turn into revenue." Marketplace products are support
businesses.

`Global_CLAUDE.md` already says it: *"Path is consulting margin and product revenue, not
speculative passive products."* Kerrigan was right before the question was asked. If the next
session revisits this, the realistic framings are:

- Productise the MACH/AI Readiness Audit with agent-assisted delivery. Semi-passive, uses the
  actual moat, and `aireport` plus CrawlIndex become credibility assets that feed it.
- Give one of the three existing live products distribution, rather than building a fourth.
- Accept "low-maintenance, not passive" at ~3-5 hours a month, which opens up options that are
  closed at zero hours.

**And validate demand before writing code.** That is the single lesson of this build.

---

## 8. Operating notes

```
pnpm probe nytimes.com      # one domain, no writes, prints observation and score
pnpm test                   # robots semantics and score determinism, 30 tests
pnpm crawl --limit 6000     # full pass, ~23 min local, ~43 min on a hosted runner
pnpm seed --count 5000      # refresh Tranco ranks, retro-apply exclusion rules
```

- Secrets: `.secrets/` is gitignored and holds the Supabase DB password and pooler host.
  Actions secrets hold `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Supabase direct DB host is IPv6-only from Builder. Use the session pooler,
  **aws-0**-eu-central-1 for this project (markwright is aws-1, so probe both).
- The site reads Supabase through ISR, so a finished crawl is live within the hour with no
  deploy step.
- The corpus maintains itself: hosts failing three consecutive crawls are demoted with a
  recorded reason, and the Monday re-seed refreshes ranks.
