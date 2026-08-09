import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMonthReport, getReportMonths, monthLabel, movement } from '../../../lib/report';
import { absoluteUrl, SITE, citation } from '../../../lib/site';
import { CohortTable, PageHeader, StatTile } from '../../../components/ui';

type Props = { params: Promise<{ month: string }> };

export const dynamicParams = false;

/**
 * Reports publish themselves. The month list comes from whatever days exist in the stats
 * series, so the first crawl of a new month creates that month's report, links it, and
 * puts it in the sitemap with no human involved.
 */
export function generateStaticParams() {
  return getReportMonths().map((month) => ({ month }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const month = (await params).month;
  if (!/^\d{4}-\d{2}$/.test(month)) return { title: 'Report', robots: { index: false, follow: true } };
  const label = monthLabel(month);
  return {
    title: `The state of AI crawler access, ${label}`,
    description: `How the most-visited sites on the web treated AI crawlers in ${label}: who blocked what, how llms.txt adoption moved, which CDNs and platforms set the policy, and which sites changed.`,
    alternates: { canonical: `/reports/${month}` },
    openGraph: { type: 'article', url: absoluteUrl(`/reports/${month}`) },
  };
}

export default async function ReportPage({ params }: Props) {
  const month = (await params).month;
  const report = getMonthReport(month);
  if (!report) notFound();

  const { last, first, deltas, bots, platforms, networks } = report;
  const pct = (n: number) => (last.observed ? ((n / last.observed) * 100).toFixed(1) : '0');
  const subject = `The state of AI crawler access, ${report.label}`;

  const topNetwork = [...networks].sort((a, b) => b.blockingRate - a.blockingRate)[0];
  const lowNetwork = [...networks].sort((a, b) => a.blockingRate - b.blockingRate)[0];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Report',
    headline: subject,
    datePublished: last.day,
    dateModified: last.day,
    url: absoluteUrl(`/reports/${report.month}`),
    isAccessibleForFree: true,
    license: SITE.licenceUrl,
    author: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    publisher: {
      '@type': 'Organization',
      name: SITE.publisher,
      url: SITE.publisherUrl,
      address: { '@type': 'PostalAddress', addressLocality: 'Breda', addressCountry: 'NL' },
    },
    creator: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    sourceOrganization: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    isBasedOn: { '@type': 'Dataset', name: SITE.name, url: SITE.url, license: SITE.licenceUrl },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PageHeader
        kicker={`Report . ${report.label}`}
        title={subject}
        lede={`Drawn from ${report.days} daily crawl${report.days === 1 ? '' : 's'} of up to ${last.totalDomains.toLocaleString()} Tranco-ranked domains, of which ${last.observed.toLocaleString()} could be measured.`}
      />

      <p className="text-sm text-muted mb-8 border-l-2 border-accent pl-4 max-w-2xl">
        Research and data by{' '}
        <a href={SITE.publisherUrl} className="text-accent underline underline-offset-4">
          {SITE.publisher}
        </a>
        , {SITE.publisherLocation}. Published as {SITE.name} and free to reuse under {SITE.licence}{' '}
        with attribution.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        <StatTile
          value={`${pct(last.blockingAnyTier1)}%`}
          label="Block at least one answer-surface crawler"
          sub={`${last.blockingAnyTier1.toLocaleString()} sites`}
        />
        <StatTile
          value={`${pct(last.blockingAllTier1)}%`}
          label="Block every answer-surface crawler"
          sub={`${last.blockingAllTier1.toLocaleString()} sites`}
        />
        <StatTile value={`${pct(last.llmsTxt)}%`} label="Publish an llms.txt" sub={`${last.llmsTxt.toLocaleString()} sites`} />
        <StatTile
          value={last.meanScore === null ? 'n/a' : String(Math.round(last.meanScore))}
          label="Mean readiness score"
          sub="Out of 100"
        />
      </div>

      <section className="max-w-2xl space-y-4 leading-relaxed mb-12">
        <h2 className="text-2xl font-bold">What moved</h2>
        {report.days < 2 ? (
          <p>
            This report covers a single day of measurement, so it records a starting position
            rather than a trend. Month-on-month movement appears here once the index has more than
            one crawl inside the period.
          </p>
        ) : (
          <>
            <p>
              Between {first.day} and {last.day}, the number of measured sites blocking at least
              one answer-surface AI crawler {movement(deltas.blockingAnyTier1, 'sites')}. Sites
              publishing an llms.txt {movement(deltas.llmsTxt, 'sites')}, and sites publishing an
              agents.md {movement(deltas.agentsMd, 'sites')}.
            </p>
            <p>
              The mean readiness score across scored sites{' '}
              {deltas.meanScore === null
                ? 'could not be compared across the period'
                : deltas.meanScore === 0
                  ? 'held steady'
                  : `${deltas.meanScore > 0 ? 'rose' : 'fell'} ${Math.abs(deltas.meanScore)} points to ${last.meanScore}`}
              .
            </p>
          </>
        )}
        {last.paymentRequired > 0 ? (
          <p>
            <strong className="tnum">{last.paymentRequired.toLocaleString()}</strong> sites answered
            an agent with HTTP 402 Payment Required. That is a pay-per-crawl gateway rather than a
            block: access is being metered and sold rather than refused.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Sites that could not be measured are excluded rather than counted as failures, so these
          totals are over the {last.observed.toLocaleString()} domains actually observed. Method:{' '}
          <Link href="/methodology" className="text-accent underline underline-offset-4">
            /methodology
          </Link>
          .
        </p>
      </section>

      {networks.length ? (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-1">Who set the policy</h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            Blocking rate grouped by edge network.
            {topNetwork && lowNetwork && topNetwork.id !== lowNetwork.id ? (
              <>
                {' '}
                Sites behind <strong>{topNetwork.id}</strong> blocked at{' '}
                <strong className="tnum">{topNetwork.blockingRate.toFixed(1)}%</strong> against{' '}
                <strong className="tnum">{lowNetwork.blockingRate.toFixed(1)}%</strong> behind{' '}
                <strong>{lowNetwork.id}</strong>, which is a far wider spread than anything
                explained by what the sites themselves publish.
              </>
            ) : null}
          </p>
          <CohortTable cohorts={networks} kind="network" caption="Blocking rate by edge network" />
        </section>
      ) : null}

      {platforms.length ? (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">By publishing platform</h2>
          <CohortTable cohorts={platforms} kind="platform" caption="Blocking rate by publishing platform" />
        </section>
      ) : null}

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Blocking by crawler</h2>
        <div className="overflow-x-auto border border-rule rounded">
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">AI crawlers by number of sites blocking them in {report.label}</caption>
            <thead>
              <tr className="bg-raised text-left">
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Crawler</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Operator</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-28">Blocked by</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-20">Share</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-28">Over period</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <tr key={b.token} className="border-b border-rule last:border-0">
                  <td className="px-3 py-2 font-mono">{b.token}</td>
                  <td className="px-3 py-2 text-muted">{b.operator}</td>
                  <td className="px-3 py-2 tnum">{b.blocked.toLocaleString()}</td>
                  <td className="px-3 py-2 tnum text-muted">{b.share.toFixed(1)}%</td>
                  <td className="px-3 py-2 tnum">
                    {b.delta === 0 ? (
                      <span className="text-muted">no change</span>
                    ) : (
                      <span className={b.delta > 0 ? 'text-bad' : 'text-good'}>
                        {b.delta > 0 ? '+' : ''}
                        {b.delta}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.notableChanges.length ? (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Policy changes this month</h2>
          <ul className="space-y-2 text-sm">
            {report.notableChanges.map((c, i) => (
              <li key={`${c.domain}-${i}`} className="flex flex-wrap gap-x-3 border-b border-rule pb-2">
                <time className="tnum text-muted shrink-0" dateTime={c.changedAt}>
                  {c.changedAt.slice(0, 10)}
                </time>
                <Link href={`/site/${c.domain}`} className="font-mono hover:text-accent underline underline-offset-4">
                  {c.domain}
                </Link>
                <span>{c.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-rule pt-8 max-w-2xl">
        <h2 className="text-xl font-bold mb-3">Citing this report</h2>
        <p className="text-sm text-muted mb-3">
          Free to quote and republish under {SITE.licence}. Credit {SITE.publisher} and include the
          measurement date so the claim stays checkable as the index moves.
        </p>
        <pre className="overflow-x-auto text-xs bg-raised border border-rule rounded p-3">
          <code>{citation(subject, last.day)}</code>
        </pre>
        <p className="text-sm mt-4">
          <Link href="/data" className="text-accent underline underline-offset-4">
            Download the underlying dataset
          </Link>
        </p>
      </section>
    </>
  );
}
