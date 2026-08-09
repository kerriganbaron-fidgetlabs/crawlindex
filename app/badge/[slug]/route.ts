import { allDomains, getDomain } from '../../../lib/dataset';
import { normaliseDomain } from '../../../lib/http';

/**
 * The embeddable score badge.
 *
 * This renders on somebody else's page, so it has constraints an ordinary route does not:
 * no external font (system stack only), fixed dimensions, no network dependency beyond
 * this one file, and a graceful fallback for a domain we have never measured. It is
 * generated statically, so an embedding site is fetching a static SVG from a CDN and
 * nothing can be slow or fail at request time.
 */

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return allDomains().map((r) => ({ slug: `${r.domain}.svg` }));
}

const W = 196;
const H = 28;

const COLOURS: Record<string, string> = {
  A: '#1f6b45',
  B: '#3d7a3d',
  C: '#8a5a06',
  D: '#a34a20',
  F: '#a32020',
};

const esc = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

function svg(label: string, value: string, colour: string, title: string): string {
  const labelW = 118;
  const valueW = W - labelW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <g font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="11">
    <rect width="${W}" height="${H}" rx="4" fill="#1a1813"/>
    <rect x="${labelW}" width="${valueW}" height="${H}" rx="4" fill="${colour}"/>
    <rect x="${labelW}" width="6" height="${H}" fill="${colour}"/>
    <text x="10" y="12" fill="#fbfaf7" font-weight="700" letter-spacing="0.3">crawlindex</text>
    <text x="10" y="23" fill="#a8a399" font-size="9">${esc(label)}</text>
    <text x="${labelW + valueW / 2}" y="18" fill="#ffffff" font-weight="700" font-size="13" text-anchor="middle">${esc(value)}</text>
  </g>
</svg>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const domain = normaliseDomain((await params).slug.replace(/\.svg$/i, ''));
  const row = getDomain(domain);

  const body =
    !row || row.score.total === null || !row.score.grade
      ? svg(domain.slice(0, 26), 'n/a', '#5e5b52', `${domain} is not scored on CrawlIndex`)
      : svg(
          domain.slice(0, 26),
          `${row.score.total} ${row.score.grade}`,
          COLOURS[row.score.grade] ?? '#5e5b52',
          `CrawlIndex agent readiness score for ${domain}: ${row.score.total} out of 100, grade ${row.score.grade}`,
        );

  return new Response(body, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
}
