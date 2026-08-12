import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildFrozenReport,
  getMonthReport,
  monthOf,
  resetReportCache,
  unsealedMonths,
} from '../lib/report';
import { allStats, resetDatasetCache } from '../lib/dataset';
import { writeFrozenReport } from '../worker/store';

/**
 * Sealing, proved end to end against the real committed dataset.
 *
 * `tests/report.test.ts` covers the store guarantees with synthetic fixtures. This file
 * exists because that is not the same as knowing the mechanism will fire: the seal has never
 * actually run in production, because it only triggers when a month ends and the index is
 * younger than one month. "Built and unit-tested" is not "proven", and the difference
 * matters most for the one artefact that can never be corrected afterwards.
 *
 * Three separate questions, answered separately:
 *
 *  1. **Does the trigger fire?** Would a crawl on 1 September recognise August as needing a
 *     seal, and would a crawl today correctly leave it alone?
 *  2. **Is what it would write complete?** Built against the real dataset, not a fixture,
 *     and checked field by field for the things a citation depends on.
 *  3. **Is it really write-once?** Verified through the actual store function.
 *
 * ## Why this must not leave a real seal behind
 *
 * Writing `data/reports/2026-08.json` today would freeze August on the twelfth, permanently,
 * with half a month of data in it. The whole point of the seal is that it is never
 * rewritten, so a stray one is not a tidy-up job. Question 2 therefore only *builds* the
 * object, which is a pure function and writes nothing, and question 3 uses a sentinel month
 * that cannot collide with real data and is deleted afterwards.
 */

const SENTINEL = '1999-03';
const SENTINEL_FILE = join(process.cwd(), 'data', 'reports', `${SENTINEL}.json`);

afterEach(() => {
  if (existsSync(SENTINEL_FILE)) rmSync(SENTINEL_FILE);
  resetReportCache();
  resetDatasetCache();
});

describe('the trigger fires when a month ends', () => {
  it('leaves the current month alone', () => {
    const stats = allStats();
    if (!stats.length) return; // fresh clone, nothing to reason about
    const latest = stats[stats.length - 1].day;
    // A crawl running inside the month must never seal it. Sealing mid-month would freeze
    // a partial record permanently.
    expect(unsealedMonths(latest)).not.toContain(monthOf(latest));
  });

  it('recognises a month that has ended and has no seal', () => {
    const stats = allStats();
    if (!stats.length) return;
    const month = monthOf(stats[stats.length - 1].day);
    // Simulate the first crawl of the following month.
    const [y, m] = month.split('-').map(Number);
    const nextMonthDay = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

    expect(unsealedMonths(nextMonthDay)).toContain(month);
  });

  it('stops recognising it once a seal exists', () => {
    // Proved with the sentinel rather than the real month, so no stray seal is created.
    writeFrozenReport(SENTINEL, { month: SENTINEL, frozenAt: '1999-04-01T00:00:00Z', days: [{ day: '1999-03-01' }] });
    resetReportCache();
    expect(unsealedMonths('2026-09-01')).not.toContain(SENTINEL);
  });
});

describe('what it would write is complete', () => {
  /**
   * Built against the real dataset. `buildFrozenReport` is pure and writes nothing, so this
   * exercises the genuine production path with genuine data and leaves no artefact.
   */
  it('captures everything a citation depends on', () => {
    const stats = allStats();
    if (!stats.length) return;
    const month = monthOf(stats[stats.length - 1].day);

    const report = buildFrozenReport(month, '2026-09-01T02:30:00.000Z');
    expect(report, 'a month with measurements must produce a report').not.toBeNull();
    if (!report) return;

    // Provenance. Without these the figures are uninterpretable a year from now.
    expect(report.month).toBe(month);
    expect(report.frozenAt).toBe('2026-09-01T02:30:00.000Z');
    expect(report.probeVersion).toBeTruthy();
    expect(report.rubricVersion).toBeTruthy();
    expect(report.registryVersion).toBeTruthy();

    // The measurements themselves, and the cross-tabs that used to be read live and
    // therefore used to change after the fact. This is the actual bug being guarded.
    expect(report.days.length).toBeGreaterThan(0);
    expect(Array.isArray(report.platforms)).toBe(true);
    expect(Array.isArray(report.networks)).toBe(true);
    expect(Array.isArray(report.changes)).toBe(true);
    expect(Array.isArray(report.best)).toBe(true);
    expect(Array.isArray(report.worst)).toBe(true);

    // Every day it captured belongs to the month it claims to describe.
    for (const d of report.days) expect(d.day.startsWith(month), d.day).toBe(true);
  });

  it('excludes quarantined days, so a bad night cannot become permanent', () => {
    const stats = allStats();
    if (!stats.length) return;
    const month = monthOf(stats[stats.length - 1].day);
    const report = buildFrozenReport(month, '2026-09-01T00:00:00.000Z');
    if (!report) return;

    // This is the single most important property of the whole mechanism. Everything else a
    // bad run touches can be corrected by re-crawling; a seal cannot.
    for (const d of report.days) expect(d.suspect ?? false, `${d.day} is quarantined`).toBe(false);

    const quarantinedInMonth = allStats().filter((s) => s.day.startsWith(month) && s.suspect);
    for (const q of quarantinedInMonth) {
      expect(report.days.map((d) => d.day)).not.toContain(q.day);
    }
  });

  it('returns null rather than an empty shell for a month with no measurements', () => {
    expect(buildFrozenReport('1999-03', '1999-04-01T00:00:00.000Z')).toBeNull();
  });
});

describe('a seal is written once and never again', () => {
  const seal = (marker: string) => ({
    month: SENTINEL,
    frozenAt: '1999-04-01T00:00:00.000Z',
    probeVersion: '1.0.0',
    rubricVersion: '1.0.0',
    registryVersion: '1.0.0',
    days: [
      {
        day: '1999-03-01',
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
    changes: [],
    best: [],
    worst: [],
  });

  it('writes the first time and refuses every time after', () => {
    expect(writeFrozenReport(SENTINEL, seal('original'))).toBe(true);
    expect(writeFrozenReport(SENTINEL, seal('overwrite'))).toBe(false);
    expect(writeFrozenReport(SENTINEL, seal('again'))).toBe(false);

    const onDisk = readFileSync(SENTINEL_FILE, 'utf8');
    expect(onDisk).toContain('original');
    expect(onDisk).not.toContain('overwrite');
  });

  it('is served from the file rather than recomputed', () => {
    writeFrozenReport(SENTINEL, seal('sealed-cohort'));
    resetReportCache();

    const report = getMonthReport(SENTINEL)!;
    expect(report.frozen).toBe(true);
    // The cross-tab comes from the file. Reading it live is what made July's report change
    // in September, which is the bug this whole mechanism exists to prevent.
    expect(report.platforms[0].id).toBe('sealed-cohort');
    expect(report.versions.rubric).toBe('1.0.0');
  });

  it('does not stamp a sealed report with today’s versions', () => {
    // Provenance must come from the archived record. Falling back to current constants
    // would eventually label a historical report with a rubric it was never scored under.
    writeFrozenReport(SENTINEL, seal('x'));
    resetReportCache();
    const report = getMonthReport(SENTINEL)!;
    expect(report.versions.probe).toBe('1.0.0');
    expect(report.versions.rubric).toBe('1.0.0');
  });
});
