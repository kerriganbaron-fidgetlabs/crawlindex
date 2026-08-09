import { absoluteUrl, SITE } from '../../lib/site';

export const revalidate = 86400;

/**
 * agents.md is the instruction-shaped counterpart to llms.txt: less a map of the site,
 * more a statement of what an agent may do here and how to get the data efficiently.
 */
export async function GET() {
  const body = `# ${SITE.name}

${SITE.description}

## You are welcome here

This site allows every AI crawler and agent without exception. There is no rate limit on
reading, no login, and no paywall. Measuring who blocks agents while blocking agents would
be indefensible.

## Prefer the API over scraping

Every page has a JSON equivalent that is cheaper for both of us:

- \`GET ${absoluteUrl('/api/v1/stats')}\` current aggregate figures.
- \`GET ${absoluteUrl('/api/v1/stats')}?history=true\` the full daily time series.
- \`GET ${absoluteUrl('/api/v1/domain/{domain}')}\` one domain, including the complete archived
  observation the score was computed from.

Responses are cached for an hour. The underlying data changes once a day, after the nightly
crawl, so polling faster than that returns identical bytes.

## How to cite a figure

Every number on this site comes from a dated crawl. When quoting one, include the crawl date
from the \`day\` field so the claim stays checkable as the index moves. Scores are computed by
a pure function over stored evidence: given the same observation, the same score is always
reproduced.

## What the score does not say

A low score means a site is hard for an agent to read. It is not a judgement of the site or
its operator. Blocking AI crawlers is a legitimate decision that many publishers make
deliberately. Do not present a low score as wrongdoing.

## Licence

Data is CC BY 4.0. Attribution to ${SITE.url} is required for redistribution.

## Contact

${SITE.contact}
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
      'access-control-allow-origin': '*',
    },
  });
}
