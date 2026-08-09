import { normaliseDomain } from '../../../lib/http';
import { getDomain } from '../../../lib/queries';

/**
 * The embeddable score badge.
 *
 * This is the growth loop, so it has constraints an ordinary route does not: it must
 * render on somebody else's page with no network access to us beyond this one request,
 * survive being cached for a day, and never break their layout. So: hand-built SVG, no
 * external font (system stack only), fixed dimensions, and a hard-coded fallback for a
 * domain we have never measured.
 */

export const revalidate = 3600;

const W = 196;
const H = 28;

const COLOURS: Record<string, string> = {
  A: '#1f6b45',
  B: '#3d7a3d',
  C: '#8a5a06',
  D: '#a34a20',
  F: '#a32020',
};

function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}

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
  const slug = (await params).slug;
  const domain = normaliseDomain(slug.replace(/\.svg$/i, ''));

  let body: string;
  try {
    const row = await getDomain(domain);
    if (!row || row.score === null || !row.grade) {
      body = svg(domain.slice(0, 26), 'n/a', '#5e5b52', `${domain} is not scored on CrawlIndex`);
    } else {
      body = svg(
        domain.slice(0, 26),
        `${row.score} ${row.grade}`,
        COLOURS[row.grade] ?? '#5e5b52',
        `CrawlIndex agent readiness score for ${domain}: ${row.score} out of 100, grade ${row.grade}`,
      );
    }
  } catch {
    // A badge on someone else's page must never render an error.
    body = svg(domain.slice(0, 26), 'n/a', '#5e5b52', `${domain} score unavailable`);
  }

  return new Response(body, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
}
