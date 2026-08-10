import { badgeRoute } from '../../../lib/badge-route';

/**
 * The default mark, one per indexed domain, in all three themes.
 *
 * This path predates the tiered marks and is kept exactly where it was, because a URL
 * somebody has already embedded on their own site is a promise. It renders whichever tier
 * the domain has earned, so an existing embed silently gets the better design.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

const { generateStaticParams, GET } = badgeRoute('flat', 'all');
export { generateStaticParams, GET };
