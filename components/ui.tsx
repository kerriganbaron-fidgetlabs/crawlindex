import Link from 'next/link';
import type { DomainSummary } from '../lib/queries';

export function gradeColor(grade: string | null): string {
  switch (grade) {
    case 'A':
      return 'text-good border-good';
    case 'B':
      return 'text-good border-good';
    case 'C':
      return 'text-warn border-warn';
    case 'D':
      return 'text-bad border-bad';
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
    score === null ? 'Not scored' : `Score ${score} out of 100, grade ${grade}${partial ? ', partial assessment' : ''}`;

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

export function StatTile({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub?: string;
}) {
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
}: {
  rows: DomainSummary[];
  caption: string;
  showRank?: boolean;
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
              <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-16">
                Rank
              </th>
            ) : null}
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule">
              Domain
            </th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-24">
              Score
            </th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule">
              Answer-surface crawlers
            </th>
            <th scope="col" className="px-3 py-2 font-semibold border-b border-rule w-28">
              Agent files
            </th>
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
                {r.cloaking ? (
                  <span className="ml-2 text-xs text-bad" title="Serves crawlers different content">
                    cloaking
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <ScoreChip score={r.score} grade={r.grade} partial={r.partial} />
              </td>
              <td className="px-3 py-2 text-muted">
                {r.tier1_blocked.length === 0 ? (
                  <span className="text-good">all allowed</span>
                ) : (
                  <span className="tnum">{r.tier1_blocked.length} blocked</span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted">
                {[r.llms_txt ? 'llms.txt' : null, r.agents_md ? 'agents.md' : null]
                  .filter(Boolean)
                  .join(' ') || 'none'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 leading-relaxed max-w-2xl">{children}</div>;
}

export function PageHeader({
  kicker,
  title,
  lede,
}: {
  kicker?: string;
  title: string;
  lede?: string;
}) {
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
