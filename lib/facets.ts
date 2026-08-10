/**
 * Facets: classifications published beside the score rather than folded into it.
 *
 * The score answers "how ready is this site". It cannot answer "did anyone here actually
 * decide that", and compressing a decision into a grade would destroy the interesting
 * part. Every facet below is a pure function of an archived observation, computed on load
 * like the score itself, and every one of them is derivable from bytes the probe already
 * had. None of them costs a request and none of them moves a number.
 *
 * The reason these exist: a leaderboard of scores flattens five thousand sites onto one
 * axis, and the dataset's real finding is not that some sites score badly. It is that
 * most operators never made a choice, and that a meaningful minority publish one policy
 * and enforce a different one.
 */

import { AGENTS, TIER1 } from './agents';
import type { Observation } from './types';

// --- policy posture ---------------------------------------------------------

export type PolicyPosture = 'deliberate' | 'inherited' | 'blanket' | 'absent';

export const POSTURE_LABEL: Record<PolicyPosture, string> = {
  deliberate: 'Deliberate',
  inherited: 'Inherited',
  blanket: 'Blanket',
  absent: 'Absent',
};

export const POSTURE_BLURB: Record<PolicyPosture, string> = {
  deliberate:
    'robots.txt names AI crawlers by token. Somebody at this organisation decided what AI systems may do with the site.',
  inherited:
    'robots.txt exists and names no AI crawler at all. Whatever AI policy this site has is a side effect of generic rules it inherited, most often from its platform or CDN default.',
  blanket:
    'One rule for every crawler, allow nothing. This is a decision, but it is not a decision about AI specifically.',
  absent: 'No robots.txt. Crawler policy is undeclared, so every crawler applies its own default.',
};

export function policyPosture(obs: Observation): PolicyPosture {
  if (!obs.robots.present) return 'absent';
  if (obs.robots.blocksAllCrawlers) return 'blanket';
  if (obs.robots.namedTokens.length > 0) return 'deliberate';
  return 'inherited';
}

// --- access archetype -------------------------------------------------------

export type AccessArchetype =
  | 'open'
  | 'no-training'
  | 'assistant-only'
  | 'selective'
  | 'walled'
  | 'metered'
  | 'undeclared';

export const ARCHETYPE_LABEL: Record<AccessArchetype, string> = {
  open: 'Open',
  'no-training': 'No training',
  'assistant-only': 'Assistant only',
  selective: 'Selective',
  walled: 'Walled',
  metered: 'Metered',
  undeclared: 'Undeclared',
};

export const ARCHETYPE_BLURB: Record<AccessArchetype, string> = {
  open: 'Every answer-surface crawler is allowed. An agent asked about this site can read it.',
  'no-training':
    'Training crawlers are blocked and the crawlers that answer live questions are not. This site wants to be cited without being absorbed.',
  'assistant-only':
    'Index builders are blocked but crawlers fetching a page on behalf of a person are allowed. Readable on request, not in bulk.',
  selective: 'Some answer-surface crawlers are blocked and others are not.',
  walled: 'Every answer-surface crawler is blocked. This site is invisible to AI answers by choice.',
  metered: 'Access is sold rather than refused. An unpaid agent gets HTTP 402 Payment Required.',
  undeclared: 'No robots.txt, so nothing is stated either way.',
};

export function accessArchetype(obs: Observation): AccessArchetype {
  if (obs.control.kind === 'payment-required') return 'metered';
  if (!obs.robots.present) return 'undeclared';

  const blocked = new Set(obs.tier1Blocked);
  if (blocked.size === 0) return 'open';
  if (blocked.size >= TIER1.length) return 'walled';

  const roleOf = new Map(AGENTS.map((a) => [a.token, a.role]));
  const blockedRoles = new Set([...blocked].map((t) => roleOf.get(t)));
  const allowedRoles = new Set(
    TIER1.filter((a) => !blocked.has(a.token)).map((a) => a.role),
  );

  // Blocks training, allows everything that answers a live question.
  if (blockedRoles.size === 1 && blockedRoles.has('training')) return 'no-training';
  // Blocks the index builders, keeps the on-demand fetchers.
  if (!blockedRoles.has('assistant') && allowedRoles.has('assistant')) return 'assistant-only';
  return 'selective';
}

// --- the policy gap ---------------------------------------------------------

/**
 * The strongest single finding in the dataset, and it costs nothing.
 *
 * robots.txt is a published promise. The response to a request carrying an AI user agent
 * is what actually happens. Both halves have been measured on every domain since the
 * first crawl and nobody had cross-referenced them. A site whose robots.txt permits GPTBot
 * and whose server refuses GPTBot anyway is not blocking AI, it is saying one thing and
 * doing another, usually because an edge rule was switched on above the operator's head.
 *
 * Deliberately narrow. Only an outright refusal counts, never a thin response, because a
 * dynamic page legitimately varies in size and a false accusation here is expensive.
 */
export type PolicyGap = { gap: boolean; reason: string | null };

const REFUSAL_STATUSES = new Set([401, 403, 405, 406, 429, 503]);

export function policyGap(obs: Observation): PolicyGap {
  if (!obs.cloaking.tested) return { gap: false, reason: null };
  if (obs.access['GPTBot'] === false) return { gap: false, reason: null };
  if (!REFUSAL_STATUSES.has(obs.cloaking.botStatus)) return { gap: false, reason: null };
  return {
    gap: true,
    reason: `robots.txt permits GPTBot, and a request identifying as GPTBot was refused with HTTP ${obs.cloaking.botStatus}.`,
  };
}

// --- percentile -------------------------------------------------------------

/**
 * Where a score sits in the whole index, as a percentage of scored sites it beats.
 *
 * This is what makes a badge mean anything. "84 out of 100" is a number with no referent.
 * "Better than 91% of the five thousand most-visited sites on the web" is a claim.
 */
export function percentileOf(score: number, ascendingScores: number[]): number {
  if (!ascendingScores.length) return 0;
  // Count strictly below, plus half the ties. Standard midpoint rank, so a wall of
  // identical scores does not hand the whole band to whoever is sorted first.
  let below = 0;
  let equal = 0;
  for (const s of ascendingScores) {
    if (s < score) below++;
    else if (s === score) equal++;
  }
  return Math.round(((below + equal / 2) / ascendingScores.length) * 100);
}
