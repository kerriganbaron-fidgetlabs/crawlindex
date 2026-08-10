import {
  BADGE_THEMES,
  badgeSlug,
  badgeTier,
  badgeTitle,
  isEmbeddable,
  parseBadgeSlug,
  renderBadge,
  type BadgeVariant,
} from './badge';
import { allDomains, getDomain, latestStats, scoredRows } from './dataset';
import { normaliseDomain } from './http';

/**
 * The shared handler behind every badge route.
 *
 * ## Two shapes of route, one handler
 *
 * `flat` lives at `/badge/<slug>` because that path predates the tiered marks and somebody
 * may already have embedded it. `seal` and `card` live at `/badge/seal/<slug>` and
 * `/badge/card/<slug>` with **literal** segments.
 *
 * That is not stylistic. `/badge/[slug]` already exists, and Next refuses two
 * differently-named dynamic segments at the same position. The build completes, and then
 * every route on the site throws at runtime. This project has shipped that once already.
 *
 * ## Theme rides in the filename
 *
 * `example.com.svg` is auto, `example.com.light.svg` and `example.com.dark.svg` are pinned.
 * Same reason: a `[theme]` segment would collide with `[slug]`.
 */
export function badgeRoute(
  variant: BadgeVariant,
  /**
   * `award` generates only for grade A and B, which is what makes the mark mean something.
   * `all` generates for every indexed domain, used by the legacy flat path so an existing
   * embed keeps resolving whatever the site scores.
   */
  scope: 'award' | 'all',
) {
  const generateStaticParams = () => {
    const domains =
      scope === 'all'
        ? allDomains()
        : scoredRows().filter((r) => isEmbeddable(badgeTier(r.score.total, r.score.grade)));
    return domains.flatMap((r) => BADGE_THEMES.map((theme) => ({ slug: badgeSlug(r.domain, theme) })));
  };

  const GET = async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { domain: raw, theme } = parseBadgeSlug((await params).slug);
    const domain = normaliseDomain(raw);
    const row = getDomain(domain);

    const input = {
      domain,
      score: row?.score.total ?? null,
      grade: row?.score.grade ?? null,
      percentile: row?.percentile ?? null,
      partial: row?.score.partial ?? false,
      measuredOn: latestStats()?.day ?? null,
    };

    return new Response(renderBadge(variant, input, theme), {
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
