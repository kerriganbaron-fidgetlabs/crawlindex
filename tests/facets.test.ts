import { describe, expect, it } from 'vitest';
import { AGENTS, TIER1 } from '../lib/agents';
import { accessArchetype, percentileOf, policyGap, policyPosture } from '../lib/facets';
import { brandLabel, groupByEntity, groupSize } from '../lib/entities';
import { badgeTier, isEmbeddable, badgeTitle, renderBadge, BADGE_THEMES, badgeSlug, parseBadgeSlug } from '../lib/badge';
import type { DomainRow } from '../lib/dataset';
import type { Observation } from '../lib/types';

function obs(over: Partial<Observation> = {}): Observation {
  const access: Record<string, boolean> = {};
  for (const a of AGENTS) access[a.token] = true;
  return {
    domain: 'example.com',
    observedAt: '2026-08-09T00:00:00.000Z',
    registryVersion: '1.0.0',
    probeVersion: '3.0.0',
    vantage: 'test',
    reachable: true,
    httpStatus: 200,
    finalUrl: 'https://example.com/',
    error: null,
    optedOut: false,
    https: true,
    control: { challenged: false, reason: null, kind: 'none' },
    robots: {
      present: true,
      blocksAllCrawlers: false,
      sitemapDeclared: true,
      namedTokens: [],
      groupCount: 1,
      usesAllowRules: false,
      crawlDelay: null,
      bytes: 100,
    },
    access,
    tier1Blocked: [],
    tier2Blocked: [],
    cloaking: { tested: true, browserBytes: 50_000, botStatus: 200, botBytes: 50_000, detected: false },
    llmsTxt: { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 },
    agentsMd: { present: false, bytes: 0 },
    structured: { jsonLdTypes: [], hasOrganization: false, hasWebSite: false },
    content: {
      title: 'Example',
      lang: 'en',
      ssrTextLength: 4000,
      h1Count: 1,
      landmarks: ['main'],
      imagesTotal: 0,
      imagesWithAlt: 0,
      feed: false,
      canonical: true,
      metaNoindex: false,
    },
    stack: { platform: null, network: null, server: null },
    security: { hsts: false, csp: false, xContentTypeOptions: false },
    ...over,
  };
}

const blocking = (tokens: string[]): Partial<Observation> => {
  const access: Record<string, boolean> = {};
  for (const a of AGENTS) access[a.token] = !tokens.includes(a.token);
  return {
    access,
    tier1Blocked: TIER1.filter((a) => tokens.includes(a.token)).map((a) => a.token),
    robots: { ...obs().robots, namedTokens: tokens },
  };
};

describe('policy posture', () => {
  it('calls it absent when there is no robots.txt', () => {
    expect(policyPosture(obs({ robots: { ...obs().robots, present: false } }))).toBe('absent');
  });

  it('calls it blanket when one rule covers every crawler', () => {
    expect(policyPosture(obs({ robots: { ...obs().robots, blocksAllCrawlers: true } }))).toBe('blanket');
  });

  it('calls it deliberate when an AI crawler is named', () => {
    expect(policyPosture(obs({ robots: { ...obs().robots, namedTokens: ['GPTBot'] } }))).toBe('deliberate');
  });

  it('calls it inherited when robots.txt exists and names no AI crawler', () => {
    // The central claim of the whole index rests on this distinction being right: a site
    // with generic rules did not decide anything about AI, its platform did.
    expect(policyPosture(obs())).toBe('inherited');
  });
});

describe('access archetype', () => {
  it('separates a site that blocks training from one that blocks everything', () => {
    const trainingTokens = TIER1.filter((a) => a.role === 'training').map((a) => a.token);
    expect(accessArchetype(obs(blocking(trainingTokens)))).toBe('no-training');
    expect(accessArchetype(obs(blocking(TIER1.map((a) => a.token))))).toBe('walled');
  });

  it('reports an open site as open', () => {
    expect(accessArchetype(obs())).toBe('open');
  });

  it('reports a metered site as metered, never as blocked', () => {
    // 402 is a live commercial policy, not a refusal. Averaging the two misdescribes both.
    const metered = obs({
      control: { challenged: true, reason: 'HTTP 402', kind: 'payment-required' },
      ...blocking(TIER1.map((a) => a.token)),
    });
    expect(accessArchetype(metered)).toBe('metered');
  });

  it('reports a site with no robots.txt as undeclared rather than open', () => {
    expect(accessArchetype(obs({ robots: { ...obs().robots, present: false } }))).toBe('undeclared');
  });
});

