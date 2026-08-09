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
          Research and data by{' '}
          <a href={SITE.publisherUrl} className="text-accent underline underline-offset-4">
            {SITE.publisher}
          </a>
          , an architecture and AI consultancy in {SITE.publisherLocation}. The index is operated
          as a standalone public resource, not as a marketing surface for client work. Nobody can
          pay to change a score, and there is nothing here to buy.
        </p>

        <h2 className="text-2xl font-bold pt-4">How it is funded, and why that matters</h2>
        <p>
          It costs essentially nothing to run, which is the point. The crawler is a scheduled job
          on free CI minutes, the dataset is files in a public git repository rather than a hosted
          database, and the site is static. There is no server to keep alive and no bill that grows
          with traffic.
        </p>
        <p>
          That is deliberate. A free public resource that depends on someone continuing to pay for
          it is a resource with an expiry date. This one can sit here indefinitely without anyone
          deciding to keep funding it.
        </p>

        <h2 className="text-2xl font-bold pt-4">What data it holds</h2>
        <p>
          Only what a web server hands to any anonymous visitor: robots.txt, a homepage, and two
          well-known paths. No personal data is collected, no accounts exist, no cookies are set,
          and there is no advertising or third-party tracking on this site.
        </p>

        <h2 className="text-2xl font-bold pt-4">Being removed from the index</h2>
        <p>
          Self-service, and it needs no request. Disallow{' '}
          <code className="font-mono text-sm">CrawlIndexBot</code> in your robots.txt and the domain
          drops out on the next crawl. The crawler checks that rule before it requests anything
          else, so opting out costs your server a single request:
        </p>
        <pre className="overflow-x-auto text-sm bg-raised border border-rule rounded p-4">
          <code>{`User-agent: CrawlIndexBot\nDisallow: /`}</code>
        </pre>
        <p>
          Note that a blanket <code className="font-mono text-sm">User-agent: * / Disallow: /</code>{' '}
          is treated differently. We honour it by fetching no pages, but robots.txt is public and
          the access policy it states is still reported, because dropping the most restrictive
          operators from an index about restrictiveness would quietly bias every figure on the
          site.
        </p>

        <h2 className="text-2xl font-bold pt-4">Corrections</h2>
        <p>
          Measurement projects get things wrong. If a result looks incorrect, the{' '}
          <Link href="/methodology" className="text-accent underline underline-offset-4">
            methodology
          </Link>{' '}
          explains how it was produced and the{' '}
          <Link href="/data" className="text-accent underline underline-offset-4">
            underlying observation
          </Link>{' '}
          is downloadable, so you can usually see the cause yourself.
        </p>
        <p>
          Corrections can be raised as an{' '}
          <a href={SITE.issues} className="text-accent underline underline-offset-4">
            issue on the repository
          </a>
          . To be straight with you about the service level: this project is deliberately
          unstaffed. Issues are not monitored on any schedule and there is no support address. The
          robots.txt opt-out above is the mechanism that is guaranteed to work, immediately and
          without anyone reading anything.
        </p>

        <h2 className="text-2xl font-bold pt-4">Reuse</h2>
        <p>
          The dataset is licensed{' '}
          <a href={SITE.licenceUrl} className="text-accent underline underline-offset-4">
            {SITE.licence}
          </a>
          . Use it in research, journalism or a commercial product. The only condition is credit to{' '}
          {SITE.publisher}. The{' '}
          <Link href="/data" className="text-accent underline underline-offset-4">
            data page
          </Link>{' '}
          has the files and a ready-made citation.
        </p>
      </div>
    </>
  );
}
