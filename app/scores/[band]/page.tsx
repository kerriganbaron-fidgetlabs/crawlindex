import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BANDS, bandBySlug, bandOfScore, GRADE_MEANING } from '../../../lib/bands';
import { latestStats, scoredRows } from '../../../lib/dataset';
import { groupByEntity } from '../../../lib/entities';
import { absoluteUrl, SITE } from '../../../lib/site';
import { Attribution, EntityTable, PageHeader, PageMeta } from '../../../components/ui';

type Props = { params: Promise<{ band: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return BANDS.map((b) => ({ band: b.slug }));
}

/**
 * One page per ten-point band.
 *
 * Ten static pages, and each answers a question an answer engine is actually asked: "which
 * sites score 60 to 69 for AI readiness". Previously the only way to see the population
 * behind a bar on the distribution chart was to download the dataset.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const band = bandBySlug((await params).band);
  if (!band) return { title: 'Score band', robots: { index: false, follow: true } };

  const n = scoredRows().filter((r) => bandOfScore(r.score.total as number).index === band.index).length;
  return {
    title: `Sites scoring ${band.label} for AI readiness`,
    description: `${n.toLocaleString()} measured sites score ${band.label} out of 100 on the CrawlIndex agent readiness rubric, ${band.gradeLabel}. ${GRADE_MEANING[band.grade]}`,
    alternates: { canonical: `/scores/${band.slug}` },
  };
}

export default async function BandPage({ params }: Props) {
  const band = bandBySlug((await params).band);
  if (!band) notFound();

  const stats = latestStats();
  const all = scoredRows();
  const inBand = all
    .filter((r) => bandOfScore(r.score.total as number).index === band.index)
    .sort((a, b) => (b.score.total ?? 0) - (a.score.total ?? 0));

  const share = all.length ? (inBand.length / all.length) * 100 : 0;
  const groups = groupByEntity(inBand).slice(0, 150);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `Sites scoring ${band.label} for AI readiness`,
    description: GRADE_MEANING[band.grade],
    url: absoluteUrl(`/scores/${band.slug}`),
    isAccessibleForFree: true,
    license: SITE.licenceUrl,
    ...(stats ? { temporalCoverage: stats.day, dateModified: stats.day } : {}),
    isPartOf: { '@type': 'Dataset', name: SITE.name, url: SITE.url },
    creator: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    variableMeasured: [
      {
        '@type': 'PropertyValue',
        name: `Sites scoring ${band.label}`,
        value: inBand.length,
        description: `${inBand.length} of ${all.length} fully measured sites${stats ? `, measured ${stats.day}` : ''}`,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PageHeader
        kicker={`Score band . ${band.gradeLabel}`}
        title={`Sites scoring ${band.label}`}
        lede={`${inBand.length.toLocaleString()} of ${all.length.toLocaleString()} fully measured sites land here, ${share.toFixed(1)}% of the index. ${GRADE_MEANING[band.grade]}`}
      />

      <nav aria-label="Other score bands" className="mb-10 flex flex-wrap gap-2 text-sm">
        {BANDS.map((b) => {
          const n = all.filter((r) => bandOfScore(r.score.total as number).index === b.index).length;
          const current = b.index === band.index;
          return (
            <Link
              key={b.slug}
              href={`/scores/${b.slug}`}
              aria-current={current ? 'page' : undefined}
              className={`tnum rounded px-2.5 py-1 border ${
                current ? 'border-accent text-accent bg-accent-soft font-medium' : 'border-rule text-muted hover:border-accent'
              }`}
            >
              {b.label} <span className="text-xs">({n.toLocaleString()})</span>
            </Link>
          );
        })}
      </nav>

      {inBand.length === 0 ? (
        <p className="border border-rule rounded p-5 bg-raised">
          No measured site currently scores in this band.
        </p>
      ) : (
        <section>
          <h2 className="text-xl font-bold mb-1">
            {groups.length === inBand.length
              ? `All ${inBand.length.toLocaleString()}`
              : `${groups.length.toLocaleString()} operators`}
          </h2>
          <p className="text-sm text-muted mb-4 max-w-2xl">
            One row per operator, highest score first. Partial assessments are excluded, because a
            renormalised score belongs to a different scale and could not be placed in a band
            honestly.
          </p>
          <EntityTable groups={groups} caption={`Sites scoring ${band.label}`} />
          {groups.length < inBand.length ? (
            <p className="text-sm text-muted mt-3">
              Showing the first {groups.length.toLocaleString()} operators.{' '}
              <Link href="/data" className="text-accent underline underline-offset-4">
                The full list is in the dataset
              </Link>
              .
            </p>
          ) : null}
        </section>
      )}

      <PageMeta />
      <Attribution subject={`Sites scoring ${band.label} for AI readiness`} measuredOn={stats?.day ?? null} />
    </>
  );
}
