# CrawlIndex v2 design

**Date:** 2026-08-10
**Status:** approved, in build
**Supersedes nothing.** `docs/HANDOVER.md` remains the operational truth. This document records
what v2 changes and why.

---

## 0. The brief, restated

Two readings of the live site were commissioned.

**As a researcher:** there is no search, no way to submit a domain, no explanation of any of the
elements on screen, and the "least agent-ready" list is twenty regional Amazon storefronts in a
row because Amazon serves our crawler a stub.

**As a marketer:** the page has no personality, no motion, nothing that guides a reader, and the
badge is something no operator would ever embed. There is also nowhere on the site that explains
a badge exists at all.

Plus: differentiate the numbers with more signals, make the monthly reports real time capsules,
and show the interesting data graphically.

## 0b. Decisions taken without asking

The build ran under a `/goal` directive that forbids pausing. These calls were made and are called
out here so they can be reversed cheaply.

1. **The rubric changes rather than growing a second score.** One number, versioned, re-scored over
   history. A second parallel score would make every published figure ambiguous.
2. **New metrics are mostly free.** One additional HTTP request per domain, no more. Everything
   else is derived from bytes already fetched.
3. **Personality is added in copy, motion and colour, not in a redesign.** The paper-and-rust
   visual language stays. It is right for a reference work; it was just too quiet.
4. **The badge becomes an award.** Sites that score badly are not offered a badge to embed. They
   are offered a fix list.

---

## 1. Research credibility

### 1.1 The Amazon problem is two separate bugs

**Bug one, and it is a measurement bug.** `amazon.com` is stored as `reachable: true`,
`httpStatus: 200`, `control.challenged: false`, `browserBytes: 2167`, `ssrTextLength: 0`,
`title: "&nbsp;"`, and the GPTBot fetch came back `503`. Eight of the fourteen score lines are
derived from that 2KB body, and every one of them was charged to Amazon as a failure. Score: 8.

That directly violates design rule 3, *a measurement we failed to take is never charged to the
site*. Amazon did not publish a homepage with no content. Amazon served our crawler an
anti-automation stub with an HTTP 200 on it, and `detectChallenge` only looks for 402/403/429/451,
vendor fingerprints, and auto-submitting forms. A 200-with-nothing-in-it slips through. `amazon.de`
does the same thing with an HTTP 202.

**Fix: stub detection.** A new `ControlKind: 'unreadable'`, raised when the control response body
is under 5,000 bytes *and* yields under 100 characters of extractable text. Both conditions, both
tight. A real single-page-application shell is large (tiktok.com ships 362KB with 22 characters of
text and is correctly scored zero for server-side readability). A 2KB document with no text is not
a homepage under any reading.

Body-derived lines become unavailable, the score renormalises, and the site becomes `partial`,
which already excludes it from the leaderboard. The twenty Amazon rows disappear without a single
domain being deleted or hand-excluded.

The risk is the opposite error: letting a genuinely empty site off the hook. Accepted. Rule 3 says
the tie goes to the site, and a measurement we cannot take is not a finding.

**Bug two, and it is a presentation bug.** Even with Amazon gone, `isaidub`, `dailymail` and
`imageshack` families repeat. One operator publishing the same policy across twenty ccTLDs is one
fact, not twenty.

**Fix: entity grouping.** `lib/entities.ts` derives an entity key from the registrable brand label
plus a policy fingerprint (identical tier-1 block set, same edge network). The leaderboard shows
one representative row per entity with "and 20 more regional domains", expandable. Nothing is
removed from the dataset, the API, or the per-domain pages. It is a view.

### 1.2 Search

4,984 domains and no way to look one up. A build-time `/search-index.json` carrying
`[domain, rank, score, grade, flags]` per row, loaded on demand by a header search dialog on every
page and by a no-JavaScript `/search` page. Static, no server, no dependency.

### 1.3 Submission

`/check` measures live but stores nothing, so there is no way to get a domain into the index.

Submission goes through a GitHub issue form. `worker/intake.ts` runs in the nightly Action before
the seed, reads open issues labelled `domain-submission` with the built-in `GITHUB_TOKEN`,
validates each domain, adds it to the corpus as pinned, and closes the issue with a comment. No
secrets, no server, no database, no moderation queue that anyone has to watch. The audit trail is
the issue thread.

### 1.4 Explanations

Nothing on the site defines tier 1, cloaking, "control request challenged", edge network versus
platform, or what a partial assessment is. Fix: an `Explain` inline-definition primitive backed by
one glossary source of truth, a `/glossary` page, and every score line deep-linking to its rubric
entry on `/methodology`.

### 1.5 Coverage honesty

5,006 attempted, 3,633 reachable, 2,831 fully scored. That funnel is the most honest thing the
project has and it is published nowhere. New `/coverage` page: every domain that fell out, and why.

---

## 2. New metrics

Constraint: no model in the scoring path, honest nulls, and near-zero extra request cost.

Verified against current deployment reality in August 2026 before selection. Two intended signals
were dropped on the evidence: `/.well-known/mcp.json` is not a canonical path, and A2A agent cards
live at `/.well-known/agent-card.json`, not `agent.json`.

**Free, from robots.txt bytes already in hand:**

- **RSL licensing.** `License: <absoluteURL>` in robots.txt, per the RSL 1.0 spec. A site declaring
  machine-readable licence terms is doing something categorically different from blocking.
