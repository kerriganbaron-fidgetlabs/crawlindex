import { badgeRoute } from '../../../../lib/badge-route';

/** The circular award mark, in all three themes. Issued only to grade A and B. */
export const dynamic = 'force-static';
export const dynamicParams = false;

const { generateStaticParams, GET } = badgeRoute('seal', 'award');
export { generateStaticParams, GET };
