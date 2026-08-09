import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl, SITE } from '../../lib/site';
import { PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'API',
  description: `Free JSON access to the ${SITE.name} dataset: per-domain measurements, aggregate statistics, cross-tabs by CDN and platform, and the full daily history.`,
  alternates: { canonical: '/api' },
};

const ENDPOINTS = [
  {
    path: '/api/v1/stats',
    summary:
      'Current aggregates, the full daily history, and cross-tabs by edge network, platform and top-level domain.',
    example: absoluteUrl('/api/v1/stats'),
  },
  {
    path: '/api/v1/domain/{domain}',
    summary:
      'One domain: score, grade, per-crawler access, detected stack, and the complete archived observation the score was computed from.',
    example: absoluteUrl('/api/v1/domain/stripe.com'),
  },
  {
    path: '/data/domains.jsonl',
    summary: 'The entire dataset, one JSON object per line. Usually what you actually want.',
    example: absoluteUrl('/data/domains.jsonl'),
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
        lede="Free, unauthenticated, CORS-open, and served as static files from a CDN. There is no key to request, no quota to exceed and no endpoint that can be slow, because none of this is computed at request time."
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
          observed, usually because the request met a bot wall. The total is then renormalised over
          the points that remained, so a partial 80 and a complete 80 are not the same claim. Do
          not put them in the same ranking.
        </p>
        <p>
          <code className="font-mono text-sm">score</code> is{' '}
          <code className="font-mono text-sm">null</code> when the site could not be measured at
          all. That is not a zero and should be excluded from averages rather than coerced to one.
        </p>
        <p>
          Every response carries <code className="font-mono text-sm">observation</code>, the raw
          evidence the score was derived from, and <code className="font-mono text-sm">vantage</code>,
          the network the measurement was taken from. Scoring is a pure function over the
          observation, so you can recompute any score and get the identical result.
        </p>

        <h2 className="text-2xl font-bold pt-4">Rate limits</h2>
        <p>
          None. Everything is a static file on a CDN, so there is nothing to protect. The data
          changes once a day after the nightly crawl, so polling faster returns identical bytes. If
          you need the whole index, download{' '}
          <a href={absoluteUrl('/data/domains.jsonl')} className="text-accent underline underline-offset-4">
            domains.jsonl
          </a>{' '}
          once rather than fetching thousands of per-domain files.
        </p>

        <h2 className="text-2xl font-bold pt-4">Stability</h2>
        <p>
          The <code className="font-mono text-sm">v1</code> shape will not change incompatibly. New
          fields may be added; existing ones will not be renamed or removed under the same version.
          If the rubric changes, <code className="font-mono text-sm">versions.rubric</code> changes
          with it and historical records keep the version they were scored under.
        </p>

        <h2 className="text-2xl font-bold pt-4">Credit</h2>
        <p>
          Licensed{' '}
          <a href={SITE.licenceUrl} className="text-accent underline underline-offset-4">
            {SITE.licence}
          </a>
          . Attribution to {SITE.publisher} is the only condition. The{' '}
          <Link href="/data" className="text-accent underline underline-offset-4">
            data page
          </Link>{' '}
          carries a ready-made citation.
        </p>
      </section>
    </>
  );
}
