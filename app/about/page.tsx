import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '../../lib/site';
import { PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'About',
  description: `Who runs ${SITE.name}, how it is funded, what data it holds, and how to have a domain removed.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <PageHeader kicker="About" title={`What ${SITE.name} is`} />

      <div className="max-w-2xl space-y-5 leading-relaxed">
        <p>
          {SITE.name} is a public measurement project. It reads publicly served files from the
          most-visited sites on the web and publishes what it finds about how those sites treat AI
          crawlers and agents.
        </p>

        <h2 className="text-2xl font-bold pt-4">Who runs it</h2>
        <p>
          It is published by{' '}
          <a href={SITE.publisherUrl} className="text-accent underline underline-offset-4">
            {SITE.publisher}
          </a>
          , an architecture and AI consultancy in Breda, the Netherlands. The index is operated as
          a standalone public resource and is not a marketing surface for client work.
        </p>

        <h2 className="text-2xl font-bold pt-4">How it is funded</h2>
        <p>
          The public index is free and intended to stay that way. It costs very little to run: the
          crawler is a scheduled job on a single machine and the site is static enough to serve
          from cache. Paid access to the API, change alerts and historical exports is what pays for
          it. There is no advertising, and nobody can pay to change a score.
        </p>

        <h2 className="text-2xl font-bold pt-4">What data it holds</h2>
        <p>
          Only what a web server hands to any anonymous visitor: robots.txt, a homepage, and two
          well-known paths. No personal data is collected, no accounts are required to read
          anything, and there is no advertising or third-party tracking on this site.
        </p>

        <h2 className="text-2xl font-bold pt-4">Being removed from the index</h2>
        <p>
          Disallow <code className="font-mono text-sm">CrawlIndexBot</code> in your robots.txt and
          the domain drops out on the next crawl. The crawler checks that rule before it requests
          anything else, so opting out costs your server a single request:
        </p>
        <pre className="overflow-x-auto text-sm bg-raised border border-rule rounded p-4">
          <code>{`User-agent: CrawlIndexBot\nDisallow: /`}</code>
        </pre>
        <p>
          If you would rather not edit robots.txt, write to{' '}
          <a href={`mailto:${SITE.contact}`} className="text-accent underline underline-offset-4">
            {SITE.contact}
          </a>{' '}
          and the domain will be excluded manually.
        </p>

        <h2 className="text-2xl font-bold pt-4">Corrections</h2>
        <p>
          Measurement projects get things wrong. If a result looks incorrect, the{' '}
          <Link href="/methodology" className="text-accent underline underline-offset-4">
            methodology
          </Link>{' '}
          explains how it was produced, and the underlying observation is available through the{' '}
          <Link href="/api" className="text-accent underline underline-offset-4">
            API
          </Link>
          . Send corrections to {SITE.contact} and they will be fixed.
        </p>

        <h2 className="text-2xl font-bold pt-4">Reuse</h2>
        <p>
          The published data is licensed{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            className="text-accent underline underline-offset-4"
          >
            CC BY 4.0
          </a>
          . Use it in research, journalism or products. An attribution link back to {SITE.name} is
          all that is asked.
        </p>
      </div>
    </>
  );
}
