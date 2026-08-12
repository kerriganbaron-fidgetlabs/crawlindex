import type { Metadata } from 'next';
import Link from 'next/link';
import { AGENTS, REGISTRY_SNAPSHOT_DATE, REGISTRY_VERSION, TIER1, TIER2 } from '../../lib/agents';
import { getMeta } from '../../lib/dataset';
import { NETWORKS, PLATFORMS } from '../../lib/fingerprints';
import { PROBE_VERSION } from '../../lib/probe';
import { RUBRIC_VERSION } from '../../lib/score';
import { SITE } from '../../lib/site';
import { PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'Exactly how CrawlIndex measures and scores agent readiness: what it requests, how robots.txt is interpreted, the full 100-point rubric, and the rules that keep the numbers honest.',
  alternates: { canonical: '/methodology' },
};

const RUBRIC: Array<{ band: string; max: number; rows: Array<[string, number, string]> }> = [
  {
    band: 'Agent access',
    max: 45,
    rows: [
      ['Answer-surface crawlers allowed', 30, `Proportional across the ${TIER1.length} tier-1 tokens.`],
      ['Secondary crawlers allowed', 8, `Proportional across the ${TIER2.length} tier-2 tokens.`],
      ['Serves crawlers the same content', 7, 'Lost when a request as GPTBot is refused or served materially less than a browser gets.'],
    ],
  },
  {
    band: 'Machine-readable surface',
    max: 25,
    rows: [
      ['robots.txt published', 3, 'Present and parseable.'],
      ['Sitemap declared in robots.txt', 5, 'A Sitemap: line pointing somewhere.'],
      ['llms.txt published', 12, 'Eight points for serving one, twelve when its structure also matches the spec.'],
      ['agents.md published', 5, 'Served as text at /agents.md.'],
    ],
  },
  {
    band: 'Content structure',
    max: 30,
    rows: [
      ['Organization schema', 8, 'JSON-LD that lets an agent resolve who publishes the site.'],
      ['WebSite schema', 4, 'JSON-LD WebSite node.'],
      ['Additional structured data', 4, 'Any further JSON-LD types on the homepage.'],
      ['Readable without JavaScript', 8, 'Eight at 500 or more characters of server-rendered text, four at 150, none below.'],
      ['Single top-level heading', 3, 'Exactly one h1.'],
      ['Semantic landmarks', 3, 'Three or more of main, nav, header, footer, article, aside.'],
    ],
  },
];

