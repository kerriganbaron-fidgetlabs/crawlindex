import { AGENTS } from '../../../../lib/agents';
import { allStats, getMeta, latestStats, networkCohorts, platformCohorts, tldCohorts } from '../../../../lib/dataset';
import { SITE } from '../../../../lib/site';

export const dynamic = 'force-static';

export async function GET() {
  const latest = latestStats();
  if (!latest) {
    return Response.json({ error: 'no_data', message: 'No crawl has completed yet.' }, { status: 503 });
  }

  const meta = getMeta();
  const cohort = (c: { id: string; observed: number; blockingAny: number; blockingRate: number; meanScore: number | null }) => ({
    id: c.id,
    sites: c.observed,
    blockingAnyAnswerSurfaceCrawler: c.blockingAny,
    blockingRatePercent: Number(c.blockingRate.toFixed(2)),
    meanScore: c.meanScore,
  });

  return new Response(
    JSON.stringify(
      {
        day: latest.day,
        generatedAt: meta?.generatedAt ?? null,
        vantage: meta?.vantage ?? null,
        versions: {
          probe: meta?.probeVersion ?? null,
          rubric: meta?.rubricVersion ?? null,
          registry: meta?.registryVersion ?? null,
        },
        domainsIndexed: latest.totalDomains,
        domainsScored: latest.observed,
        meanScore: latest.meanScore,
        blockingAnyAnswerSurfaceCrawler: latest.blockingAnyTier1,
        blockingAllAnswerSurfaceCrawlers: latest.blockingAllTier1,
        publishingLlmsTxt: latest.llmsTxt,
        publishingAgentsMd: latest.agentsMd,
        // Requests identifying as GPTBot that were refused or curtailed while a browser
        // was served normally. Includes sites whose robots.txt already blocks GPTBot, so
        // this alone is not evidence of a contradiction. The per-domain endpoint reports
        // `contradictsStatedPolicy`, which separates the two cases.
        refusedGptbotAtTheServer: latest.refusedGptbot,
        chargingForCrawlAccess: latest.paymentRequired,
        blockedByCrawler: AGENTS.map((a) => ({
          token: a.token,
          operator: a.operator,
          tier: a.tier,
          blockedBy: latest.perBot?.[a.token] ?? 0,
        })),
        byNetwork: networkCohorts().map(cohort),
        byPlatform: platformCohorts().map(cohort),
        byTld: tldCohorts().slice(0, 40).map(cohort),
        history: allStats(),
        bulkDownload: `${SITE.url}/data/domains.jsonl`,
        license: SITE.licence,
        attribution: `${SITE.publisher}, ${SITE.url}`,
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
