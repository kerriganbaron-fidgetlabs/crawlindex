/**
 * Build the domain corpus from the Tranco list, plus pinned domains.
 *
 * Tranco is the right source: a research-grade ranking combining five providers, built to
 * resist the manipulation and day-to-day churn that make Alexa-style lists useless for
 * longitudinal work. The index only means anything if the population is stable enough to
 * compare month over month.
 *
 * Seeding never destroys observations. It writes `corpus.json` only; `domains.jsonl` is
 * the crawler's business.
 *
 *   pnpm seed
 *   pnpm seed --count 20000
 */

import { isValidDomain, normaliseDomain } from '../lib/http';
import { readCorpus, writeCorpus, type CorpusEntry } from './store';

const TRANCO_LATEST = 'https://tranco-list.eu/api/lists/date/latest';

/**
 * Domains that stay in the index regardless of ranking.
 *
 * Fidget Labs publishes this index, so its own properties are measured by it and held to
 * the same rubric as everyone else. An index whose author exempts himself is worthless.
 */
export const PINNED_DOMAINS = [
  'fidgetlabs.io',
  'markwright.app',
  'kerriganbaron.com',
  'crawlindex.org',
  'imageclean.app',
  'aireport.fidgetlabs.io',
];

/**
 * Infrastructure, not websites. These rank highly because everything embeds them, but
 * they have no homepage a person or an agent would read, so scoring them would pollute
 * every aggregate on the site.
 */
export const EXCLUDE_PATTERNS: RegExp[] = [
  /(^|\.)(cdn|api|static|assets|img|images|media|edge|cache)\./,
  /(^|\.)(googleapis|gstatic|googlesyndication|googletagmanager|google-analytics|doubleclick|googleusercontent|googlevideo)\.com$/,
  /(^|\.)(akamai|akamaized|akamaiedge|edgesuite|edgekey|akadns|akamaihd)\.net$/,
  /(^|\.)(cloudfront|amazonaws|azureedge|azurewebsites|windows|windowsupdate|trafficmanager)\.(net|com)$/,
  /(^|\.)(fbcdn|cdninstagram|twimg|licdn|ytimg|ggpht|gvt1|gvt2|aaplimg|apple-dns)\.(net|com)$/,
  /(^|\.)(office|office365|officeapps|microsoftonline|msftncsi|msedge|msn|live|skype)\.(com|net)$/,
  /(^|\.)(whatsapp|messenger|fbsbx|instagram-static)\.(net|com)$/,
  /(^|\.)(rubiconproject|casalemedia|pubmatic|adnxs|criteo|taboola|outbrain|scorecardresearch|adsrvr|adsafeprotected|moatads)\.(com|org|net)$/,
  /(^|\.)(sentry|segment|amplitude|mixpanel|newrelic|datadoghq|cloudflareinsights|nr-data)\.(io|com|net)$/,
  /(^|\.)(gtld-servers|root-servers|nstld|domaincontrol|registrar-servers|dnsnode|ultradns|dynect)\.(net|com|org)$/,
  /(^|\.)(ns[0-9]*|dns[0-9]*)\./,
  /-dns\.(net|com)$/,
  /^(goo\.gl|bit\.ly|t\.co|tinyurl\.com|ow\.ly|buff\.ly|lnkd\.in|amzn\.to|youtu\.be|fb\.me|g\.co)$/,
  /^(localhost|example|invalid|test)\./,
  /\.(arpa|local|internal)$/,
];

export function isIndexable(domain: string): boolean {
  if (!isValidDomain(domain)) return false;
  if (PINNED_DOMAINS.includes(domain)) return true;
  if (domain.split('.').length > 3) return false;
  return !EXCLUDE_PATTERNS.some((re) => re.test(domain));
}

async function fetchTranco(count: number): Promise<{ listId: string; rows: Array<{ domain: string; rank: number }> }> {
  const metaRes = await fetch(TRANCO_LATEST);
  if (!metaRes.ok) throw new Error(`Tranco list metadata failed: HTTP ${metaRes.status}`);
  const meta = (await metaRes.json()) as { list_id: string; available: boolean };
  if (!meta.available) throw new Error('Tranco reports the latest list is not available yet.');

  // Over-fetch: filtering removes a meaningful slice of the head of the list.
  const res = await fetch(`https://tranco-list.eu/download/${meta.list_id}/${Math.min(1_000_000, count * 3)}`);
  if (!res.ok) throw new Error(`Tranco download failed: HTTP ${res.status}`);
  const csv = await res.text();

  const rows: Array<{ domain: string; rank: number }> = [];
  for (const line of csv.split('\n')) {
    const [rankRaw, domainRaw] = line.trim().split(',');
    if (!rankRaw || !domainRaw) continue;
    const domain = normaliseDomain(domainRaw);
    if (!isIndexable(domain)) continue;
    rows.push({ domain, rank: Number(rankRaw) });
    if (rows.length >= count) break;
  }
  return { listId: meta.list_id, rows };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--count');
  const count = i >= 0 ? Number(args[i + 1]) : 5000;
  if (!Number.isFinite(count) || count < 1) throw new Error('--count must be a positive number');

  const existing = new Map(readCorpus().map((e) => [e.domain, e]));
  const now = new Date().toISOString();

  console.log(`Fetching Tranco top ${count} after filtering...`);
  let ranked: Array<{ domain: string; rank: number }> = [];
  try {
    const { listId, rows } = await fetchTranco(count);
    ranked = rows;
    console.log(`Tranco list ${listId}: ${rows.length} indexable domains.`);
  } catch (e) {
    // A seeding failure must not wipe the corpus or fail the nightly run. The crawler can
    // work perfectly well from yesterday's list.
    console.error(`Tranco fetch failed, keeping the existing corpus: ${e instanceof Error ? e.message : e}`);
    if (!existing.size) throw e;
  }

  const next = new Map<string, CorpusEntry>();

  for (const { domain, rank } of ranked) {
    const prev = existing.get(domain);
    next.set(domain, {
      domain,
      rank,
      firstSeen: prev?.firstSeen ?? now,
      consecutiveFailures: prev?.consecutiveFailures ?? 0,
      excluded: prev?.excluded ?? null,
    });
  }

  // Pinned domains are added last so they always survive, ranked or not.
  for (const domain of PINNED_DOMAINS) {
    const prev = existing.get(domain);
    next.set(domain, {
      domain,
      rank: prev?.rank ?? null,
      firstSeen: prev?.firstSeen ?? now,
      pinned: true,
      consecutiveFailures: prev?.consecutiveFailures ?? 0,
      excluded: prev?.excluded ?? null,
    });
  }

  // Retro-apply the exclusion rules. The infrastructure pattern list grows as crawls
  // surface new cases, and entries added under an older list must be dropped.
  let dropped = 0;
  for (const [domain] of next) {
    if (!isIndexable(domain)) {
      next.delete(domain);
      dropped++;
    }
  }

  writeCorpus([...next.values()]);
  console.log(
    `Corpus: ${next.size} domains (${PINNED_DOMAINS.length} pinned)${dropped ? `, ${dropped} dropped as infrastructure` : ''}.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
