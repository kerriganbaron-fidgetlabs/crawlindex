import Link from 'next/link';
import type { Cohort, DomainRow } from '../lib/dataset';
import { networkLabel, platformLabel } from '../lib/fingerprints';
import { SITE, citation } from '../lib/site';

export function gradeColor(grade: string | null): string {
  switch (grade) {
    case 'A':
    case 'B':
      return 'text-good border-good';
    case 'C':
      return 'text-warn border-warn';
    case 'D':
    case 'F':
      return 'text-bad border-bad';
    default:
      return 'text-muted border-rule';
  }
}

/**
 * The score chip. Grade is carried by the letter and the border, never by colour alone,
 * so it survives greyscale and colour-blind viewing.
 */
export function ScoreChip({
  score,
  grade,
  partial,
  size = 'sm',
}: {
  score: number | null;
  grade: string | null;
  partial?: boolean;
  size?: 'sm' | 'lg';
}) {
  const label =
    score === null
      ? 'Not scored'
      : `Score ${score} out of 100, grade ${grade}${partial ? ', partial assessment' : ''}`;

  if (size === 'lg') {
    return (
      <div className={`inline-flex items-baseline gap-3 border-2 rounded px-4 py-2 ${gradeColor(grade)}`}>
        <span className="sr-only">{label}</span>
        <span aria-hidden="true" className="tnum text-5xl font-bold leading-none">
          {score ?? '--'}
        </span>
        <span aria-hidden="true" className="text-2xl font-bold">
          {grade ?? ''}
        </span>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-baseline gap-1.5 border rounded px-2 py-0.5 ${gradeColor(grade)}`}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="tnum font-semibold text-sm">
        {score ?? '--'}
      </span>
      <span aria-hidden="true" className="text-xs font-bold">
        {grade ?? ''}
      </span>
    </span>
  );
}

export function StatTile({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="border border-rule rounded p-4 bg-raised">
      <div className="tnum text-3xl font-bold leading-tight">{value}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      {sub ? <div className="text-xs text-muted mt-1">{sub}</div> : null}
    </div>
  );
}

/** Wide tables must scroll inside their own container, never the page body. */
export function DomainTable({
  rows,
  caption,
  showRank = true,
  showStack = false,
}: {
  rows: DomainRow[];
  caption: string;
  showRank?: boolean;
  showStack?: boolean;
}) {
  if (!rows.length) {
    return <p className="text-muted">Nothing to show yet. The next crawl will populate this.</p>;
  }

  return (
    <div className="overflow-x-auto border border-rule rounded">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-raised text-left">
            {showRank ? (
              <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-16">Rank</th>
            ) : null}
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule">Domain</th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-24">Score</th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule">Answer-surface crawlers</th>
            {showStack ? (
              <th scope="col" className="px-3 py-2 font-semibold border-b border-rule">Stack</th>
            ) : (
              <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-28">Agent files</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domain} className="border-b border-rule last:border-0">
              {showRank ? <td className="px-3 py-2 tnum text-muted">{r.rank ?? '--'}</td> : null}
              <td className="px-3 py-2">
                <Link href={`/site/${r.domain}`} className="font-mono hover:text-accent underline underline-offset-4">
                  {r.domain}
                </Link>
                {r.obs.cloaking.detected ? (
                  <span className="ml-2 text-xs text-bad">refused GPTBot</span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <ScoreChip score={r.score.total} grade={r.score.grade} partial={r.score.partial} />
              </td>
              <td className="px-3 py-2 text-muted">
                {r.obs.tier1Blocked.length === 0 ? (
                  <span className="text-good">all allowed</span>
                ) : (
                  <span className="tnum">{r.obs.tier1Blocked.length} blocked</span>
                )}
              </td>
              {showStack ? (
                <td className="px-3 py-2 text-muted text-xs">
                  {[platformLabel(r.obs.stack.platform), networkLabel(r.obs.stack.network)]
                    .filter(Boolean)
                    .join(' . ') || 'unidentified'}
                </td>
              ) : (
                <td className="px-3 py-2 font-mono text-xs text-muted">
                  {[r.obs.llmsTxt.present ? 'llms.txt' : null, r.obs.agentsMd.present ? 'agents.md' : null]
                    .filter(Boolean)
                    .join(' ') || 'none'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cohort comparison: the blocking rate of a group of sites that share a platform or CDN. */
export function CohortTable({
  cohorts,
  kind,
  caption,
}: {
  cohorts: Cohort[];
  kind: 'platform' | 'network' | 'tld';
  caption: string;
}) {
  const label = (id: string) =>
    kind === 'platform' ? (platformLabel(id) ?? id) : kind === 'network' ? (networkLabel(id) ?? id) : `.${id}`;
  const href = (id: string) =>
    kind === 'platform' ? `/platforms/${id}` : kind === 'network' ? `/networks/${id}` : `/tlds/${id}`;

  if (!cohorts.length) {
    return <p className="text-muted">Not enough measured sites yet to report a cohort.</p>;
  }

  return (
    <div className="overflow-x-auto border border-rule rounded">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-raised text-left">
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule">
              {kind === 'platform' ? 'Platform' : kind === 'network' ? 'Edge network' : 'Top-level domain'}
            </th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-24">Sites</th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-32">Blocking AI</th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-40">
              <span className="sr-only">Proportion blocking</span>
            </th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-24">Mean score</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.id} className="border-b border-rule last:border-0">
              <td className="px-3 py-2">
                <Link href={href(c.id)} className="hover:text-accent underline underline-offset-4">
                  {label(c.id)}
                </Link>
              </td>
              <td className="px-3 py-2 tnum text-muted">{c.observed.toLocaleString()}</td>
              <td className="px-3 py-2 tnum">
                {c.blockingAny.toLocaleString()}{' '}
                <span className="text-muted">({c.blockingRate.toFixed(1)}%)</span>
              </td>
              <td className="px-3 py-2">
                <div aria-hidden="true" className="h-2 bg-rule rounded-full overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${Math.max(1, c.blockingRate)}%` }} />
                </div>
              </td>
              <td className="px-3 py-2 tnum">{c.meanScore ?? 'n/a'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHeader({ kicker, title, lede }: { kicker?: string; title: string; lede?: string }) {
  return (
    <div className="mb-8">
      {kicker ? (
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">{kicker}</p>
      ) : null}
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
      {lede ? <p className="mt-3 text-lg text-muted max-w-2xl leading-relaxed">{lede}</p> : null}
    </div>
  );
}

/**
 * The attribution block. Rendered on every page that carries measured data.
 *
 * The dataset is free to reuse, and the only thing asked in return is credit. Making the
 * exact citation string copyable, rather than expecting people to compose one, is the
 * difference between being credited and being quietly scraped.
 */
export function Attribution({ subject, measuredOn }: { subject: string; measuredOn?: string | null }) {
  return (
    <section className="border-t border-rule mt-16 pt-8">
      <h2 className="text-lg font-bold mb-2">Using these figures</h2>
      <p className="text-sm text-muted mb-3 max-w-2xl">
        Free to reuse in research, journalism or a product under{' '}
        <a href={SITE.licenceUrl} className="text-accent underline underline-offset-4">
          {SITE.licence}
        </a>
        , with credit to {SITE.publisher}. Quote the measurement date so the claim stays checkable
        as the index moves.
      </p>
      <pre className="overflow-x-auto text-xs bg-raised border border-rule rounded p-3">
        <code>{citation(subject, measuredOn)}</code>
      </pre>
    </section>
  );
}
