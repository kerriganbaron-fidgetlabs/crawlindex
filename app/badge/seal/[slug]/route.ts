import { badgeRoute } from '../../../../lib/badge-route';

/** The circular award mark. Issued only to grade A and B. See `lib/badge-route.ts`. */
export const dynamic = 'force-static';
export const dynamicParams = false;

const { generateStaticParams, GET } = badgeRoute('seal');
export { generateStaticParams, GET };
