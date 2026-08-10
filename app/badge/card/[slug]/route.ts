import { badgeRoute } from '../../../../lib/badge-route';

/** The wide award mark, for a footer or a press page. Grade A and B only. */
export const dynamic = 'force-static';
export const dynamicParams = false;

const { generateStaticParams, GET } = badgeRoute('card');
export { generateStaticParams, GET };
