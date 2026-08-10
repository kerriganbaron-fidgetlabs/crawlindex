import { describe, expect, it } from 'vitest';
import { AGENTS, TIER1, TIER2 } from '../lib/agents';
import { bodyIsStub, MAX_POINTS, scoreObservation } from '../lib/score';
import type { Observation } from '../lib/types';

function signals(over: Partial<NonNullable<Observation['signals']>> = {}): NonNullable<Observation['signals']> {
  return {
    licenseUrl: 'https://example.com/licence.xml',
    licenseLink: true,
    contentSignal: 'search=yes,ai-train=no',
    crawlerPrice: null,
    agentCard: true,
    agentCardBytes: 200,
    datePublished: true,
    dateModified: true,
    hasAuthor: true,
    h2Count: 4,
    h3Count: 6,
    listCount: 3,
    tableCount: 1,
    textRatio: 0.28,
    ...over,
  };
}

function observation(over: Partial<Observation> = {}): Observation {
  const access: Record<string, boolean> = {};
  for (const a of AGENTS) access[a.token] = true;
  return {
    domain: 'example.com',
    observedAt: '2026-08-09T00:00:00.000Z',
    registryVersion: '1.0.0',
    probeVersion: '3.0.0',
    reachable: true,
    httpStatus: 200,
    finalUrl: 'https://example.com/',
    error: null,
    optedOut: false,
    https: true,
    vantage: 'test',
    control: { challenged: false, reason: null, kind: 'none' as const },
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
    llmsTxt: { present: true, specValid: true, issues: [], bytes: 200, linkCount: 3 },
    agentsMd: { present: true, bytes: 200 },
    structured: { jsonLdTypes: ['Organization', 'WebSite', 'BreadcrumbList'], hasOrganization: true, hasWebSite: true },
    content: {
      title: 'Example',
      lang: 'en',
      ssrTextLength: 4000,
      h1Count: 1,
      landmarks: ['main', 'nav', 'footer'],
      imagesTotal: 10,
      imagesWithAlt: 10,
      feed: false,
      canonical: true,
      metaNoindex: false,
    },
    signals: signals(),
    stack: { platform: null, network: null, server: null },
    security: { hsts: true, csp: false, xContentTypeOptions: true },
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
    expect(s.partial).toBe(false);
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
    const s = scoreObservation(observation({ access, tier1Blocked: TIER1.map((a) => a.token) }));
    // All 30 tier-1 points lost, nothing else.
    expect(s.total).toBe(70);
    expect(s.bands.find((b) => b.id === 'access')!.earned).toBe(15);
  });

  it('costs less when only secondary crawlers are blocked', () => {
    const access: Record<string, boolean> = {};
    for (const a of AGENTS) access[a.token] = a.tier !== 2;
    const s = scoreObservation(observation({ access, tier2Blocked: TIER2.map((a) => a.token) }));
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
        cloaking: { tested: false, browserBytes: 50_000, botStatus: 0, botBytes: 0, detected: false },
      }),
    );
    expect(s.total).toBe(100);
  });
});

describe('surface band', () => {
  it('gives partial credit for an off-spec llms.txt', () => {
    const s = scoreObservation(
      observation({ llmsTxt: { present: true, specValid: false, issues: ['no H1 title'], bytes: 100, linkCount: 0 } }),
    );
    expect(s.total).toBe(97);
  });

  it('charges a missing llms.txt once, not twice', () => {
    const s = scoreObservation(
      observation({ llmsTxt: { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 } }),
    );
    expect(s.total).toBe(91);
    expect(s.partial).toBe(false);
  });

  it('awards the licence line from robots.txt even when the body is untrusted', () => {
    const s = scoreObservation(
      observation({
        control: { challenged: true, reason: 'Cloudflare interstitial', kind: 'bot-challenge' },
        signals: signals({ licenseLink: false }),
      }),
    );
    const line = s.lines.find((l) => l.id === 'declared-licence')!;
    expect(line.available).toBe(true);
    expect(line.earned).toBe(2);
  });
});

/**
 * The rule that matters most. Every case here corresponds to a wrong number that reached
 * production or came close to it.
 */
