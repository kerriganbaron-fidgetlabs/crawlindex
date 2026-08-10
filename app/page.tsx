import Link from 'next/link';
import { AGENTS, agentSlug, TIER1 } from '../lib/agents';
import { BANDS, examplesIn, GRADE_MEANING } from '../lib/bands';
import {
  activeQuarantine,
  allChanges,
  latestStats,
  leaderboard,
  networkCohorts,
  platformCohorts,
  scoredRows,
} from '../lib/dataset';
import { groupByEntity } from '../lib/entities';
import { findingsDataset, findingsFaq, findingsFrom } from '../lib/findings-jsonld';
import { POSTURE_LABEL, type PolicyPosture } from '../lib/facets';
import { SITE } from '../lib/site';
import { Attribution, CohortTable, EntityTable, PageMeta, StatTile } from '../components/ui';
import { PolicyQuadrant, RankedBars, UnitChart } from '../components/charts';
import { Distribution } from '../components/distribution';
import { CountUp, GrowBar, Reveal } from '../components/motion';
import { Explain } from '../components/explain';

const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);
const pctStr = (n: number, d: number) => `${Math.round(pct(n, d))}%`;

/**
 * Where each figure on this page comes from, because the distinction is invisible in the
 * markup and getting it wrong was a real defect.
 *
 * **Dated findings come from the daily snapshot** (`latestStats()`), computed over one
 * population in one pass at crawl time. Every headline number, every percentage, every
 * facet count. These are the figures somebody might quote, so they must all share a
 * denominator and a date.
 *
 * **Views come from the live dataset** — cohort tables, leaderboards, the change feed. They
 * describe the dataset as it stands rather than a measurement taken on a particular day.
 *
 * The bug this replaced: the policy-gap tile divided a live count over every record by an
 * `observed` count from the snapshot. Two different populations, presented as a percentage.
 */
