/**
 * The CrawlIndex Score. A pure function over an Observation.
 *
 * Four rules make this index trustworthy, and none of them are negotiable:
 *
 *  1. No model runs in the scoring path. Scoring is arithmetic over observed evidence.
 *     Prose is written afterwards, never as an input. A score you cannot recompute from
 *     the stored observation is not a measurement, it is an opinion.
 *  2. Unobservable is not zero. A site we could not reach scores `null` and is excluded
 *     from every aggregate, rather than dragging averages down with a fake failure.
 *  3. A measurement WE failed to take is never charged to the site. When our own control
 *     request is challenged by a WAF, everything inferred from that HTML is an artefact
 *     of being blocked. Those lines are marked unavailable and the remaining points are
 *     renormalised to 100. Publishing "reddit.com scores 3" because our crawler hit a bot
 *     wall would be a lie about reddit.com.
 *  4. The rubric is versioned. Changing weights bumps RUBRIC_VERSION so historical rows
 *     stay interpretable and nobody's score silently moves because we edited a constant.
 *
 * `tests/score.test.ts` pins all four.
 */

import { TIER1, TIER2 } from './agents';
import type { Observation, Score, ScoreLine } from './types';

export const RUBRIC_VERSION = '2.0.0';

/**
 * Points that only a probe-3 record can earn, because an older probe never looked for
 * them. A record archived before those signals existed has these lines marked unavailable
 * and its score renormalised over what its probe could actually see.
 *
 * Without this, upgrading the probe would make every archived site "partial" overnight,
 * empty the leaderboard, and publish a fabricated decline for four thousand domains that
 * did nothing.
 */
const V3_ONLY_POINTS = 2 + 2 + 1 + 3 + 2;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The soft-wall thresholds. A document under this many bytes containing under this much
 * extractable text was not a page that was served to us.
 *
 * They live here rather than in the probe because this is a trust rule, not a fetching
 * rule, and because the scorer has to be able to apply it to records the probe archived
 * before the rule existed. `lib/probe.ts` imports them so both ends agree.
 */
export const STUB_MAX_BYTES = 5_000;
export const STUB_MAX_TEXT = 100;

/**
 * A thin body is only *suspicious*. Joined with an outright refusal of our AI user agent
 * it becomes conclusive, so the text ceiling can be looser in that case.
 */
export const WALLED_MAX_TEXT = 400;
const REFUSAL_STATUSES = new Set([401, 403, 406, 429, 503]);

/**
 * Does this archived observation describe something other than the site's own page?
 *
 * Derived entirely from stored evidence, which is deliberate. Applying it at score time as
 * well as at probe time means the fix reaches the records already on disk instead of
 * waiting for a re-crawl, and it puts design rule 3 in the one file responsible for it.
 *
 * Two arms, and the second exists because the first was tuned on a single day of data and
 * missed the very case it was written for. Amazon's AWS WAF interstitial came back at
 * 3,781 bytes with 151 characters the next night, just outside a 100-character ceiling, and
 * twenty Amazon domains reappeared at the bottom of the leaderboard.
 *
 *  1. **Tiny and empty.** Under 5,000 bytes and under 100 characters of text. No homepage
 *     in the top five thousand is two sentences long inside 5KB.
 *  2. **Thin and refused.** Under 5,000 bytes, under 400 characters, *and* the request
 *     carrying an AI user agent was refused outright. A server that sends almost nothing
 *     and slams the door on the bot was walling us, not serving us.
 *
 * The refusal condition in arm 2 is doing real work, and the temptation to drop it and
 * just raise the ceiling has to be resisted. lua.org's genuine homepage is 2,036 bytes
 * with 129 characters and answers the bot with a 200. Raising the ceiling alone would
 * publish "we were served a stub" about a real, deliberately minimal page, which is its
 * own kind of false claim. Rule 3 protects a site from a wrong score; it does not licence
 * a wrong explanation.
 *
 * `browserBytes` is the size of the control response. Zero means the comparison never ran,
 * which the early-return paths already handle by other means.
 */
