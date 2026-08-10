/**
 * The lite index probe. Six requests per domain, by design.
 *
 * The full battery in `fidget-ai-report` makes ~15 requests and takes seconds per site.
 * That is right for one commissioned report and wrong for an index that re-measures
 * thousands of domains every night, both for our compute and for their servers.
 *
 * So this probe buys the highest-signal observations for the fewest requests:
 *   1. /robots.txt             -> access policy for the whole registry, and the opt-out
 *                                 check, before we touch anything else
 *   2. homepage as a browser   -> reachability, structure, structured data, platform,
 *                                 network, security headers (the control)
 *   3. homepage as GPTBot      -> the cloaking comparison against the control
 *   4. /llms.txt               -> agent surface
 *   5. /agents.md              -> agent surface
 *   6. /.well-known/agent-card.json
 *                              -> A2A agent card, the one signal that needs its own
 *                                 request. Adoption is near zero today, which is why it
 *                                 is worth having the curve from the beginning.
 *
 * A site whose robots.txt bars all crawlers costs one request, not six.
 *
 * Everything in `stack` and most of `content` is derived from bytes already in hand.
 * Deriving more per fetch is the cheapest way to make the dataset richer, and it is why
 * this index can cross-tabulate blocking against CDN and platform when nobody else does.
 *
 * HTML is parsed with bounded regex rather than a DOM. At this volume a full parse costs
 * real minutes of CPU and a lot of memory for signals that do not need one.
 */

import { AGENTS, LIVE_TEST_AGENTS, REGISTRY_VERSION, TIER1, TIER2 } from './agents';
import { detectNetwork, detectPlatform } from './fingerprints';
import { politeFetch, PROBE_TOKEN, type FetchOutcome } from './http';
import { EMPTY_ROBOTS, isAgentAllowed, isAgentNamed, parseRobots, type ParsedRobots } from './robots';
import { STUB_MAX_BYTES, STUB_MAX_TEXT } from './score';
import type { AccessMap, Observation } from './types';

export const PROBE_VERSION = '3.0.0';

/**
 * Compare dotted versions. Used to decide whether an archived record was taken by a probe
 * new enough to have looked for a given signal at all.
 */
