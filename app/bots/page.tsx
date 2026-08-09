import type { Metadata } from 'next';
import Link from 'next/link';
import { AGENTS, agentSlug } from '../../lib/agents';
import { getLatestStats } from '../../lib/queries';
import { PageHeader } from '../../components/ui';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'AI crawlers we track',
  description:
    'Every AI crawler CrawlIndex tracks, who operates it, what it is for, and how many of the most-visited sites block it.',
  alternates: { canonical: '/bots' },
};

export default async function BotsPage() {
  const stats = await getLatestStats();
  const observed = stats?.observed ?? 0;

  const tiers = [
    {
      n: 1 as const,
      title: 'Answer-surface crawlers',
      blurb:
        'These put content in front of a person the same day. Blocking one removes the site from answers users are reading right now, which is why they carry the most weight in the score.',
    },
    {
      n: 2 as const,
      title: 'Index and training breadth',
      blurb:
        'These shape which models know the site exists at all. The effect is real but slower, so they are weighted lower.',
    },
  ];

  return (
    <>
      <PageHeader
        kicker="Registry"
        title="The crawlers we track"
        lede={`${AGENTS.length} AI crawler tokens, checked against every site's robots.txt on each crawl. The registry is version-pinned so the index stays comparable over time.`}
      />

      {tiers.map((tier) => (
        <section key={tier.n} className="mb-12">
          <h2 className="text-2xl font-bold mb-1">{tier.title}</h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">{tier.blurb}</p>
          <div className="overflow-x-auto border border-rule rounded">
            <table className="w-full text-sm border-collapse">
              <caption className="sr-only">{tier.title}</caption>
              <thead>
                <tr className="bg-raised text-left">
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Token</th>
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Operator</th>
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">What it does</th>
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-32">Blocked by</th>
                </tr>
              </thead>
              <tbody>
                {AGENTS.filter((a) => a.tier === tier.n).map((a) => {
                  const blocked = stats?.per_bot?.[a.token] ?? 0;
                  return (
                    <tr key={a.token} className="border-b border-rule last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/bots/${agentSlug(a.token)}`} className="font-mono hover:text-accent underline underline-offset-4">
                          {a.token}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{a.operator}</td>
                      <td className="px-3 py-2 text-muted">{a.blurb}</td>
                      <td className="px-3 py-2 tnum whitespace-nowrap">
                        {blocked.toLocaleString()}
                        {observed ? (
                          <span className="text-muted"> ({((blocked / observed) * 100).toFixed(1)}%)</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