- **Content-Signal.** `Content-Signal: search=yes,ai-train=no,use=reference`. Granular consent
  rather than binary allow/deny, and Cloudflare injects it into managed robots.txt, which makes its
  adoption curve a direct measurement of the project's own central thesis.

**Free, from HTML already in hand:**

- Dateline (`datePublished`/`dateModified` in JSON-LD, or `<time datetime>`)
- Author attribution (JSON-LD `author`, or `rel="author"`)
- Extractable structure (h2/h3 depth, lists, tables in the server response)
- Text-to-markup ratio
- `<link rel="license">`

**Free, from response headers already in hand:**

- `crawler-price` on a 402, so a metered site's asking price is recorded rather than just the fact
  of metering.

**One extra request:**

- `/.well-known/agent-card.json`. Near-zero current adoption, which is exactly the point: being the
  index that can state the adoption rate of agent cards across the top 5,000 domains is a finding
  nobody else publishes.

Crawl cost goes from five requests per domain to six. Roughly 40 minutes to roughly 50. Free
either way on a public repository.

**Facets, not score inflation.** The most differentiating outputs are classifications, and they are
published beside the score rather than folded into it:

- **Policy posture** — Deliberate, Inherited, Blanket, Absent. Derived from whether the operator
  names tokens, uses `Allow:` rules, sets crawl-delay, declares a sitemap. Answers "did you choose
  this, or did your CDN choose for you" per site rather than only in aggregate.
- **Access archetype** — Open, No training, Assistant only, Walled, Metered, Undeclared.
- **Policy gap** — robots.txt permits GPTBot and the server refuses it anyway. Both halves are
  already measured; nobody has cross-referenced them. "Says yes, does no" is the strongest single
  finding in the dataset and it costs nothing.
- **Percentile** — where a site sits against the whole index, which is what makes a badge mean
  something.

`RUBRIC_VERSION` goes to 2.0.0 and `PROBE_VERSION` to 3.0.0. Records predating the new fields score
them `available: false` rather than zero, so the transition cannot manufacture a fake decline.

---

## 3. The badge

The current badge is a 196×28 shields.io lookalike that can say `F`. Nobody embeds an F, and
nothing on the site explains the badge exists.

- **It becomes an award.** Grade A earns **Agent Ready**, grade B earns **Agent Friendly**. Anything
  lower is offered a prioritised fix list instead, and a neutral **Measured** mark if it wants one.
- **It looks like a certification mark**, not a CI badge: a grade seal, the score, the percentile,
  the measurement date, and the word independently.
- **Variants**: `seal`, `flat`, `compact`, `card`, each in light and dark.
- **It links.** Embed code wraps the image in an anchor to the site's own CrawlIndex page, so it is
  a real citation and a reader can verify it in one click.
- **`/badge` explains all of it**: what it measures, what the levels mean, how to earn one, that it
  updates nightly and can be lost, and copy-paste HTML, Markdown and JSX.
- Every site page and every `/check` result that qualifies gets a direct call to action.

---

## 4. Monthly reports as time capsules

Today `getMonthReport` reads platform and network cross-tabs from the **live** dataset and pulls
changes from a rolling 4,000-record window. July's report therefore changes in September and
eventually loses its own change list. It is a template over current data, not a record of a month.

**Fix: freeze on month roll.** When a crawl runs and the previous month has no frozen file, the
crawl writes `data/reports/YYYY-MM.json` containing the first and last daily stats, the full
per-bot series, cohorts computed at that moment, the month's complete change list, corpus size,
leaderboard snapshot, and the probe, rubric and registry versions in force. Once written it is
never rewritten.

`getMonthReport` prefers the frozen file. The current, still-running month is computed live and
labelled in progress with figures that move until it closes. Sealed reports render "Sealed
<date> under rubric X" so a citation stays checkable forever.

---

## 5. Personality and motion

The visual language stays. What changes:

- A hero that moves. A unit chart that draws itself, stating the headline finding in cells rather
  than a sentence.
- Numbers that count up, bars that grow, sections that reveal on scroll. Every one of them
  server-renders its true final value first and animates only as an enhancement, because a
  scroll-animated value that starts at zero reads as a broken site.
- `prefers-reduced-motion` renders the final state with no animation at all.
- Copy with a point of view. The dataset's actual argument, that most operators never chose their
  AI policy and their CDN chose it for them, leads rather than sitting in paragraph three.
- No em dashes, no exclamation marks.

## 6. Graphics

Hand-rolled SVG, no charting dependency, every chart paired with a real table for screen readers.

1. Unit chart, 100 cells, for headline prevalence
2. Sorted horizontal bars for cohort blocking rates
3. Score distribution histogram, with a marker for the site being viewed
4. **Policy gap quadrant**: robots permissiveness against observed server behaviour. Four
   quadrants, the interesting one being "says yes, does no"
5. Per-site band bars against ghosted nominal maxima
6. Sparklines for anything with more than two days of series, degrading to nothing below that

---

## 7. Testing

The existing 48 tests each correspond to a real mistake. New tests must hold the same line:

- Stub detection fires on the archived Amazon shape and does **not** fire on the archived TikTok
  shape
- Records lacking v3 fields score them unavailable, never zero
- A frozen report file is preferred over live computation and is byte-stable across runs
- Entity grouping never removes a domain from `allDomains`, the API, or the sitemap
- Badge tier gating: no embeddable award below grade B
- Percentile is monotonic with score

## 8. Out of scope

Stripe, any paid tier, any AXIS.run API integration (a live third-party call in the scoring path
would break rule 1), and any change to the zero-cost, zero-secret, zero-maintenance operating
model.
