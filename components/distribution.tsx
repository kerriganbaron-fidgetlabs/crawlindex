'use client';

import { useId, useState, type ReactNode } from 'react';
import { BANDS, GRADE_STARTS, type GradeBand } from '../lib/bands';

/**
 * The score distribution.
 *
 * ## What was wrong with the old one
 *
 * A 320x106 SVG capped at 24rem, `aria-hidden`, no y-axis, no counts, no interactivity, and
 * the one prop that would have marked anything was never passed on the homepage. The real
 * numbers existed only in a visually-hidden table. It occupied a section heading and told a
 * sighted reader nothing they could act on.
 *
 * ## What this does differently
 *
 * - Buckets are **tinted by grade** with the rubric's own boundaries drawn, so the shape
 *   maps onto A/B/C/D/F instead of arbitrary decades.
 * - Counts sit above the bars and there is a real y-axis, so a magnitude can be read off.
 * - The **median is marked**, which is the single most useful fact about a distribution and
 *   was previously absent.
 * - Every bucket is a real control: hover, click, or tab to it and a panel names the count,
 *   the share, what that grade means, and three example domains.
 *
 * ## The rule this follows
 *
 * **Every panel is server-rendered into the DOM as `children`.** This component only decides
 * which one is visible. With JavaScript off, or before hydration, one panel is showing and
 * every number is present and correct. Interactivity is an enhancement on top of a complete
 * document, which is the same rule the motion primitives follow, and the reason is the same:
 * an index whose value is that its numbers are right cannot afford a state where they are
 * missing.
 */

const GRADE_FILL: Record<GradeBand, string> = {
  A: 'var(--color-good)',
  B: 'var(--color-good)',
  C: 'var(--color-warn)',
  D: 'var(--color-bad)',
  F: 'var(--color-bad)',
};

/** B and C read as the same hue at a glance otherwise. */
const GRADE_OPACITY: Record<GradeBand, number> = { A: 1, B: 0.62, C: 1, D: 0.62, F: 1 };

