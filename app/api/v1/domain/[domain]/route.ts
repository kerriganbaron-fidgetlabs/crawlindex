import { allDomains, getDomain } from '../../../../../lib/dataset';
import { contradictsStatedPolicy, describeCloaking } from '../../../../../lib/findings';
import { normaliseDomain } from '../../../../../lib/http';
import { SITE } from '../../../../../lib/site';

/** Statically generated at build time, one file per domain. No server, no cold start. */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return allDomains().map((r) => ({ domain: r.domain }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normaliseDomain((await params).domain);
  const row = getDomain(domain);

  if (!row) {
    return Response.json({ error: 'not_found', domain }, { status: 404 });
  }

  const { obs, score } = row;

  return new Response(
    JSON.stringify(
      {
        domain: row.domain,
        url: `${SITE.url}/site/${row.domain}`,
        rank: row.rank,
        firstSeen: row.firstSeen,
        observedAt: obs.observedAt,
        vantage: obs.vantage,
        score: score.total,
        grade: score.grade,
        // True when some checks were unobservable, so the total is renormalised over
        // fewer points and is not comparable with a complete score.
        partial: score.partial,
        reachable: obs.reachable,
        wall: obs.control.kind === 'none' ? null : { kind: obs.control.kind, reason: obs.control.reason },
        blocked: { tier1: obs.tier1Blocked, tier2: obs.tier2Blocked },
        namedTokens: obs.robots.namedTokens,
        llmsTxt: obs.llmsTxt.present,
        agentsMd: obs.agentsMd.present,
        cloaking: obs.cloaking,
        contradictsStatedPolicy: contradictsStatedPolicy(obs),
        cloakingExplanation: describeCloaking(obs),
        stack: obs.stack,
        security: obs.security,
        scoreDetail: score,
        observation: obs,
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
