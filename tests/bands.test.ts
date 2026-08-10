import { describe, expect, it } from 'vitest';
import { BANDS, bandBySlug, bandOfScore, gradeOfScore, GRADE_MEANING, GRADE_STARTS } from '../lib/bands';
import { scoreObservation } from '../lib/score';
import { AGENTS } from '../lib/agents';
import type { Observation } from '../lib/types';

describe('bands cover the whole range exactly once', () => {
  it('has ten contiguous bands from 0 to 100', () => {
    expect(BANDS).toHaveLength(10);
    expect(BANDS[0].from).toBe(0);
    expect(BANDS[9].to).toBe(100);
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i].from).toBe(BANDS[i - 1].to + (i === 9 ? 1 : 1));
    }
  });

  it('places every possible score in exactly one band', () => {
    for (let s = 0; s <= 100; s++) {
      const band = bandOfScore(s);
      expect(s, `score ${s}`).toBeGreaterThanOrEqual(band.from);
      expect(s, `score ${s}`).toBeLessThanOrEqual(band.to);
    }
  });

  it('resolves every slug', () => {
    for (const b of BANDS) expect(bandBySlug(b.slug)?.index).toBe(b.index);
    expect(bandBySlug('nonsense')).toBeUndefined();
  });
});

/**
 * The band grades duplicate the thresholds in `grade()`. That duplication is deliberate
 * (one maps a score to a letter, the other describes bands as objects) and this is what
 * stops the two drifting apart.
 */
describe('band grades agree with the rubric', () => {
  it('uses the same boundaries the scorer does', () => {
    expect(gradeOfScore(90)).toBe('A');
    expect(gradeOfScore(89)).toBe('B');
    expect(gradeOfScore(75)).toBe('B');
    expect(gradeOfScore(74)).toBe('C');
    expect(gradeOfScore(60)).toBe('C');
    expect(gradeOfScore(59)).toBe('D');
    expect(gradeOfScore(40)).toBe('D');
    expect(gradeOfScore(39)).toBe('F');
    expect(gradeOfScore(0)).toBe('F');
  });

  it('matches the grade a real perfect observation receives', () => {
    const access: Record<string, boolean> = {};
    for (const a of AGENTS) access[a.token] = true;
    const perfect = {
      domain: 'example.com',
      observedAt: '2026-08-12T00:00:00.000Z',
      registryVersion: '1.0.0',
      probeVersion: '3.0.0',
      vantage: 'test',
      reachable: true,
      httpStatus: 200,
      finalUrl: 'https://example.com/',
      error: null,
      optedOut: false,
      https: true,
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
      structured: { jsonLdTypes: ['Organization', 'WebSite', 'Article'], hasOrganization: true, hasWebSite: true },
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
        licenseUrl: 'https://example.com/l.xml',
        licenseLink: true,
        contentSignal: 'search=yes',
        crawlerPrice: null,
        agentCard: true,
        agentCardBytes: 10,
        datePublished: true,
        dateModified: true,
        hasAuthor: true,
        h2Count: 2,
        h3Count: 1,
        listCount: 1,
        tableCount: 0,
        textRatio: 0.3,
      },
      stack: { platform: null, network: null, server: null },
      security: { hsts: false, csp: false, xContentTypeOptions: false },
    } as Observation;

    const s = scoreObservation(perfect);
    expect(s.total).toBe(100);
    expect(bandOfScore(s.total!).grade).toBe(s.grade);
  });
});

describe('grade boundaries', () => {
  it('are the rubric’s real thresholds, not bucket edges', () => {
    // 75 falls inside the 70-79 bucket. Snapping it to 80 would draw the rubric in the
    // wrong place, so the chart uses these score positions directly.
    expect(GRADE_STARTS.map((g) => g.at)).toEqual([40, 60, 75, 90]);
    for (const { at, grade } of GRADE_STARTS) {
      expect(gradeOfScore(at), `${at} opens ${grade}`).toBe(grade);
      expect(gradeOfScore(at - 1), `${at - 1} is below ${grade}`).not.toBe(grade);
    }
  });

  /**
   * The labelling bug this replaced: bands took the grade of their lowest score, so
   * /scores/70-79 announced "grade C" while listing sites whose own page showed a B.
   */
  it('names every grade a band actually contains', () => {
    const straddling = BANDS.filter((b) => b.straddles);
    expect(straddling.map((b) => b.slug)).toEqual(['70-79']);
    expect(straddling[0].grades).toEqual(['C', 'B']);
    expect(straddling[0].gradeLabel).toBe('grades C and B');
  });

  it('never claims a grade a band does not contain', () => {
    for (const b of BANDS) {
      for (let s = b.from; s <= b.to; s++) {
        expect(b.grades, `score ${s} in band ${b.slug}`).toContain(gradeOfScore(s));
      }
    }
  });

  it('gives every grade a published meaning', () => {
    for (const b of BANDS) {
      for (const g of b.grades) expect(GRADE_MEANING[g], g).toBeTruthy();
    }
  });
});