describe('the policy gap', () => {
  it('fires when robots permits GPTBot and the server refuses it', () => {
    const g = policyGap(
      obs({ cloaking: { tested: true, browserBytes: 40_000, botStatus: 403, botBytes: 0, detected: true } }),
    );
    expect(g.gap).toBe(true);
    expect(g.reason).toContain('403');
  });

  it('does not fire when robots.txt already blocks GPTBot', () => {
    // Blocked and refused is consistent, not a contradiction. Reporting it as one would
    // accuse the most honest operators on the web of dishonesty.
    const g = policyGap(
      obs({
        ...blocking(['GPTBot']),
        cloaking: { tested: true, browserBytes: 40_000, botStatus: 403, botBytes: 0, detected: true },
      }),
    );
    expect(g.gap).toBe(false);
  });

  it('does not fire on a merely thin response', () => {
    // Only an outright refusal counts. A dynamic page varies legitimately and a false
    // accusation here would be expensive.
    const g = policyGap(
      obs({ cloaking: { tested: true, browserBytes: 40_000, botStatus: 200, botBytes: 900, detected: true } }),
    );
    expect(g.gap).toBe(false);
  });

  it('does not fire when the comparison never ran', () => {
    expect(policyGap(obs({ cloaking: { tested: false, browserBytes: 0, botStatus: 0, botBytes: 0, detected: false } })).gap).toBe(
      false,
    );
  });
});

