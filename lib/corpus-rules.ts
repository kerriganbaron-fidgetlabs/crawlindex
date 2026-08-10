/**
 * Which domains belong in the corpus. Pure rules, no side effects, no network.
 *
 * These used to live in `worker/seed.ts`, which calls `main()` at module scope. The moment
 * a second module needed `isIndexable`, importing it silently started a live Tranco fetch
 * and a corpus rewrite as an import side effect, racing whatever the importer was doing.
 * The test suite caught it; production would have caught it later and worse. Rules that
 * more than one place needs belong somewhere that does nothing when you load it.
 */

import { isValidDomain } from './http';

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