export default function HomePage() {
  const stats = latestStats();
  const quarantine = activeQuarantine();
  const observed = stats?.observed ?? 0;

  const changes = allChanges().slice(0, 6);
  const networks = networkCohorts().slice(0, 8);
  const platforms = platformCohorts().slice(0, 6);
  const worst = groupByEntity(leaderboard('bottom', 200)).slice(0, 10);

  // Snapshot, not live. Both halves of the quadrant have been measured since the first
  // crawl and nobody had crossed them, which is why it leads the page.
  const gaps = stats?.policyGaps ?? 0;
  const quadrant = stats?.quadrant ?? { gap: 0, openHonest: 0, blockedHonest: 0, declaredOnly: 0 };

  const postures = Object.entries(stats?.perPosture ?? {})
    .map(([id, count]) => ({ id: id as PolicyPosture, count }))
    .sort((a, b) => b.count - a.count);
  const deliberate = stats?.perPosture?.deliberate ?? 0;
  const inherited = stats?.perPosture?.inherited ?? 0;

  const botRows = AGENTS.map((a) => ({ ...a, blocked: stats?.perBot?.[a.token] ?? 0 })).sort(
    (a, b) => b.blocked - a.blocked,
  );

  const topNetwork = [...networks].sort((a, b) => b.blockingRate - a.blockingRate)[0];
  const lowNetwork = [...networks].sort((a, b) => a.blockingRate - b.blockingRate)[0];

  const blockingShare = pct(stats?.blockingAnyTier1 ?? 0, observed);

  /**
   * The distribution. Buckets come from the snapshot so the chart agrees with every other
   * figure on the page; the example domains come from the live dataset because they are a
   * view, not a dated finding, and they link straight through to the sites themselves.
   */
  const histogram = stats?.histogram ?? [];
  const comparable = histogram.reduce((a, b) => a + b, 0);
  const scored = scoredRows();

  // The median, read off the histogram rather than the row list, so it belongs to the same
  // population as the bars it is drawn over. Interpolated within the band it lands in.
  const median = (() => {
    if (!comparable) return null;
    const target = comparable / 2;
    let seen = 0;
    for (const b of BANDS) {
      const n = histogram[b.index] ?? 0;
      if (seen + n >= target) {
        const within = n === 0 ? 0 : (target - seen) / n;
        return Math.round(b.from + within * (b.to - b.from));
      }
      seen += n;
    }
    return null;
  })();

  // Where the bulk actually sits, stated rather than left for the reader to eyeball.
  const midBandShare = comparable
    ? (([5, 6, 7].reduce((sum, i) => sum + (histogram[i] ?? 0), 0) / comparable) * 100)
    : 0;

  /**
   * The same findings, three ways: a Dataset with denominators and units, an FAQ an answer
   * engine can lift a sentence from, and a visible list at the foot of the page. All three
   * are generated from one array, so they cannot disagree with each other or with the
   * figures above them.
   */
  const findings = stats ? findingsFrom(stats) : [];

  return (
    <>
      {stats && findings.length ? (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(findingsDataset(stats, findings)) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(findingsFaq(findings)) }}
          />
        </>
      ) : null}

      {/*
        A quarantined run is not a failure, so nothing else would say it happened. The
        figures below are the last day that passed the health check, which is the honest
        thing to show, but silently serving yesterday's numbers under today's date would
        not be.
      */}
      {quarantine ? (
        <section className="mb-10 border-l-4 border-warn bg-raised p-4" aria-labelledby="quarantine">
          <h2 id="quarantine" className="font-semibold mb-1">
            The most recent crawl was quarantined
          </h2>
          <p className="text-sm mb-2">
            The run on <time dateTime={quarantine.day}>{quarantine.day}</time> produced figures
            implausible enough that they are not being published. Everything below is from{' '}
            <time dateTime={stats?.day}>{stats?.day}</time>, the last crawl that passed.
          </p>
          <ul className="text-sm text-muted list-disc pl-5 space-y-1">
            {(quarantine.suspectReasons ?? []).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-sm mt-2">
            <Link href="/coverage" className="text-accent underline underline-offset-4">
              How this check works
            </Link>
          </p>
        </section>
      ) : null}

      <section className="mb-16">
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-accent" />
          Recrawled every night. Method published in full. Dataset open.
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] max-w-3xl text-balance">
          Most of the web never decided how AI may read it.
        </h1>
        <p className="mt-5 text-lg text-muted max-w-2xl leading-relaxed">
          Someone decided anyway. We measure the most-visited sites on the internet every night and
          publish exactly what we find: which AI crawlers each one blocks, what it publishes for
          agents to read, whether it serves a crawler something different from what it serves you,
          and who actually made that call.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <p className="flex flex-wrap gap-3">
            <Link
              href="/findings"
              className="inline-block border-2 border-accent bg-accent text-paper font-medium rounded px-5 py-2.5 hover:opacity-90"
            >
              What we found
            </Link>
            <Link
              href="/check"
              className="inline-block border-2 border-rule font-medium rounded px-5 py-2.5 hover:border-accent hover:text-accent"
            >
              Measure your site
            </Link>
            <Link
              href="/leaderboard"
              className="inline-block font-medium rounded px-5 py-2.5 text-muted hover:text-accent link-draw"
            >
              Browse the index
            </Link>
          </p>

          {observed ? (
            <UnitChart
              sweep
              percent={blockingShare}
              label={`${Math.round(blockingShare)} in every 100 measured sites block at least one crawler that answers questions today`}
              sub={`${(stats?.blockingAnyTier1 ?? 0).toLocaleString()} of ${observed.toLocaleString()} domains, measured ${stats?.day}`}
            />
          ) : null}
        </div>
      </section>

      {stats ? (
        <section className="mb-16" aria-labelledby="findings">
          <h2 id="findings" className="text-2xl font-bold mb-1">
            What the last crawl found
          </h2>
          <p className="text-sm text-muted mb-5">
            {observed.toLocaleString()} domains measured on {stats.day}. Sites we could not observe
            are excluded rather than counted as failures, which is why these denominators are
            smaller than the corpus.{' '}
            <Link href="/coverage" className="text-accent underline underline-offset-4">
              See the whole funnel
            </Link>
            .
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              value={pctStr(stats.blockingAnyTier1, observed)}
              animateTo={pct(stats.blockingAnyTier1, observed)}
              suffix="%"
              label="Block a crawler that answers questions"
              sub={`${stats.blockingAnyTier1.toLocaleString()} of ${observed.toLocaleString()} sites`}
              termId="answer-surface"
            />
            <StatTile
              value={pctStr(gaps, observed)}
              animateTo={pct(gaps, observed)}
              suffix="%"
              label="Say one thing and do another"
              sub={`${gaps.toLocaleString()} permit GPTBot in robots.txt and refuse it at the server`}
              termId="policy-gap"
              tone="bad"
            />
            <StatTile
              value={pctStr(stats.llmsTxt, observed)}
              animateTo={pct(stats.llmsTxt, observed)}
              suffix="%"
              label="Publish an llms.txt"
              sub={`${stats.llmsTxt.toLocaleString()} sites, out of ${observed.toLocaleString()}`}
              termId="llms-txt"
            />
            <StatTile
              value={stats.meanScore === null ? 'n/a' : String(Math.round(stats.meanScore))}
              animateTo={stats.meanScore ?? undefined}
              label="Mean readiness score"
              sub="Out of 100, across fully scored sites"
              termId="score"
            />
          </div>
        </section>
      ) : (
        <section className="mb-16">
          <p className="border border-rule rounded p-4 bg-raised">
            The first crawl has not completed yet. Statistics appear here once it has.
          </p>
        </section>
      )}

      <Reveal>
        <section className="mb-16" aria-labelledby="gap">
          <h2 id="gap" className="text-2xl font-bold mb-1">
            The gap between what sites say and what they do
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            robots.txt is a published promise. What a server does when an AI crawler actually knocks
            is a separate fact. Every index in this category publishes the first one. We measure
            both on every domain, and{' '}
            <strong className="text-ink tnum">{gaps.toLocaleString()}</strong> sites turn out to be
            enforcing a policy they never published.
          </p>
          <PolicyQuadrant counts={quadrant} total={observed} />
          <p className="mt-4 text-sm">
            <Link href="/findings#policy-gap" className="text-accent underline underline-offset-4">
              Which sites, and why it happens
            </Link>
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-16" aria-labelledby="who-decides">
          <h2 id="who-decides" className="text-2xl font-bold mb-1">
            Who is actually deciding
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            <strong className="text-ink tnum">{inherited.toLocaleString()}</strong> measured sites
            have a robots.txt that names no AI crawler at all, against{' '}
            <strong className="text-ink tnum">{deliberate.toLocaleString()}</strong> that name at
            least one. For most of the web, the AI policy is a side effect of a default somebody
            else shipped.{' '}
            {topNetwork && lowNetwork && topNetwork.id !== lowNetwork.id ? (
              <>
                Sites behind <strong className="text-ink">{topNetwork.id}</strong> block an
                answer-surface crawler{' '}
                <strong className="text-ink tnum">{topNetwork.blockingRate.toFixed(1)}%</strong> of
                the time against{' '}
                <strong className="text-ink tnum">{lowNetwork.blockingRate.toFixed(1)}%</strong>{' '}
                behind <strong className="text-ink">{lowNetwork.id}</strong>, a spread far wider
                than anything the sites themselves publish explains.
              </>
            ) : null}
          </p>

          <div className="grid gap-8 lg:grid-cols-2 items-start">
            <div>
              <h3 className="text-sm font-semibold mb-3">
                <Explain id="posture">Policy posture</Explain>
              </h3>
              <ul className="space-y-3">
                {postures.map((p) => (
                  <li key={p.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{POSTURE_LABEL[p.id]}</span>
                      <span className="tnum text-muted">
                        {p.count.toLocaleString()} ({pctStr(p.count, observed)})
                      </span>
                    </div>
                    <GrowBar
                      percent={pct(p.count, observed)}
                      label={`${POSTURE_LABEL[p.id]}: ${p.count} sites`}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">
                Blocking rate by <Explain id="edge-network">edge network</Explain>
              </h3>
              <RankedBars
                caption="Share of sites behind each edge network that block at least one answer-surface crawler"
                data={networks.map((n) => ({
                  id: n.id,
                  label: n.id,
                  value: n.blockingRate,
                  href: `/networks/${n.id}`,
                }))}
              />
            </div>
          </div>

          <p className="mt-5 text-sm">
            <Link href="/networks" className="text-accent underline underline-offset-4">
              All edge networks
            </Link>
            {' . '}
            <Link href="/platforms" className="text-accent underline underline-offset-4">
              By publishing platform
            </Link>
            {' . '}
            <Link href="/findings#who-decides" className="text-accent underline underline-offset-4">
              The full argument
            </Link>
          </p>
        </section>
      </Reveal>

      {platforms.length ? (
        <Reveal>
          <section className="mb-16" aria-labelledby="platforms">
            <h2 id="platforms" className="text-2xl font-bold mb-1">
              Readiness by platform
            </h2>
            <p className="text-sm text-muted mb-5 max-w-2xl">
              What a site is built on predicts how legible it is to an agent, because the defaults
              come with the box.
            </p>
            <CohortTable cohorts={platforms} kind="platform" caption="AI blocking rate by publishing platform" />
          </section>
        </Reveal>
      ) : null}

      {stats ? (
        <Reveal>
          <section className="mb-16" aria-labelledby="bots">
            <h2 id="bots" className="text-2xl font-bold mb-1">
              Which crawlers get shut out
            </h2>
            <p className="text-sm text-muted mb-5 max-w-2xl">
              Share of measured sites whose robots.txt denies each crawler the site root. The first{' '}
              {TIER1.length} are{' '}
              <Explain id="answer-surface">answer-surface crawlers</Explain>, whose output reaches a
              reader today.
            </p>
            <div className="overflow-x-auto border border-rule rounded">
              <table className="w-full text-sm border-collapse">
                <caption className="sr-only">AI crawlers ranked by how many indexed sites block them</caption>
                <thead>
                  <tr className="bg-raised text-left">
                    <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Crawler</th>
                    <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Operator</th>
                    <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-32">Blocked by</th>
                    <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-40">
                      <span className="sr-only">Proportion</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {botRows.slice(0, 12).map((b, i) => {
                    const share = pct(b.blocked, observed);
                    return (
                      <tr key={b.token} className="border-b border-rule last:border-0">
                        <td className="px-3 py-2">
                          <Link href={`/bots/${agentSlug(b.token)}`} className="font-mono hover:text-accent underline underline-offset-4">
                            {b.token}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted">{b.operator}</td>
                        <td className="px-3 py-2 tnum">
                          {b.blocked.toLocaleString()} <span className="text-muted">({share.toFixed(1)}%)</span>
                        </td>
                        <td className="px-3 py-2">
                          <GrowBar percent={share} delayMs={i * 35} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm">
              <Link href="/bots" className="text-accent underline underline-offset-4">
                All {AGENTS.length} tracked crawlers
              </Link>
            </p>
          </section>
        </Reveal>
      ) : null}

      <Reveal>
        <section className="mb-16" aria-labelledby="spread">
          <h2 id="spread" className="text-2xl font-bold mb-1">
            How the web scores
          </h2>
          <p className="text-sm text-muted mb-6 max-w-2xl">
            Every fully measured site, in ten-point bands, tinted by the grade each band falls
            under. The shape is the finding:{' '}
            {midBandShare > 0 ? (
              <>
                <strong className="text-ink tnum">{Math.round(midBandShare)}%</strong> of the web
                sits between 50 and 79.{' '}
              </>
            ) : null}
            Not hostile to agents, not ready for them either. Hover or tab through a band to see
            what is in it.
          </p>

          {histogram.length ? (
            <Distribution
              buckets={histogram}
              total={comparable}
              median={median}
              panels={BANDS.map((b) => {
                const n = histogram[b.index] ?? 0;
                const examples = examplesIn(scored, b);
                return (
                  <div className="border border-rule rounded p-4 bg-raised">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                      <h3 className="font-bold">
                        Scores {b.label}
                        <span className="text-muted font-normal"> . {b.gradeLabel}</span>
                      </h3>
                      <span className="tnum text-sm text-muted">
                        {n.toLocaleString()} sites, {comparable ? ((n / comparable) * 100).toFixed(1) : '0'}% of the
                        index
                      </span>
                    </div>
                    <p className="text-sm text-muted leading-relaxed mb-3">{GRADE_MEANING[b.grade]}</p>
                    {examples.length ? (
                      <p className="text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-muted">For example</span>
                        {examples.map((r) => (
                          <Link
                            key={r.domain}
                            href={`/site/${r.domain}`}
                            className="font-mono text-accent underline underline-offset-4"
                          >
                            {r.domain}
                            <span className="text-muted no-underline"> {r.score.total}</span>
                          </Link>
                        ))}
                      </p>
                    ) : (
                      <p className="text-sm text-muted">No measured site currently scores in this band.</p>
                    )}
                    <p className="text-sm mt-3">
                      <Link href={`/scores/${b.slug}`} className="text-accent underline underline-offset-4">
                        All {n.toLocaleString()} sites scoring {b.label}
                      </Link>
                    </p>
                  </div>
                );
              })}
            />
          ) : null}

          <p className="mt-4 text-sm">
            <Link href="/check" className="text-accent underline underline-offset-4">
              Find out where your site sits
            </Link>
            {' . '}
            <Link href="/methodology" className="text-accent underline underline-offset-4">
              How the score is built
            </Link>
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-16" aria-labelledby="worst">
          <h2 id="worst" className="text-2xl font-bold mb-1">
            Least agent-ready right now
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            Fully measured sites with the lowest scores, one row per operator.{' '}
            <Explain id="partial">Partial assessments</Explain> are excluded, because a
            renormalised score is not comparable with a complete one.
          </p>
          <EntityTable groups={worst} caption="Lowest scoring operators in the index" />
          <p className="mt-3 text-sm">
            <Link href="/leaderboard" className="text-accent underline underline-offset-4">
              Full leaderboard, best and worst
            </Link>
          </p>
        </section>
      </Reveal>

      {changes.length ? (
        <Reveal>
          <section className="mb-16" aria-labelledby="changes">
            <h2 id="changes" className="text-2xl font-bold mb-1">
              Recent movements
            </h2>
            <p className="text-sm text-muted mb-5 max-w-2xl">
              Only real changes are recorded. A site&apos;s first measurement is a baseline, not an
              event, and nothing is diffed across a change to our own probe.
            </p>
            <ul className="space-y-2 text-sm">
              {changes.map((c, i) => (
                <li key={`${c.domain}-${i}`} className="flex flex-wrap gap-x-3 gap-y-1 border-b border-rule pb-2">
                  <time className="tnum text-muted shrink-0" dateTime={c.changedAt}>
                    {c.changedAt.slice(0, 10)}
                  </time>
                  <Link href={`/site/${c.domain}`} className="font-mono hover:text-accent underline underline-offset-4">
                    {c.domain}
                  </Link>
                  <span className="text-muted">{c.summary}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href="/changes" className="text-accent underline underline-offset-4">
                All recorded changes
              </Link>
            </p>
          </section>
        </Reveal>
      ) : null}

      {/*
        The findings as plain sentences, each with its numerator, denominator and date.
        Rendered rather than hidden in JSON-LD for two reasons: a person skimming gets the
        answers without decoding a chart, and an engine that ignores structured data still
        finds a quotable, dated, attributed claim in the text.
      */}
      {findings.length ? (
        <Reveal>
          <section className="mb-16" aria-labelledby="answers">
            <h2 id="answers" className="text-2xl font-bold mb-1">
              The short answers
            </h2>
            <p className="text-sm text-muted mb-5 max-w-2xl">
              Every figure on this page with its denominator and its measurement date attached, so
              quoting one correctly takes no work. Free to reuse under {SITE.licence} with credit.
            </p>
            <dl className="space-y-4 max-w-3xl">
              {findings.map((f) => (
                <div key={f.id} className="border-l-2 border-rule pl-4">
                  <dt className="font-medium">{f.question}</dt>
                  <dd className="text-muted leading-relaxed mt-0.5">
                    {f.answer}{' '}
                    <data value={String(f.value)} className="sr-only">
                      {f.value}
                      {f.unit === 'PERCENT' ? '%' : ''}
                    </data>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </Reveal>
      ) : null}

      <Reveal>
        <section className="border-t border-rule pt-8">
          <h2 className="text-2xl font-bold mb-3">Why this exists</h2>
          <div className="max-w-2xl space-y-4 leading-relaxed text-muted">
            <p>
              Publishers are deciding, one robots.txt at a time, whether AI systems may read the
              web. Those decisions are made quietly, changed without announcement, and are
              individually trivial to check but collectively invisible.
            </p>
            <p>
              {SITE.name} checks them on a schedule and keeps the receipts. The rubric is published,
              every score is arithmetic over archived evidence, and no language model touches the
              numbers. The whole dataset is downloadable. If you disagree with a result you can read
              exactly how it was reached and recompute it yourself.
            </p>
            <p className="flex flex-wrap gap-x-5 gap-y-1">
              <Link href="/methodology" className="text-accent underline underline-offset-4">
                Read the methodology
              </Link>
              <Link href="/glossary" className="text-accent underline underline-offset-4">
                What every term means
              </Link>
              <Link href="/data" className="text-accent underline underline-offset-4">
                Download the dataset
              </Link>
              <Link href="/submit" className="text-accent underline underline-offset-4">
                Add a domain
              </Link>
            </p>
          </div>
        </section>
      </Reveal>

      <PageMeta />
      <Attribution subject="The state of AI crawler access" measuredOn={stats?.day ?? null} />
    </>
  );
}