describe('a measurement we failed to take is never charged to the site', () => {
  const challenged = () =>
    observation({
      control: { challenged: true, reason: 'Cloudflare interstitial', kind: 'bot-challenge' as const },
      // Everything below is what a bot wall returns, not what the site publishes.
      llmsTxt: { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 },
      agentsMd: { present: false, bytes: 0 },
      structured: { jsonLdTypes: [], hasOrganization: false, hasWebSite: false },
      content: { ...observation().content, title: null, ssrTextLength: 6, h1Count: 0, landmarks: [], imagesTotal: 0, imagesWithAlt: 0 },
      cloaking: { tested: true, browserBytes: 8000, botStatus: 403, botBytes: 1500, detected: true },
      signals: signals({ datePublished: false, dateModified: false, hasAuthor: false, agentCard: false, licenseLink: false }),
    });

  it('excludes body-derived lines instead of scoring them zero', () => {
    const s = scoreObservation(challenged());
    expect(s.partial).toBe(true);
    const excluded = s.lines.filter((l) => !l.available).map((l) => l.id);
    expect(excluded).toEqual(
      expect.arrayContaining([
        'no-cloaking',
        'llms-txt',
        'agents-md',
        'agent-card',
        'schema-org',
        'ssr-text',
        'landmarks',
        'dateline',
        'authorship',
      ]),
    );
    // robots.txt is a separate fetch of a separate path and stays trustworthy.
    expect(s.lines.find((l) => l.id === 'tier1-access')!.available).toBe(true);
    expect(s.lines.find((l) => l.id === 'robots')!.available).toBe(true);
    expect(s.lines.find((l) => l.id === 'content-signal')!.available).toBe(true);
  });

  it('still reports a full score when access policy is open', () => {
    const s = scoreObservation(challenged());
    expect(s.total).toBe(100);
  });

  it('reports the real cost when the site also blocks every crawler', () => {
    const s = scoreObservation({
      ...challenged(),
      access: Object.fromEntries(AGENTS.map((a) => [a.token, false])),
      tier1Blocked: TIER1.map((a) => a.token),
      tier2Blocked: TIER2.map((a) => a.token),
      robots: { ...observation().robots, blocksAllCrawlers: true, sitemapDeclared: false },
    });
    // Surviving: robots 3, licence 2, Content-Signal 2, out of 49 observable. All three
    // are read from robots.txt, which a bot wall on the homepage does not affect.
    expect(s.total).toBe(14);
    expect(s.partial).toBe(true);
  });

  it('returns null rather than a number when nothing at all is observable', () => {
    const s = scoreObservation({ ...challenged(), reachable: false });
    expect(s.total).toBeNull();
  });
});

/**
 * The Amazon bug. amazon.com answered HTTP 200 with 2,167 bytes, a `&nbsp;` title and zero
 * extractable text; nothing in the challenge detector caught it, so eight body-derived
 * lines were charged to Amazon and it scored 8 out of 100 across twenty country domains.
 */
