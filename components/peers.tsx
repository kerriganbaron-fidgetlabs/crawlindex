import Link from 'next/link';
import { networkLabel, platformLabel } from '../lib/fingerprints';

/**
 * How a site compares to its own peers.
 *
 * ## Why this exists
 *
 * A score of 84 is not information. A reader has no idea whether that is good, and telling
 * them "out of 100" does not help, because nothing on the web is scored out of 100 on this
 * rubric except the things in this index.
 *
 * The site page already carried a percentile against the whole index, which is better but
 * still abstract: being ahead of 91% of the top five thousand domains does not tell an
 * operator whether they are behind the sites they actually compete with, or whether the
 * thing holding them back is their own doing at all.
 *
 * The comparison that answers "is this worth my time" is against the cohort they are already
 * in. A Shopify store 15 points below the Shopify median has something specific to fix. A
 * Shopify store 10 points above it has learned that their platform is the ceiling, which is
 * also worth knowing and is this project's central finding restated at the level of one
 * site.
 *
 * Cohorts under the minimum size are not published at all, so a comparison here is always
 * against at least 25 measured sites.
 */

export type Peer = {
  kind: 'platform' | 'network' | 'index';
  id: string;
  label: string;
  median: number;
  size: number;
  href?: string;
};

export function PeerComparison({ score, peers }: { score: number; peers: Peer[] }) {
  if (!peers.length) return null;

  // Widest span across everything drawn, so the bars share one scale and the gaps are
  // honestly proportioned rather than each normalised to itself.
  const values = [score, ...peers.map((p) => p.median)];
  const lo = Math.max(0, Math.min(...values) - 8);
  const hi = Math.min(100, Math.max(...values) + 8);
  const pos = (v: number) => ((v - lo) / Math.max(1, hi - lo)) * 100;

  return (
    <figure className="m-0">
      <table className="sr-only">
        <caption>This site&apos;s score against the median of each group it belongs to</caption>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Median score</th>
            <th scope="col">Sites in group</th>
            <th scope="col">Difference</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">This site</th>
            <td>{score}</td>
            <td>1</td>
            <td>0</td>
          </tr>
          {peers.map((p) => (
            <tr key={`${p.kind}-${p.id}`}>
              <th scope="row">{p.label}</th>
              <td>{p.median}</td>
              <td>{p.size}</td>
              <td>{(score - p.median).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul aria-hidden="true" className="space-y-3">
        {peers.map((p) => {
          const delta = Number((score - p.median).toFixed(1));
          const ahead = delta >= 0;
          return (
            <li key={`${p.kind}-${p.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm mb-1">
                <span>
                  {p.href ? (
                    <Link href={p.href} className="hover:text-accent underline underline-offset-4">
                      {p.label}
                    </Link>
                  ) : (
                    p.label
                  )}
                  <span className="text-muted"> . {p.size.toLocaleString()} sites</span>
                </span>
                <span className={`tnum font-medium ${ahead ? 'text-good' : 'text-bad'}`}>
                  {ahead ? '+' : ''}
                  {delta} vs their median of {p.median}
                </span>
              </div>
              <div className="relative h-2.5 bg-rule/50 rounded-sm">
                {/* The cohort median, as a reference mark rather than a bar, because it is
                    a position to be measured against and not a quantity. */}
                <span
                  className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-muted"
                  style={{ left: `${pos(p.median)}%` }}
                />
                <span
                  className="absolute -top-1 -bottom-1 w-1 rounded-sm bg-accent"
                  style={{ left: `${pos(score)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p aria-hidden="true" className="text-xs text-muted mt-3 flex flex-wrap gap-x-4">
        <span>
          <span className="inline-block w-1 h-3 bg-accent align-middle mr-1.5" />
          this site
        </span>
        <span>
          <span className="inline-block w-0.5 h-3 bg-muted align-middle mr-1.5" />
          group median
        </span>
      </p>
    </figure>
  );
}
