/**
 * robots.txt parsing, group-aware.
 *
 * The rules that matter for this index:
 *  - Consecutive User-agent lines share one group.
 *  - A group naming the token explicitly beats the `*` group entirely. It does not merge.
 *  - Longest matching path rule wins. On equal length, Allow beats Disallow.
 *  - `Disallow:` with an empty value means "allow everything", not "block everything".
 *  - Absence of any applicable rule means allowed.
 *
 * These are the Google/RFC 9309 semantics. Getting them wrong would silently
 * misreport thousands of sites, so `tests/robots.test.ts` pins every clause above.
 */

export type RobotsGroup = {
  agents: string[];
  disallow: string[];
  allow: string[];
};

export type ParsedRobots = {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** True when the fetch produced something that actually parses as robots.txt. */
  present: boolean;
};

export const EMPTY_ROBOTS: ParsedRobots = { groups: [], sitemaps: [], present: false };

export function parseRobots(txt: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const idx = line.indexOf(':');
    if (idx < 0) continue;

    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (field === 'disallow') current.disallow.push(value);
    if (field === 'allow') current.allow.push(value);
  }

  return { groups, sitemaps, present: true };
}

/** Length of the match if `rule` applies to `path`, else -1. Supports a trailing `*`. */
function matchLength(rule: string, path: string): number {
  if (rule === '') return -1; // "Disallow:" is an explicit no-op, never a match.
  const prefix = rule.endsWith('*') ? rule.slice(0, -1) : rule;
  return path.startsWith(prefix) ? prefix.length : -1;
}

/**
 * Is `token` permitted to fetch `path` under these rules?
 * Returns true when no rule applies, which is the correct default for robots.txt.
 */
export function isAgentAllowed(parsed: ParsedRobots, token: string, path = '/'): boolean {
  const lower = token.toLowerCase();

  // A group naming this token wins outright. Otherwise fall back to the wildcard group.
  const specific = parsed.groups.find((g) => g.agents.includes(lower));
  const group = specific ?? parsed.groups.find((g) => g.agents.includes('*'));
  if (!group) return true;

  let bestDisallow = -1;
  for (const r of group.disallow) bestDisallow = Math.max(bestDisallow, matchLength(r, path));

  let bestAllow = -1;
  for (const r of group.allow) bestAllow = Math.max(bestAllow, matchLength(r, path));

  if (bestDisallow < 0) return true;
  // Ties go to Allow, per RFC 9309.
  return bestAllow >= bestDisallow;
}

/** True when the token is named in its own group, whether that group allows or blocks. */
export function isAgentNamed(parsed: ParsedRobots, token: string): boolean {
  const lower = token.toLowerCase();
  return parsed.groups.some((g) => g.agents.includes(lower));
}
