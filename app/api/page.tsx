import type { Metadata } from 'next';
import { absoluteUrl, SITE } from '../../lib/site';
import { PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'API',
  description: `Free JSON access to the ${SITE.name} dataset: per-domain measurements, aggregate statistics and the full daily history.`,
  alternates: { canonical: '/api' },
};

const ENDPOINTS = [
  {
    path: '/api/v1/stats',
    summary: 'Current aggregate figures across the whole index.',
    example: absoluteUrl('/api/v1/stats'),
  },
  {
    path: '/api/v1/stats?history=true',
    summary: 'The same, plus the full daily time series since the index began.',
    example: absoluteUrl('/api/v1/stats?history=true'),
  },
  {
    path: '/api/v1/domain/{domain}',
    summary:
      'One domain: score, grade, per-crawler access, and the complete archived observation the score was computed from.',
    example: absoluteUrl('/api/v1/domain/stripe.com'),
  },
  {
    path: '/badge/{domain}.svg',
    summary: 'Embeddable SVG badge showing the current score.',
    example: absoluteUrl('/badge/stripe.com.svg'),
  },
];

export default function ApiPage() {
  return (
    <>
      <PageHeader
        kicker="API"
        title="Take the data"
        lede="Read access is free, unauthenticated and CORS-open. The dataset is CC BY 4.0, so you can use it in research, journalism or a product as long as you credit it."
      />

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Endpoints</h2>
        <div className="space-y-6">
          {ENDPOINTS.map((e) => (
            <div key={e.path} className="border border-rule rounded p-4">
              <p className="font-mono text-sm font-semibold break-all">GET {e.path}</p>
              <p className="text-sm text-muted mt-2">{e.summary}</p>
              <p className="mt-2 text-sm">
                <a href={e.example} className="text-accent underline underline-offset-4 break-all">
                  Try it
                </a>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12 max-w-2xl space-y-4 leading-relaxed">
        <h2 className="text-2xl font-bold">Reading a response honestly</h2>
        <p>
          Two fields decide whether a score means what you think it means.{' '}
          <code className="font-mono text-sm">partial</code> is true when some checks could not be
          observed, usually because our request met a bot challenge. The total is then renormalised
          over the points that remained, so a partial 80 and a complete 80 are not the same claim.
          Do not put them in the same ranking.
        </p>
        <p>
          <code className="font-mono text-sm">score</code> is <code className="font-mono text-sm">null</code>{' '}
          when the site could not be measured at all. That is not a zero and should be excluded
          from averages rather than coerced to one.
        </p>
        <p>
          Every response carries <code className="font-mono text-sm">observation</code>, the raw
          evidence the score was derived from. Scoring is a pure function over that object, so you
          can recompute any score yourself and get the identical result.
        </p>

        <h2 className="text-2xl font-bold pt-4">Rate limits and caching</h2>
        <p>
          Responses are cached for an hour at the edge. The data behind them changes once a day
          after the nightly crawl, so polling faster returns identical bytes. There is no hard rate
          limit today. If that changes it will be announced here first, and the free tier will keep
          covering ordinary research use.
        </p>

        <h2 className="text-2xl font-bold pt-4">Coming next</h2>
        <p>
          Change webhooks and monitored domain alerts, so you find out the day a site starts
          blocking a crawler rather than the next time you think to check. That is the paid tier
          and it is what funds the free one. Write to{' '}
          <a href={`mailto:${SITE.contact}`} className="text-accent underline underline-offset-4">
            {SITE.contact}
          </a>{' '}
          to be told when it exists.
        </p>
      </section>
    </>
  );
}
