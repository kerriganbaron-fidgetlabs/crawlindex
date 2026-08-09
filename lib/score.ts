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

export const RUBRIC_VERSION = '1.0.0';

const round1 = (n: number) => Math.round(n * 10) / 10;

function grade(total: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (total >= 90) return 'A';
  if (total >= 75) return 'B';
  if (total >= 60) return 'C';
  if (total >= 40) return 'D';
  return 'F';
}

const ACCESS_IDS = ['tier1-access', 'tier2-access', 'no-cloaking'];
const SURFACE_IDS = ['robots', 'sitemap', 'llms-txt', 'agents-md'];
const STRUCTURE_IDS = [
  'schema-org',
  'schema-website',
  'schema-other',
  'ssr-text',
  'single-h1',
  'landmarks',
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
  const bodyTrusted = !obs.control.challenged;

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
      ? 'Not assessed. Our control request was challenged, so there is no clean baseline to compare against.'
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
    earned: obs.robots.sitemapDeclared ? 5 : 0,
    max: 5,
    available: true,
    detail: obs.robots.sitemapDeclared
      ? 'robots.txt points crawlers at a sitemap.'
      : 'robots.txt does not declare a sitemap.',
  });

  // A WAF that challenges the homepage challenges these paths too, so a miss here would
  // be our failure, not theirs.
  const surfaceDetail = (present: boolean, path: string) =>
    !bodyTrusted
      ? `Not assessed. ${path} could not be fetched cleanly past the bot challenge.`
      : present
        ? `${path} is served.`
        : `No ${path}.`;

  // Graduated rather than two lines. "Does it follow the spec" is not a question you can
  // fail when there is no file, and splitting it would double-charge the same absence.
  lines.push({
    id: 'llms-txt',
    label: 'llms.txt published',
    earned: obs.llmsTxt.present ? (obs.llmsTxt.specValid ? 12 : 8) : 0,
    max: 12,
    available: bodyTrusted,
    detail: !bodyTrusted
      ? 'Not assessed. /llms.txt could not be fetched cleanly past the bot challenge.'
      : !obs.llmsTxt.present
        ? 'No /llms.txt.'
        : obs.llmsTxt.specValid
          ? '/llms.txt is served and its structure matches the spec.'
          : `/llms.txt is served but is off-spec: ${obs.llmsTxt.issues.join('; ')}.`,
  });
  lines.push({
    id: 'agents-md',
    label: 'agents.md published',
    earned: obs.agentsMd.present ? 5 : 0,
    max: 5,
    available: bodyTrusted,
    detail: surfaceDetail(obs.agentsMd.present, '/agents.md'),
  });

  // --- Content structure, 30 ----------------------------------------------
  const notAssessed = 'Not assessed. Our control request was challenged by a bot wall.';

  lines.push({
    id: 'schema-org',
    label: 'Organization schema',
    earned: obs.structured.hasOrganization ? 8 : 0,
    max: 8,
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
    earned: obs.structured.hasWebSite ? 4 : 0,
    max: 4,
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
    earned: otherTypes.length > 0 ? 4 : 0,
    max: 4,
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
    earned: obs.content.ssrTextLength >= 500 ? 8 : obs.content.ssrTextLength >= 150 ? 4 : 0,
    max: 8,
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
    earned: obs.content.landmarks.length >= 3 ? 3 : 0,
    max: 3,
    available: bodyTrusted,
    detail: !bodyTrusted
      ? notAssessed
      : obs.content.landmarks.length
        ? `Uses ${obs.content.landmarks.join(', ')}.`
        : 'No semantic landmark elements found.',
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

  return {
    total,
    grade: grade(total),
    bands,
    lines,
    rubricVersion: RUBRIC_VERSION,
    partial: availableMax !== MAX_POINTS,
  };
}

/** Total available points when everything is observable. Asserted to be 100 by the tests. */
export const MAX_POINTS = 45 + 25 + 30;