describe('percentile', () => {
  const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it('is monotonic with score', () => {
    let last = -1;
    for (const s of scores) {
      const p = percentileOf(s, scores);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it('splits ties at the midpoint rather than handing the band to one of them', () => {
    const tied = [50, 50, 50, 50];
    expect(percentileOf(50, tied)).toBe(50);
  });

  it('returns 0 for an empty population instead of dividing by zero', () => {
    expect(percentileOf(80, [])).toBe(0);
  });
});

describe('entity grouping', () => {
  const row = (domain: string, score: number, blocked: string[] = [], network = 'akamai'): DomainRow =>
    ({
      domain,
      rank: 100,
      firstSeen: '2026-01-01',
      tld: domain.split('.').slice(1).join('.'),
      obs: obs({ tier1Blocked: blocked, stack: { platform: null, network, server: null } }),
      score: { total: score, grade: 'F', bands: [], lines: [], rubricVersion: '2.0.0', partial: false },
      posture: 'deliberate',
      archetype: 'walled',
      gap: { gap: false, reason: null },
      percentile: 1,
    }) as unknown as DomainRow;

  it('reads the brand label out of a multi-part public suffix', () => {
    expect(brandLabel('amazon.co.uk')).toBe('amazon');
    expect(brandLabel('amazon.com.br')).toBe('amazon');
    expect(brandLabel('amazon.com')).toBe('amazon');
    expect(brandLabel('news.bbc.co.uk')).toBe('bbc');
  });

  it('collapses one operator across country domains into one row', () => {
    const groups = groupByEntity([
      row('amazon.com', 8, ['GPTBot']),
      row('amazon.co.uk', 8, ['GPTBot']),
      row('amazon.de', 8, ['GPTBot']),
      row('bbc.co.uk', 40, []),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].lead.domain).toBe('amazon.com');
    expect(groupSize(groups[0])).toBe(3);
  });

  it('never loses a domain', () => {
    const rows = [row('amazon.com', 8, ['GPTBot']), row('amazon.de', 8, ['GPTBot']), row('bbc.co.uk', 40)];
    const seen = groupByEntity(rows).flatMap((g) => [g.lead, ...g.others]);
    expect(seen).toHaveLength(rows.length);
    expect(new Set(seen.map((r) => r.domain))).toEqual(new Set(rows.map((r) => r.domain)));
  });

  it('keeps input order, so a ranked list stays ranked', () => {
    const groups = groupByEntity([row('aaaa.com', 10), row('bbbb.com', 20), row('cccc.com', 30)]);
    expect(groups.map((g) => g.lead.domain)).toEqual(['aaaa.com', 'bbbb.com', 'cccc.com']);
  });

  it('does not group a shared brand when the policies differ', () => {
    // Same word, different block lists. Grouping these would merge two companies.
    const groups = groupByEntity([row('orange.fr', 30, ['GPTBot']), row('orange.com', 30, [])]);
    expect(groups).toHaveLength(2);
  });

  it('refuses to group on a very short label', () => {
    const groups = groupByEntity([row('abc.com', 30), row('abc.de', 30)]);
    expect(groups).toHaveLength(2);
  });
});

describe('the badge is an award', () => {
  it('only issues an embeddable mark at grade B or better', () => {
    expect(isEmbeddable(badgeTier(95, 'A'))).toBe(true);
    expect(isEmbeddable(badgeTier(80, 'B'))).toBe(true);
    expect(isEmbeddable(badgeTier(65, 'C'))).toBe(false);
    expect(isEmbeddable(badgeTier(20, 'F'))).toBe(false);
    expect(isEmbeddable(badgeTier(null, null))).toBe(false);
  });

  it('renders valid, self-contained SVG in every variant and theme', () => {
    const input = { domain: 'example.com', score: 92, grade: 'A', percentile: 97, measuredOn: '2026-08-10', partial: false };
    for (const variant of ['flat', 'seal', 'card'] as const) {
      for (const theme of BADGE_THEMES) {
        const svg = renderBadge(variant, input, theme);
        const where = `${variant}/${theme}`;
        expect(svg.startsWith('<svg'), where).toBe(true);
        expect(svg.trimEnd().endsWith('</svg>'), where).toBe(true);
        // A mark embedded on someone else's page must fetch nothing and run nothing. The
        // xmlns declaration is a namespace identifier, not a request, so it is exempt.
        const withoutNamespace = svg.replace(/xmlns="[^"]*"/g, '');
        expect(withoutNamespace, where).not.toMatch(/https?:\/\//);
        expect(svg, where).not.toMatch(/<(script|image|foreignObject)\b/i);
        expect(svg, where).not.toMatch(/@import|url\(/i);
        expect(svg, where).toContain('role="img"');
        expect(svg, where).toContain('<title>');
      }
    }
  });

  /** The complaint that prompted the rebuild: the wordmark was illegible and unbranded. */
  it('carries a legible two-tone wordmark in the site’s own treatment', () => {
    const input = { domain: 'example.com', score: 92, grade: 'A', percentile: 97, measuredOn: '2026-08-10', partial: false };
    for (const variant of ['flat', 'seal', 'card'] as const) {
      const svg = renderBadge(variant, input, 'light');
      expect(svg, variant).toContain('crawl<tspan');
      expect(svg, variant).toContain('>index</tspan>');
      // The rust accent, same value as the site header. The old mark was flat grey.
      expect(svg, variant).toContain('#a33d17');
      // Big enough to read. The old one was 8px.
      const size = Number(svg.match(/font-size="(\d+(?:\.\d+)?)"[^>]*font-weight="700"[^>]*>crawl/)?.[1] ?? 0);
      expect(size, `${variant} wordmark size`).toBeGreaterThanOrEqual(14);
    }
  });

  it('pins the palette when a theme is chosen, and defers when it is auto', () => {
    const input = { domain: 'example.com', score: 92, grade: 'A', percentile: 97, measuredOn: '2026-08-10', partial: false };
    const light = renderBadge('flat', input, 'light');
    const dark = renderBadge('flat', input, 'dark');
    const auto = renderBadge('flat', input, 'auto');

    // Pinned themes are literal hex with no media query to second-guess them.
    expect(light).not.toContain('prefers-color-scheme');
    expect(dark).not.toContain('prefers-color-scheme');
    expect(light).toContain('#fbfaf7');
    expect(dark).toContain('#17150f');
    expect(light).not.toBe(dark);

    // Auto ships both palettes and lets the viewer's setting choose.
    expect(auto).toContain('prefers-color-scheme:dark');
    expect(auto).toContain('#fbfaf7');
    expect(auto).toContain('#17150f');
  });

  it('round-trips the theme through the filename', () => {
    // Theme rides in the slug because a [theme] route segment would collide with [slug],
    // which builds fine and then 500s every route on the site.
    for (const theme of BADGE_THEMES) {
      const slug = badgeSlug('example.co.uk', theme);
      expect(parseBadgeSlug(slug)).toEqual({ domain: 'example.co.uk', theme });
    }
    expect(badgeSlug('example.com', 'auto')).toBe('example.com.svg');
    expect(badgeSlug('example.com', 'dark')).toBe('example.com.dark.svg');
  });

  it('does not mistake a domain that ends in a theme word', () => {
    // `light.com` must not parse as the light theme of a domain called "".
    expect(parseBadgeSlug('light.com.svg')).toEqual({ domain: 'light.com', theme: 'auto' });
    expect(parseBadgeSlug('dark.svg')).toEqual({ domain: 'dark', theme: 'auto' });
  });

  it('escapes a hostile domain rather than injecting it', () => {
    const svg = renderBadge('card', {
      domain: 'evil.com"><script>alert(1)</script>',
      score: 80,
      grade: 'B',
      percentile: 50,
      measuredOn: '2026-08-10',
      partial: false,
    });
    expect(svg).not.toContain('<script>');
  });

  it('describes an unscored domain without inventing a number', () => {
    const title = badgeTitle({ domain: 'x.com', score: null, grade: null, percentile: null, measuredOn: null, partial: false });
    expect(title).toContain('not currently scored');
    expect(title).not.toMatch(/\b0\b/);
  });
});
