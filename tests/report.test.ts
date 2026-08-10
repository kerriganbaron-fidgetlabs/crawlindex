import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFrozenReport, getMonthReport, monthOf, resetReportCache, unsealedMonths } from '../lib/report';
import { writeFrozenReport } from '../worker/store';

/**
 * A sealed month is the one thing on this site that must never change. The original
 * implementation read a past month's cross-tabs from the live dataset and its change list
 * from a rolling window, so July's report said something different in September and
 * eventually lost its own changes. These tests pin the fix.
 *
 * The sentinel month is far enough in the past that it cannot collide with real data.
 */
const MONTH = '1999-01';
const DIR = join(process.cwd(), 'data', 'reports');
const FILE = join(DIR, `${MONTH}.json`);

function cleanup() {
  if (existsSync(FILE)) rmSync(FILE);
  resetReportCache();
}
afterEach(cleanup);

const sealed = (marker: string) => ({
  month: MONTH,
  frozenAt: '1999-02-01T00:00:00.000Z',
  probeVersion: '1.0.0',
  rubricVersion: '1.0.0',
  registryVersion: '1.0.0',
  days: [
    {
      day: '1999-01-01',
      totalDomains: 10,
      observed: 8,
      meanScore: 50,
      blockingAnyTier1: 4,
      blockingAllTier1: 1,
      llmsTxt: 2,
      agentsMd: 1,
      refusedGptbot: 0,
      paymentRequired: 0,
      perBot: {},
    },
  ],
  platforms: [{ id: marker, total: 1, observed: 1, blockingAny: 0, blockingAll: 0, llmsTxt: 0, meanScore: 1, blockingRate: 0 }],
  networks: [],
  changes: [{ domain: 'example.com', summary: 'now blocks GPTBot.', changedAt: '1999-01-15T00:00:00.000Z', kind: 'access' }],
  best: [{ domain: 'good.com', score: 99, grade: 'A' }],
  worst: [{ domain: 'bad.com', score: 4, grade: 'F' }],
});

describe('sealing a month', () => {
  it('writes the file the first time', () => {
    expect(writeFrozenReport(MONTH, sealed('first'))).toBe(true);
    expect(existsSync(FILE)).toBe(true);
  });

  it('refuses to overwrite an existing seal', () => {
    // This refusal IS the feature. Without it a nightly crawl would silently rewrite every
    // past month's report with today's cross-tabs, which is the bug being fixed.
    writeFrozenReport(MONTH, sealed('first'));
    expect(writeFrozenReport(MONTH, sealed('second'))).toBe(false);
    expect(readFileSync(FILE, 'utf8')).toContain('first');
    expect(readFileSync(FILE, 'utf8')).not.toContain('second');
  });
});

describe('reading a sealed month', () => {
  it('serves the sealed figures rather than recomputing them', () => {
    writeFrozenReport(MONTH, sealed('sealed-cohort'));
    resetReportCache();

    const report = getMonthReport(MONTH)!;
    expect(report.frozen).toBe(true);
    expect(report.frozenAt).toBe('1999-02-01T00:00:00.000Z');
    // Cross-tabs come from the file, not from today's dataset.
    expect(report.platforms[0].id).toBe('sealed-cohort');
    // And so does the change list, which a rolling window would have dropped by now.
    expect(report.notableChanges).toHaveLength(1);
    expect(report.best[0].domain).toBe('good.com');
  });

  it('reports the versions in force when it was sealed, not today’s', () => {
    writeFrozenReport(MONTH, sealed('x'));
    resetReportCache();
    const report = getMonthReport(MONTH)!;
    expect(report.versions.rubric).toBe('1.0.0');
    expect(report.versions.probe).toBe('1.0.0');
  });

  it('is byte-identical across repeated reads', () => {
    writeFrozenReport(MONTH, sealed('x'));
    resetReportCache();
    const a = JSON.stringify(getMonthReport(MONTH));
    resetReportCache();
    const b = JSON.stringify(getMonthReport(MONTH));
    expect(a).toBe(b);
  });

  it('survives a corrupt seal by falling back rather than crashing the build', () => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, '{ not json', 'utf8');
    resetReportCache();
    expect(() => getFrozenReport(MONTH)).not.toThrow();
    expect(getFrozenReport(MONTH)).toBeNull();
  });
});

describe('deciding what to seal', () => {
  it('never seals the month currently in progress', () => {
    const now = '2026-08-10';
    expect(unsealedMonths(now)).not.toContain(monthOf(now));
  });

  it('does not list a month that already has a seal', () => {
    writeFrozenReport(MONTH, sealed('x'));
    resetReportCache();
    expect(unsealedMonths('2026-08-10')).not.toContain(MONTH);
  });
});
