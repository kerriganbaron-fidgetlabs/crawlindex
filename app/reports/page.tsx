import type { Metadata } from 'next';
import Link from 'next/link';
import { getReportMonths, monthLabel } from '../../lib/report';
import { SITE } from '../../lib/site';
import { PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Reports',
  description:
    'Dated monthly reports on how the most-visited sites on the web treat AI crawlers, generated automatically from the CrawlIndex dataset by Fidget Labs.',
  alternates: { canonical: '/reports' },
};

export default function ReportsPage() {
  const months = getReportMonths();

  return (
    <>
      <PageHeader
        kicker="Reports"
        title="The state of AI crawler access"
        lede="One dated report per month, generated from the same measurements the rest of the index publishes. Figures are templated rather than written, so a regenerated report says exactly what it said before and stays citable."
      />

      {months.length === 0 ? (
        <p className="border border-rule rounded p-4 bg-raised">
          The first report appears once a full day of crawling has been recorded.
        </p>
      ) : (
        <ul className="space-y-3">
          {months.map((m) => (
            <li key={m}>
              <Link href={`/reports/${m}`} className="text-lg text-accent underline underline-offset-4 font-medium">
                The state of AI crawler access, {monthLabel(m)}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-muted mt-10 max-w-2xl">
        Reports publish themselves. The first crawl inside a new month creates that month's report,
        links it here and adds it to the sitemap. Nobody presses publish. Research and data by{' '}
        <a href={SITE.publisherUrl} className="text-accent underline underline-offset-4">
          {SITE.publisher}
        </a>
        , free to reuse under {SITE.licence} with attribution.
      </p>
    </>
  );
}
