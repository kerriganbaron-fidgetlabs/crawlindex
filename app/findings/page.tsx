import type { Metadata } from 'next';
import Link from 'next/link';
import { TIER1 } from '../../lib/agents';
import {
  latestStats,
  networkCohorts,
  platformCohorts,
  policyGaps,
  tldCohorts,
} from '../../lib/dataset';
import {
  ARCHETYPE_BLURB,
  ARCHETYPE_LABEL,
  POSTURE_BLURB,
  POSTURE_LABEL,
  type AccessArchetype,
  type PolicyPosture,
} from '../../lib/facets';
import { Attribution, CohortTable, DomainTable, PageHeader, PageMeta } from '../../components/ui';
import { PolicyQuadrant, RankedBars, UnitChart } from '../../components/charts';
import { Reveal } from '../../components/motion';
import { Explain } from '../../components/explain';

export const metadata: Metadata = {
  title: 'What we found',
  description:
    'Findings from the nightly measurement of the most-visited sites on the web: how many block AI crawlers, how many enforce a policy they never published, who is actually setting the policy, and how few sites publish anything machine-readable.',
  alternates: { canonical: '/findings' },
};

const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);
const pctStr = (n: number, d: number) => `${pct(n, d).toFixed(1)}%`;

/**
 * Same sourcing rule as the homepage: every dated finding comes from the daily snapshot, so
 * the two pages cannot quote different numbers for the same claim. Cohort tables and the
 * example lists stay live, because they are views rather than findings.
 */