export function probeAtLeast(version: string | undefined, floor: string): boolean {
  const a = (version ?? '0.0.0').split('.').map((n) => Number(n) || 0);
  const b = floor.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

/** Where this process is running. Observations are only comparable within a vantage. */
export function currentVantage(): string {
  if (process.env.CRAWLINDEX_VANTAGE) return process.env.CRAWLINDEX_VANTAGE;
  return process.env.GITHUB_ACTIONS === 'true' ? 'gha-ubuntu' : 'local';
}

const LOOKS_LIKE_HTML = /^\s*(<!doctype html|<html|<\?xml|\{|\[)/i;

/** A plain-text endpoint that answered 200 with something that is not a web page. */
function servedAsText(res: FetchOutcome): boolean {
  if (res.status !== 200 || !res.body.trim()) return false;
  if (LOOKS_LIKE_HTML.test(res.body.slice(0, 400))) return false;
  if ((res.headers['content-type'] ?? '').includes('text/html')) return false;
  return true;
}

function stripToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type JsonLdSummary = {
  types: string[];
  /** Any node in the graph declares an author. */
  hasAuthor: boolean;
  datePublished: boolean;
  dateModified: boolean;
};

/**
 * Walk every JSON-LD graph on the page once and take everything we need from it.
 *
 * Authorship and dateline come out of the same traversal as the type list because they
 * are free once the graph is already in hand, and because an answer engine deciding
 * whether to cite a page weighs "who wrote this and when" at least as heavily as "what
 * kind of thing is it".
 */
function extractJsonLd(html: string): JsonLdSummary {
  const out: JsonLdSummary = { types: [], hasAuthor: false, datePublished: false, dateModified: false };
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  const nonEmpty = (v: unknown) =>
    v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

  for (const m of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue; // Malformed JSON-LD is invisible to consumers, so it is invisible to us.
    }
    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    let guard = 0;
    while (queue.length && guard++ < 500) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      const rec = node as Record<string, unknown>;
      if (Array.isArray(rec['@graph'])) queue.push(...(rec['@graph'] as unknown[]));
      const t = rec['@type'];
      if (typeof t === 'string') out.types.push(t);
      else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.types.push(x);

      if (nonEmpty(rec['author']) || nonEmpty(rec['creator'])) out.hasAuthor = true;
      if (nonEmpty(rec['datePublished'])) out.datePublished = true;
      if (nonEmpty(rec['dateModified'])) out.dateModified = true;
    }
  }
  return out;
}

/**
 * robots.txt directives that are not access rules.
 *
 * Both of these are read from bytes the probe already fetched, so they cost nothing, and
 * both describe something the binary allow/deny model cannot express.
 *
 *  - `License:` is RSL 1.0. The operator is pointing at machine-readable licence terms
 *    rather than refusing, which is a third answer to "may an AI read this".
 *  - `Content-Signal:` is granular consent, e.g. `search=yes,ai-train=no,use=reference`.
 *    Cloudflare writes it into managed robots.txt, so tracking its spread measures the
 *    same thing this index keeps finding: the edge network is setting the policy.
 */
function extractRobotsDirectives(body: string): { licenseUrl: string | null; contentSignal: string | null } {
  const licenseUrl = body.match(/^[ \t]*license[ \t]*:[ \t]*(\S+)/im)?.[1]?.slice(0, 300) ?? null;
  const contentSignal =
    body.match(/^[ \t]*content-signal[ \t]*:[ \t]*([^\r\n#]+)/im)?.[1]?.trim().slice(0, 200) || null;
  return { licenseUrl, contentSignal };
}

function validateLlmsTxt(txt: string): { specValid: boolean; issues: string[]; linkCount: number } {
  const issues: string[] = [];
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.some((l) => /^#\s+\S/.test(l))) issues.push('no H1 title');
  if (!lines.some((l) => /^>\s*\S/.test(l))) issues.push('no blockquote summary');
  if (!lines.some((l) => /^##\s+\S/.test(l))) issues.push('no H2 sections');
  const linkCount = lines.filter((l) => /^\s*-\s*\[.+\]\(.+\)/.test(l)).length;
  if (linkCount === 0) issues.push('no markdown link list');
  return { specValid: issues.length === 0, issues, linkCount };
}

/**
 * Did a bot wall answer instead of the site?
 *
 * If we score the interstitial, we publish a number about Cloudflare rather than about the
 * domain. Every signal here is either a vendor fingerprint or an explicit challenge
 * string, never a heuristic about page size, so a genuinely thin page is not mistaken for
 * a block.
 */
const CHALLENGE_SIGNATURES: Array<[RegExp, string]> = [
  [/just a moment\s*\.{0,3}\s*<\/title>/i, 'Cloudflare interstitial'],
  [/attention required!?\s*\|\s*cloudflare/i, 'Cloudflare block page'],
  [/enable javascript and cookies to continue/i, 'JavaScript/cookie challenge'],
  [/cf-browser-verification|cf_chl_opt|__cf_chl/i, 'Cloudflare challenge script'],
  [/<title>[^<]*access denied[^<]*<\/title>/i, 'Access denied page'],
  [/errors\.edgesuite\.net|akamai reference\s*#/i, 'Akamai block page'],
  [/_incapsula_resource|incapsula incident id/i, 'Imperva/Incapsula block'],
  [/datadome|geo\.captcha-delivery\.com/i, 'DataDome challenge'],
  [/px-captcha|perimeterx/i, 'PerimeterX challenge'],
  [/are you a robot|unusual traffic from your/i, 'Bot verification prompt'],
  [/<title>[^<]*(security check|bot verification)[^<]*<\/title>/i, 'Security check page'],
  [/elements\.namedItem\(\s*["']solution["']\s*\)/i, 'JavaScript proof-of-work challenge'],

  // Added after the first version of the stub rule caught Amazon by size alone. All four
  // are named vendor products, verified against live responses, and being able to say
  // *which* wall answered is worth far more than a generic "something thin came back".
  [/window\.(awsWafCookieDomainList|gokuProps)\b/i, 'AWS WAF challenge'],
  [/api-services-support@amazon\.com/i, 'Amazon automated-access interstitial'],
  [/<title>[^<]*client challenge[^<]*<\/title>|\/_fs-ch-/i, 'Fastly bot challenge'],
  [
    /<title>[^<]*request rejected[^<]*<\/title>|the requested url was rejected\. please consult/i,
    'F5 BIG-IP block page',
  ],
  [/<title>[^<]*server busy[^<]*<\/title>/i, 'Server busy interstitial'],
];

/**
 * The structural fallback, for challenges that carry no vendor fingerprint.
 *
 * A page that is small, has effectively no text, and immediately submits a form by script
 * is an interstitial. Requiring all three keeps ordinary single-page apps out: an SPA
 * shell has no auto-submitting form, so it is correctly scored as "not readable without
 * JavaScript" rather than being written off as a block.
 */
function looksLikeAutoSubmitChallenge(html: string, textLength: number): boolean {
  if (html.length > 25_000 || textLength > 200) return false;
  if (!/<form[\s>]/i.test(html)) return false;
  return /requestSubmit\(\)|\.submit\(\s*\)/i.test(html);
}

type ControlState = Observation['control'];

export function detectChallenge(res: FetchOutcome, textLength: number): ControlState {
  // 402 is not a failure. Cloudflare's pay-per-crawl and equivalent gateways answer an
  // unpaid agent with Payment Required, so this is a live, monetised access policy.
  if (res.status === 402) {
    return {
      challenged: true,
      reason: 'HTTP 402 Payment Required. Access for agents is metered rather than free.',
      kind: 'payment-required',
    };
  }

  const challenge = (reason: string): ControlState => ({ challenged: true, reason, kind: 'bot-challenge' });

  if (res.status === 403) return challenge('HTTP 403 on the control request');
  if (res.status === 429) return challenge('HTTP 429 on the control request');
  if (res.status === 451) return challenge('HTTP 451, access restricted for legal reasons');
  if (res.headers['cf-mitigated']) return challenge('Cloudflare cf-mitigated header');

  const head = res.body.slice(0, 20_000);
  for (const [re, reason] of CHALLENGE_SIGNATURES) if (re.test(head)) return challenge(reason);
  if (looksLikeAutoSubmitChallenge(res.body, textLength)) {
    return challenge('Auto-submitting interstitial with no readable content');
  }

  /**
   * The soft wall. Last, so a stub carrying a vendor fingerprint is still reported by
   * vendor rather than by this generic rule.
   *
   * amazon.com answers our crawler with HTTP 200, 2,167 bytes, a `&nbsp;` title and zero
   * extractable text. Nothing above catches it, so every body-derived line was charged to
   * Amazon as a failure and the site scored 8 out of 100. Twenty regional Amazon domains
   * did the same thing and took over the bottom of the leaderboard. That is a lie about
   * Amazon, and it is exactly what design rule 3 exists to prevent.
   *
   * Both conditions are required and both are tight. A real JavaScript application ships a
   * large shell: tiktok.com sends 362KB with 22 characters of text, does not trip this, and
   * is correctly scored zero for server-side readability. A document under 5KB containing
   * under 100 characters of text is not a homepage that was served to us.
   *
   * Restricted to non-error responses. A tiny 404 body means there is no site here, which
   * is a reachability fact and is handled by the caller.
   */
  if (res.status < 400 && res.bytes < STUB_MAX_BYTES && textLength < STUB_MAX_TEXT) {
    return {
      challenged: true,
      reason: `The homepage answered HTTP ${res.status} with ${res.bytes.toLocaleString()} bytes and no extractable text. That is a stub served to our crawler, not a page, so nothing derived from it is charged to the site.`,
      kind: 'unreadable',
    };
  }

  return { challenged: false, reason: null, kind: 'none' };
}

const LANDMARK_TAGS = ['main', 'nav', 'header', 'footer', 'article', 'aside'];

type Signals = NonNullable<Observation['signals']>;

/** Every probe-3 signal in its "we looked and found nothing" state. */
function blankSignals(): Signals {
  return {
    licenseUrl: null,
    licenseLink: false,
    contentSignal: null,
    crawlerPrice: null,
    agentCard: false,
    agentCardBytes: 0,
    datePublished: false,
    dateModified: false,
    hasAuthor: false,
    h2Count: 0,
    h3Count: 0,
    listCount: 0,
    tableCount: 0,
    textRatio: 0,
  };
}

/** A well-known endpoint that answered 200 with a JSON object rather than a web page. */
function servedAsJson(res: FetchOutcome): boolean {
  if (res.status !== 200) return false;
  const t = res.body.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

export function tldOf(domain: string): string {
  const parts = domain.split('.');
  if (parts.length < 2) return '';
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  // Treat common two-part public suffixes as one label so .co.uk is not read as .uk.
  if (parts.length >= 3 && /^(co|com|org|net|ac|gov|edu)$/.test(second) && last.length === 2) {
    return `${second}.${last}`;
  }
  return last;
}

/**
 * How long a single probe may take before it stops asking for more.
 *
 * The nightly crawl has no ceiling worth worrying about, but `/check` runs in a serverless
 * function with a hard `maxDuration`, and six requests with their own timeouts plus the
 * per-host politeness gate can exceed it against a slow origin. Overrunning produces a bare
 * platform 504 with no explanation, which is a worse answer than a partial measurement that
 * says which checks it ran out of time for.
 *
 * Optional and unset by default, so the crawler behaves exactly as before.
 */
export async function probeDomain(
  domain: string,
  opts: { deadlineMs?: number } = {},
): Promise<Observation> {
  const observedAt = new Date().toISOString();
  const vantage = currentVantage();
  const startedAt = Date.now();
  /** True once there is not enough time left to be worth another request. */
  const outOfTime = (reserve = 1500) =>
    opts.deadlineMs !== undefined && Date.now() - startedAt > opts.deadlineMs - reserve;

  const base = (obs: Partial<Observation>): Observation => ({
    domain,
    observedAt,
    registryVersion: REGISTRY_VERSION,
    probeVersion: PROBE_VERSION,
    vantage,
    reachable: false,
    httpStatus: 0,
    finalUrl: null,
    error: null,
    optedOut: false,
    https: true,
    control: { challenged: false, reason: null, kind: 'none' },
    robots: {
      present: false,
      blocksAllCrawlers: false,
      sitemapDeclared: false,
      namedTokens: [],
      groupCount: 0,
      usesAllowRules: false,
      crawlDelay: null,
      bytes: 0,
    },
    access: {},
    tier1Blocked: [],
    tier2Blocked: [],
    cloaking: { tested: false, browserBytes: 0, botStatus: 0, botBytes: 0, detected: false },
    llmsTxt: { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 },
    agentsMd: { present: false, bytes: 0 },
    structured: { jsonLdTypes: [], hasOrganization: false, hasWebSite: false },
    content: {
      title: null,
      lang: null,
      ssrTextLength: 0,
      h1Count: 0,
      landmarks: [],
      imagesTotal: 0,
      imagesWithAlt: 0,
      feed: false,
      canonical: false,
      metaNoindex: false,
    },
    signals: blankSignals(),
    stack: { platform: null, network: null, server: null },
    security: { hsts: false, csp: false, xContentTypeOptions: false },
    ...obs,
  });

  // --- 1. robots.txt first -------------------------------------------------
  // Read before anything else so an operator who has opted out is charged one request
  // instead of five, and so we never fetch a page we were asked not to fetch.
  let origin = `https://${domain}`;
  let https = true;
  let robotsRes = await politeFetch(`${origin}/robots.txt`);
  if (robotsRes.status === 0) {
    const alt = await politeFetch(`http://${domain}/robots.txt`);
    if (alt.status !== 0) {
      origin = `http://${domain}`;
      https = false;
      robotsRes = alt;
    }
  }

  const robotsParsed: ParsedRobots = servedAsText(robotsRes) ? parseRobots(robotsRes.body) : EMPTY_ROBOTS;
  // Free: the bytes are already here, and these say things allow/deny cannot.
  const robotsDirectives = robotsParsed.present
    ? extractRobotsDirectives(robotsRes.body)
    : { licenseUrl: null, contentSignal: null };

  const crawlDelayMatch = robotsRes.body.match(/^\s*crawl-delay\s*:\s*([\d.]+)/im);
  const robotsSummary: Observation['robots'] = {
    present: robotsParsed.present,
    blocksAllCrawlers:
      Boolean(robotsParsed.groups.find((g) => g.agents.includes('*'))?.disallow.includes('/')) &&
      !isAgentAllowed(robotsParsed, 'AnUnlistedGenericBot', '/'),
    sitemapDeclared: robotsParsed.sitemaps.length > 0,
    namedTokens: AGENTS.filter((a) =>
      robotsParsed.groups.some((g) => g.agents.includes(a.token.toLowerCase())),
    ).map((a) => a.token),
    groupCount: robotsParsed.groups.length,
    usesAllowRules: robotsParsed.groups.some((g) => g.allow.some((r) => r !== '')),
    crawlDelay: crawlDelayMatch ? Number(crawlDelayMatch[1]) : null,
    bytes: robotsParsed.present ? robotsRes.bytes : 0,
  };

  const accessFromRobots = (): AccessMap => {
    const m: AccessMap = {};
    for (const a of AGENTS) m[a.token] = isAgentAllowed(robotsParsed, a.token, '/');
    return m;
  };

  // Two different things look identical to a naive allow-check, and conflating them
  // biases the whole index.
  //
  //  * A group that NAMES CrawlIndexBot and denies it is a deliberate opt-out from this
  //    project. Record nothing and leave the index.
  //  * A blanket `User-agent: * / Disallow: /` is a site telling every crawler to stay
  //    out. We honour it by fetching no pages, but robots.txt is public and already in
  //    hand, so its access policy is reported. Dropping these sites entirely would quietly
  //    remove the most restrictive operators on the web from every aggregate about
  //    restrictiveness.
  if (isAgentNamed(robotsParsed, PROBE_TOKEN) && !isAgentAllowed(robotsParsed, PROBE_TOKEN, '/')) {
    return base({ reachable: true, https, optedOut: true, robots: robotsSummary });
  }

  if (!isAgentAllowed(robotsParsed, PROBE_TOKEN, '/')) {
    const acc = accessFromRobots();
    return base({
      reachable: true,
      https,
      robots: robotsSummary,
      access: acc,
      tier1Blocked: TIER1.filter((a) => !acc[a.token]).map((a) => a.token),
      tier2Blocked: TIER2.filter((a) => !acc[a.token]).map((a) => a.token),
      control: {
        challenged: true,
        reason: 'robots.txt disallows all crawlers at the site root, so no page was fetched.',
        kind: 'robots-restricted',
      },
      // robots.txt is already in hand, so its non-access directives are still observed
      // even though no page was fetched. Everything body-derived stays blank.
      signals: { ...blankSignals(), ...robotsDirectives },
    });
  }

  // --- 2. homepage as a browser (the control) ------------------------------
  const control = LIVE_TEST_AGENTS.find((a) => a.role === 'control')!;
  let home = await politeFetch(`${origin}/`, { ua: control.ua });
  if (home.status === 0 && https) {
    const alt = await politeFetch(`http://${domain}/`, { ua: control.ua });
    if (alt.status !== 0) {
      origin = `http://${domain}`;
      https = false;
      home = alt;
    }
  }

  if (home.status === 0) {
    return base({ reachable: false, https, robots: robotsSummary, error: home.error ?? 'no response' });
  }

  const html = home.body;
  const text = stripToText(html);
  const control_ = detectChallenge(home, text.length);

  // A 403 or 429 is a bot wall, not a dead host: the site is up and its robots.txt is
  // still worth reading. Anything else in the 4xx/5xx range means there is no site here.
  if (home.status >= 400 && !control_.challenged) {
    return base({
      reachable: false,
      https,
      httpStatus: home.status,
      finalUrl: home.url,
      robots: robotsSummary,
      error: `homepage returned HTTP ${home.status}`,
    });
  }

  const access = accessFromRobots();

  // --- 3. homepage as GPTBot (the cloaking comparison) ---------------------
  const botAgent = LIVE_TEST_AGENTS.find((a) => a.role === 'ai')!;
  const botRes = await politeFetch(`${origin}/`, { ua: botAgent.ua });
  const refused = botRes.status === 403 || botRes.status === 429 || botRes.status === 503;
  const starved = home.status === 200 && botRes.status === 200 && botRes.bytes < home.bytes * 0.25;

  /**
   * --- 4, 5 and 6. Agent surface files --------------------------------------
   *
   * These three are the ones a deadline drops, in reverse order of value. Skipping is not
   * the same as finding nothing: a skipped check is recorded as unobserved so the score
   * renormalises rather than charging the site for our timeout, which is design rule 3
   * applied to our own impatience.
   */
  const skipped: string[] = [];

  const llmsRes = outOfTime()
    ? null
    : await politeFetch(`${origin}/llms.txt`, { timeoutMs: 8000 });
  if (!llmsRes) skipped.push('/llms.txt');
  const llmsPresent = llmsRes ? servedAsText(llmsRes) : false;

  const agentsRes = outOfTime() ? null : await politeFetch(`${origin}/agents.md`, { timeoutMs: 8000 });
  if (!agentsRes) skipped.push('/agents.md');
  const agentsPresent = agentsRes ? servedAsText(agentsRes) : false;

  // The only request added in probe 3. Adoption today is close to zero, which is the
  // reason to measure it: being able to state the agent-card adoption rate across the top
  // five thousand domains is a number nobody else has, and the curve is the story.
  const cardRes = outOfTime()
    ? null
    : await politeFetch(`${origin}/.well-known/agent-card.json`, { timeoutMs: 8000 });
  if (!cardRes) skipped.push('/.well-known/agent-card.json');
  const cardPresent = cardRes ? servedAsJson(cardRes) : false;

  // --- derive ---------------------------------------------------------------
  const landmarks = LANDMARK_TAGS.filter((t) => new RegExp(`<${t}[\\s>]`, 'i').test(html));
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const ld = extractJsonLd(html);
  const jsonLdTypes = ld.types;
  const metaRobots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';

  const signals: Signals = {
    ...robotsDirectives,
    licenseLink: /<link[^>]+rel=["'][^"']*\blicense\b[^"']*["']/i.test(html),
    crawlerPrice: (home.headers['crawler-price'] ?? botRes.headers['crawler-price'] ?? '').slice(0, 80) || null,
    agentCard: cardPresent,
    agentCardBytes: cardPresent && cardRes ? cardRes.bytes : 0,

    // A dateline can be declared three ways and any of them is machine-readable.
    datePublished:
      ld.datePublished ||
      /<meta[^>]+property=["']article:published_time["']/i.test(html) ||
      /<time[^>]+datetime=/i.test(html),
    dateModified:
      ld.dateModified ||
      /<meta[^>]+property=["']article:modified_time["']/i.test(html),
    hasAuthor:
      ld.hasAuthor ||
      /<meta[^>]+name=["']author["'][^>]+content=["'][^"']+["']/i.test(html) ||
      /rel=["'][^"']*\bauthor\b[^"']*["']/i.test(html),

    h2Count: count(html, /<h2[\s>]/gi),
    h3Count: count(html, /<h3[\s>]/gi),
    listCount: count(html, /<(ul|ol)[\s>]/gi),
    tableCount: count(html, /<table[\s>]/gi),
    textRatio: html.length ? Number((text.length / html.length).toFixed(4)) : 0,
    ...(skipped.length ? { skippedChecks: skipped } : {}),
  };

  return base({
    reachable: true,
    https,
    httpStatus: home.status,
    finalUrl: home.url,
    control: control_,
    robots: robotsSummary,
    access,
    tier1Blocked: TIER1.filter((a) => !access[a.token]).map((a) => a.token),
    tier2Blocked: TIER2.filter((a) => !access[a.token]).map((a) => a.token),
    cloaking: {
      tested: botRes.status !== 0,
      browserBytes: home.bytes,
      botStatus: botRes.status,
      botBytes: botRes.bytes,
      detected: refused || starved,
    },
    llmsTxt:
      llmsPresent && llmsRes
        ? { present: true, bytes: llmsRes.bytes, ...validateLlmsTxt(llmsRes.body) }
        : { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 },
    agentsMd: { present: agentsPresent, bytes: agentsPresent && agentsRes ? agentsRes.bytes : 0 },
    structured: {
      jsonLdTypes: [...new Set(jsonLdTypes)],
      hasOrganization: jsonLdTypes.some((t) =>
        /^(organization|corporation|localbusiness|onlinebusiness|newsmediaorganization|educationalorganization|governmentorganization)$/i.test(
          t,
        ),
      ),
      hasWebSite: jsonLdTypes.some((t) => /^website$/i.test(t)),
    },
    content: {
      title: (html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? '').trim() || null,
      lang:
        (html.match(/<html[^>]+lang=["']([a-zA-Z-]{2,12})["']/i)?.[1] ?? '')
          .toLowerCase()
          .split('-')[0] || null,
      ssrTextLength: text.length,
      h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
      landmarks,
      imagesTotal: imgTags.length,
      imagesWithAlt: imgTags.filter((t) => /\balt\s*=\s*["'][^"']+["']/i.test(t)).length,
      feed: /<link[^>]+type=["']application\/(rss\+xml|atom\+xml)["']/i.test(html),
      canonical: /<link[^>]+rel=["']canonical["']/i.test(html),
      metaNoindex: /noindex/i.test(metaRobots) || /noindex/i.test(home.headers['x-robots-tag'] ?? ''),
    },
    signals,
    stack: {
      platform: detectPlatform(html, home.headers),
      network: detectNetwork(home.headers),
      server: (home.headers['server'] ?? '').slice(0, 40) || null,
    },
    security: {
      hsts: Boolean(home.headers['strict-transport-security']),
      csp: Boolean(home.headers['content-security-policy']),
      xContentTypeOptions: (home.headers['x-content-type-options'] ?? '').toLowerCase() === 'nosniff',
    },
  });
}
