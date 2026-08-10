import { describe, expect, it } from 'vitest';
import { AGENTS, TIER1 } from '../lib/agents';
import { withAccess, type StoredRecord } from '../lib/dataset';
import { scoreObservation } from '../lib/score';
import { diff } from '../worker/crawl';
import type { Observation } from '../lib/types';

/**
 * Change detection.
 *
 * Every test here corresponds to a defect that reached production. The rescoring bug
 * published 682 fictional "score fell" records against 50 rises in one night, and the
 * vantage bug before it produced 25 phantom changes per 150 domains. `diff()` had no test
 * file at all until this one.
 */

function observation(over: Partial<Observation> = {}): Observation {
  const access: Record<string, boolean> = {};
  for (const a of AGENTS) access[a.token] = true;
  return {
    domain: 'example.com',
    observedAt: '2026-08-11T00:00:00.000Z',
    registryVersion: '1.0.0',
    probeVersion: '3.0.0',
    vantage: 'gha-ubuntu',
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
    llmsTxt: { present: true, specValid: true, issues: [], bytes: 200, linkCount: 3 },
    agentsMd: { present: true, bytes: 200 },
    structured: { jsonLdTypes: ['Organization', 'WebSite'], hasOrganization: true, hasWebSite: true },
    content: {
      title: 'Example',
      lang: 'en',
      ssrTextLength: 4000,
      h1Count: 1,
      landmarks: ['main', 'nav', 'footer'],
      imagesTotal: 0,
      imagesWithAlt: 0,
      feed: false,
      canonical: true,
      metaNoindex: false,
    },
    signals: {
      licenseUrl: null,
      licenseLink: false,
      contentSignal: null,
      crawlerPrice: null,
      agentCard: false,
      agentCardBytes: 0,
      datePublished: true,
      dateModified: true,
      hasAuthor: true,
      h2Count: 3,
      h3Count: 2,
      listCount: 1,
      tableCount: 0,
      textRatio: 0.3,
    },
    stack: { platform: null, network: null, server: null },
    security: { hsts: false, csp: false, xContentTypeOptions: false },
    ...over,
  };
}

/** An observation blocking the given tokens, with the access map kept consistent. */
function blocking(tokens: string[]): Observation {
  const access: Record<string, boolean> = {};
  for (const a of AGENTS) access[a.token] = !tokens.includes(a.token);
  return observation({
    access,
    tier1Blocked: TIER1.filter((a) => tokens.includes(a.token)).map((a) => a.token),
  });
}

/**
 * How a record actually reaches `diff()`: written to disk with `access` stripped by
 * `stableObs`, then read back. Reproducing that here is the whole point, because the bug
 * only appears on the round trip.
 */
function archived(obs: Observation): StoredRecord {
  const { access: _dropped, ...withoutAccess } = obs;
  return {
    domain: obs.domain,
    rank: 1,
    firstSeen: '2026-01-01',
    obs: withoutAccess as StoredRecord['obs'],
  };
}

describe('an archived record rescores to the same number it was published with', () => {
  /**
   * The invariant the rescoring bug broke. `stableObs` drops `access` on write, and
   * `scoreObservation` reads a missing token as "allowed", so anything that rescores an
   * archived observation without going through `withAccess` awards a free 38 points.
   */
  it('holds for a site that blocks everything', () => {
    const live = blocking(TIER1.map((a) => a.token));
    const liveScore = scoreObservation(live).total;
    const rescored = scoreObservation(withAccess(archived(live).obs)).total;
    expect(rescored).toBe(liveScore);
  });

  it('holds across the whole blocking spectrum', () => {
    for (let n = 0; n <= TIER1.length; n++) {
      const live = blocking(TIER1.slice(0, n).map((a) => a.token));
      const rescored = scoreObservation(withAccess(archived(live).obs)).total;
      expect(rescored, `${n} crawlers blocked`).toBe(scoreObservation(live).total);
    }
  });

  it('proves the old approach was wrong, so this cannot silently regress', () => {
    // Pinning the defect itself. If someone reintroduces `access: {}` this stays true and
    // the tests above start failing, which is the pairing that makes the bug legible.
    const live = blocking(TIER1.map((a) => a.token));
    const naive = scoreObservation({ ...archived(live).obs, access: {} } as Observation).total!;
    expect(naive).toBeGreaterThan(scoreObservation(live).total!);
  });
});

