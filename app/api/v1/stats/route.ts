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
        /**
         * The denominator, named once and stated plainly, because every count below is
         * over it. A consumer should never have to guess which population a figure
         * describes or reconstruct the base from two other numbers.
         */
        denominator: {
          field: 'domainsScored',
          value: latest.observed,
          meaning:
            'Domains that responded and could be scored on this crawl. Sites we could not observe are excluded rather than counted as failures, so domainsIndexed minus domainsScored is not a count of failing sites.',
        },
        domainsIndexed: latest.totalDomains,
        domainsScored: latest.observed,

        /** Run shape and health. Absent on snapshots taken before these were recorded. */
        run: {
          attempted: latest.attempted ?? null,
          succeeded: latest.succeeded ?? null,
          crawled: latest.crawled ?? null,
          carried: latest.carried ?? null,
          partial: latest.partial ?? null,
          suspect: latest.suspect ?? false,
          suspectReasons: latest.suspectReasons ?? [],
        },

        meanScore: latest.meanScore,
        blockingAnyAnswerSurfaceCrawler: latest.blockingAnyTier1,
        blockingAllAnswerSurfaceCrawlers: latest.blockingAllTier1,
        publishingLlmsTxt: latest.llmsTxt,
        publishingAgentsMd: latest.agentsMd,

        /** robots.txt permits GPTBot and the server refuses it anyway. */
        policyGap: latest.policyGaps ?? null,
        statedAgainstEnforced: latest.quadrant ?? null,
        byPolicyPosture: latest.perPosture ?? null,
        byAccessArchetype: latest.perArchetype ?? null,
        scoreHistogram: latest.histogram ?? null,

        /**
         * Probe-3 signals. `observed` is their denominator and is not the same as
         * `domainsScored`: a null count means no probe has looked yet, which is a
         * different fact from nobody publishing them.
         */
        emergingSignals: {
          observed: latest.signalsObserved ?? 0,
          declaredLicence: latest.declaredLicence ?? null,
          contentSignal: latest.contentSignal ?? null,
          agentCard: latest.agentCard ?? null,
          dateline: latest.dateline ?? null,
          authorship: latest.authorship ?? null,
        },
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