export function Distribution({
  buckets,
  total,
  median,
  panels,
}: {
  buckets: number[];
  total: number;
  /** Median score across the comparable population, or null when there is none. */
  median: number | null;
  /** One server-rendered panel per bucket, index-aligned with `buckets`. */
  panels: ReactNode[];
}) {
  // Start on the modal bucket: the tallest bar is where a reader's eye lands anyway, and it
  // is the most informative default for someone who never interacts.
  const modal = buckets.indexOf(Math.max(...buckets, 0));
  const [active, setActive] = useState(modal < 0 ? 0 : modal);
  const listId = useId();

  const peak = Math.max(1, ...buckets);
  const W = 720;
  const H = 200;
  const padL = 40;
  const padB = 34;
  const padT = 18;
  const plotW = W - padL - 12;
  const plotH = H - padB - padT;
  const bw = plotW / buckets.length;

  const y = (n: number) => padT + plotH - (n / peak) * plotH;
  // Three gridlines is enough to read a magnitude and few enough not to fight the bars.
  const ticks = [0, Math.round(peak / 2), peak];
  const medianX = median === null ? null : padL + (Math.min(100, median) / 100) * plotW;

  return (
    <figure className="m-0">
      {/* The accessible truth. The graphic is an illustration of this table, never a
          replacement for it, so the SVG stays aria-hidden and this carries the data. */}
      <table className="sr-only">
        <caption>Number of measured sites in each ten-point score band</caption>
        <thead>
          <tr>
            <th scope="col">Score band</th>
            <th scope="col">Grade</th>
            <th scope="col">Sites</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {BANDS.map((b) => (
            <tr key={b.slug}>
              <th scope="row">{b.label}</th>
              <td>{b.grades.join(' and ')}</td>
              <td>{buckets[b.index] ?? 0}</td>
              <td>{total ? (((buckets[b.index] ?? 0) / total) * 100).toFixed(1) : '0'}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        aria-hidden="true"
        className="block select-none"
        role="presentation"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={y(t)} x2={W - 12} y2={y(t)} stroke="var(--color-rule)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-muted)">
              {t.toLocaleString()}
            </text>
          </g>
        ))}

        {/*
          Grade boundaries at their TRUE score positions, not at bucket edges. B begins at
          75, which is the middle of the 70-79 bucket, so snapping the line to a bucket edge
          would draw the rubric in the wrong place and make one band's label look wrong.
        */}
        {GRADE_STARTS.map(({ at, grade }) => {
          const x = padL + (at / 100) * plotW;
          return (
            <g key={grade}>
              <line
                x1={x}
                y1={padT - 8}
                x2={x}
                y2={padT + plotH}
                stroke="var(--color-muted)"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.6"
              />
              <text x={x + 3} y={padT - 9} fontSize="10" fontWeight="700" fill="var(--color-muted)">
                {grade}
              </text>
            </g>
          );
        })}

        {BANDS.map((b) => {
          const n = buckets[b.index] ?? 0;
          const x = padL + b.index * bw;
          const barH = Math.max(n > 0 ? 2 : 0, padT + plotH - y(n));
          const isActive = active === b.index;
          return (
            <g key={b.slug}>
              {/* Full-height hit area, so a thin bar is still easy to hover. */}
              <rect
                x={x}
                y={padT}
                width={bw}
                height={plotH}
                fill={isActive ? 'var(--color-rule)' : 'transparent'}
                opacity={isActive ? 0.4 : 0}
              />
              <rect
                x={x + 2}
                y={y(n)}
                width={bw - 4}
                height={barH}
                rx={2}
                fill={GRADE_FILL[b.grade]}
                opacity={isActive ? 1 : GRADE_OPACITY[b.grade]}
                stroke={isActive ? 'var(--color-ink)' : 'none'}
                strokeWidth="1.5"
              />
              {n > 0 ? (
                <text
                  x={x + bw / 2}
                  y={y(n) - 5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isActive ? '700' : '400'}
                  fill="var(--color-ink)"
                >
                  {n.toLocaleString()}
                </text>
              ) : null}
              <text
                x={x + bw / 2}
                y={H - padB + 16}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-muted)"
              >
                {b.from}
              </text>
            </g>
          );
        })}

        {medianX !== null ? (
          <g>
            <line
              x1={medianX}
              y1={padT - 4}
              x2={medianX}
              y2={padT + plotH}
              stroke="var(--color-accent)"
              strokeWidth="2"
            />
            <text
              x={medianX + 5}
              y={padT + plotH - 4}
              fontSize="10"
              fontWeight="700"
              fill="var(--color-accent)"
            >
              median {median}
            </text>
          </g>
        ) : null}

        <line x1={padL} y1={padT + plotH} x2={W - 12} y2={padT + plotH} stroke="var(--color-muted)" strokeWidth="1" />
        <text x={padL + plotW / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
          CrawlIndex score
        </text>
      </svg>

      {/*
        The real controls, layered over the graphic. Buttons rather than SVG handlers so
        they are keyboard reachable, announce themselves, and get a focus ring for free.
      */}
      <div className="grid grid-cols-10 gap-0 -mt-9 mb-4 px-[5.5%]" role="tablist" aria-label="Score bands">
        {BANDS.map((b) => (
          <button
            key={b.slug}
            role="tab"
            id={`${listId}-tab-${b.index}`}
            aria-selected={active === b.index}
            aria-controls={`${listId}-panel-${b.index}`}
            tabIndex={active === b.index ? 0 : -1}
            onMouseEnter={() => setActive(b.index)}
            onFocus={() => setActive(b.index)}
            onClick={() => setActive(b.index)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setActive((i) => Math.min(BANDS.length - 1, i + 1));
              if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, i - 1));
            }}
            className="h-8 rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="sr-only">
              Scores {b.label}, {b.gradeLabel}, {(buckets[b.index] ?? 0).toLocaleString()} sites
            </span>
          </button>
        ))}
      </div>

      {panels.map((panel, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${listId}-panel-${i}`}
          aria-labelledby={`${listId}-tab-${i}`}
          hidden={active !== i}
        >
          {panel}
        </div>
      ))}
    </figure>
  );
}
