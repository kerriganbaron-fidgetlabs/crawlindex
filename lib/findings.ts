/**
 * Derived readings over a stored Observation.
 *
 * These are deliberately not extra probe fields. Everything here is computable from
 * evidence already archived, so adding a reading never costs a re-crawl and never
 * invalidates historical rows.
 */

import type { Observation } from './types';

/**
 * The finding worth reporting: robots.txt says the crawler may read the site, and then
 * the server refuses it anyway.
 *
 * This is a stronger and much more specific claim than "serves crawlers different
 * content". A site whose robots.txt already blocks GPTBot and whose edge also blocks it
 * is simply consistent, and reporting that as cloaking would inflate the number with
 * sites that are being perfectly straightforward about their policy.
 */
export function contradictsStatedPolicy(obs: Observation | null): boolean {
  if (!obs?.cloaking.detected) return false;
  // The live test is run as GPTBot, so GPTBot's stated policy is the one to compare.
  return obs.access['GPTBot'] === true;
}

/** Plain-language description of a cloaking result, precise about which case it is. */
export function describeCloaking(obs: Observation | null): string | null {
  if (!obs || !obs.cloaking.detected) return null;

  const { botStatus, botBytes, browserBytes } = obs.cloaking;
  const how =
    botStatus === 403 || botStatus === 429 || botStatus === 503
      ? `refused it with HTTP ${botStatus}`
      : `served it ${botBytes.toLocaleString()} bytes against ${browserBytes.toLocaleString()} for a browser`;

  return contradictsStatedPolicy(obs)
    ? `robots.txt permits GPTBot, but the server ${how}. The stated policy and the actual behaviour disagree.`
    : `The server ${how}. This matches its robots.txt, which already blocks GPTBot.`;
}