export default function FindingsPage() {
  const stats = latestStats();
  const observed = stats?.observed ?? 0;
  // The denominator for every percentage on this page. One population, one date.
  const total = observed;

  const gaps = stats?.policyGaps ?? 0;
  const gapExamples = policyGaps(25);
  const quadrant = stats?.quadrant ?? { gap: 0, openHonest: 0, blockedHonest: 0, declaredOnly: 0 };

  const postures = Object.entries(stats?.perPosture ?? {})
    .map(([id, count]) => ({ id: id as PolicyPosture, count }))
    .sort((a, b) => b.count - a.count);
  const archetypes = Object.entries(stats?.perArchetype ?? {})
    .map(([id, count]) => ({ id: id as AccessArchetype, count }))
    .sort((a, b) => b.count - a.count);

  const networks = networkCohorts().slice(0, 10);
  const platforms = platformCohorts().slice(0, 10);
  const tlds = tldCohorts().slice(0, 10);

  /**
   * Emerging-standards adoption. `signalsObserved` is the denominator and it is doing real
   * work: a null count means the probe of the day never looked, which is a different fact
   * from nobody publishing them. Rendering both as 0% would be rule 2 with the sign flipped.
   */
  const signalsObserved = stats?.signalsObserved ?? 0;
  const anySignals = signalsObserved > 0;
  const withLicence = stats?.declaredLicence ?? null;
  const withSignal = stats?.contentSignal ?? null;
  const withCard = stats?.agentCard ?? null;
  const withDateline = stats?.dateline ?? null;
  const withAuthor = stats?.authorship ?? null;

  const inherited = stats?.perPosture?.inherited ?? 0;
  const deliberate = stats?.perPosture?.deliberate ?? 0;
  const absent = stats?.perPosture?.absent ?? 0;

  return (
    <>
      <PageHeader
        kicker="Findings"
        title="What the index actually shows"
        lede={`Four things stand out from ${observed.toLocaleString()} measured domains, and three of them are not what the category usually reports. Every figure here recomputes from the published dataset, so it moves when the web does.`}
      />

      <nav aria-label="Findings on this page" className="mb-14 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {[
          ['#policy-gap', 'The policy gap'],
          ['#who-decides', 'Who decides'],
          ['#shapes', 'The shapes of a policy'],
          ['#standards', 'Nobody publishes anything'],
          ['#stack', 'By stack'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="text-muted hover:text-accent link-draw">
            {label}
          </a>
        ))}
      </nav>

      {/* --- 1 ---------------------------------------------------------- */}
      <section className="mb-16 scroll-mt-20" id="policy-gap">
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">Finding one</p>
        <h2 className="text-3xl font-bold mb-3 max-w-2xl text-balance">
          Thousands of sites enforce a policy they never published
        </h2>
        <div className="max-w-2xl space-y-4 leading-relaxed mb-8">
          <p>
            robots.txt is a published promise. What a server does when a crawler carrying an AI user
            agent actually knocks is a separate fact, and the two do not have to agree. Every other
            index in this category publishes the first one. This index has measured both on every
            domain since the first crawl.
          </p>
          <p>
            <strong className="tnum">{gaps.toLocaleString()}</strong> measured sites, or{' '}
            <strong className="tnum">{pctStr(gaps, total)}</strong>, permit GPTBot in robots.txt and
            refuse a request from GPTBot at the server. Nothing in their published policy asked for
            that. It is almost always an edge rule switched on above the operator, and the operator
            usually does not know.
          </p>
          <p className="text-muted">
            The measurement is deliberately narrow: only an outright refusal counts, never a
            response that merely looks thin, because a dynamic page varies legitimately and a false
            accusation here would be expensive.
          </p>
        </div>

        <PolicyQuadrant counts={quadrant} total={total} />

        {gapExamples.length ? (
          <div className="mt-8">
            <h3 className="text-lg font-bold mb-3">The most-visited sites where this is happening</h3>
            <DomainTable rows={gapExamples} caption="Sites permitting GPTBot in robots.txt and refusing it at the server" showStack />
          </div>
        ) : null}
      </section>

      {/* --- 2 ---------------------------------------------------------- */}
      <Reveal>
        <section className="mb-16 scroll-mt-20" id="who-decides">
          <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">Finding two</p>
          <h2 className="text-3xl font-bold mb-3 max-w-2xl text-balance">
            Most of the web never made a decision about AI at all
          </h2>
          <div className="max-w-2xl space-y-4 leading-relaxed mb-8">
            <p>
              Coverage of AI crawler blocking treats it as a choice publishers are making. For most
              of the web it is not a choice, it is a default.
            </p>
            <p>
              <strong className="tnum">{inherited.toLocaleString()}</strong> measured sites have a
              robots.txt that names no AI crawler at all, and another{' '}
              <strong className="tnum">{absent.toLocaleString()}</strong> have no robots.txt
              whatsoever. Against that, only{' '}
              <strong className="tnum">{deliberate.toLocaleString()}</strong> name a single one. So
              for roughly{' '}
              <strong className="tnum">{pctStr(inherited + absent, total)}</strong> of the sites in
              this index, whatever AI policy exists arrived with the platform or the CDN.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 items-start mb-8">
            <div>
              <h3 className="text-sm font-semibold mb-3">
                <Explain id="posture">Policy posture</Explain>
              </h3>
              <RankedBars
                caption="Share of measured sites in each policy posture"
                unit="%"
                data={postures.map((p) => ({
                  id: p.id,
                  label: POSTURE_LABEL[p.id],
                  value: pct(p.count, total),
                }))}
              />
              <dl className="mt-4 space-y-2 text-sm">
                {postures.map((p) => (
                  <div key={p.id}>
                    <dt className="font-medium">{POSTURE_LABEL[p.id]}</dt>
                    <dd className="text-muted text-xs leading-relaxed">{POSTURE_BLURB[p.id]}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">
                Blocking rate by <Explain id="edge-network">edge network</Explain>
              </h3>
              <RankedBars
                caption="Share of sites behind each edge network blocking at least one answer-surface crawler"
                data={networks.map((n) => ({
                  id: n.id,
                  label: n.id,
                  value: n.blockingRate,
                  href: `/networks/${n.id}`,
                }))}
              />
              <p className="text-sm text-muted mt-4 leading-relaxed">
                The spread between the most and least restrictive edge networks is far wider than
                anything the sites themselves publish accounts for. Which CDN a site sits behind
                predicts its AI policy better than anything about the site.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* --- 3 ---------------------------------------------------------- */}
      <Reveal>
        <section className="mb-16 scroll-mt-20" id="shapes">
          <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">Finding three</p>
          <h2 className="text-3xl font-bold mb-3 max-w-2xl text-balance">
            Blocking is not one behaviour, and the interesting group wants to be cited
          </h2>
          <div className="max-w-2xl space-y-4 leading-relaxed mb-8">
            <p>
              A single "blocks AI" percentage flattens six different positions into one. Separating
              them turns up a segment that is usually invisible: sites that block the training
              crawlers and allow every crawler that answers a live question. They are not refusing
              AI. They are refusing to be absorbed while staying available to be quoted.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            {archetypes.map((a) => (
              <div key={a.id} className="border border-rule rounded p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-bold">{ARCHETYPE_LABEL[a.id]}</h3>
                  <span className="tnum text-sm text-muted">{pctStr(a.count, total)}</span>
                </div>
                <p className="tnum text-xs text-muted mt-0.5">{a.count.toLocaleString()} sites</p>
                <p className="text-sm text-muted mt-2 leading-snug">{ARCHETYPE_BLURB[a.id]}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted max-w-2xl">
            Measured across {TIER1.length} answer-surface crawlers.{' '}
            <Link href="/bots" className="text-accent underline underline-offset-4">
              Per-crawler detail
            </Link>
            .
          </p>
        </section>
      </Reveal>

      {/* --- 4 ---------------------------------------------------------- */}
      <Reveal>
        <section className="mb-16 scroll-mt-20" id="standards">
          <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">Finding four</p>
          <h2 className="text-3xl font-bold mb-3 max-w-2xl text-balance">
            Almost nobody publishes anything for agents to read
          </h2>
          <div className="max-w-2xl space-y-4 leading-relaxed mb-8">
            <p>
              There is a lot of writing about llms.txt, agent cards and machine-readable licensing.
              There is very little deployment. These are the adoption rates across the most-visited
              domains on the web, which is the most favourable population you could pick.
            </p>
          </div>

          {/*
            Each row carries its own denominator, because they genuinely differ. llms.txt and
            agents.md have been measured on every record since the first crawl; the probe-3
            signals only exist on records taken by a probe that looked for them. Dividing
            both by the same number would be the exact defect this release fixed elsewhere.
          */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ['llms.txt', stats?.llmsTxt ?? null, observed],
                ['agents.md', stats?.agentsMd ?? null, observed],
                ['Agent card', withCard, signalsObserved],
                ['Machine-readable licence', withLicence, signalsObserved],
                ['Content-Signal', withSignal, signalsObserved],
                ['A dateline', withDateline, signalsObserved],
              ] as Array<[string, number | null, number]>
            ).map(([label, n, base]) =>
              n === null || base === 0 ? (
                <figure key={label} className="m-0 border border-rule rounded p-4">
                  <figcaption className="text-sm font-medium">{label}</figcaption>
                  <p className="text-xs text-muted mt-1 leading-snug">
                    Not measured yet. This check was added in probe 3 and appears after the next
                    nightly crawl. Shown as unmeasured rather than as zero, because nobody has
                    asked.
                  </p>
                </figure>
              ) : (
                <UnitChart
                  key={label}
                  percent={pct(n, base)}
                  label={label}
                  sub={`${n.toLocaleString()} of ${base.toLocaleString()} sites (${pctStr(n, base)})`}
                />
              ),
            )}
          </div>

          {!anySignals ? (
            <p className="border border-rule rounded p-4 bg-raised mt-4 text-sm">
              The four probe-3 signals above have not been measured yet. The archived records
              predate the checks, and inventing a zero for a question that was never asked is the
              failure this index is built to avoid.
            </p>
          ) : null}

          <p className="text-sm text-muted mt-6 max-w-2xl">
            {withAuthor === null ? (
              <>
                Declared authorship is measured from the next crawl onward. An answer engine
                deciding whether to quote a page weighs when it was written and who wrote it, and
                both are cheaper to add than anything else on this list.
              </>
            ) : (
              <>
                Declared authorship reaches {pctStr(withAuthor, signalsObserved)}. An answer engine
                deciding whether to quote a page weighs when it was written and who wrote it, and
                both are cheaper to add than anything else on this list.
              </>
            )}
          </p>
        </section>
      </Reveal>

      {/* --- 5 ---------------------------------------------------------- */}
      <Reveal>
        <section className="mb-16 scroll-mt-20" id="stack">
          <h2 className="text-2xl font-bold mb-1">By stack</h2>
          <p className="text-sm text-muted mb-6 max-w-2xl">
            Cohorts under 25 measured sites are not published, because a 100% blocking rate over
            three sites is noise presented as a finding.
          </p>

          <div className="space-y-10">
            <div>
              <h3 className="text-lg font-bold mb-3">Edge network</h3>
              <CohortTable cohorts={networks} kind="network" caption="Blocking rate by edge network" />
            </div>
            <div>
              <h3 className="text-lg font-bold mb-3">Publishing platform</h3>
              <CohortTable cohorts={platforms} kind="platform" caption="Blocking rate by publishing platform" />
            </div>
            <div>
              <h3 className="text-lg font-bold mb-3">Top-level domain</h3>
              <CohortTable cohorts={tlds} kind="tld" caption="Blocking rate by top-level domain" />
            </div>
          </div>
        </section>
      </Reveal>

      <section className="border-t border-rule pt-8 max-w-2xl">
        <h2 className="text-xl font-bold mb-3">Check any of this yourself</h2>
        <p className="text-muted leading-relaxed">
          Every number on this page is arithmetic over an archived observation, no model involved at
          any point, and the whole dataset is a download.{' '}
          <Link href="/methodology" className="text-accent underline underline-offset-4">
            How each one is measured
          </Link>
          {' . '}
          <Link href="/coverage" className="text-accent underline underline-offset-4">
            What the index does not cover
          </Link>
          {' . '}
          <Link href="/data" className="text-accent underline underline-offset-4">
            Download it
          </Link>
        </p>
      </section>

      <PageMeta />
      <Attribution subject="What the CrawlIndex data shows" measuredOn={stats?.day ?? null} />
    </>
  );
}
