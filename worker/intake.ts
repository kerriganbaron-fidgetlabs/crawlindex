/**
 * Domain submissions, taken from GitHub issues.
 *
 * ## Why issues rather than a form
 *
 * The site had no way to add a domain. `/check` measures live and stores nothing, so a
 * domain outside the Tranco head could never get a permanent page. Fixing that normally
 * means a form, an endpoint, a database, a spam filter and a moderation queue somebody has
 * to watch, which is four new failure modes and a running cost on a project whose entire
 * design goal is zero of both.
 *
 * A GitHub issue form is all of it for free. GitHub does the authentication, the spam
 * filtering and the abuse handling. The thread is the audit trail, so a decision about a
 * domain is public and permanent. And this worker needs no secret: the nightly Action
 * already has `GITHUB_TOKEN`, which is scoped to this repository and expires when the job
 * ends.
 *
 *   pnpm intake              # processes open submissions, needs GITHUB_TOKEN
 *   pnpm intake --dry-run    # parse and validate, write nothing, close nothing
 */

import { isIndexable } from '../lib/corpus-rules';
import { isValidDomain, normaliseDomain } from '../lib/http';
import { isEntrypoint } from './entrypoint';
import { readCorpus, writeCorpus, type CorpusEntry } from './store';

const REPO = process.env.GITHUB_REPOSITORY ?? 'kerriganbaron-fidgetlabs/crawlindex';
const API = 'https://api.github.com';
const LABEL = 'domain-submission';

/**
 * A cap, not a queue. One night cannot add more than this many domains however many
 * issues are open, so a scripted flood costs the crawl minutes rather than hours and the
 * rest simply wait for tomorrow.
 */
const MAX_PER_RUN = 50;

type Issue = { number: number; title: string; body: string | null; user: { login: string } | null };

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'CrawlIndexIntake/1.0',
  };
}

/**
 * Pull the domain out of an issue form body.
 *
 * GitHub renders a form submission as `### Label` followed by the value. The heading match
 * is tried first and a bare-hostname scan is the fallback, because people do file these by
 * hand and rejecting a perfectly clear submission on formatting would be obnoxious.
 */
export function parseDomain(body: string | null, title: string): string | null {
  const text = body ?? '';

  const fromForm = text.match(/###\s*Domain\s*\n+\s*([^\s\n]+)/i)?.[1];
  const candidate =
    fromForm ??
    title.replace(/^add\s+domain:?\s*/i, '').trim() ??
    text.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i)?.[1];

  if (!candidate) return null;
  const domain = normaliseDomain(candidate);
  return domain || null;
}

/** Why a submission was refused, phrased for the person who filed it. */
export function rejectionReason(domain: string | null): string | null {
  if (!domain) {
    return 'No domain could be read from this issue. Reopen it with just the hostname, for example `example.com`.';
  }
  if (!isValidDomain(domain)) {
    return `\`${domain}\` is not a valid hostname. Submit the domain on its own, with no scheme, port or path.`;
  }
  if (!isIndexable(domain)) {
    return `\`${domain}\` looks like infrastructure rather than a site somebody reads: a CDN host, an analytics endpoint, an ad exchange or a deeply nested subdomain. Scoring these would distort every aggregate on the index, so they are excluded by rule rather than by judgement. The rule is in \`worker/seed.ts\`, and if it is wrong about this domain that is worth saying.`;
  }
  return null;
}

async function comment(token: string, issue: number, body: string): Promise<void> {
  await fetch(`${API}/repos/${REPO}/issues/${issue}/comments`, {
    method: 'POST',
    headers: { ...headers(token), 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

async function closeIssue(token: string, issue: number, reason: 'completed' | 'not_planned'): Promise<void> {
  await fetch(`${API}/repos/${REPO}/issues/${issue}`, {
    method: 'PATCH',
    headers: { ...headers(token), 'content-type': 'application/json' },
    body: JSON.stringify({ state: 'closed', state_reason: reason }),
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

  if (!token) {
    // Not an error. A local crawl has no token and does not need one, and the nightly run
    // must not fail because submissions could not be read.
    console.log('No GITHUB_TOKEN. Skipping domain intake.');
    return;
  }

  const res = await fetch(
    `${API}/repos/${REPO}/issues?state=open&labels=${LABEL}&per_page=100`,
    { headers: headers(token) },
  );
  if (!res.ok) {
    console.error(`Could not list submissions: HTTP ${res.status}. Continuing without them.`);
    return;
  }

  const issues = (await res.json()) as Issue[];
  if (!issues.length) {
    console.log('No open domain submissions.');
    return;
  }

  const corpus = readCorpus();
  const byDomain = new Map(corpus.map((c) => [c.domain, c]));
  const now = new Date().toISOString();

  let added = 0;
  let rejected = 0;
  let already = 0;

  for (const issue of issues) {
    if (added >= MAX_PER_RUN) {
      console.log(`Hit the ${MAX_PER_RUN} per run cap. The rest wait for tomorrow.`);
      break;
    }

    const domain = parseDomain(issue.body, issue.title);
    const reason = rejectionReason(domain);

    if (reason || !domain) {
      rejected++;
      console.log(`#${issue.number}: rejected. ${reason}`);
      if (!dryRun) {
        await comment(token, issue.number, `${reason}\n\nClosing this. Reopening with a corrected domain is fine.`);
        await closeIssue(token, issue.number, 'not_planned');
      }
      continue;
    }

    const existing = byDomain.get(domain);
    if (existing && !existing.excluded) {
      already++;
      console.log(`#${issue.number}: ${domain} is already indexed.`);
      if (!dryRun) {
        await comment(
          token,
          issue.number,
          `\`${domain}\` is already in the index: https://crawlindex.org/site/${domain}\n\nIt is re-measured every night.`,
        );
        await closeIssue(token, issue.number, 'completed');
      }
      continue;
    }

    // Pinned, because the Monday reseed rebuilds the corpus from Tranco and would
    // otherwise drop anything that is not in the ranking. A submitted domain is almost by
    // definition not in the ranking.
    const entry: CorpusEntry = {
      domain,
      rank: existing?.rank ?? null,
      firstSeen: existing?.firstSeen ?? now,
      pinned: true,
      source: 'submitted',
      consecutiveFailures: 0,
      excluded: null,
    };
    byDomain.set(domain, entry);
    added++;
    console.log(`#${issue.number}: added ${domain}.`);

    if (!dryRun) {
      await comment(
        token,
        issue.number,
        [
          `\`${domain}\` has been added to the corpus and will be measured on tonight's crawl.`,
          '',
          `Its page will be at https://crawlindex.org/site/${domain} once the crawl completes and deploys.`,
          '',
          'If the operator wants it removed, disallowing `CrawlIndexBot` in their robots.txt takes it out on the next crawl. That is checked before any other request is made.',
        ].join('\n'),
      );
      await closeIssue(token, issue.number, 'completed');
    }
  }

  if (added && !dryRun) writeCorpus([...byDomain.values()]);

  console.log(
    `Intake: ${added} added, ${already} already present, ${rejected} rejected${dryRun ? ' (dry run, nothing written)' : ''}.`,
  );
}

// `tests/probe.test.ts` imports the two pure parsers above, so this must not run on import.
if (isEntrypoint(import.meta.url)) {
  main().catch((e) => {
    // Intake failing must never stop a crawl. The submissions are still there tomorrow.
    console.error(`Intake failed, continuing without it: ${e instanceof Error ? e.message : e}`);
  });
}
