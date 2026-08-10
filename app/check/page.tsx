import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TIER1 } from '../../lib/agents';
import { badgeTier, isEmbeddable, TIER_NAME } from '../../lib/badge';
import { getDomain, scoredRows } from '../../lib/dataset';
import {
  accessArchetype,
  ARCHETYPE_LABEL,
  percentileOf,
  policyGap,
  policyPosture,
  POSTURE_LABEL,
} from '../../lib/facets';
import { networkLabel, platformLabel } from '../../lib/fingerprints';
import { isValidDomain, normaliseDomain } from '../../lib/http';
import { probeDomain } from '../../lib/probe';
import { scoreObservation } from '../../lib/score';
import { PageHeader, ScoreChip } from '../../components/ui';
import { BandBars, Histogram } from '../../components/charts';
import { scoreHistogram } from '../../lib/dataset';

// Five outbound requests, each with its own timeout. The only route on the site that is
// not a static file, because it measures something that does not exist yet.
export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Check a domain',
  description:
    'Measure any domain against the CrawlIndex rubric: which AI crawlers it blocks, whether it publishes llms.txt or agents.md, and whether it serves crawlers different content.',
  alternates: { canonical: '/check' },
};

type Props = { searchParams: Promise<{ domain?: string }> };

export default async function CheckPage({ searchParams }: Props) {
  const raw = (await searchParams).domain?.trim();
  const domain = raw ? normaliseDomain(raw) : null;
  const valid = domain ? isValidDomain(domain) : false;

  // Anything already in the nightly index gets the permanent page, with its history.
  if (domain && valid && getDomain(domain)) redirect(`/site/${domain}`);

  return (
    <>
      <PageHeader
        kicker="Live check"
        title="Measure any domain"
        lede="Runs the same requests the nightly crawler makes and scores the result with the same rubric. Nothing is stored: only domains from the Tranco ranking are permanently indexed."
      />

      <form method="get" action="/check" className="mb-10 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-64">
          <label htmlFor="domain" className="block text-sm font-medium mb-1">
            Domain
          </label>
          <input
            id="domain"
            name="domain"
            type="text"
            inputMode="url"
            autoComplete="url"
            required
            defaultValue={domain ?? ''}
            placeholder="example.com"
            aria-describedby="domain-hint"
            className="w-full border border-rule rounded px-3 py-2 bg-paper text-ink font-mono"
          />
          <p id="domain-hint" className="text-xs text-muted mt-1">
            Just the hostname. Takes a few seconds.
          </p>
        </div>
        <button
          type="submit"
          className="border-2 border-accent text-accent font-medium rounded px-5 py-2 hover:bg-accent-soft"
        >
          Measure it
        </button>
      </form>

      {raw && !valid ? (
        <p role="alert" className="border-l-4 border-bad bg-raised p-4">
          <strong>{raw}</strong> is not a valid domain name. Enter a hostname such as example.com.
        </p>
      ) : null}

      {domain && valid ? <Result domain={domain} /> : null}
    </>
  );
}

