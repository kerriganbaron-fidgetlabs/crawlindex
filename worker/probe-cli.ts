/**
 * Probe one or more domains and print the observation plus the score.
 * Writes nothing. This is the tool for checking the probe itself.
 *
 *   pnpm probe example.com nytimes.com
 *   pnpm probe example.com --json
 */

import { normaliseDomain } from '../lib/http';
import { probeDomain } from '../lib/probe';
import { scoreObservation } from '../lib/score';

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const domains = args.filter((a) => !a.startsWith('--')).map(normaliseDomain);

  if (!domains.length) {
    console.error('usage: pnpm probe <domain> [domain...] [--json]');
    process.exit(1);
  }

  for (const domain of domains) {
    const started = Date.now();
    const obs = await probeDomain(domain);
    const score = scoreObservation(obs);
    const elapsed = Date.now() - started;

    if (json) {
      console.log(JSON.stringify({ observation: obs, score }, null, 2));
      continue;
    }

    console.log(`\n=== ${domain} ${'='.repeat(Math.max(0, 56 - domain.length))}`);
    if (!obs.reachable) {
      console.log(`  UNREACHABLE: ${obs.error}  (${elapsed}ms)`);
      continue;
    }
    console.log(
      `  Score ${score.total}/100  grade ${score.grade}   (${elapsed}ms)${score.partial ? '  [PARTIAL]' : ''}`,
    );
    if (obs.control.challenged) console.log(`  ! control request challenged: ${obs.control.reason}`);
    for (const b of score.bands) {
      const excluded = b.max === 0 ? ' (not assessed)' : b.max !== b.nominalMax ? ` of ${b.nominalMax} assessable` : '';
      console.log(`    ${b.label.padEnd(28)} ${b.earned}/${b.max}${excluded}`);
    }
    console.log(`  robots.txt: ${obs.robots.present}   sitemap: ${obs.robots.sitemapDeclared}   llms.txt: ${obs.llmsTxt.present}   agents.md: ${obs.agentsMd.present}`);
    console.log(`  tier1 blocked: ${obs.tier1Blocked.join(', ') || 'none'}`);
    console.log(`  tier2 blocked: ${obs.tier2Blocked.join(', ') || 'none'}`);
    console.log(`  named tokens : ${obs.robots.namedTokens.join(', ') || 'none'}`);
    console.log(`  cloaking     : ${obs.cloaking.detected} (browser ${obs.cloaking.browserBytes}B vs bot ${obs.cloaking.botBytes}B, HTTP ${obs.cloaking.botStatus})`);
    console.log(`  jsonld       : ${obs.structured.jsonLdTypes.join(', ') || 'none'}`);
    console.log(`  ssr text     : ${obs.content.ssrTextLength} chars, h1x${obs.content.h1Count}, landmarks ${obs.content.landmarks.join('/') || 'none'}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
