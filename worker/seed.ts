/**
 * Seed the domain corpus from the Tranco list.
 *
 * Tranco is the right source here: it is a research-grade ranking that combines five
 * providers and is explicitly built to resist the manipulation and day-to-day churn that
 * make Alexa-style lists useless for longitudinal work. The index only means something
 * if the population is stable enough to compare month over month.
 *
 *   pnpm seed              # top 5000
 *   pnpm seed --count 20000
 */

import { isValidDomain, normaliseDomain } from '../lib/http';
import { assertWrote, serviceClient } from './env';

const TRANCO_LATEST = 'https://tranco-list.eu/api/lists/date/latest';

/**
 * Infrastructure, not websites. These rank highly because everything embeds them, but
 * they have no homepage a person or an agent would ever read, so scoring them would
 * pollute every aggregate on the site.
 */
export const EXCLUDE_PATTERNS: RegExp[] = [
  // Content delivery and asset hosts.
  /(^|\.)(cdn|api|static|assets|img|images|media|edge|cache)\./,
  /(^|\.)(googleapis|gstatic|googlesyndication|googletagmanager|google-analytics|doubleclick|googleusercontent|googlevideo)\.com$/,
  /(^|\.)(akamai|akamaized|akamaiedge|edgesuite|edgekey|akadns|akamaihd)\.net$/,
  /(^|\.)(cloudfront|amazonaws|azureedge|azurewebsites|windows|windowsupdate|trafficmanager)\.(net|com)$/,
  /(^|\.)(fbcdn|cdninstagram|twimg|licdn|ytimg|ggpht|gvt1|gvt2|aaplimg|apple-dns)\.(net|com)$/,
  // Identity, telemetry and platform plumbing with no readable homepage.
  /(^|\.)(office|office365|officeapps|microsoftonline|msftncsi|msedge|msn|live|skype)\.(com|net)$/,
  /(^|\.)(whatsapp|messenger|fbsbx|instagram-static)\.(net|com)$/,
  /(^|\.)(rubiconproject|casalemedia|pubmatic|adnxs|criteo|taboola|outbrain|scorecardresearch|adsrvr|adsafeprotected|moatads)\.(com|org|net)$/,
  /(^|\.)(sentry|segment|amplitude|mixpanel|newrelic|datadoghq|cloudflareinsights|nr-data)\.(io|com|net)$/,
  // DNS and registry infrastructure.
  /(^|\.)(gtld-servers|root-servers|nstld|domaincontrol|registrar-servers|dnsnode|ultradns|dynect)\.(net|com|org)$/,
  /(^|\.)(ns[0-9]*|dns[0-9]*)\./,
  /-dns\.(net|com)$/,
  // URL shorteners resolve to a redirect, never a page.
  /^(goo\.gl|bit\.ly|t\.co|tinyurl\.com|ow\.ly|buff\.ly|lnkd\.in|amzn\.to|youtu\.be|fb\.me|g\.co)$/,
  /^(localhost|example|invalid|test)\./,
  /\.(arpa|local|internal)$/,
];

function isIndexable(domain: string): boolean {
  if (!isValidDomain(domain)) return false;
  // A bare two-label domain or a normal subdomain. Anything deeper is usually plumbing.
  if (domain.split('.').length > 3) return false;
  return !EXCLUDE_PATTERNS.some((re) => re.test(domain));
}

async function fetchTranco(count: number): Promise<{ listId: string; rows: Array<{ domain: string; rank: number }> }> {
  const metaRes = await fetch(TRANCO_LATEST);
  if (!metaRes.ok) throw new Error(`Tranco list metadata failed: HTTP ${metaRes.status}`);
  const meta = (await metaRes.json()) as { list_id: string; available: boolean };
  if (!meta.available) throw new Error('Tranco reports the latest list is not available yet.');

  // Over-fetch, because filtering removes a meaningful slice of the head of the list.
  const fetchCount = Math.min(1_000_000, count * 3);
  const url = `https://tranco-list.eu/download/${meta.list_id}/${fetchCount}`;
  const res = await fetch(url);
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
  const countArg = args.indexOf('--count');
  const count = countArg >= 0 ? Number(args[countArg + 1]) : 5000;
  if (!Number.isFinite(count) || count < 1) throw new Error('--count must be a positive number');

  console.log(`Fetching Tranco top ${count} (after filtering)...`);
  const { listId, rows } = await fetchTranco(count);
  console.log(`Tranco list ${listId}: ${rows.length} indexable domains.`);

  const db = serviceClient();

  // Upsert in batches. `rank` is refreshed every seed; everything else is left to the
  // crawler so re-seeding never wipes observations.
  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await db
      .from('domains')
      .upsert(
        batch.map((r) => ({ domain: r.domain, rank: r.rank })),
        { onConflict: 'domain', ignoreDuplicates: false },
      )
      .select('domain');
    if (error) throw new Error(`Upsert failed at offset ${i}: ${error.message}`);
    written += assertWrote(data, `seed batch at ${i}`, batch.length).length;
    process.stdout.write(`\r  seeded ${written}/${rows.length}`);
  }
  console.log(`\nSeeded ${written} domains.`);

  // Retro-apply the current exclusion rules. The list of infrastructure patterns grows
  // as the crawl surfaces new ones, and rows seeded under an older list must be demoted
  // rather than left polluting the aggregates.
  const { data: all, error: allErr } = await db
    .from('domains')
    .select('domain')
    .eq('indexable', true)
    .limit(1_000_000);
  if (allErr) throw new Error(`could not scan for demotions: ${allErr.message}`);

  const demote = (all ?? []).map((r: { domain: string }) => r.domain).filter((d) => !isIndexable(d));
  if (!demote.length) {
    console.log('No existing rows need demoting.');
    return;
  }

  for (let i = 0; i < demote.length; i += BATCH) {
    const slice = demote.slice(i, i + BATCH);
    const { error } = await db
      .from('domains')
      .update({ indexable: false, excluded_reason: 'Infrastructure host, not a readable website' })
      .in('domain', slice)
      .select('domain');
    if (error) throw new Error(`demotion failed at ${i}: ${error.message}`);
  }
  console.log(`Demoted ${demote.length} infrastructure hosts out of the published index.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
