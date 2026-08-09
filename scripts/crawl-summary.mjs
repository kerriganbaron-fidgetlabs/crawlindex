/**
 * Turn a night's crawl into a readable pull request body.
 *
 * The data diff is megabytes of JSON Lines that nobody will ever read. What matters is
 * what moved, so the commit message and the PR body carry that instead, which also makes
 * `git log` a usable changelog of how the web's AI policy changed over time.
 */

import { readFileSync } from 'node:fs';

const day = process.argv[2] ?? new Date().toISOString().slice(0, 10);

const read = (path, fallback) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return fallback;
  }
};

const meta = JSON.parse(read('data/meta.json', '{}'));
const statsSeries = JSON.parse(read('data/stats.json', '[]'));
const stats = statsSeries.at(-1) ?? null;
const previous = statsSeries.at(-2) ?? null;

const changes = read('data/changes.jsonl', '')
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter((c) => c && c.changedAt?.startsWith(day));

const delta = (now, before, label) => {
  if (before === undefined || before === null || now === before) return null;
  const d = now - before;
  return `${label} ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} to ${now}`;
};

const lines = [];

if (meta.crawl) {
  lines.push(
    `Crawled ${meta.crawl.attempted.toLocaleString()} domains from \`${meta.vantage}\` in ${Math.round(meta.crawl.durationMs / 1000)}s. ` +
      `${meta.crawl.succeeded.toLocaleString()} reachable, ${meta.crawl.failed.toLocaleString()} not.`,
    '',
  );
}

if (stats) {
  lines.push(
    `**Scored** ${stats.observed.toLocaleString()} of ${stats.totalDomains.toLocaleString()}. Mean ${stats.meanScore}.`,
    `**Blocking** an answer-surface crawler: ${stats.blockingAnyTier1.toLocaleString()}. All of them: ${stats.blockingAllTier1.toLocaleString()}.`,
    `**Publishing** llms.txt: ${stats.llmsTxt.toLocaleString()}. agents.md: ${stats.agentsMd.toLocaleString()}.`,
  );
  if (stats.paymentRequired) {
    lines.push(`**Charging** for crawl access (HTTP 402): ${stats.paymentRequired.toLocaleString()}.`);
  }

  const moves = previous
    ? [
        delta(stats.blockingAnyTier1, previous.blockingAnyTier1, 'Sites blocking'),
        delta(stats.llmsTxt, previous.llmsTxt, 'llms.txt'),
        delta(stats.agentsMd, previous.agentsMd, 'agents.md'),
        delta(stats.observed, previous.observed, 'Scored'),
      ].filter(Boolean)
    : [];
  if (moves.length) lines.push('', `Against yesterday: ${moves.join('; ')}.`);
}

lines.push('', `### Changes detected today: ${changes.length}`);
if (changes.length) {
  lines.push('');
  for (const c of changes.slice(0, 30)) lines.push(`- \`${c.domain}\` ${c.summary}`);
  if (changes.length > 30) lines.push(`- ...and ${changes.length - 30} more`);
} else {
  lines.push('', 'Nothing moved, or this was the first comparable crawl at this vantage.');
}

lines.push(
  '',
  '---',
  'Opened automatically by the nightly crawl. Data is CC BY 4.0, by Fidget Labs BV.',
);

console.log(lines.join('\n'));
