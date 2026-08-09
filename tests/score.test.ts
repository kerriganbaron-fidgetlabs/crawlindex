import { describe, expect, it } from 'vitest';
import { AGENTS, TIER1, TIER2 } from '../lib/agents';
import { MAX_POINTS, scoreObservation } from '../lib/score';
import type { Observation } from '../lib/types';

function observation(over: Partial<Observation> = {}): Observation {
  const access: Record<string, boolean> = {};
  for (const a of AGENTS) access[a.token] = true;
  return {
    domain: 'example.com',
    observedAt: '2026-08-09T00:00:00.000Z',
    registryVersion: '1.0.0',
    probeVersion: '1.0.0',
    reachable: true,
    httpStatus: 200,
    finalUrl: 'https://example.com/',
    error: null,
    optedOut: false,
    control: { challenged: false, reason: null, kind: 'none' as const },
    robots: { present: true, blocksAllCrawlers: false, sitemapDeclared: true, namedTokens: [] },
    access,
    tier1Blocked: [],
    tier2Blocked: [],
    cloaking: { tested: true, browserBytes: 50_000, botStatus: 200, botBytes: 50_000, detected: false },
    llmsTxt: { present: true, specValid: true, issues: [] },
    agentsMd: { present: true },
    structured: { jsonLdTypes: ['Organization', 'WebSite', 'BreadcrumbList'], hasOrganization: true, hasWebSite: true },
    content: {
      title: 'Example',
      ssrTextLength: 4000,
      h1Count: 1,
      landmarks: ['main', 'nav', 'footer'],
      imagesTotal: 10,
      imagesWithAlt: 10,
    },
    ...over,
  };
}

describe('rubric shape', () => {
  it('sums to exactly 100 points', () => {
    expect(MAX_POINTS).toBe(100);
    const s = scoreObservation(observation());
    expect(s.bands.reduce((a, b) => a + b.max, 0)).toBe(100);
    expect(s.lines.reduce((a, l) => a + l.max, 0)).toBe(100);
  });

  it('awards a perfect score to a fully ready site', () => {
    const s = scoreObservation(observation());
    expect(s.total).toBe(100);
    expect(s.grade).toBe('A');
  });
});

describe('unobservable is not zero', () => {
  it('scores an unreachable domain as null, never 0', () => {
    const s = scoreObservation(observation({ reachable: false, error: 'no response' }));
    expect(s.total).toBeNull();
    expect(s.grade).toBeNull();
  });
});

describe('access band', () => {
  it('costs the most when answer-surface crawlers are blocked', () => {
    const access: Record<string, boolean> = {};
    for (const a of AGENTS) access[a.token] = a.tier !== 1;
    const s = scoreObservation(
      observation({ access, tier1Blocked: TIER1.map((a) => a.token) }),
    );
    // All 30 tier-1 points lost, nothing else.
    expect(s.total).toBe(70);
    expect(s.bands.find((b) => b.id === 'access')!.earned).toBe(15);
  });

  it('costs less when only secondary crawlers are blocked', () => {
    const access: Record<string, boolean> = {};
    for (const a of AGENTS) access[a.token] = a.tier !== 2;
    const s = scoreObservation(
      observation({ access, tier2Blocked: TIER2.map((a) => a.token) }),
    );
    expect(s.total).toBe(92);
  });

  it('penalises detected cloaking', () => {
    const s = scoreObservation(
      observation({
        cloaking: { tested: true, browserBytes: 50_000, botStatus: 403, botBytes: 0, detected: true },
      }),
    );
    expect(s.total).toBe(93);
  });

  it('does not penalise a site when the cloaking test could not run', () => {
    const s = scoreObservation(
      observation({
        cloaking: { tested: false, browserBytes: 0, botStatus: 0, botBytes: 0, detected: false },
      }),
    );
    expect(s.total).toBe(100);
  });
});

describe('surface band', () => {
  it('gives partial credit for an off-spec llms.txt', () => {
    const s = scoreObservation(
      observation({ llmsTxt: { present: true, specValid: false, issues: ['no H1 title'] } }),
    );
    expect(s.total).toBe(96);
  });

  it('charges a missing llms.txt once, not twice', () => {
    const s = scoreObservation(
      observation({ llmsTxt: { present: false, specValid: false, issues: [] } }),
    );
    expect(s.total).toBe(88);
    expect(s.partial).toBe(false);
  });
});

