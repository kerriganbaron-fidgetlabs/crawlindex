import { allDomains, getDomain, latestStats } from '../../../lib/dataset';
import { badgeTitle, renderBadge } from '../../../lib/badge';
import { normaliseDomain } from '../../../lib/http';

/**
 * The default mark, one per indexed domain.
 *
 * This path predates the tiered marks and is kept exactly where it was, because a URL that
 * somebody has already embedded on their own site is a promise. It now renders whichever
 * tier the domain has earned rather than a bare grade, so an existing embed silently gets
 * the better design.
 *
 * Generated statically, so an embedding site is pulling a file off a CDN and nothing can
 * be slow or fail at request time. See `lib/badge.ts` for why the palette is fixed rather
 * than theme-aware.
 */

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return allDomains().map((r) => ({ slug: `${r.domain}.svg` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const domain = normaliseDomain((await params).slug.replace(/\.svg$/i, ''));
  const row = getDomain(domain);
  const measuredOn = latestStats()?.day ?? null;

  const input = {
    domain,
    score: row?.score.total ?? null,
    grade: row?.score.grade ?? null,
    percentile: row?.percentile ?? null,
    partial: row?.score.partial ?? false,
    measuredOn,
  };

  return new Response(renderBadge('flat', input), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
      // The alt text a fetcher gets without parsing the SVG.
      'x-badge-description': badgeTitle(input).slice(0, 200),
    },
  });
}
