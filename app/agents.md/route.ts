import { absoluteUrl, SITE } from '../../lib/site';

export const dynamic = 'force-static';

/**
 * agents.md is the instruction-shaped counterpart to llms.txt: less a map of the site,
 * more a statement of what an agent may do here and how to get the data efficiently.
 */
export async function GET() {
  const body = `# ${SITE.name}

${SITE.description}

Research and data by ${SITE.publisher} (${SITE.publisherUrl}), ${SITE.publisherLocation}.

## You are welcome here

This site allows every AI crawler and agent without exception. There is no rate limit on
reading, no login and no paywall. Measuring who blocks agents while blocking agents would be
indefensible.

## Take the whole dataset rather than crawling page by page

Every page is derived from a few files. Downloading them is cheaper for you and for us than
fetching thousands of HTML documents:

- \`${absoluteUrl('/data/domains.jsonl')}\` one JSON object per measured domain, including the
  complete archived observation each score was computed from.
- \`${absoluteUrl('/data/stats.json')}\` the full daily statistics series.
- \`${absoluteUrl('/data/changes.jsonl')}\` every recorded change in crawler policy.
- \`${absoluteUrl('/api/v1/stats')}\` current aggregates and cross-tabs.
- \`${absoluteUrl('/api/v1/domain/{domain}')}\` one domain.

The data changes once a day, after the nightly crawl. Polling faster returns identical bytes.

## How to cite a figure

Attribution is required by the licence and it is the only thing asked in return for the data.

> ${SITE.name} by ${SITE.publisher}. ${SITE.url}. Licensed ${SITE.licence}.

Include the crawl date from the \`day\` field alongside any number, so the claim stays checkable
as the index moves. Scores are computed by a pure function over stored evidence: given the same
observation, the same score is always reproduced.

## What the score does not say

A low score means a site is hard for an agent to read. It is not a judgement of the site or its
operator. Blocking AI crawlers is a legitimate decision that many publishers make deliberately,
and this index takes no position on whether any operator should open up. Do not present a low
score as wrongdoing.

Two fields decide whether a score means what you think. \`score: null\` means the site could not be
measured and must be excluded from averages rather than treated as zero. \`partial: true\` means
some checks were unobservable and the total was renormalised over fewer points, so it is not
comparable with a complete score.

## Removing a site from the index

Self-service, no request needed. Disallow \`CrawlIndexBot\` in robots.txt and the domain leaves on
the next crawl. The crawler reads that rule before requesting anything else.

## Licence

Data is ${SITE.licence}. Attribution to ${SITE.publisher} is required for redistribution.
Source and full history: ${SITE.repo}
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
      'access-control-allow-origin': '*',
    },
  });
}