describe('a challenged control request is never charged to the site', () => {
  const challenged = () =>
    observation({
      control: { challenged: true, reason: 'Cloudflare interstitial', kind: 'bot-challenge' as const },
      // Everything below is what a bot wall returns, not what the site publishes.
      llmsTxt: { present: false, specValid: false, issues: [] },
      agentsMd: { present: false },
      structured: { jsonLdTypes: [], hasOrganization: false, hasWebSite: false },
      content: { title: null, ssrTextLength: 6, h1Count: 0, landmarks: [], imagesTotal: 0, imagesWithAlt: 0 },
      cloaking: { tested: true, browserBytes: 8000, botStatus: 403, botBytes: 1500, detected: true },
    });

  it('excludes body-derived lines instead of scoring them zero', () => {
    const s = scoreObservation(challenged());
    expect(s.partial).toBe(true);
    const excluded = s.lines.filter((l) => !l.available).map((l) => l.id);
    expect(excluded).toEqual(
      expect.arrayContaining(['no-cloaking', 'llms-txt', 'agents-md', 'schema-org', 'ssr-text', 'landmarks']),
    );
    // robots.txt is a separate fetch of a separate path and stays trustworthy.
    expect(s.lines.find((l) => l.id === 'tier1-access')!.available).toBe(true);
    expect(s.lines.find((l) => l.id === 'robots')!.available).toBe(true);
  });

  it('still reports a full score when access policy is open', () => {
    // 38 of 38 observable access points, 8 of 8 observable surface points.
    const s = scoreObservation(challenged());
    expect(s.total).toBe(100);
  });

  it('reports the real cost when the site also blocks every crawler', () => {
    const s = scoreObservation({
      ...challenged(),
      access: Object.fromEntries(AGENTS.map((a) => [a.token, false])),
      tier1Blocked: TIER1.map((a) => a.token),
      tier2Blocked: TIER2.map((a) => a.token),
      robots: { present: true, blocksAllCrawlers: true, sitemapDeclared: false, namedTokens: [] },
    });
    // Only the 3 robots.txt points survive, out of 46 observable.
    expect(s.total).toBe(7);
    expect(s.partial).toBe(true);
  });

  it('returns null rather than a number when nothing at all is observable', () => {
    const s = scoreObservation({
      ...challenged(),
      // Force every line unavailable by removing the registry-independent ones too.
      reachable: false,
    });
    expect(s.total).toBeNull();
  });
});

describe('structure band', () => {
  it('gives half credit for thin server-rendered text', () => {
    const s = scoreObservation(observation({ content: { ...observation().content, ssrTextLength: 200 } }));
    expect(s.total).toBe(96);
  });

  it('gives no credit for a client-rendered shell', () => {
    const s = scoreObservation(observation({ content: { ...observation().content, ssrTextLength: 20 } }));
    expect(s.total).toBe(92);
  });
});

describe('determinism', () => {
  it('reproduces an identical score from the same archived observation', () => {
    const obs = observation({
      llmsTxt: { present: false, specValid: false, issues: [] },
      content: { ...observation().content, ssrTextLength: 900, h1Count: 3 },
    });
    const a = scoreObservation(obs);
    const b = scoreObservation(JSON.parse(JSON.stringify(obs)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('never returns a total outside 0..100', () => {
    const s = scoreObservation(
      observation({
        access: Object.fromEntries(AGENTS.map((a) => [a.token, false])),
        tier1Blocked: TIER1.map((a) => a.token),
        tier2Blocked: TIER2.map((a) => a.token),
        robots: { present: false, blocksAllCrawlers: true, sitemapDeclared: false, namedTokens: [] },
        cloaking: { tested: true, browserBytes: 1000, botStatus: 403, botBytes: 0, detected: true },
        llmsTxt: { present: false, specValid: false, issues: [] },
        agentsMd: { present: false },
        structured: { jsonLdTypes: [], hasOrganization: false, hasWebSite: false },
        content: { title: null, ssrTextLength: 0, h1Count: 0, landmarks: [], imagesTotal: 0, imagesWithAlt: 0 },
      }),
    );
    expect(s.total).toBe(0);
    expect(s.grade).toBe('F');
  });
});
