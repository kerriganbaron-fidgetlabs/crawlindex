/** Canonical site config. One place, so metadata and machine surfaces cannot drift apart. */

export const SITE = {
  name: 'CrawlIndex',
  tagline: 'The open index of how the web treats AI agents',
  description:
    'CrawlIndex measures how thousands of the most-visited websites treat AI crawlers and agents. Which bots they block, whether they publish llms.txt or agents.md, whether they serve crawlers the same content as browsers. Updated nightly, method published in full.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://crawlindex.org',
  publisher: 'Fidget Labs BV',
  publisherUrl: 'https://fidgetlabs.io',
  contact: 'bot@crawlindex.org',
} as const;

export function absoluteUrl(path = '/'): string {
  return new URL(path, SITE.url).toString();
}
