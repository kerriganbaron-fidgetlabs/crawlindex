import Link from 'next/link';
import { cohortsBy, latestStats, rowsInCohort, type Cohort, type DomainRow } from '../lib/dataset';
import { Attribution, CohortTable, DomainTable, PageHeader } from './ui';

/**
 * Shared rendering for the three cross-tab dimensions: platform, edge network, TLD.
 *
 * The cross-tabs are the part of this dataset that says something new. Anyone can check
 * whether one site blocks GPTBot. Only a full crawl can show that the decision correlates
 * far more strongly with which CDN a site sits behind than with anything the operator
 * chose, which is a claim about how the web's AI policy is actually being set.
 */

export type CohortKind = 'platform' | 'network' | 'tld';

export const KEY: Record<CohortKind, (r: DomainRow) => string | null> = {
  platform: (r) => r.obs.stack.platform,
  network: (r) => r.obs.stack.network,
  tld: (r) => r.tld,
};

export function CohortIndex({
  kind,
  title,
  kicker,
  lede,
  note,
}: {
  kind: CohortKind;
  title: string;
  kicker: string;
  lede: string;
  note?: string;
}) {
  const cohorts = cohortsBy(KEY[kind]);
  const stats = latestStats();

  const sorted = [...cohorts].sort((a, b) => b.blockingRate - a.blockingRate);
  const high = sorted[0];
  const low = sorted[sorted.length - 1];

  return (
    <>
      <PageHeader kicker={kicker} title={title} lede={lede} />

      {high && low && high.id !== low.id ? (
        <p className="text-lg mb-8 max-w-2xl">
          The spread is wide. <strong>{high.id}</strong> sites block an answer-surface crawler{' '}
          <strong className="tnum">{high.blockingRate.toFixed(1)}%</strong> of the time.{' '}
          <strong>{low.id}</strong> sites,{' '}
          <strong className="tnum">{low.blockingRate.toFixed(1)}%</strong>.
        </p>
      ) : null}

      <CohortTable cohorts={cohorts} kind={kind} caption={title} />

      <p className="text-sm text-muted mt-4 max-w-2xl">
        {note ? `${note} ` : ''}Cohorts smaller than 25 measured sites are not shown: a blocking
        rate over a handful of domains is noise presented as a finding.
      </p>

      <Attribution subject={title} measuredOn={stats?.day ?? null} />
    </>
  );
}

export function CohortDetail({
  kind,
  id,
  label,
  backHref,
  backLabel,
}: {
  kind: CohortKind;
  id: string;
  label: string;
  backHref: string;
  backLabel: string;
}) {
  const rows = rowsInCohort(KEY[kind], id, 200);
  const cohort: Cohort | undefined = cohortsBy(KEY[kind], 1).find((c) => c.id === id);
  const stats = latestStats();

  const lede = cohort
    ? `${cohort.observed.toLocaleString()} measured sites. ${cohort.blockingAny.toLocaleString()} of them, ${cohort.blockingRate.toFixed(1)}%, block at least one answer-surface AI crawler. Mean readiness score ${cohort.meanScore ?? 'not available'}.`
    : `${rows.length.toLocaleString()} sites in the index.`;

  const compareWhat = kind === 'tld' ? 'top-level domain' : kind === 'network' ? 'edge network' : 'platform';

  return (
    <>
      <PageHeader kicker={backLabel} title={label} lede={lede} />

      <p className="text-sm mb-8">
        <Link href={backHref} className="text-accent underline underline-offset-4">
          Compare against every other {compareWhat}
        </Link>
      </p>

      <DomainTable rows={rows} caption={`Sites on ${label}`} showStack />
      {rows.length >= 200 ? <p className="text-sm text-muted mt-3">Showing the 200 most-visited.</p> : null}

      <Attribution subject={`Agent readiness on ${label}`} measuredOn={stats?.day ?? null} />
    </>
  );
}
