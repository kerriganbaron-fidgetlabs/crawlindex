/**
 * Reading and writing `data/`. The only place that touches the dataset files.
 *
 * Writes are atomic: everything is written to a temporary file in the same directory and
 * renamed over the target. A crawl killed mid-write must never leave a half-written
 * dataset that the next build would happily deploy.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Observation } from '../lib/types';
import type { ChangeRecord, DailyStats, Meta, StoredRecord } from '../lib/dataset';

export const DATA_DIR = join(process.cwd(), 'data');

export type CorpusEntry = {
  domain: string;
  rank: number | null;
  firstSeen: string;
  /** Pinned domains stay in the corpus whatever the ranking says. */
  pinned?: boolean;
  consecutiveFailures?: number;
  excluded?: string | null;
};

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function writeAtomic(file: string, contents: string) {
  ensureDir();
  const target = join(DATA_DIR, file);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, target);
}

function readTextOr(file: string, fallback: string): string {
  try {
    return readFileSync(join(DATA_DIR, file), 'utf8');
  } catch {
    return fallback;
  }
}

function parseLines<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as T);
    } catch {
      /* skip a corrupt line rather than lose the file */
    }
  }
  return out;
}

// --- corpus ----------------------------------------------------------------

export const readCorpus = (): CorpusEntry[] =>
  JSON.parse(readTextOr('corpus.json', '[]')) as CorpusEntry[];

export function writeCorpus(entries: CorpusEntry[]) {
  const sorted = [...entries].sort((a, b) => a.domain.localeCompare(b.domain));
  writeAtomic('corpus.json', JSON.stringify(sorted, null, 1) + '\n');
}

// --- observations ----------------------------------------------------------

export const readRecords = (): StoredRecord[] => parseLines<StoredRecord>(readTextOr('domains.jsonl', ''));

/**
 * One record per line, sorted by domain, keys in a stable order.
 *
 * All three properties exist to keep the nightly git commit small. An unsorted or
 * unstable-key file rewrites every line every night and turns a 4MB dataset into
 * gigabytes of history over a year.
 */
export function writeRecords(records: StoredRecord[]) {
  const sorted = [...records].sort((a, b) => a.domain.localeCompare(b.domain));
  const lines = sorted.map((r) =>
    JSON.stringify({
      domain: r.domain,
      rank: r.rank,
      firstSeen: r.firstSeen,
      obs: stableObs(r.obs as Observation),
    }),
  );
  writeAtomic('domains.jsonl', lines.join('\n') + '\n');
}

/**
 * Re-emit an observation with a fixed key order, dropping `access`.
 *
 * `access` is fully implied by tier1Blocked and tier2Blocked, so storing it would add
 * ~600 bytes per record for zero information. `lib/dataset.ts` rebuilds it on load.
 */
function stableObs(o: Observation) {
  return {
    domain: o.domain,
    observedAt: o.observedAt,
    registryVersion: o.registryVersion,
    probeVersion: o.probeVersion,
    vantage: o.vantage,
    reachable: o.reachable,
    httpStatus: o.httpStatus,
    finalUrl: o.finalUrl,
    error: o.error,
    optedOut: o.optedOut,
    https: o.https,
    control: o.control,
    robots: o.robots,
    tier1Blocked: o.tier1Blocked,
    tier2Blocked: o.tier2Blocked,
    cloaking: o.cloaking,
    llmsTxt: o.llmsTxt,
    agentsMd: o.agentsMd,
    structured: o.structured,
    content: o.content,
    stack: o.stack,
    security: o.security,
  };
}

// --- changes ---------------------------------------------------------------

/** Rolling window. The feed is a "what moved recently" surface, not an archive; git
 *  history holds the full record for anyone who wants it. */
const MAX_CHANGES = 4000;

export const readChanges = (): ChangeRecord[] => parseLines<ChangeRecord>(readTextOr('changes.jsonl', ''));

export function appendChanges(fresh: ChangeRecord[]) {
  const all = [...readChanges(), ...fresh]
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, MAX_CHANGES);
  // Oldest first on disk so appends touch the end of the file and diff small.
  const lines = [...all].reverse().map((c) => JSON.stringify(c));
  writeAtomic('changes.jsonl', lines.join('\n') + '\n');
}

// --- stats -----------------------------------------------------------------

export const readStats = (): DailyStats[] => JSON.parse(readTextOr('stats.json', '[]')) as DailyStats[];

export function upsertStats(entry: DailyStats) {
  const all = readStats().filter((s) => s.day !== entry.day);
  all.push(entry);
  all.sort((a, b) => a.day.localeCompare(b.day));
  writeAtomic('stats.json', JSON.stringify(all, null, 1) + '\n');
}

// --- meta ------------------------------------------------------------------

export function writeMeta(meta: Meta) {
  writeAtomic('meta.json', JSON.stringify(meta, null, 2) + '\n');
}
