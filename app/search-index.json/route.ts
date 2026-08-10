import { searchIndex } from '../../lib/dataset';
import { getMeta } from '../../lib/dataset';

/**
 * The client search index.
 *
 * Generated at build time and served as a static file, like everything else here. The
 * browser fetches it the first time somebody opens the search box and never again, so
 * search costs one request and then runs entirely locally with no server, no API, and no
 * query leaving the reader's machine.
 *
 * Tuples rather than objects: five thousand rows of `{"domain":...,"score":...}` is
 * several times the bytes for identical information, and this file is downloaded by
 * anyone who wants to look a domain up.
 */

export const dynamic = 'force-static';

export function GET() {
  const rows = searchIndex();
  return new Response(
    JSON.stringify({
      // Consumers should be able to tell how old the index they are holding is.
      generatedAt: getMeta()?.generatedAt ?? null,
      fields: ['domain', 'rank', 'score', 'grade', 'flags'],
      flags: {
        1: 'blocks at least one answer-surface crawler',
        2: 'publishes llms.txt',
        4: 'permits GPTBot in robots.txt but refuses it at the server',
        8: 'partial assessment',
      },
      rows,
    }),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'access-control-allow-origin': '*',
      },
    },
  );
}
