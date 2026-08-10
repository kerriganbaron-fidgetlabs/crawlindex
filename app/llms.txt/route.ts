import { AGENTS, agentSlug } from '../../lib/agents';
import { latestStats, networkCohorts, platformCohorts } from '../../lib/dataset';
import { getReportMonths, monthLabel } from '../../lib/report';
import { absoluteUrl, SITE } from '../../lib/site';

/**
 * Our own llms.txt.
 *
 * An index that scores other sites on publishing one has to publish a good one itself,
 * validated by the same rules it points at everyone else. It also carries live figures,
 * because a static file quoting last quarter's numbers is exactly the sort of thing this
 * project exists to catch.
 */

export const dynamic = 'force-static';

export async function GET() {
  const stats = latestStats();
  const networks = networkCohorts().slice(0, 5);
  const platforms = platformCohorts().slice(0, 5);
  const months = getReportMonths().slice(0, 6);

  /**
   * Every figure carries its denominator and the measurement date.
   *
   * A bare count is unquotable: "445 sites publish an llms.txt" says nothing without the
   * population it was counted over. The same rule now governs the homepage JSON-LD, and
   * these sentences are generated from the same snapshot, so the two cannot disagree.
   */
  const of = (n: number) => `${n.toLocaleString()} of ${stats!.observed.toLocaleString()} measured sites (${((n / Math.max(1, stats!.observed)) * 100).toFixed(1)}%)`;

  const findings = stats
    ? [
        '',
        `## Current findings`,
        '',
        `Crawl of ${stats.day}. Denominator throughout is ${stats.observed.toLocaleString()} domains that could be measured, out of ${stats.totalDomains.toLocaleString()} published records. Sites we could not observe are excluded rather than counted as failures, so do not treat the difference as sites that failed.`,
        ...(stats.suspect
          ? ['', `NOTE: the most recent run was quarantined as implausible. These figures are from ${stats.day}, the last crawl that passed a health check.`]
          : []),
        '',
        `- ${of(stats.blockingAnyTier1)} block at least one answer-surface AI crawler.`,
        `- ${of(stats.blockingAllTier1)} block every answer-surface AI crawler.`,
        ...(stats.policyGaps !== undefined
          ? [
              `- ${of(stats.policyGaps)} permit GPTBot in robots.txt and then refuse a request from GPTBot at the server. Their published policy is not the one being enforced.`,
            ]
          : []),
        `- ${of(stats.llmsTxt)} publish an llms.txt.`,
        `- ${of(stats.agentsMd)} publish an agents.md.`,
        `- ${of(stats.refusedGptbot)} refused or curtailed a request identifying as GPTBot while serving a browser normally. For some, robots.txt already blocks GPTBot, so the server is consistent rather than contradictory. The per-domain endpoint separates the two cases.`,
        `- ${of(stats.paymentRequired)} answered an agent with HTTP 402 Payment Required, which is a pay-per-crawl gateway rather than a block.`,
        `- Mean agent readiness score: ${stats.meanScore ?? 'not available'} out of 100, across the ${stats.observed.toLocaleString()} measured sites.`,
        ...(stats.perPosture
          ? [
              '',
              `Of those, ${(stats.perPosture.inherited ?? 0).toLocaleString()} have a robots.txt naming no AI crawler and ${(stats.perPosture.absent ?? 0).toLocaleString()} have no robots.txt at all, against ${(stats.perPosture.deliberate ?? 0).toLocaleString()} that name at least one. For most of the web the AI policy is a default rather than a decision.`,
            ]
          : []),
        ...(stats.signalsObserved === 0
          ? [
              '',
              'Licence declarations, Content-Signal, agent cards, datelines and authorship are measured from probe 3 onward and have not been observed yet. They are absent from this file rather than reported as zero, because nobody has asked.',
            ]
          : []),
      ]
    : [];

  const cohortLines = networks.length
    ? [
        '',
        '## Who is setting the policy',
        '',
        'Most operators never formed a view on AI crawlers. Their edge network or platform shipped a default and they inherited it. Blocking rate by edge network:',
        '',
        ...networks.map((c) => `- ${c.id}: ${c.blockingRate.toFixed(1)}% of ${c.observed.toLocaleString()} measured sites block an answer-surface crawler.`),
        '',
        'By publishing platform:',
        '',
        ...platforms.map((c) => `- ${c.id}: ${c.blockingRate.toFixed(1)}% of ${c.observed.toLocaleString()} measured sites.`),
      ]
    : [];

  const body = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    `Research and data by ${SITE.publisher} (${SITE.publisherUrl}), ${SITE.publisherLocation}.`,
    `Licensed ${SITE.licence}. Attribution to ${SITE.publisher} is required when reusing these figures.`,
    'Scores are arithmetic over archived evidence. No language model is involved in producing them.',
    ...findings,
    ...cohortLines,
    '',
    '## Start here',
    '',
    `- [Methodology](${absoluteUrl('/methodology')}): what is requested, how robots.txt is interpreted, and the full 100-point rubric.`,
    `- [Download the dataset](${absoluteUrl('/data')}): every record, free, no key, no signup.`,
    `- [Leaderboard](${absoluteUrl('/leaderboard')}): most and least agent-ready sites.`,
    `- [Does your CDN decide your AI policy](${absoluteUrl('/networks')}): blocking rate by edge network.`,
    `- [Readiness by platform](${absoluteUrl('/platforms')}): blocking rate by CMS and framework.`,
    `- [By top-level domain](${absoluteUrl('/tlds')}): a rough proxy for jurisdiction.`,
    `- [Crawler registry](${absoluteUrl('/bots')}): every AI crawler tracked, and how many sites block it.`,
    `- [Change feed](${absoluteUrl('/changes')}): sites that recently changed crawler policy.`,
    `- [About](${absoluteUrl('/about')}): who runs this, how it is funded, and how to be removed.`,
    ...(months.length
      ? ['', '## Reports', '', ...months.map((m) => `- [The state of AI crawler access, ${monthLabel(m)}](${absoluteUrl(`/reports/${m}`)})`)]
      : []),
    '',
    '## Machine endpoints',
    '',
    `- [Full dataset](${absoluteUrl('/data/domains.jsonl')}): JSON Lines, one record per domain, with the archived observation behind every score.`,
    `- [Daily statistics](${absoluteUrl('/data/stats.json')}): the complete series since the index began.`,
    `- [Change log](${absoluteUrl('/data/changes.jsonl')})`,
    `- [Aggregate statistics](${absoluteUrl('/api/v1/stats')}): current totals and cross-tabs as JSON.`,
    `- [Single domain](${absoluteUrl('/api/v1/domain/stripe.com')}): full measurement for one domain.`,
    '',
    '## Per-crawler pages',
    '',
    ...AGENTS.filter((a) => a.tier === 1).map(
      (a) => `- [Who blocks ${a.token}](${absoluteUrl(`/bots/${agentSlug(a.token)}`)}): ${a.operator}. ${a.blurb}`,
    ),
    '',
    '## Optional',
    '',
    `- [Score badge](${absoluteUrl('/badge/stripe.com.svg')}): embeddable SVG for any indexed domain.`,
    `- [Source code and full history](${SITE.repo})`,
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
