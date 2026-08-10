import Link from 'next/link';

/**
 * Charts.
 *
 * Hand-rolled SVG, no charting dependency. The project ships three runtime dependencies
 * and adding a fourth to draw eleven bars would be a poor trade, but the real reason is
 * that a charting library would fight every rule this site is built on: server-rendered
 * markup, correct without JavaScript, and readable by the crawlers the index is about.
 *
 * Accessibility rule for everything in this file: **a chart is an illustration of a
 * table, never a replacement for one.** Each component takes its data already shaped and
 * renders `aria-hidden` graphics beside a real, visually-hidden table, or is captioned by
 * a table the caller is already rendering. Colour never carries meaning alone.
 */

// --- shared -----------------------------------------------------------------

/** A visually hidden table. The accessible truth behind an aria-hidden graphic. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={j}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- unit chart -------------------------------------------------------------

/**
 * One hundred cells, one per percentage point.
 *
 * A percentage is an abstraction and a hundred squares is not. "Fourteen of every hundred
 * sites say one thing and do another" lands as a shape before it lands as a number, which
 * is the entire job of the figure at the top of the page.
 *
 * The sweep is a CSS animation on a gradient overlay, so it costs no JavaScript and the
 * global `prefers-reduced-motion` rule already switches it off.
 */
export function UnitChart({
  percent,
  label,
  sub,
  sweep = false,
}: {
  percent: number;
  label: string;
  sub?: string;
  sweep?: boolean;
}) {
  const filled = Math.round(Math.max(0, Math.min(100, percent)));
  const cols = 20;
  const size = 12;
  const gap = 4;
  const step = size + gap;
  const w = cols * step - gap;
  const rows = 5;
  const h = rows * step - gap;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        role="img"
        aria-label={`${filled} of every 100 sites: ${label}`}
        className="max-w-md"
      >
        {Array.from({ length: 100 }, (_, i) => {
          const on = i < filled;
          return (
            <rect
              key={i}
              x={(i % cols) * step}
              y={Math.floor(i / cols) * step}
              width={size}
              height={size}
              rx={2}
              // Dimness carries in the fill, not in an opacity attribute, so the sweep
              // animation can own opacity outright and reduced-motion can switch it off
              // with a single `animation: none` and no restore step.
              fill={on ? 'var(--color-accent)' : 'var(--color-cell-empty)'}
              className={sweep ? 'unit-cell' : undefined}
              style={sweep ? { animationDelay: `${i * 9}ms` } : undefined}
            />
          );
        })}
      </svg>
      <figcaption className="mt-3">
        <span className="block text-sm font-medium">{label}</span>
        {sub ? <span className="block text-xs text-muted mt-0.5">{sub}</span> : null}
      </figcaption>
    </figure>
  );
}

// --- ranked bars ------------------------------------------------------------

export type BarDatum = { id: string; label: string; value: number; sub?: string; href?: string };

/**
 * Sorted horizontal bars with the value on the bar.
 *
 * Rendered as a list of rows rather than one SVG so each label can be a real link and
 * each row can wrap on a narrow screen. The bars are plain divs, which keeps them
 * responsive without a viewBox fighting the layout.
 */
