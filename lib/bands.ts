/**
 * Score bands: the ten-point buckets, and the grades they fall under.
 *
 * The distribution used to be drawn as ten arbitrary decades with no relationship to the
 * rubric, which made the shape unreadable: a reader could see a lump in the middle without
 * learning that the lump is where C turns into B. Bucketing stays at ten points because it
 * is finer than the five grades and shows the shape, but every bucket now knows which grade
 * it belongs to and where the grade boundary sits.
 *
 * Boundaries mirror `grade()` in `lib/score.ts`. They are duplicated deliberately rather
 * than imported, because that function maps a score to a letter and this one describes the
 * bands as objects; a test pins that the two agree.
 */

import type { DomainRow } from './dataset';

export type GradeBand = 'A' | 'B' | 'C' | 'D' | 'F';

export type Band = {
  /** 0 to 9. Bucket 6 is scores 60 to 69. */
  index: number;
  from: number;
  to: number;
  /** URL segment, e.g. "60-69". */
  slug: string;
  label: string;
  /** The grade of the band's lowest score. Use `grades` when the band straddles. */
  grade: GradeBand;
  /** Every grade present in this band's range. Length 2 only for 70 to 79. */
  grades: GradeBand[];
  /** "grade C", or "grades C and B" for the one band that spans a boundary. */
  gradeLabel: string;
  straddles: boolean;
};

/**
 * Where each grade begins, for drawing the boundary on a score axis.
 *
 * These are score positions, not bucket edges. 75 falls in the middle of the 70-79 bucket,
 * and a chart that snapped it to 80 would draw the rubric somewhere it is not.
 */
export const GRADE_STARTS: Array<{ at: number; grade: GradeBand }> = [
  { at: 40, grade: 'D' },
  { at: 60, grade: 'C' },
  { at: 75, grade: 'B' },
  { at: 90, grade: 'A' },
];

export function gradeOfScore(score: number): GradeBand {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Ten-point buckets do not divide evenly into the rubric's grades.
 *
 * Boundaries are at 40, 60, 75 and 90, so bucket 7 (70 to 79) contains both C and B. The
 * first version of this labelled it C, on the theory that the lower grade is the
 * conservative claim. That was wrong in a way worth recording: it would have put "grade C"
 * at the top of a page listing sites whose own detail page shows a B, which reads as a bug
 * and undermines the thing the page exists to do.
 *
 * So a band carries **every** grade in its range and says so. One bucket straddles, and
 * naming that is cheaper than pretending it does not.
 */
export const BANDS: Band[] = Array.from({ length: 10 }, (_, index) => {
  const from = index * 10;
  const to = index === 9 ? 100 : from + 9;
  const grades = [...new Set([gradeOfScore(from), gradeOfScore(to)])];
  const grade = grades[0];
  return {
    index,
    from,
    to,
    slug: `${from}-${to}`,
    label: `${from} to ${to}`,
    grade,
    grades,
    gradeLabel: grades.length === 1 ? `grade ${grade}` : `grades ${grades.join(' and ')}`,
    straddles: grades.length > 1,
  };
});

export const bandOfScore = (score: number): Band => BANDS[Math.min(9, Math.floor(score / 10))];
export const bandBySlug = (slug: string): Band | undefined => BANDS.find((b) => b.slug === slug);

export const GRADE_MEANING: Record<GradeBand, string> = {
  A: 'Open to the crawlers that answer questions, publishing machine-readable surfaces, and serving content an agent can read without running JavaScript.',
  B: 'Broadly legible to agents with room left on the table. Usually one or two changes short of an A.',
  C: 'Readable but undeclared. Typically no llms.txt, thin structured data, and a robots.txt that names no AI crawler.',
  D: 'Substantially closed or substantially unreadable. Often a platform default rather than a decision.',
  F: 'Blocks most answer-surface crawlers, or serves almost nothing a crawler can read.',
};

/**
 * Representative domains for a bucket.
 *
 * Chosen by best Tranco rank rather than at random, so the figure is stable between builds
 * and a reader who quotes it is quoting something reproducible. An unranked domain sorts
 * last rather than being excluded, so a bucket made entirely of submitted domains still
 * shows examples.
 */
export function examplesIn(rows: DomainRow[], band: Band, limit = 3): DomainRow[] {
  return rows
    .filter((r) => r.score.total !== null && !r.score.partial && bandOfScore(r.score.total).index === band.index)
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit);
}
