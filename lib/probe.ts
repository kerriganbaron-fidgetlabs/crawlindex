/**
 * The lite index probe. Five requests per domain, by design.
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
 *
 * A site whose robots.txt bars all crawlers costs one request, not five.
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
import type { AccessMap, Observation } from './types';

export const PROBE_VERSION = '2.0.0';

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

function extractJsonLdTypes(html: string): string[] {
  const types: string[] = [];
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

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
      if (typeof t === 'string') types.push(t);
      else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') types.push(x);
    }
  }
  return types;
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

function detectChallenge(res: FetchOutcome, textLength: number): ControlState {
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
  return { challenged: false, reason: null, kind: 'none' };
}

const LANDMARK_TAGS = ['main', 'nav', 'header', 'footer', 'article', 'aside'];

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

export async function probeDomain(domain: string): Promise<Observation> {
  const observedAt = new Date().toISOString();
  const vantage = currentVantage();

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

  // --- 4 + 5. agent surface files ------------------------------------------
  const llmsRes = await politeFetch(`${origin}/llms.txt`, { timeoutMs: 8000 });
  const llmsPresent = servedAsText(llmsRes);
  const agentsRes = await politeFetch(`${origin}/agents.md`, { timeoutMs: 8000 });
  const agentsPresent = servedAsText(agentsRes);

  // --- derive ---------------------------------------------------------------
  const landmarks = LANDMARK_TAGS.filter((t) => new RegExp(`<${t}[\\s>]`, 'i').test(html));
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const jsonLdTypes = extractJsonLdTypes(html);
  const metaRobots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';

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
    llmsTxt: llmsPresent
      ? { present: true, bytes: llmsRes.bytes, ...validateLlmsTxt(llmsRes.body) }
      : { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 },
    agentsMd: { present: agentsPresent, bytes: agentsPresent ? agentsRes.bytes : 0 },
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
