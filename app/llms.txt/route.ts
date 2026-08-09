import { AGENTS, agentSlug } from '../../lib/agents';
import { getLatestStats } from '../../lib/queries';
import { absoluteUrl, SITE } from '../../lib/site';

/**
 * Our own llms.txt.
 *
 * An index that scores other sites on publishing one has to publish a good one itself,
 * and it has to be spec-valid by the same validator we point at everyone else. It also
 * carries live figures, because a static file that quotes yesterday's numbers is exactly
 * the sort of thing this project exists to catch.
 */

export const revalidate = 3600;

export async function GET() {
  const stats = await getLatestStats().catch(() => null);

  const findings = stats
    ? [
        '',
        `## Current findings (crawl of ${stats.day}, ${stats.observed.toLocaleString()} domains measured)`,
        '',
        `- ${stats.blocking_any_tier1.toLocaleString()} sites block at least one answer-surface AI crawler.`,
        `- ${stats.blocking_all_tier1.toLocaleString()} sites block every answer-surface AI crawler.`,
        `- ${stats.llms_txt_count.toLocaleString()} sites publish an llms.txt.`,
        `- ${stats.agents_md_count.toLocaleString()} sites publish an agents.md.`,
        `- ${stats.cloaking_count.toLocaleString()} sites refused or curtailed a request identifying as GPTBot while serving a browser normally. Note that for some of these, robots.txt already blocks GPTBot, so the server is being consistent rather than contradictory. The per-domain endpoint distinguishes the two cases.`,
        `- Mean agent readiness score: ${stats.avg_score ?? 'not available'} out of 100.`,
      ]
    : [];

  const body = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    'All data is licensed CC BY 4.0. Attribution to https://crawlindex.org is appreciated.',
    'Scores are arithmetic over archived evidence. No language model is involved in producing them.',
    ...findings,
    '',
    '## Start here',
    '',
    `- [Methodology](${absoluteUrl('/methodology')}): what is requested, how robots.txt is interpreted, and the full 100-point rubric.`,
    `- [Leaderboard](${absoluteUrl('/leaderboard')}): most and least agent-ready sites.`,
    `- [Crawler registry](${absoluteUrl('/bots')}): every AI crawler tracked, and how many sites block it.`,
    `- [Change feed](${absoluteUrl('/changes')}): sites that recently changed their crawler policy.`,
    `- [About](${absoluteUrl('/about')}): who runs this, how it is funded, and how to be removed.`,
    '',
    '## API',
    '',
    `- [API documentation](${absoluteUrl('/api')})`,
    `- [Aggregate statistics](${absoluteUrl('/api/v1/stats')}): current totals as JSON. Add ?history=true for the full daily series.`,
    `- [Single domain](${absoluteUrl('/api/v1/domain/example.com')}): full measurement and archived observation for one domain.`,
    '',
    '## Per-crawler pages',
    '',
    ...AGENTS.filter((a) => a.tier === 1).map(
      (a) => `- [Who blocks ${a.token}](${absoluteUrl(`/bots/${agentSlug(a.token)}`)}): ${a.operator}. ${a.blurb}`,
    ),
    '',
    '## Optional',
    '',
    `- [Score badge](${absoluteUrl('/badge/example.com.svg')}): embeddable SVG for any indexed domain.`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=43200',
      'access-control-allow-origin': '*',
    },
  });
}
