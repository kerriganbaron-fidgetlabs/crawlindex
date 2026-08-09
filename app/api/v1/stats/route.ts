import { AGENTS } from '../../../../lib/agents';
import { getLatestStats, getStatsHistory } from '../../../../lib/queries';
import { SITE } from '../../../../lib/site';

export const revalidate = 3600;

export async function GET(req: Request) {
  const history = new URL(req.url).searchParams.get('history') === 'true';

  const [latest, series] = await Promise.all([
    getLatestStats(),
    history ? getStatsHistory(365) : Promise.resolve([]),
  ]);

  if (!latest) {
    return Response.json({ error: 'no_data', message: 'No crawl has completed yet.' }, { status: 503 });
  }

  return new Response(
    JSON.stringify(
      {
        day: latest.day,
        domainsIndexed: latest.total_domains,
        domainsScored: latest.observed,
        meanScore: latest.avg_score,
        blockingAnyAnswerSurfaceCrawler: latest.blocking_any_tier1,
        blockingAllAnswerSurfaceCrawlers: latest.blocking_all_tier1,
        publishingLlmsTxt: latest.llms_txt_count,
        publishingAgentsMd: latest.agents_md_count,
        // Requests identifying as GPTBot that were refused or curtailed while a browser
        // was served normally. Includes sites whose robots.txt already blocks GPTBot, so
        // this is not by itself evidence of a contradiction. Use the per-domain endpoint,
        // which reports `contradictsStatedPolicy`, to separate the two cases.
        refusedGptbotAtTheServer: latest.cloaking_count,
        blockedByCrawler: AGENTS.map((a) => ({
          token: a.token,
          operator: a.operator,
          tier: a.tier,
          blockedBy: latest.per_bot?.[a.token] ?? 0,
        })),
        ...(history ? { history: series } : {}),
        license: 'CC BY 4.0',
        attribution: SITE.url,
      },
      null,
      2,
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=43200',
        'access-control-allow-origin': '*',
      },
    },
  );
}