export function RankedBars({
  data,
  max,
  unit = '%',
  caption,
}: {
  data: BarDatum[];
  /** Scale ceiling. Defaults to the largest value, which exaggerates small spreads. */
  max?: number;
  unit?: string;
  caption: string;
}) {
  const ceiling = max ?? Math.max(100, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-muted">Not enough measured sites yet.</p>;

  return (
    <figure className="m-0">
      <ChartTable
        caption={caption}
        columns={['Group', `Value (${unit})`]}
        rows={data.map((d) => [d.label, d.value.toFixed(1)])}
      />
      <ul aria-hidden="true" className="space-y-2.5">
        {data.map((d) => (
          <li key={d.id} className="grid grid-cols-[minmax(7rem,10rem)_1fr_3.5rem] gap-3 items-center">
            <span className="text-sm truncate">
              {d.href ? (
                <Link href={d.href} className="hover:text-accent underline underline-offset-4">
                  {d.label}
                </Link>
              ) : (
                d.label
              )}
            </span>
            <span className="h-3 bg-rule/60 rounded-sm overflow-hidden">
              <span
                className="block h-full bg-accent rounded-sm"
                style={{ width: `${Math.max(0.8, (d.value / ceiling) * 100)}%` }}
              />
            </span>
            <span className="tnum text-sm text-right">
              {d.value.toFixed(1)}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// --- histogram --------------------------------------------------------------

/**
 * Score distribution in ten-point buckets, optionally with a marker for one site.
 *
 * The marker is the reason this exists. A score of 62 means nothing on its own. A score of
 * 62 with a pin showing where it sits against five thousand measured sites is a position.
 */
export function Histogram({
  buckets,
  markAt,
  markLabel,
}: {
  buckets: number[];
  /** A score, 0 to 100, to pin on the distribution. */
  markAt?: number | null;
  markLabel?: string;
}) {
  const peak = Math.max(1, ...buckets);
  const w = 320;
  const h = 90;
  const bw = w / buckets.length;
  const markIndex = markAt === null || markAt === undefined ? null : Math.min(9, Math.floor(markAt / 10));

  return (
    <figure className="m-0">
      <ChartTable
        caption="Number of measured sites in each ten-point score band"
        columns={['Score band', 'Sites']}
        rows={buckets.map((n, i) => [`${i * 10} to ${i * 10 + 9}`, n])}
      />
      <svg viewBox={`0 0 ${w} ${h + 16}`} width="100%" aria-hidden="true" className="max-w-sm">
        {buckets.map((n, i) => {
          const bh = (n / peak) * h;
          const isMark = markIndex === i;
          return (
            <g key={i}>
              <rect
                x={i * bw + 1}
                y={h - bh}
                width={bw - 2}
                height={Math.max(1, bh)}
                rx={1.5}
                fill={isMark ? 'var(--color-accent)' : 'var(--color-rule)'}
              />
              {i % 2 === 0 ? (
                <text
                  x={i * bw + bw / 2}
                  y={h + 12}
                  textAnchor="middle"
                  fontSize="8"
                  fill="var(--color-muted)"
                >
                  {i * 10}
                </text>
              ) : null}
            </g>
          );
        })}
        {markIndex !== null ? (
          <line
            x1={markIndex * bw + bw / 2}
            y1={0}
            x2={markIndex * bw + bw / 2}
            y2={h}
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        ) : null}
      </svg>
      {markLabel ? <figcaption className="text-xs text-muted mt-1">{markLabel}</figcaption> : null}
    </figure>
  );
}

// --- the policy gap quadrant ------------------------------------------------

export type QuadrantCounts = {
  /** robots allows, server serves. */
  openHonest: number;
  /** robots allows, server refuses. The interesting one. */
  gap: number;
  /** robots blocks, server refuses. Consistent. */
  blockedHonest: number;
  /** robots blocks, server serves anyway. Declared but not enforced. */
  declaredOnly: number;
};

/**
 * Stated policy against enforced behaviour.
 *
 * Every other index in this category publishes one axis: what robots.txt says. This
 * dataset has always had both halves and nobody had crossed them. The top-right cell,
 * "permits GPTBot and refuses GPTBot", is the finding: a policy the operator believes
 * they published and an edge rule that overrides it.
 */
export function PolicyQuadrant({ counts, total }: { counts: QuadrantCounts; total: number }) {
  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : '0.0');

  const cells: Array<{ k: keyof QuadrantCounts; title: string; note: string; tone: string }> = [
    {
      k: 'gap',
      title: 'Says yes, does no',
      note: 'robots.txt permits GPTBot. The server refuses it.',
      tone: 'border-bad text-bad',
    },
    {
      k: 'openHonest',
      title: 'Open, and means it',
      note: 'Permitted in robots.txt and served on request.',
      tone: 'border-good text-good',
    },
    {
      k: 'blockedHonest',
      title: 'Closed, and means it',
      note: 'Blocked in robots.txt and refused at the server.',
      tone: 'border-rule',
    },
    {
      k: 'declaredOnly',
      title: 'Says no, does yes',
      note: 'Blocked in robots.txt but served anyway. The rule is a request, not a wall.',
      tone: 'border-warn text-warn',
    },
  ];

  return (
    <figure className="m-0">
      <ChartTable
        caption="Sites grouped by what robots.txt states against what the server does when asked as GPTBot"
        columns={['Group', 'Sites', 'Share']}
        rows={cells.map((c) => [c.title, counts[c.k], `${pct(counts[c.k])}%`])}
      />
      <div aria-hidden="true" className="grid grid-cols-2 gap-3">
        {cells.map((c) => (
          <div key={c.k} className={`border-2 rounded p-4 bg-raised ${c.tone}`}>
            <div className="tnum text-3xl font-bold leading-none">{pct(counts[c.k])}%</div>
            <div className="text-sm font-semibold mt-1.5 text-ink">{c.title}</div>
            <div className="text-xs text-muted mt-1 leading-snug">{c.note}</div>
            <div className="text-xs text-muted mt-1.5 tnum">{counts[c.k].toLocaleString()} sites</div>
          </div>
        ))}
      </div>
    </figure>
  );
}

// --- per-site band bars -----------------------------------------------------

/**
 * The three score bands against ghosted nominal maxima.
 *
 * The ghost matters: when a band is renormalised because a check could not be observed,
 * the difference between "earned 20 of 25" and "earned 20 of the 22 we could see" is the
 * difference between an accusation and a measurement.
 */
export function BandBars({
  bands,
}: {
  bands: Array<{ id: string; label: string; earned: number; max: number; nominalMax: number }>;
}) {
  return (
    <figure className="m-0 space-y-3">
      <ChartTable
        caption="Points earned in each score band"
        columns={['Band', 'Earned', 'Available', 'Nominal maximum']}
        rows={bands.map((b) => [b.label, b.earned, b.max, b.nominalMax])}
      />
      {bands.map((b) => {
        const availableShare = (b.max / b.nominalMax) * 100;
        const earnedShare = (b.earned / b.nominalMax) * 100;
        const reduced = b.max < b.nominalMax;
        return (
          <div key={b.id} aria-hidden="true">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">{b.label}</span>
              <span className="tnum text-muted">
                {b.earned} of {b.max}
                {reduced ? <span className="text-warn"> (of {b.nominalMax} normally)</span> : null}
              </span>
            </div>
            <div className="relative h-3 bg-rule/50 rounded-sm overflow-hidden">
              {reduced ? (
                <div
                  className="absolute inset-y-0 left-0 bg-rule"
                  style={{ width: `${availableShare}%` }}
                />
              ) : null}
              <div
                className="absolute inset-y-0 left-0 bg-accent rounded-sm"
                style={{ width: `${Math.max(0.8, earnedShare)}%` }}
              />
            </div>
          </div>
        );
      })}
    </figure>
  );
}

// --- sparkline --------------------------------------------------------------

/**
 * A trend line, or nothing.
 *
 * Returns null under three points. A two-point "trend" drawn as a line is a claim the
 * data cannot support, and this index has been running for days rather than years.
 */
export function Sparkline({
  values,
  label,
  width = 120,
  height = 28,
}: {
  values: number[];
  label: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 3) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
    </svg>
  );
}
