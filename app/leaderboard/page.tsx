import type { Metadata } from 'next';
import { getLeaderboard } from '../../lib/queries';
import { DomainTable, PageHeader } from '../../components/ui';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Agent readiness leaderboard',
  description:
    'The most and least agent-ready sites on the web, scored on crawler access, machine-readable surface and content structure. Updated nightly.',
  alternates: { canonical: '/leaderboard' },
};

export default async function LeaderboardPage() {
  const [top, bottom] = await Promise.all([getLeaderboard('top', 50), getLeaderboard('bottom', 50)]);

  return (
    <>
      <PageHeader
        kicker="Leaderboard"
        title="Who is ready for agents, and who is not"
        lede="Ranked by the CrawlIndex Score. Only fully measured sites appear here: a partial assessment is renormalised over fewer points, so putting it in the same column would be comparing two different scales."
      />

      <section className="mb-14" aria-labelledby="top">
        <h2 id="top" className="text-2xl font-bold mb-4">
          Most agent-ready
        </h2>
        <DomainTable rows={top} caption="Highest scoring domains" />
      </section>

      <section aria-labelledby="bottom">
        <h2 id="bottom" className="text-2xl font-bold mb-4">
          Least agent-ready
        </h2>
        <DomainTable rows={bottom} caption="Lowest scoring domains" />
      </section>
    </>
  );
}
