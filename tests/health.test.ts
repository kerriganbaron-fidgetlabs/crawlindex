import { describe, expect, it } from 'vitest';
import { assessRun, lastTrustworthy } from '../lib/health';
import type { DailyStats } from '../lib/dataset';

function day(over: Partial<DailyStats> = {}): DailyStats {
  return {
    day: '2026-08-12',
    totalDomains: 3700,
    observed: 3600,
    meanScore: 64.5,
    blockingAnyTier1: 650,
    blockingAllTier1: 155,
    llmsTxt: 445,
    agentsMd: 28,
    refusedGptbot: 500,
    paymentRequired: 11,
    perBot: {},
    attempted: 5000,
    succeeded: 3650,
    ...over,
  };
}

const healthy = { attempted: 5000, succeeded: 3650, scoreChanges: 40 };

describe('a normal night passes', () => {
  it('does not trip on figures that barely move', () => {
    const v = assessRun(day(), day({ day: '2026-08-13', observed: 3620, meanScore: 64.7 }), healthy);
    expect(v.suspect).toBe(false);
    expect(v.reasons).toEqual([]);
  });

  it('does not treat growth as suspicious', () => {
    const v = assessRun(day(), day({ totalDomains: 5200, observed: 3800 }), healthy);
    expect(v.suspect).toBe(false);
  });
});

/**
 * The scenario the gate exists for: nothing on our side fails, every process exits zero, and
 * the measurement environment has changed underneath us. A vendor status page cannot see this.
 */
describe('a network blocking our crawler is caught', () => {
  it('trips when reachability collapses', () => {
    const v = assessRun(day(), day({ observed: 1200 }), {
      attempted: 5000,
      succeeded: 1250,
      scoreChanges: 40,
    });
    expect(v.suspect).toBe(true);
    expect(v.reasons.join(' ')).toMatch(/Reachability fell/);
  });

  it('trips when the measured population moves sharply', () => {
    const v = assessRun(day(), day({ observed: 2000 }), healthy);
    expect(v.reasons.join(' ')).toMatch(/Measured population moved/);
  });

  it('trips when the published population shrinks in one sweep', () => {
    // The real 2026-08-10 event: totalDomains fell 4,984 to 3,719 with no annotation.
    const v = assessRun(day({ totalDomains: 4984 }), day({ totalDomains: 3719 }), healthy);
    expect(v.reasons.join(' ')).toMatch(/Published population shrank/);
  });

  it('trips when the mean score jumps', () => {
    const v = assessRun(day(), day({ meanScore: 78 }), healthy);
    expect(v.reasons.join(' ')).toMatch(/Mean score moved/);
  });
});

/**
 * The tripwire that would have caught the rescoring bug on its first night. It emitted score
 * changes for 18.8% of the corpus, and a fifth of the web does not change policy overnight.
 */
describe('an implausible volume of change is caught', () => {
  it('trips at the real observed rate of the rescoring bug', () => {
    const v = assessRun(day(), day(), { ...healthy, scoreChanges: 682 });
    expect(v.suspect).toBe(true);
    expect(v.reasons.join(' ')).toMatch(/score changes/);
  });

  it('allows a normal night of churn', () => {
    const v = assessRun(day(), day(), { ...healthy, scoreChanges: 120 });
    expect(v.suspect).toBe(false);
  });

  it('catches it even with no baseline, because the check is absolute', () => {
    const v = assessRun(null, day(), { ...healthy, scoreChanges: 682 });
    expect(v.suspect).toBe(true);
  });
});

/**
 * `stats.json` was emptied when the provisional data was discarded, so the first crawl after
 * that has nothing to compare against. A gate that trips on its own first run is worse than
 * no gate, because it teaches the operator to pass --force by reflex.
 */
describe('the first run of a series', () => {
  it('passes with no baseline at all', () => {
    expect(assessRun(null, day(), healthy).suspect).toBe(false);
  });

  it('still catches a completely empty run', () => {
    const v = assessRun(null, day({ observed: 0, meanScore: null }), { ...healthy, scoreChanges: 0 });
    expect(v.suspect).toBe(true);
    expect(v.reasons.join(' ')).toMatch(/Nothing was observed/);
  });

  it('does not compare reachability against a snapshot that never recorded it', () => {
    // Snapshots written before the run-shape fields existed have no `attempted`. Reading
    // that as a collapse from zero would quarantine the first night after an upgrade.
    const legacy = day();
    delete legacy.attempted;
    delete legacy.succeeded;
    expect(assessRun(legacy, day(), healthy).suspect).toBe(false);
  });
});

describe('choosing which day to quote', () => {
  it('skips back over a quarantined day', () => {
    const good = day({ day: '2026-08-12' });
    const bad = day({ day: '2026-08-13', suspect: true, observed: 900 });
    expect(lastTrustworthy([good, bad])?.day).toBe('2026-08-12');
  });

  it('skips back over several', () => {
    const good = day({ day: '2026-08-11' });
    const bad1 = day({ day: '2026-08-12', suspect: true });
    const bad2 = day({ day: '2026-08-13', suspect: true });
    expect(lastTrustworthy([good, bad1, bad2])?.day).toBe('2026-08-11');
  });

  it('returns null rather than a suspect day when every day is suspect', () => {
    expect(lastTrustworthy([day({ suspect: true })])).toBeNull();
  });

  it('returns null for an empty series', () => {
    expect(lastTrustworthy([])).toBeNull();
  });
});
