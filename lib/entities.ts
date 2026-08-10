/**
 * Operator grouping for ranked views.
 *
 * The bottom of the leaderboard was twenty regional Amazon storefronts in a row. Once the
 * probe stopped charging Amazon for a stub it never served, those particular rows went
 * away, but the shape of the problem did not: one operator publishing one policy across
 * twenty country domains is one fact, and a ranking that repeats it twenty times is a
 * ranking about Amazon rather than about the web.
 *
 * This is a VIEW and nothing else. Nothing is removed from the dataset, the JSON files,
 * the API, the sitemap, or the per-domain pages. `allDomains()` is untouched. Grouping
 * happens at render time in ranked lists, where repetition is the problem.
 *
 * Two domains group only when they share a brand label AND publish an identical
 * answer-surface block list AND sit behind the same edge network. Requiring all three
 * makes an accidental grouping of two unrelated companies that happen to share a word
 * very unlikely, and the members are always listed so a reader can check.
 */

import { tldOf } from './probe';
import type { DomainRow } from './dataset';

/** `amazon.co.uk` -> `amazon`. The label immediately left of the public suffix. */
export function brandLabel(domain: string): string {
  const tld = tldOf(domain);
  const rest = tld && domain.endsWith(`.${tld}`) ? domain.slice(0, -(tld.length + 1)) : domain;
  const parts = rest.split('.').filter(Boolean);
  return parts[parts.length - 1] ?? domain;
}

/**
 * A brand shorter than this is too generic to group on. Two-letter labels collide across
 * genuinely unrelated companies far too often to risk it.
 */
const MIN_BRAND_LENGTH = 4;

function fingerprint(row: DomainRow): string {
  return [
    brandLabel(row.domain),
    [...row.obs.tier1Blocked].sort().join(','),
    row.obs.stack.network ?? '-',
  ].join('|');
}

export type EntityGroup = {
  /** The row that represents the group in a ranked list. */
  lead: DomainRow;
  /** Every other domain in the group, ranked. Never dropped, only collapsed. */
  others: DomainRow[];
  brand: string;
};

/**
 * Collapse a ranked list so no operator appears twice.
 *
 * Input order is preserved: the first row of a group encountered becomes its lead, so a
 * list sorted by score stays sorted by score.
 */
export function groupByEntity(rows: DomainRow[]): EntityGroup[] {
  const byKey = new Map<string, EntityGroup>();
  const order: string[] = [];

  for (const row of rows) {
    const brand = brandLabel(row.domain);
    // Too generic to group safely: give it a key nothing else can collide with.
    const key = brand.length < MIN_BRAND_LENGTH ? `@unique:${row.domain}` : fingerprint(row);

    const existing = byKey.get(key);
    if (existing) {
      existing.others.push(row);
    } else {
      byKey.set(key, { lead: row, others: [], brand });
      order.push(key);
    }
  }

  return order.map((k) => byKey.get(k)!);
}

/** How many domains a group covers, lead included. */
export const groupSize = (g: EntityGroup): number => g.others.length + 1;