export default function MethodologyPage() {
  const meta = getMeta();

  return (
    <>
      <PageHeader
        kicker="Methodology"
        title="How the numbers are made"
        lede="Everything here is checkable. If a score looks wrong to you, this page plus the downloadable observation should let you work out why without asking anyone."
      />

      <div className="max-w-2xl space-y-4 leading-relaxed mb-12">
        <h2 className="text-2xl font-bold pt-4">What we request</h2>
        <p>
          Each measured domain receives at most five requests, identifying as{' '}
          <code className="font-mono text-sm">CrawlIndexBot/1.0</code> except where noted:
        </p>
        <ol className="list-decimal pl-6 space-y-1">
          <li>
            <code className="font-mono text-sm">/robots.txt</code> first, which yields the access
            policy for every tracked crawler in one fetch and lets us honour an opt-out before
            requesting anything else.
          </li>
          <li>The homepage, as a mainstream desktop browser. This is the control.</li>
          <li>The homepage again, as GPTBot, to compare against the control.</li>
          <li><code className="font-mono text-sm">/llms.txt</code></li>
          <li><code className="font-mono text-sm">/agents.md</code></li>
        </ol>
        <p>
          A site whose robots.txt bars all crawlers costs one request, not five. Requests are rate
          limited to one per host at a time, carry a <code className="font-mono text-sm">From</code>{' '}
          header, and time out quickly. We read only what a site serves publicly. We do not log in,
          do not evaluate JavaScript, and store no personal data.
        </p>

        <h2 className="text-2xl font-bold pt-4">What is derived without extra requests</h2>
        <p>
          Publishing platform, edge network, server software, page language, feed and canonical
          presence, security headers and the sophistication of the robots.txt policy are all read
          from bytes already fetched. That costs the measured site nothing and is what lets this
          index cross-tabulate blocking against{' '}
          <Link href="/networks" className="text-accent underline underline-offset-4">CDN</Link> and{' '}
          <Link href="/platforms" className="text-accent underline underline-offset-4">platform</Link>.
        </p>
        <p>
          {PLATFORMS.length} platform fingerprints and {NETWORKS.length} network fingerprints are
          matched, header evidence before markup, most specific first. Nothing is guessed: an
          unrecognised stack is recorded as unidentified and excluded from cross-tabs, because a
          wrong label is worse than no label.
        </p>

        <h2 className="text-2xl font-bold pt-4">How robots.txt is read</h2>
        <p>
          Following RFC 9309. Consecutive <code className="font-mono text-sm">User-agent</code>{' '}
          lines share a group. A group naming a token beats the wildcard group outright and does
          not inherit from it. The longest matching path rule wins, and an exact-length tie goes to{' '}
          <code className="font-mono text-sm">Allow</code>. An empty{' '}
          <code className="font-mono text-sm">Disallow:</code> means allow everything. Where no rule
          applies, the crawler is allowed.
        </p>

        <h2 className="text-2xl font-bold pt-4">Five rules that keep this honest</h2>
        <ol className="list-decimal pl-6 space-y-3">
          <li>
            <strong>No model touches a score, and neither does anybody else&apos;s API.</strong>{' '}
            Scoring is arithmetic over recorded observations. Language models are used nowhere in
            measurement, scoring or report prose.
            <span className="block mt-2 text-muted">
              This rules out something worth naming, because it is a reasonable thing to ask for.
              Other agent-readiness scores exist, and folding one into this rubric would be easy
              and would break the whole thing: a score would stop being reproducible from the
              evidence in this repository, would move when somebody else changed their model, and
              could not be recomputed for a past date. Every number here has to be derivable from
              bytes we archived and published. Where an external standard is worth measuring, we
              measure its <em>adoption</em> from the site&apos;s own bytes, which is why RSL
              licensing, Content-Signal and agent cards are checks here and no third-party score
              is.
            </span>
          </li>
          <li>
            <strong>Unobservable is not zero.</strong> A site we cannot reach has no score and is
            excluded from every average, rather than counted as a failure and dragging the
            aggregate down.
          </li>
          <li>
            <strong>Our failures are not charged to the site.</strong> When our control request is
            met by a bot challenge, everything we could infer from that page describes the
            challenge, not the site. Those checks are marked unavailable and the score is
            renormalised over what remained. Such results are labelled partial and kept out of
            leaderboards, because a score over 46 points is not comparable to one over 100.
          </li>
          <li>
            <strong>A change must be the site's, not ours.</strong> Nothing is reported as a change
            when the two observations came from different probe versions or different network
            vantage points. Improving our own bot-wall detection, or moving where the crawler runs,
            must never be published as somebody else changing their policy.
          </li>
          <li>
            <strong>Everything is versioned.</strong> Each stored measurement records the crawler
            registry, probe and rubric versions and the vantage it was produced under, and the full
            observation is archived so any score can be recomputed later.
          </li>
        </ol>

        <h2 className="text-2xl font-bold pt-4">What a low score does not mean</h2>
        <p>
          Blocking AI crawlers is a legitimate choice, and for many publishers it is the correct
          one. A low score means a site is hard for agents to read. It does not mean the site is
          badly run, and this index takes no position on whether any given operator should open up.
          What it does insist on is that the choice be visible.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">The rubric, in full</h2>
        {RUBRIC.map((band) => (
          <div key={band.band} className="mb-6">
            <h3 className="font-semibold border-b border-rule pb-1 mb-2 flex justify-between">
              <span>{band.band}</span>
              <span className="tnum text-muted text-sm">{band.max} points</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <caption className="sr-only">{band.band} scoring lines</caption>
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="py-1 pr-3 font-medium">Check</th>
                    <th scope="col" className="py-1 pr-3 font-medium w-16">Points</th>
                    <th scope="col" className="py-1 font-medium">How it is awarded</th>
                  </tr>
                </thead>
                <tbody>
                  {band.rows.map(([label, pts, how]) => (
                    <tr key={label} className="border-t border-rule">
                      <td className="py-2 pr-3 font-medium align-top">{label}</td>
                      <td className="py-2 pr-3 tnum align-top">{pts}</td>
                      <td className="py-2 text-muted align-top">{how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="text-sm text-muted">
          Grades: A at 90 and above, B at 75, C at 60, D at 40, F below 40.
        </p>
      </section>

      <section className="border-t border-rule pt-8">
        <h2 className="text-2xl font-bold mb-4">Versions in force</h2>
        <dl className="text-sm grid sm:grid-cols-2 gap-x-8 gap-y-2 max-w-xl">
          <div className="flex justify-between border-b border-rule py-1">
            <dt className="text-muted">Rubric</dt>
            <dd className="tnum">{RUBRIC_VERSION}</dd>
          </div>
          <div className="flex justify-between border-b border-rule py-1">
            <dt className="text-muted">Probe</dt>
            <dd className="tnum">{PROBE_VERSION}</dd>
          </div>
          <div className="flex justify-between border-b border-rule py-1">
            <dt className="text-muted">Crawler registry</dt>
            <dd className="tnum">{REGISTRY_VERSION} ({AGENTS.length} tokens)</dd>
          </div>
          <div className="flex justify-between border-b border-rule py-1">
            <dt className="text-muted">Registry snapshot</dt>
            <dd className="tnum">{REGISTRY_SNAPSHOT_DATE}</dd>
          </div>
          {meta ? (
            <div className="flex justify-between border-b border-rule py-1">
              <dt className="text-muted">Last crawl vantage</dt>
              <dd className="tnum">{meta.vantage}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-sm text-muted mt-6 max-w-2xl">
          Everything above is checkable against the{' '}
          <Link href="/data" className="text-accent underline underline-offset-4">
            downloadable dataset
          </Link>{' '}
          and the{' '}
          <a href={SITE.repo} className="text-accent underline underline-offset-4">
            source
          </a>
          . To have a domain excluded, disallow{' '}
          <code className="font-mono text-sm">CrawlIndexBot</code> in its robots.txt and it drops
          out on the next crawl.
        </p>
      </section>
    </>
  );
}