describe('no change is reported when nothing changed', () => {
  it('emits nothing for an identical re-measurement', () => {
    const obs = blocking(['GPTBot', 'ClaudeBot']);
    const out = diff(archived(obs), obs, scoreObservation(obs));
    expect(out).toEqual([]);
  });

  it('emits nothing for a heavily blocked site measured twice', () => {
    // The exact shape that produced "Score fell 82 points to 7" every single night.
    const obs = blocking(TIER1.map((a) => a.token));
    const out = diff(archived(obs), obs, scoreObservation(obs));
    expect(out.filter((c) => c.kind === 'score')).toEqual([]);
  });
});

describe('a real change is still reported', () => {
  it('reports newly blocked answer-surface crawlers', () => {
    const before = observation();
    const after = blocking(['GPTBot', 'ClaudeBot']);
    const out = diff(archived(before), after, scoreObservation(after));
    const access = out.find((c) => c.kind === 'access');
    expect(access?.summary).toContain('now blocks');
    expect(access?.summary).toContain('GPTBot');
  });

  it('reports a genuine score movement above the noise floor', () => {
    const before = observation();
    const after = blocking(TIER1.map((a) => a.token));
    const out = diff(archived(before), after, scoreObservation(after));
    const score = out.find((c) => c.kind === 'score');
    expect(score?.summary).toContain('fell');
  });

  it('stays silent for drift below the noise floor', () => {
    // Landmarks are worth 2, under SCORE_NOISE_FLOOR of 3. A one-point wobble is not news,
    // and a feed that reports it is a feed nobody reads.
    const before = observation();
    const after = observation({ content: { ...observation().content, landmarks: ['main'] } });
    expect(scoreObservation(before).total! - scoreObservation(after).total!).toBeLessThan(3);
    expect(diff(archived(before), after, scoreObservation(after))).toEqual([]);
  });

  it('reports a surface change even when the score barely moves', () => {
    // agents.md is worth 4, so this crosses the floor and should report both facts.
    const before = observation();
    const after = observation({ agentsMd: { present: false, bytes: 0 } });
    const out = diff(archived(before), after, scoreObservation(after));
    expect(out.find((c) => c.kind === 'surface')?.summary).toContain('agents.md removed');
    expect(out.find((c) => c.kind === 'score')?.summary).toContain('fell 4 points');
  });
});

/**
 * Suppression. Both of these rules already existed in the crawler and neither had a test,
 * despite the vantage one having already produced 25 phantom changes per 150 domains in
 * production. The positive control matters as much as the two negatives: a suppression rule
 * that accidentally swallows everything looks exactly like a quiet week.
 */
describe('our own changes are never attributed to the site', () => {
  it('suppresses every diff across a probe version change', () => {
    const before = observation({ probeVersion: '2.0.0' });
    const after = blocking(TIER1.map((a) => a.token));
    expect(diff(archived(before), after, scoreObservation(after))).toEqual([]);
  });

  it('suppresses every diff across a vantage change', () => {
    const before = observation({ vantage: 'local' });
    const after = blocking(TIER1.map((a) => a.token));
    expect(diff(archived(before), after, scoreObservation(after))).toEqual([]);
  });

  it('does not suppress when probe and vantage both match', () => {
    const before = observation();
    const after = blocking(TIER1.map((a) => a.token));
    expect(diff(archived(before), after, scoreObservation(after)).length).toBeGreaterThan(0);
  });

  it('treats a first measurement as a baseline, not an event', () => {
    const obs = blocking(TIER1.map((a) => a.token));
    expect(diff(undefined, obs, scoreObservation(obs))).toEqual([]);
  });
});
