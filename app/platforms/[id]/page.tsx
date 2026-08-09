import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CohortDetail } from '../../../components/cohort';
import { cohortsBy } from '../../../lib/dataset';
import { PLATFORMS, platformLabel } from '../../../lib/fingerprints';

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return PLATFORMS.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const label = platformLabel(id);
  if (!label) return { title: 'Unknown platform', robots: { index: false, follow: true } };

  const c = cohortsBy((r) => r.obs.stack.platform, 1).find((x) => x.id === id);
  return {
    title: `${label} sites and AI crawlers`,
    description: c
      ? `${c.blockingRate.toFixed(1)}% of measured ${label} sites block at least one answer-surface AI crawler. Mean agent readiness score ${c.meanScore ?? 'not available'}.`
      : `Agent readiness of sites built on ${label}.`,
    alternates: { canonical: `/platforms/${id}` },
  };
}

export default async function PlatformPage({ params }: Props) {
  const id = (await params).id;
  const label = platformLabel(id);
  if (!label) notFound();
  return <CohortDetail kind="platform" id={id} label={label} backHref="/platforms" backLabel="Platform" />;
}
