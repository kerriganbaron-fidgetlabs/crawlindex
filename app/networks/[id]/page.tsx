import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CohortDetail } from '../../../components/cohort';
import { cohortsBy } from '../../../lib/dataset';
import { NETWORKS, networkLabel } from '../../../lib/fingerprints';

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return NETWORKS.map((n) => ({ id: n.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const label = networkLabel(id);
  if (!label) return { title: 'Unknown network', robots: { index: false, follow: true } };

  const c = cohortsBy((r) => r.obs.stack.network, 1).find((x) => x.id === id);
  return {
    title: `${label} and AI crawler access`,
    description: c
      ? `${c.blockingRate.toFixed(1)}% of measured sites served through ${label} block at least one answer-surface AI crawler.`
      : `AI crawler access for sites served through ${label}.`,
    alternates: { canonical: `/networks/${id}` },
  };
}

export default async function NetworkPage({ params }: Props) {
  const id = (await params).id;
  const label = networkLabel(id);
  if (!label) notFound();
  return <CohortDetail kind="network" id={id} label={label} backHref="/networks" backLabel="Edge network" />;
}