async function Result({ domain }: { domain: string }) {
  const obs = await probeDomain(domain);
  const score = scoreObservation(obs);

  if (obs.optedOut) {
    return (
      <section className="border border-rule rounded p-5 bg-raised">
        <h2 className="text-xl font-bold mb-2">{domain} has opted out</h2>
        <p className="text-sm">
          Its robots.txt disallows CrawlIndexBot by name, so we stopped after that one request and
          measured nothing further. It will not appear in the index.
        </p>
      </section>
    );
  }

  if (!obs.reachable) {
    return (
      <section className="border border-rule rounded p-5 bg-raised">
        <h2 className="text-xl font-bold mb-2">Could not reach {domain}</h2>
        <p className="text-sm font-mono">{obs.error}</p>
        <p className="text-sm text-muted mt-2">
          A site we cannot observe gets no score. It is not recorded as a zero.
        </p>
      </section>
    );
  }

  const platform = platformLabel(obs.stack.platform);
  const network = networkLabel(obs.stack.network);
  const gap = policyGap(obs);
  const tier = badgeTier(score.total, score.grade);

  // Ranked against the same population the leaderboard uses, so the figure means the same
  // thing here as it does on a permanent page.
  const comparable = scoredRows()
    .map((r) => r.score.total as number)
    .sort((a, b) => a - b);
  const percentile =
    score.total !== null && !score.partial ? percentileOf(score.total, comparable) : null;

  const fixes = score.lines
    .filter((l) => l.available && l.earned < l.max)
    .map((l) => ({ ...l, gap: Number((l.max - l.earned).toFixed(1)) }))
    .sort((a, b) => b.gap - a.gap);

  return (
    <section>
      <div className="flex flex-wrap items-start gap-8 mb-8">
        <div>
          <ScoreChip score={score.total} grade={score.grade} partial={score.partial} size="lg" />
          {tier !== 'unscored' ? <p className="mt-2 text-sm font-medium">{TIER_NAME[tier]}</p> : null}
        </div>
        <div>
          <h2 className="text-2xl font-bold font-mono">{domain}</h2>
          <p className="text-muted">
            {obs.tier1Blocked.length === 0
              ? `Allows all ${TIER1.length} answer-surface AI crawlers.`
              : `Blocks ${obs.tier1Blocked.length} of ${TIER1.length} answer-surface AI crawlers.`}
          </p>
          <p className="text-sm text-muted mt-1">
            {POSTURE_LABEL[policyPosture(obs)]} policy . {ARCHETYPE_LABEL[accessArchetype(obs)]}
            {platform || network ? ` . ${[platform, network].filter(Boolean).join(' . ')}` : ''}
          </p>
          {percentile !== null ? (
            <p className="text-sm mt-2">
              Ahead of <strong className="tnum">{percentile}%</strong> of the fully measured sites in
              the index.
            </p>
          ) : null}
        </div>
        {percentile !== null ? (
          <Histogram buckets={scoreHistogram()} markAt={score.total} markLabel="Where this sits" />
        ) : null}
      </div>

      {gap.gap ? (
        <div className="border-l-4 border-bad bg-raised p-4 mb-8">
          <h3 className="font-semibold mb-1">Stated policy and enforced policy disagree</h3>
          <p className="text-sm">
            {gap.reason} Nothing in robots.txt asked for that, so it is most likely an edge rule
            above the site rather than a decision anyone made here.
          </p>
        </div>
      ) : null}

      {score.partial ? (
        <p className="border-l-4 border-warn bg-raised p-4 mb-8 text-sm">
          Partial assessment.{' '}
          {obs.control.reason ?? 'Some checks could not be observed.'} Those checks were excluded
          rather than failed, and the score was renormalised over what remained.
        </p>
      ) : null}

      {score.total !== null ? (
        <div className="mb-8 max-w-lg">
          <BandBars bands={score.bands} />
        </div>
      ) : null}

      {fixes.length ? (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-1">What would move this score</h3>
          <p className="text-sm text-muted mb-3 max-w-2xl">
            Observable checks that did not earn full marks, heaviest first.
          </p>
          <ol className="space-y-2">
            {fixes.slice(0, 6).map((f) => (
              <li key={f.id} className="text-sm flex gap-3 border-b border-rule pb-2">
                <span className="tnum shrink-0 w-12 text-right font-semibold text-accent">+{f.gap}</span>
                <span>
                  <span className="font-medium">{f.label}.</span>{' '}
                  <span className="text-muted">{f.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {isEmbeddable(tier) ? (
        <div className="border-2 border-good rounded p-5 mb-8 bg-raised">
          <h3 className="text-lg font-bold mb-1">{domain} would qualify for the {TIER_NAME[tier]} mark</h3>
          <p className="text-sm text-muted">
            A live check is not stored, so there is no permanent page and no mark yet.{' '}
            <Link href="/submit" className="text-accent underline underline-offset-4">
              Add the domain to the nightly index
            </Link>{' '}
            and it gets both on the next crawl.{' '}
            <Link href="/badge" className="text-accent underline underline-offset-4">
              What the mark is
            </Link>
            .
          </p>
        </div>
      ) : null}

      <h3 className="text-lg font-bold mb-3">Every check</h3>
      <ul className="space-y-2 mb-8">
        {score.lines.map((l) => (
          <li key={l.id} className="text-sm flex gap-3 border-b border-rule pb-2">
            <span
              aria-hidden="true"
              className={`tnum shrink-0 w-14 text-right font-medium ${
                !l.available ? 'text-muted' : l.earned === l.max ? 'text-good' : l.earned === 0 ? 'text-bad' : 'text-warn'
              }`}
            >
              {l.available ? `${l.earned}/${l.max}` : 'n/a'}
            </span>
            <span>
              <span className="font-medium">{l.label}.</span>{' '}
              <span className="text-muted">{l.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted">
        Measured just now, live, and not stored. See the{' '}
        <Link href="/methodology" className="text-accent underline underline-offset-4">
          methodology
        </Link>{' '}
        for how each line is awarded, or the{' '}
        <Link href="/glossary" className="text-accent underline underline-offset-4">
          glossary
        </Link>{' '}
        for what the terms mean.{' '}
        <Link href="/submit" className="text-accent underline underline-offset-4">
          Add this domain to the nightly index
        </Link>{' '}
        to give it a permanent page and a change history.
      </p>
    </section>
  );
}
