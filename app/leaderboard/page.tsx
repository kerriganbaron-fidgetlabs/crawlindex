import type { Metadata } from 'next';
import { leaderboard, latestStats } from '../../lib/dataset';
import { Attribution, DomainTable, PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Agent readiness leaderboard',
  description:
    'The most and least agent-ready sites on the web, scored on crawler access, machine-readable surface and content structure. Updated nightly.',
  alternates: { canonical: '/leaderboard' },
};

export default function LeaderboardPage() {
  const top = leaderboard('top', 100);
  const bottom = leaderboard('bottom', 100);
  const stats = latestStats();

  return (
    <>
      <PageHeader
        kicker="Leaderboard"
        title="Who is ready for agents, and who is not"
        lede="Ranked by the CrawlIndex Score. Only fully measured sites appear here: a partial assessment is renormalised over fewer points, so putting it in the same column would compare two different scales."
      />

      <section className="mb-14" aria-labelledby="top">
        <h2 id="top" className="text-2xl font-bold mb-4">Most agent-ready</h2>
        <DomainTable rows={top} caption="Highest scoring domains" showStack />
      </section>

      <section aria-labelledby="bottom">
        <h2 id="bottom" className="text-2xl font-bold mb-4">Least agent-ready</h2>
        <DomainTable rows={bottom} caption="Lowest scoring domains" showStack />
      </section>

      <Attribution subject="Agent readiness leaderboard" measuredOn={stats?.day ?? null} />
    </>
  );
}