describe('a stub response is not evidence about the site', () => {
  const stubbed = () =>
    observation({
      cloaking: { tested: true, browserBytes: 2167, botStatus: 503, botBytes: 2671, detected: true },
      content: { ...observation().content, title: null, ssrTextLength: 0, h1Count: 0, landmarks: [], imagesTotal: 0 },
      structured: { jsonLdTypes: [], hasOrganization: false, hasWebSite: false },
      llmsTxt: { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 },
      agentsMd: { present: false, bytes: 0 },
      signals: signals({ datePublished: false, dateModified: false, hasAuthor: false, agentCard: false, licenseLink: false }),
    });

  it('recognises the archived Amazon shape', () => {
    expect(bodyIsStub(stubbed())).toBe(true);
  });

  it('does not fire on a large client-rendered shell', () => {
    // tiktok.com: 362KB of HTML with 22 characters of text. A real single-page app, and
    // correctly scored zero for server-side readability rather than written off.
    const spa = observation({
      cloaking: { tested: true, browserBytes: 362_692, botStatus: 200, botBytes: 361_919, detected: false },
      content: { ...observation().content, ssrTextLength: 22 },
    });
    expect(bodyIsStub(spa)).toBe(false);
    expect(scoreObservation(spa).lines.find((l) => l.id === 'ssr-text')!.available).toBe(true);
  });

  it('does not fire when the cloaking comparison never ran', () => {
    const untested = observation({
      cloaking: { tested: false, browserBytes: 0, botStatus: 0, botBytes: 0, detected: false },
      content: { ...observation().content, ssrTextLength: 0 },
    });
    expect(bodyIsStub(untested)).toBe(false);
  });

  it('marks the assessment partial rather than scoring the stub', () => {
    const s = scoreObservation(stubbed());
    expect(s.partial).toBe(true);
    expect(s.lines.find((l) => l.id === 'ssr-text')!.available).toBe(false);
    expect(s.lines.find((l) => l.id === 'schema-org')!.available).toBe(false);
    // An open access policy plus robots-derived surface lines, all of them real.
    expect(s.total).toBe(100);
  });

  it('says a stub was served rather than blaming a bot wall', () => {
    const detail = scoreObservation(stubbed()).lines.find((l) => l.id === 'ssr-text')!.detail;
    expect(detail).toContain('stub');
    expect(detail).not.toContain('bot wall');
  });
});

/**
 * Upgrading the probe must not publish a fabricated decline for four thousand domains that
 * did nothing, and must not empty the leaderboard by marking every archived record partial.
 */
describe('records taken before probe 3', () => {
  const legacy = () => {
    const o = observation({ probeVersion: '2.0.0' });
    delete o.signals;
    return o;
  };

  it('marks the newer checks unavailable rather than zero', () => {
    const s = scoreObservation(legacy());
    for (const id of ['declared-licence', 'content-signal', 'agent-card', 'dateline', 'authorship']) {
      const line = s.lines.find((l) => l.id === id)!;
      expect(line.available, id).toBe(false);
      expect(line.detail, id).toContain('predates');
    }
  });

  it('is not called partial merely for being older than the rubric', () => {
    const s = scoreObservation(legacy());
    expect(s.partial).toBe(false);
    expect(s.total).toBe(100);
  });

  it('is still called partial when something about the site was unobservable', () => {
    const o = legacy();
    o.control = { challenged: true, reason: 'Cloudflare interstitial', kind: 'bot-challenge' };
    expect(scoreObservation(o).partial).toBe(true);
  });
});

describe('structure band', () => {
  it('gives half credit for thin server-rendered text', () => {
    const s = scoreObservation(observation({ content: { ...observation().content, ssrTextLength: 200 } }));
    expect(s.total).toBe(97);
  });

  it('gives no credit for a client-rendered shell', () => {
    const s = scoreObservation(observation({ content: { ...observation().content, ssrTextLength: 20 } }));
    expect(s.total).toBe(93);
  });

  it('charges an undated anonymous page five points', () => {
    const s = scoreObservation(
      observation({ signals: signals({ datePublished: false, dateModified: false, hasAuthor: false }) }),
    );
    expect(s.total).toBe(95);
  });
});

describe('determinism', () => {
  it('reproduces an identical score from the same archived observation', () => {
    const obs = observation({
      llmsTxt: { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 },
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
        robots: { ...observation().robots, present: false, blocksAllCrawlers: true, sitemapDeclared: false },
        cloaking: { tested: true, browserBytes: 40_000, botStatus: 403, botBytes: 0, detected: true },
        llmsTxt: { present: false, specValid: false, issues: [], bytes: 0, linkCount: 0 },
        agentsMd: { present: false, bytes: 0 },
        structured: { jsonLdTypes: [], hasOrganization: false, hasWebSite: false },
        content: { ...observation().content, title: null, ssrTextLength: 0, h1Count: 0, landmarks: [], imagesTotal: 0, imagesWithAlt: 0 },
        signals: signals({
          licenseUrl: null,
          licenseLink: false,
          contentSignal: null,
          agentCard: false,
          datePublished: false,
          dateModified: false,
          hasAuthor: false,
        }),
      }),
    );
    expect(s.total).toBe(0);
    expect(s.grade).toBe('F');
  });
});