export function bodyIsStub(obs: Observation): boolean {
  const bytes = obs.cloaking.browserBytes;
  const text = obs.content.ssrTextLength;
  if (bytes <= 0 || bytes >= STUB_MAX_BYTES) return false;

  if (text < STUB_MAX_TEXT) return true;
  return text < WALLED_MAX_TEXT && REFUSAL_STATUSES.has(obs.cloaking.botStatus);
}

function grade(total: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (total >= 90) return 'A';
  if (total >= 75) return 'B';
  if (total >= 60) return 'C';
  if (total >= 40) return 'D';
  return 'F';
}

const ACCESS_IDS = ['tier1-access', 'tier2-access', 'no-cloaking'];
const SURFACE_IDS = [
  'robots',
  'sitemap',
  'llms-txt',
  'agents-md',
  'declared-licence',
  'content-signal',
  'agent-card',
];
const STRUCTURE_IDS = [
  'schema-org',
  'schema-website',
  'schema-other',
  'ssr-text',
  'single-h1',
  'landmarks',
  'dateline',
  'authorship',
];

export function scoreObservation(obs: Observation): Score {
  const emptyBands = [
    { id: 'access' as const, label: 'Agent access', earned: 0, max: 0, nominalMax: 45 },
    { id: 'surface' as const, label: 'Machine-readable surface', earned: 0, max: 0, nominalMax: 25 },
    { id: 'structure' as const, label: 'Content structure', earned: 0, max: 0, nominalMax: 30 },
  ];

  if (!obs.reachable) {
    return {
      total: null,
      grade: null,
      bands: emptyBands,
      lines: [],
      rubricVersion: RUBRIC_VERSION,
      partial: false,
    };
  }

  // When our control request was challenged, anything derived from the returned HTML
  // describes the challenge page, not the site. robots.txt is a separate fetch of a
  // separate path and stays trustworthy.
  const stub = bodyIsStub(obs);
  const bodyTrusted = !obs.control.challenged && !stub;

  // Undefined means the record predates probe 3, so those questions were never asked.
  // Every line reading this group checks it, and none of them substitutes a zero.
  const sig = obs.signals;

  /**
   * Paths a deadline-bounded run gave up on. Only `/check` produces these.
   *
   * A check we ran out of time to make is unobserved, not absent. Scoring `/llms.txt` as
   * missing because we stopped asking would charge the site for our own timeout, which is
   * the same rule that stops a bot wall being charged to the site.
   */
  const skipped = new Set(sig?.skippedChecks ?? []);
  const wasSkipped = (path: string) => skipped.has(path);

  // One phrase for why the body cannot be read, so fourteen score lines cannot drift into
  // telling a reader two different stories about the same request.
  const wall = !stub
    ? 'our control request was challenged by a bot wall'
    : obs.content.ssrTextLength >= STUB_MAX_TEXT
      ? `the homepage answered with only ${obs.cloaking.browserBytes.toLocaleString()} bytes and ${obs.content.ssrTextLength} characters of text, and then refused a request carrying an AI user agent with HTTP ${obs.cloaking.botStatus}, which together describe a wall rather than a page`
      : `the homepage answered with ${obs.cloaking.browserBytes.toLocaleString()} bytes and no extractable text, which is a stub served to our crawler rather than the site`;

  const lines: ScoreLine[] = [];

  // --- Access, 45 ----------------------------------------------------------
  const t1Allowed = TIER1.filter((a) => obs.access[a.token] !== false).length;
  lines.push({
    id: 'tier1-access',
    label: 'Answer-surface crawlers allowed',
    earned: round1((t1Allowed / TIER1.length) * 30),
    max: 30,
    available: true,
    detail:
      obs.tier1Blocked.length === 0
        ? `All ${TIER1.length} answer-surface crawlers are allowed.`
        : `${obs.tier1Blocked.length} of ${TIER1.length} blocked: ${obs.tier1Blocked.join(', ')}.`,
  });

  const t2Allowed = TIER2.filter((a) => obs.access[a.token] !== false).length;
  lines.push({
    id: 'tier2-access',
    label: 'Secondary crawlers allowed',
    earned: round1((t2Allowed / TIER2.length) * 8),
    max: 8,
    available: true,
    detail:
      obs.tier2Blocked.length === 0
        ? `All ${TIER2.length} secondary crawlers are allowed.`
        : `${obs.tier2Blocked.length} of ${TIER2.length} blocked: ${obs.tier2Blocked.join(', ')}.`,
  });

  // A cloaking comparison against a challenged control tells us nothing.
  lines.push({
    id: 'no-cloaking',
    label: 'Serves crawlers the same content',
    earned: obs.cloaking.detected ? 0 : 7,
    max: 7,
    available: bodyTrusted && obs.cloaking.tested,
    detail: !bodyTrusted
      ? `Not assessed. There is no clean baseline to compare against, because ${wall}.`
      : !obs.cloaking.tested
        ? 'Comparison did not complete.'
        : obs.cloaking.detected
          ? `Requesting as GPTBot returned HTTP ${obs.cloaking.botStatus} and ${obs.cloaking.botBytes.toLocaleString()} bytes, against ${obs.cloaking.browserBytes.toLocaleString()} bytes for a browser.`
          : 'A crawler and a browser receive comparable responses.',
  });

  // --- Machine-readable surface, 25 ---------------------------------------
  lines.push({
    id: 'robots',
    label: 'robots.txt published',
    earned: obs.robots.present ? 3 : 0,
    max: 3,
    available: true,
    detail: obs.robots.present
      ? 'robots.txt is present and parseable.'
      : 'No robots.txt. Crawler policy is undeclared.',
  });
  lines.push({
    id: 'sitemap',
    label: 'Sitemap declared in robots.txt',
    earned: obs.robots.sitemapDeclared ? 4 : 0,
    max: 4,
    available: true,
    detail: obs.robots.sitemapDeclared
      ? 'robots.txt points crawlers at a sitemap.'
      : 'robots.txt does not declare a sitemap.',
  });

  // A WAF that challenges the homepage challenges these paths too, so a miss here would
  // be our failure, not theirs.
  const surfaceDetail = (present: boolean, path: string) =>
    wasSkipped(path)
      ? `Not assessed. This check ran out of time before ${path} could be requested, so it is excluded rather than counted as missing.`
      : !bodyTrusted
      ? `Not assessed. ${path} could not be read cleanly, because ${wall}.`
      : present
        ? `${path} is served.`
        : `No ${path}.`;

  // Graduated rather than two lines. "Does it follow the spec" is not a question you can
  // fail when there is no file, and splitting it would double-charge the same absence.
  lines.push({
    id: 'llms-txt',
    label: 'llms.txt published',
    earned: obs.llmsTxt.present ? (obs.llmsTxt.specValid ? 9 : 6) : 0,
    max: 9,
    available: bodyTrusted && !wasSkipped('/llms.txt'),
    detail: wasSkipped('/llms.txt')
      ? 'Not assessed. This check ran out of time before it could be requested, so it is excluded rather than counted as missing.'
      : !bodyTrusted
      ? `Not assessed. /llms.txt could not be read cleanly, because ${wall}.`
      : !obs.llmsTxt.present
        ? 'No /llms.txt.'
        : obs.llmsTxt.specValid
          ? '/llms.txt is served and its structure matches the spec.'
          : `/llms.txt is served but is off-spec: ${obs.llmsTxt.issues.join('; ')}.`,
  });
  lines.push({
    id: 'agents-md',
    label: 'agents.md published',
    earned: obs.agentsMd.present ? 4 : 0,
    max: 4,
    available: bodyTrusted && !wasSkipped('/agents.md'),
    detail: surfaceDetail(obs.agentsMd.present, '/agents.md'),
  });

  /**
   * Licence declaration, RSL 1.0 or an HTML link relation.
   *
   * This band scores how legible a site's intent is to a machine, not how permissive it
   * is. A site that points an agent at machine-readable terms has answered the question;
   * silence has not. The robots.txt half is trustworthy even behind a bot wall because
   * robots.txt is a separate fetch of a separate path.
   */
  const licenceEarned = sig ? (sig.licenseUrl ? 2 : bodyTrusted && sig.licenseLink ? 2 : 0) : 0;
  lines.push({
    id: 'declared-licence',
    label: 'Licence terms declared',
    earned: licenceEarned,
    max: 2,
    available: Boolean(sig),
    detail: !sig
      ? 'Not assessed. This record predates the licence check.'
      : sig.licenseUrl
        ? `robots.txt declares licence terms at ${sig.licenseUrl}.`
        : bodyTrusted && sig.licenseLink
          ? 'The homepage declares a licence with a link relation.'
          : 'No RSL License directive and no licence link relation. Reuse terms are undeclared.',
  });

  lines.push({
    id: 'content-signal',
    label: 'Granular usage preferences declared',
    earned: sig?.contentSignal ? 2 : 0,
    max: 2,
    available: Boolean(sig),
    detail: !sig
      ? 'Not assessed. This record predates the Content-Signal check.'
      : sig.contentSignal
        ? `robots.txt carries Content-Signal: ${sig.contentSignal}. Preferences are stated per use rather than as a single allow or deny.`
        : 'No Content-Signal directive. Policy is expressed only as allow or deny.',
  });

  lines.push({
    id: 'agent-card',
    label: 'Agent card published',
    earned: sig?.agentCard ? 1 : 0,
    max: 1,
    available: Boolean(sig) && bodyTrusted && !wasSkipped('/.well-known/agent-card.json'),
    detail: wasSkipped('/.well-known/agent-card.json')
      ? 'Not assessed. This check ran out of time before it could be requested.'
      : !sig
      ? 'Not assessed. This record predates the agent card check.'
      : !bodyTrusted
        ? `Not assessed. /.well-known/agent-card.json could not be read cleanly, because ${wall}.`
        : sig.agentCard
          ? 'Serves an A2A agent card at /.well-known/agent-card.json.'
          : 'No agent card at /.well-known/agent-card.json.',
  });

  // --- Content structure, 30 ----------------------------------------------
  const notAssessed = `Not assessed, because ${wall}.`;

  lines.push({
    id: 'schema-org',
    label: 'Organization schema',
    earned: obs.structured.hasOrganization ? 7 : 0,
    max: 7,
    available: bodyTrusted,
    detail: !bodyTrusted
      ? notAssessed
      : obs.structured.hasOrganization
        ? 'Organization JSON-LD lets an agent resolve who publishes this site.'
        : 'No Organization JSON-LD. Agents cannot reliably attribute this site to an entity.',
  });
  lines.push({
    id: 'schema-website',
    label: 'WebSite schema',
    earned: obs.structured.hasWebSite ? 3 : 0,
    max: 3,
    available: bodyTrusted,
    detail: !bodyTrusted ? notAssessed : obs.structured.hasWebSite ? 'WebSite JSON-LD present.' : 'No WebSite JSON-LD.',
  });

  const otherTypes = [
    ...new Set(
      obs.structured.jsonLdTypes.filter(
        (t) => !/^(organization|corporation|localbusiness|onlinebusiness|newsmediaorganization|website)$/i.test(t),
      ),
    ),
  ];
  lines.push({
    id: 'schema-other',
    label: 'Additional structured data',
    earned: otherTypes.length > 0 ? 3 : 0,
    max: 3,
    available: bodyTrusted,
    detail: !bodyTrusted
      ? notAssessed
      : otherTypes.length
        ? `Also declares: ${otherTypes.slice(0, 6).join(', ')}.`
        : 'No further JSON-LD types on the homepage.',
  });
  lines.push({
    id: 'ssr-text',
    label: 'Readable without JavaScript',
    earned: obs.content.ssrTextLength >= 500 ? 7 : obs.content.ssrTextLength >= 150 ? 4 : 0,
    max: 7,
    available: bodyTrusted,
    detail: !bodyTrusted
      ? notAssessed
      : `${obs.content.ssrTextLength.toLocaleString()} characters of text in the server response. Most crawlers do not execute JavaScript.`,
  });
  lines.push({
    id: 'single-h1',
    label: 'Single top-level heading',
    earned: obs.content.h1Count === 1 ? 3 : 0,
    max: 3,
    available: bodyTrusted,
    detail: !bodyTrusted
      ? notAssessed
      : `${obs.content.h1Count} h1 element${obs.content.h1Count === 1 ? '' : 's'} found.`,
  });
  lines.push({
    id: 'landmarks',
    label: 'Semantic landmarks',
    earned: obs.content.landmarks.length >= 3 ? 2 : 0,
    max: 2,
    available: bodyTrusted,
    detail: !bodyTrusted
      ? notAssessed
      : obs.content.landmarks.length
        ? `Uses ${obs.content.landmarks.join(', ')}.`
        : 'No semantic landmark elements found.',
  });

  /**
   * Dateline and authorship.
   *
   * An answer engine deciding whether to quote a page weighs when it was written and who
   * wrote it. Both are cheap to declare, both are machine-readable, and an undated
   * anonymous page is the single most common reason a factually correct source is passed
   * over for a worse one that carries a date.
   */
  const dated = Boolean(sig && (sig.datePublished || sig.dateModified));
  lines.push({
    id: 'dateline',
    label: 'Dateline declared',
    earned: dated ? 3 : 0,
    max: 3,
    available: Boolean(sig) && bodyTrusted,
    detail: !sig
      ? 'Not assessed. This record predates the dateline check.'
      : !bodyTrusted
        ? notAssessed
        : dated
          ? `Declares ${[sig.datePublished ? 'a publication date' : null, sig.dateModified ? 'a modification date' : null].filter(Boolean).join(' and ')} in machine-readable form.`
          : 'No machine-readable date. An agent cannot tell how current this page is.',
  });

  lines.push({
    id: 'authorship',
    label: 'Authorship declared',
    earned: sig?.hasAuthor ? 2 : 0,
    max: 2,
    available: Boolean(sig) && bodyTrusted,
    detail: !sig
      ? 'Not assessed. This record predates the authorship check.'
      : !bodyTrusted
        ? notAssessed
        : sig.hasAuthor
          ? 'Declares an author or creator that an agent can attribute the page to.'
          : 'No declared author. An agent quoting this page has nobody to credit.',
  });

  // --- aggregate -----------------------------------------------------------
  const band = (id: 'access' | 'surface' | 'structure', label: string, ids: string[], nominalMax: number) => {
    const ls = lines.filter((l) => ids.includes(l.id) && l.available);
    return {
      id,
      label,
      earned: round1(ls.reduce((s, l) => s + l.earned, 0)),
      max: ls.reduce((s, l) => s + l.max, 0),
      nominalMax,
    };
  };

  const bands = [
    band('access', 'Agent access', ACCESS_IDS, 45),
    band('surface', 'Machine-readable surface', SURFACE_IDS, 25),
    band('structure', 'Content structure', STRUCTURE_IDS, 30),
  ];

  const availableMax = bands.reduce((s, b) => s + b.max, 0);
  const earned = bands.reduce((s, b) => s + b.earned, 0);

  // Nothing observable at all. Do not manufacture a number.
  if (availableMax === 0) {
    return { total: null, grade: null, bands, lines, rubricVersion: RUBRIC_VERSION, partial: true };
  }

  const total = Math.round((earned / availableMax) * 100);

  // "Partial" must mean we could not observe something about THIS SITE, never that our own
  // probe was older than our own rubric. A probe-2 record that earns everything its probe
  // could see is a complete assessment for the questions that existed when it was taken.
  const expectedMax = sig ? MAX_POINTS : MAX_POINTS - V3_ONLY_POINTS;

  return {
    total,
    grade: grade(total),
    bands,
    lines,
    rubricVersion: RUBRIC_VERSION,
    partial: availableMax !== expectedMax,
  };
}

/** Total available points when everything is observable. Asserted to be 100 by the tests. */
export const MAX_POINTS = 45 + 25 + 30;
