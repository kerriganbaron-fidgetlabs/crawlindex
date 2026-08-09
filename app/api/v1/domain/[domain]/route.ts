import { normaliseDomain } from '../../../../../lib/http';
import { getDomain } from '../../../../../lib/queries';
import { contradictsStatedPolicy, describeCloaking } from '../../../../../lib/findings';
import { SITE } from '../../../../../lib/site';

export const revalidate = 3600;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=3600, s-maxage=43200',
  'access-control-allow-origin': '*',
};

export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normaliseDomain((await params).domain);

  const row = await getDomain(domain).catch(() => null);
  if (!row) {
    return Response.json(
      { error: 'not_found', domain, message: 'This domain is not in the index.' },
      { status: 404, headers: JSON_HEADERS },
    );
  }

  return new Response(
    JSON.stringify(
      {
        domain: row.domain,
        url: `${SITE.url}/site/${row.domain}`,
        rank: row.rank,
        observedAt: row.observed_at,
        firstSeen: row.first_seen,
        score: row.score,
        grade: row.grade,
        // True when some checks could not be observed, so the total is renormalised
        // over fewer points and is not comparable with a complete score.
        partial: row.partial,
        challenged: row.challenged,
        reachable: row.reachable,
        blocked: { tier1: row.tier1_blocked, tier2: row.tier2_blocked },
        llmsTxt: row.llms_txt,
        agentsMd: row.agents_md,
        cloaking: row.cloaking,
        // True only when robots.txt permits GPTBot and the server refused it anyway.
        contradictsStatedPolicy: contradictsStatedPolicy(row.observation),
        cloakingExplanation: describeCloaking(row.observation),
        scoreDetail: row.score_detail,
        observation: row.observation,
        license: 'CC BY 4.0',
        attribution: SITE.url,
      },
      null,
      2,
    ),
    { headers: JSON_HEADERS },
  );
}
