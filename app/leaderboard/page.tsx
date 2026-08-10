import type { Metadata } from 'next';
import Link from 'next/link';
import { badgeTier, isEmbeddable, TIER_NAME } from '../../lib/badge';
import { latestStats, leaderboard, scoredRows } from '../../lib/dataset';
import { groupByEntity } from '../../lib/entities';
import { Attribution, EntityTable, PageHeader, PageMeta } from '../../components/ui';
import { Histogram } from '../../components/charts';
import { Explain } from '../../components/explain';
import { Reveal } from '../../components/motion';
import { scoreHistogram } from '../../lib/dataset';

export const metadata: Metadata = {
  title: 'Agent readiness leaderboard',
  description:
    'The most and least agent-ready sites on the web, scored on crawler access, machine-readable surface and content structure. One row per operator. Updated nightly.',
  alternates: { canonical: '/leaderboard' },
};

export default function LeaderboardPage() {
  const stats = latestStats();
  const scored = scoredRows();

  // Grouped, so one company running twenty country domains occupies one row. Over-fetch
  // before grouping, otherwise collapsing a family shortens the visible list.
  const top = groupByEntity(leaderboard('top', 400)).slice(0, 100);
  const bottom = groupByEntity(leaderboard('bottom', 400)).slice(0, 100);

  const qualifying = scored.filter((r) => isEmbeddable(badgeTier(r.score.total, r.score.grade))).length;

  return (
    <>
      <PageHeader
        kicker="Leaderboard"
        title="Who is ready for agents, and who is not"
        lede={`Ranked by the CrawlIndex Score across ${scored.length.toLocaleString()} fully measured sites. One row per operator, because a company publishing the same policy on twenty country domains is one fact rather than twenty.`}
      />

      <div className="mb-12 grid gap-8 lg:grid-cols-[auto_1fr] items-start">
        <Histogram buckets={scoreHistogram()} />
        <div className="max-w-xl space-y-3 text-sm leading-relaxed">
          <p>
            <strong className="tnum">{qualifying.toLocaleString()}</strong> sites score 75 or above
            and qualify for the{' '}
            <Link href="/badge" className="text-accent underline underline-offset-4">
              {TIER_NAME.friendly} mark
            </Link>{' '}
            or better. The rest of the distribution sits in the middle: not hostile to agents, just
            never set up for them.
          </p>
          <p className="text-muted">
            Only fully measured sites appear here.{' '}
            <Explain id="partial">Partial assessments</Explain> are renormalised over fewer points,
            so putting one in the same column would compare two different scales. Sites served a{' '}
            <Explain id="stub">stub response</Explain> are partial by definition, which is why some
            very large names are absent.
          </p>
          <p className="text-muted">
            Looking for one domain rather than a ranking? Press <kbd className="font-mono text-xs border border-rule rounded px-1">/</kbd>{' '}
            or use{' '}
            <Link href="/search" className="text-accent underline underline-offset-4">
              search
            </Link>
            .
          </p>
        </div>
      </div>

      <section className="mb-16" aria-labelledby="top">
        <h2 id="top" className="text-2xl font-bold mb-1">
          Most agent-ready
        </h2>
        <p className="text-sm text-muted mb-4">
          Open to the crawlers that answer questions, publishing something machine-readable, and
          serving content a crawler can read without running JavaScript.
        </p>
        <EntityTable groups={top} caption="Highest scoring operators" />
      </section>

      <Reveal>
        <section aria-labelledby="bottom">
          <h2 id="bottom" className="text-2xl font-bold mb-1">
            Least agent-ready
          </h2>
          <p className="text-sm text-muted mb-4">
            A low score here is not an accusation of bad faith. Most of these sites blocked nothing
            deliberately.{' '}
            <Link href="/findings#who-decides" className="text-accent underline underline-offset-4">
              Someone else usually decided
            </Link>
            .
          </p>
          <EntityTable groups={bottom} caption="Lowest scoring operators" />
        </section>
      </Reveal>

      <PageMeta />
      <Attribution subject="Agent readiness leaderboard" measuredOn={stats?.day ?? null} />
    </>
  );
}
