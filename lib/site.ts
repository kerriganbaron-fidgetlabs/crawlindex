/** Canonical site config. One place, so metadata and machine surfaces cannot drift apart. */

export const SITE = {
  name: 'CrawlIndex',
  tagline: 'The open index of how the web treats AI agents',
  description:
    'CrawlIndex measures how thousands of the most-visited websites treat AI crawlers and agents. Which bots they block, whether they publish llms.txt or agents.md, whether they serve crawlers the same content as browsers, and which platforms and CDNs are quietly deciding that policy for them. Updated nightly, method published in full, dataset open.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://crawlindex.org',

  /** Attribution. Required by the licence and rendered on every page that carries data. */
  publisher: 'Fidget Labs BV',
  publisherUrl: 'https://fidgetlabs.io',
  publisherLocation: 'Breda, Netherlands',

  repo: 'https://github.com/kerriganbaron-fidgetlabs/crawlindex',
  issues: 'https://github.com/kerriganbaron-fidgetlabs/crawlindex/issues',

  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

export function absoluteUrl(path = '/'): string {
  return new URL(path, SITE.url).toString();
}

/** The citation line. Kept in one place so every surface credits identically. */
export function citation(subject: string, measuredOn?: string | null): string {
  const when = measuredOn ? ` (measured ${measuredOn})` : '';
  return `${SITE.name} by ${SITE.publisher}. "${subject}." ${SITE.url}${when}. Licensed ${SITE.licence}.`;
}

export const ATTRIBUTION_NOTE = `Data by ${SITE.publisher}, published as ${SITE.name}. Free to reuse under ${SITE.licence} with attribution.`;
