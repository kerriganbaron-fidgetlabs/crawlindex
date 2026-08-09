import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CohortDetail, KEY } from '../../../components/cohort';
import { cohortsBy, tldCohorts } from '../../../lib/dataset';

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

/** Only TLDs with a reportable cohort get a page. The long tail is noise. */
export function generateStaticParams() {
  return tldCohorts().map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const c = cohortsBy(KEY.tld, 1).find((x) => x.id === id);
  return {
    title: `.${id} sites and AI crawlers`,
    description: c
      ? `${c.blockingRate.toFixed(1)}% of measured .${id} sites block at least one answer-surface AI crawler.`
      : `Agent readiness of .${id} sites.`,
    alternates: { canonical: `/tlds/${id}` },
  };
}

export default async function TldPage({ params }: Props) {
  const id = (await params).id;
  if (!tldCohorts().some((c) => c.id === id)) notFound();
  return <CohortDetail kind="tld" id={id} label={`.${id}`} backHref="/tlds" backLabel="Top-level domain" />;
}
