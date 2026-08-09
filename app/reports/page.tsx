import type { Metadata } from 'next';
import Link from 'next/link';
import { getReportMonths, monthLabel } from '../../lib/report';
import { PageHeader } from '../../components/ui';

export const revalidate = 43200;

export const metadata: Metadata = {
  title: 'Reports',
  description:
    'Dated monthly reports on how the most-visited sites on the web treat AI crawlers, generated from the CrawlIndex dataset.',
  alternates: { canonical: '/reports' },
};

export default async function ReportsPage() {
  const months = await getReportMonths();

  return (
    <>
      <PageHeader
        kicker="Reports"
        title="The state of AI crawler access"
        lede="One dated report per month, generated from the same measurements the rest of the index publishes. Figures are templated rather than written, so a regenerated report says exactly what it said before."
      />

      {months.length === 0 ? (
        <p className="border border-rule rounded p-4 bg-raised">
          The first report appears once a full day of crawling has been recorded.
        </p>
      ) : (
        <ul className="space-y-3">
          {months.map((m) => (
            <li key={m}>
              <Link
                href={`/reports/${m}`}
                className="text-lg text-accent underline underline-offset-4 font-medium"
              >
                The state of AI crawler access, {monthLabel(m)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
