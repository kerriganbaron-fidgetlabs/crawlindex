import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AGENTS, agentBySlug, agentSlug } from '../../../lib/agents';
import { blockersOf, countBlockersOf, latestStats } from '../../../lib/dataset';
import { absoluteUrl } from '../../../lib/site';
import { Attribution, DomainTable, PageHeader } from '../../../components/ui';

type Props = { params: Promise<{ token: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return AGENTS.map((a) => ({ token: agentSlug(a.token) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const agent = agentBySlug((await params).token);
  if (!agent) return { title: 'Unknown crawler', robots: { index: false, follow: true } };
  const blocked = countBlockersOf(agent.token);
  return {
    title: `Who blocks ${agent.token}`,
    description: `${blocked.toLocaleString()} of the most-visited sites on the web block ${agent.token}, ${agent.operator}'s crawler. See which ones, updated nightly.`,
    alternates: { canonical: `/bots/${agentSlug(agent.token)}` },
    openGraph: { url: absoluteUrl(`/bots/${agentSlug(agent.token)}`) },
  };
}

export default async function BotPage({ params }: Props) {
  const agent = agentBySlug((await params).token);
  if (!agent) notFound();

  const blockers = blockersOf(agent.token, 100);
  const blockedCount = countBlockersOf(agent.token);
  const stats = latestStats();
  const observed = stats?.observed ?? 0;
  const share = observed ? ((blockedCount / observed) * 100).toFixed(1) : null;

  return (
    <>
      <PageHeader kicker={`${agent.operator} . tier ${agent.tier}`} title={agent.token} lede={agent.blurb} />

      <p className="text-lg mb-10 max-w-2xl">
        <strong className="tnum">{blockedCount.toLocaleString()}</strong> of the{' '}
        <span className="tnum">{observed.toLocaleString()}</span> sites we measured deny{' '}
        <code className="font-mono">{agent.token}</code> access to their root
        {share ? <>, which is <strong className="tnum">{share}%</strong> of the index</> : null}.
      </p>

      <section className="mb-12">
        <h2 className="text-xl font-bold mb-2">How to allow or block it</h2>
        <p className="text-sm text-muted mb-4 max-w-2xl">
          A group naming the token wins outright over the wildcard group. It does not inherit from
          it, so rules set under <code className="font-mono">User-agent: *</code> do not carry over.
        </p>
        <pre className="overflow-x-auto text-sm bg-raised border border-rule rounded p-4">
          <code>{`# Allow ${agent.token} everywhere\nUser-agent: ${agent.token}\nDisallow:\n\n# Block ${agent.token} entirely\nUser-agent: ${agent.token}\nDisallow: /`}</code>
        </pre>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-1">Sites blocking {agent.token}</h2>
        <p className="text-sm text-muted mb-4">
          Most-visited first. Showing up to 100 of {blockedCount.toLocaleString()}.
        </p>
        <DomainTable rows={blockers} caption={`Domains that block ${agent.token}`} showStack />
      </section>

      <Attribution subject={`Sites blocking ${agent.token}`} measuredOn={stats?.day ?? null} />
    </>
  );
}
