import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AGENTS } from '../../lib/agents';
import { isValidDomain, normaliseDomain } from '../../lib/http';
import { probeDomain } from '../../lib/probe';
import { scoreObservation } from '../../lib/score';
import { getDomain } from '../../lib/queries';
import { PageHeader, ScoreChip } from '../../components/ui';

// Five outbound requests, each with its own timeout.
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
  if (domain && valid) {
    const existing = await getDomain(domain).catch(() => null);
    if (existing) redirect(`/site/${domain}`);
  }

  return (
    <>
      <PageHeader
        kicker="Live check"
        title="Measure any domain"
        lede="Runs the same five requests the nightly crawler makes and scores the result with the same rubric. Nothing is stored: only domains from the Tranco ranking are permanently indexed."
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
  const tier1 = AGENTS.filter((a) => a.tier === 1);

  if (obs.optedOut) {
    return (
      <section className="border border-rule rounded p-5 bg-raised">
        <h2 className="text-xl font-bold mb-2">{domain} has opted out</h2>
        <p className="text-sm">
          Its robots.txt disallows CrawlIndexBot, so we stopped after that one request and measured
          nothing further. It will not appear in the index.
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

  return (
    <section>
      <div className="flex flex-wrap items-center gap-6 mb-8">
        <ScoreChip score={score.total} grade={score.grade} partial={score.partial} size="lg" />
        <div>
          <h2 className="text-2xl font-bold font-mono">{domain}</h2>
          <p className="text-muted">
            {obs.tier1Blocked.length === 0
              ? `Allows all ${tier1.length} answer-surface AI crawlers.`
              : `Blocks ${obs.tier1Blocked.length} of ${tier1.length} answer-surface AI crawlers.`}
          </p>
        </div>
      </div>

      {score.partial ? (
        <p className="border-l-4 border-warn bg-raised p-4 mb-8 text-sm">
          Partial assessment. Our request was met with a bot challenge
          {obs.control.reason ? ` (${obs.control.reason})` : ''}, so the checks that depend on
          reading the page were excluded rather than failed, and the score was renormalised over
          what remained.
        </p>
      ) : null}

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
        Measured just now, live. See the{' '}
        <Link href="/methodology" className="text-accent underline underline-offset-4">
          methodology
        </Link>{' '}
        for how each line is awarded.
      </p>
    </section>
  );
}
