import { badgeTier, badgeTitle, isEmbeddable, renderBadge, type BadgeVariant } from './badge';
import { getDomain, latestStats, scoredRows } from './dataset';
import { normaliseDomain } from './http';

/**
 * The shared handler behind the award-mark routes.
 *
 * Each variant gets its own route directory with a **literal** segment
 * (`/badge/seal/[slug]`, `/badge/card/[slug]`) rather than one shared `[variant]` segment.
 * That is not a stylistic choice: `/badge/[slug]` already exists for the default mark, and
 * Next refuses two differently-named dynamic segments at the same position. The build
 * completes and then every route on the site throws at runtime, which is a fun one to
 * discover in production. A literal segment sits happily beside a dynamic sibling, and it
 * produces exactly the URLs the embed snippets already emit.
 */
export function badgeRoute(variant: BadgeVariant) {
  /**
   * Only domains that earned a mark. Refusing to mint the file is what makes the award
   * mean something, and it keeps the build to roughly a thousand files per variant rather
   * than five thousand nobody would embed.
   */
  const generateStaticParams = () =>
    scoredRows()
      .filter((r) => isEmbeddable(badgeTier(r.score.total, r.score.grade)))
      .map((r) => ({ slug: `${r.domain}.svg` }));

  const GET = async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const domain = normaliseDomain((await params).slug.replace(/\.svg$/i, ''));
    const row = getDomain(domain);

    const input = {
      domain,
      score: row?.score.total ?? null,
      grade: row?.score.grade ?? null,
      percentile: row?.percentile ?? null,
      partial: row?.score.partial ?? false,
      measuredOn: latestStats()?.day ?? null,
    };

    return new Response(renderBadge(variant, input), {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'access-control-allow-origin': '*',
        'x-badge-description': badgeTitle(input).slice(0, 200),
      },
    });
  };

  return { generateStaticParams, GET };
}
