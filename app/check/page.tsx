import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callerKey, isProbeTarget, rateLimit } from '../../lib/guard';
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
import { SITE } from '../../lib/site';
import { PageHeader, ScoreChip } from '../../components/ui';
import { BandBars, Histogram } from '../../components/charts';
import { scoreHistogram } from '../../lib/dataset';

/**
 * Six outbound requests, each with its own timeout, serialised by the per-host politeness
 * gate. The only route on the site that is not a static file, because it measures something
 * that does not exist yet.
 *
 * The arithmetic does not close on its own: six timeouts plus gating can exceed this
 * ceiling against a tarpitting origin, which would produce a bare Vercel 504 with no
 * explanation. `probeDomain` is therefore given a deadline below `maxDuration` and returns
 * what it has when it runs out. See `PROBE_BUDGET_MS`.
 */
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

  // Anything already in the nightly index gets the permanent page, with its history. Free,
  // and it happens before any guard, because serving a static page costs nothing.
  if (domain && valid && getDomain(domain)) redirect(`/site/${domain}`);

  /**
   * Guards, in order of cost. This is the only route that fires outbound requests on an
   * anonymous caller's instruction, so it has to refuse two things before it does that.
   */
  let blocked: string | null = null;
  if (domain && valid) {
    const target = isProbeTarget(domain);
    if (!target.allowed) {
      blocked = target.reason ?? 'That target cannot be probed.';
    } else {
      const limit = rateLimit(callerKey(await headers()));
      if (!limit.allowed) {
        blocked = `Too many live checks from this address. Try again in ${limit.retryAfterSeconds} seconds. The nightly index and the whole dataset are free and unlimited; this one route is rate limited because each check makes six requests to somebody else's server.`;
      }
    }
  }

  return (
    <>
      <PageHeader
        kicker="Live check"
        title="Measure any domain"
        lede="Runs the same requests the nightly crawler makes and scores the result with the same rubric. Nothing is stored, and adding a domain to the nightly index is a separate, deliberate step."
      />

      {/*
        The hint used to live inside the input's flex child while the row was `items-end`,
        so the button aligned to the bottom of the hint rather than to the input and sat
        visibly low. Input and button are now their own row and the hint sits under both.
      */}
      <form method="get" action="/check" className="mb-10 max-w-xl">
        <label htmlFor="domain" className="block text-sm font-medium mb-1">
          Domain
        </label>
        <div className="flex flex-wrap gap-3">
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
            className="flex-1 min-w-56 border border-rule rounded px-3 py-2 bg-paper text-ink font-mono"
          />
          <button
            type="submit"
            className="border-2 border-accent text-accent font-medium rounded px-5 py-2 hover:bg-accent-soft shrink-0"
          >
            Measure it
          </button>
        </div>
        <p id="domain-hint" className="text-xs text-muted mt-2">
          Just the hostname. Takes a few seconds, and nothing is stored.
        </p>
      </form>

      {raw && !valid ? (
        <p role="alert" className="border-l-4 border-bad bg-raised p-4">
          <strong>{raw}</strong> is not a valid domain name. Enter a hostname such as example.com.
        </p>
      ) : null}

      {blocked ? (
        <p role="alert" className="border-l-4 border-bad bg-raised p-4">
          {blocked}
        </p>
      ) : null}

      {domain && valid && !blocked ? <Result domain={domain} /> : null}
    </>
  );
}

/**
 * Leaves headroom under `maxDuration` for scoring, rendering and the platform's own
 * overhead. Overrunning would produce a bare 504; stopping early produces a partial
 * measurement that says which checks it did not get to, which is a better answer.
 */
const PROBE_BUDGET_MS = 45_000;

async function Result({ domain }: { domain: string }) {
  const obs = await probeDomain(domain, { deadlineMs: PROBE_BUDGET_MS });
  const score = scoreObservation(obs);
  const skipped = obs.signals?.skippedChecks ?? [];

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

      {skipped.length ? (
        <div className="border-l-4 border-warn bg-raised p-4 mb-8">
          <h3 className="font-semibold mb-1">This check ran out of time</h3>
          <p className="text-sm">
            {domain} responded slowly enough that {skipped.length} check
            {skipped.length === 1 ? '' : 's'} were not made:{' '}
            <span className="font-mono">{skipped.join(', ')}</span>. Those are excluded from the
            score rather than counted as missing, because they are a fact about our deadline and
            not about the site. The nightly crawler has no such limit, so an indexed domain is
            always measured in full.
          </p>
        </div>
      ) : null}

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

      {/*
        The obvious question a reader has at this point, answered rather than left implicit.
        Auto-storing every checked domain would be easy and would quietly destroy the
        corpus: the population has to be defined and reproducible for any aggregate on the
        rest of the site to mean anything.
      */}
      <section className="border border-rule rounded p-5 bg-raised">
        <h3 className="font-bold mb-1">Want this measured every night?</h3>
        <p className="text-sm text-muted mb-4 max-w-2xl leading-relaxed">
          This result is not stored. The index is a defined population, the most-visited domains
          plus anything explicitly submitted, and it has to stay that way for any percentage on the
          rest of the site to mean something. Quietly adding every domain anybody typed would let
          one person reshape the denominator of every published figure. So adding one is a
          deliberate act with a public audit trail, and it takes a single click.
        </p>
        <p className="flex flex-wrap gap-3 items-center">
          <a
            href={`${SITE.repo}/issues/new?template=add-domain.yml&title=${encodeURIComponent(`Add domain: ${domain}`)}`}
            className="inline-block border-2 border-accent text-accent font-medium rounded px-4 py-2 hover:bg-accent-soft text-sm"
          >
            Add {domain} to the index
          </a>
          <span className="text-xs text-muted">
            Opens a prefilled GitHub issue. Measured on tonight&apos;s crawl, then it gets a
            permanent page and a change history.
          </span>
        </p>
      </section>

      <p className="text-sm text-muted mt-6">
        Measured just now, live. See the{' '}
        <Link href="/methodology" className="text-accent underline underline-offset-4">
          methodology
        </Link>{' '}
        for how each line is awarded, or the{' '}
        <Link href="/glossary" className="text-accent underline underline-offset-4">
          glossary
        </Link>{' '}
        for what the terms mean.
      </p>
    </section>
  );
}
