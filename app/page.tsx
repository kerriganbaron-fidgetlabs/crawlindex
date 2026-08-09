import Link from 'next/link';
import { AGENTS, agentSlug } from '../lib/agents';
import { allChanges, latestStats, leaderboard, networkCohorts, platformCohorts } from '../lib/dataset';
import { SITE } from '../lib/site';
import { Attribution, CohortTable, DomainTable, StatTile } from '../components/ui';

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`);

export default function HomePage() {
  const stats = latestStats();
  const worst = leaderboard('bottom', 10);
  const changes = allChanges().slice(0, 8);
  const networks = networkCohorts().slice(0, 6);
  const platforms = platformCohorts().slice(0, 6);
  const observed = stats?.observed ?? 0;

  const botRows = AGENTS.map((a) => ({ ...a, blocked: stats?.perBot?.[a.token] ?? 0 })).sort(
    (a, b) => b.blocked - a.blocked,
  );

  // The single most quotable finding the dataset produces, computed rather than asserted.
  const topNetwork = [...networks].sort((a, b) => b.blockingRate - a.blockingRate)[0];
  const lowNetwork = [...networks].sort((a, b) => a.blockingRate - b.blockingRate)[0];

  return (
    <>
      <section className="mb-14">
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-3">
          Updated nightly. Method published in full. Dataset open.
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] max-w-3xl">
          The open index of how the web treats AI agents.
        </h1>
        <p className="mt-5 text-lg text-muted max-w-2xl leading-relaxed">
          We measure the most-visited sites on the web and publish what we find. Which AI crawlers
          each site blocks. Whether it publishes llms.txt or agents.md. Whether it quietly serves
          crawlers something different from what it serves you. And which platforms and CDNs are
          making that decision on the operator's behalf.
        </p>
        <p className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/leaderboard"
            className="inline-block border-2 border-accent text-accent font-medium rounded px-5 py-2 hover:bg-accent-soft"
          >
            See the index
          </Link>
          <Link
            href="/check"
            className="inline-block border-2 border-rule font-medium rounded px-5 py-2 hover:border-accent hover:text-accent"
          >
            Check any domain
          </Link>
        </p>
      </section>

      {stats ? (
        <section className="mb-14" aria-labelledby="findings">
          <h2 id="findings" className="text-2xl font-bold mb-1">
            What the last crawl found
          </h2>
          <p className="text-sm text-muted mb-5">
            {observed.toLocaleString()} domains measured on {stats.day}. Sites we could not reach
            are excluded rather than counted as failures.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              value={pct(stats.blockingAnyTier1, observed)}
              label="Block at least one answer-surface crawler"
              sub={`${stats.blockingAnyTier1.toLocaleString()} of ${observed.toLocaleString()} sites`}
            />
            <StatTile
              value={pct(stats.llmsTxt, observed)}
              label="Publish an llms.txt"
              sub={`${stats.llmsTxt.toLocaleString()} sites`}
            />
            <StatTile
              value={pct(stats.refusedGptbot, observed)}
              label="Refuse GPTBot at the server"
              sub={`${stats.refusedGptbot.toLocaleString()} sites, whatever robots.txt says`}
            />
            <StatTile
              value={stats.meanScore === null ? 'n/a' : String(Math.round(stats.meanScore))}
              label="Mean readiness score"
              sub="Out of 100, across scored sites"
            />
          </div>
        </section>
      ) : (
        <section className="mb-14">
          <p className="border border-rule rounded p-4 bg-raised">
            The first crawl has not completed yet. Statistics appear here once it has.
          </p>
        </section>
      )}

      {networks.length ? (
        <section className="mb-14" aria-labelledby="who-decides">
          <h2 id="who-decides" className="text-2xl font-bold mb-1">
            Who is actually deciding
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            Most operators never formed a policy on AI crawlers. Their edge network did, by
            default, and they inherited it.
            {topNetwork && lowNetwork && topNetwork.id !== lowNetwork.id ? (
              <>
                {' '}
                Sites behind <strong>{topNetwork.id}</strong> block an answer-surface crawler{' '}
                <strong className="tnum">{topNetwork.blockingRate.toFixed(1)}%</strong> of the time,
                against <strong className="tnum">{lowNetwork.blockingRate.toFixed(1)}%</strong>{' '}
                behind <strong>{lowNetwork.id}</strong>.
              </>
            ) : null}
          </p>
          <CohortTable cohorts={networks} kind="network" caption="AI blocking rate by edge network" />
          <p className="mt-3 text-sm">
            <Link href="/networks" className="text-accent underline underline-offset-4">
              All edge networks
            </Link>
            {' . '}
            <Link href="/platforms" className="text-accent underline underline-offset-4">
              By publishing platform
            </Link>
          </p>
        </section>
      ) : null}

      {platforms.length ? (
        <section className="mb-14" aria-labelledby="platforms">
          <h2 id="platforms" className="text-2xl font-bold mb-1">
            Readiness by platform
          </h2>
          <p className="text-sm text-muted mb-5">
            What a site is built on predicts how legible it is to an agent.
          </p>
          <CohortTable cohorts={platforms} kind="platform" caption="AI blocking rate by publishing platform" />
        </section>
      ) : null}

      {stats ? (
        <section className="mb-14" aria-labelledby="bots">
          <h2 id="bots" className="text-2xl font-bold mb-1">
            Which crawlers get shut out
          </h2>
          <p className="text-sm text-muted mb-5">
            Share of measured sites whose robots.txt denies each crawler the site root.
          </p>
          <div className="overflow-x-auto border border-rule rounded">
            <table className="w-full text-sm border-collapse">
              <caption className="sr-only">AI crawlers ranked by how many indexed sites block them</caption>
              <thead>
                <tr className="bg-raised text-left">
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Crawler</th>
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Operator</th>
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-32">Blocked by</th>
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-40">
                    <span className="sr-only">Proportion</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {botRows.slice(0, 12).map((b) => {
                  const share = observed ? (b.blocked / observed) * 100 : 0;
                  return (
                    <tr key={b.token} className="border-b border-rule last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/bots/${agentSlug(b.token)}`} className="font-mono hover:text-accent underline underline-offset-4">
                          {b.token}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted">{b.operator}</td>
                      <td className="px-3 py-2 tnum">
                        {b.blocked.toLocaleString()} <span className="text-muted">({share.toFixed(1)}%)</span>
                      </td>
                      <td className="px-3 py-2">
                        <div aria-hidden="true" className="h-2 bg-rule rounded-full overflow-hidden">
                          <div className="h-full bg-accent" style={{ width: `${Math.max(1, share)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">
            <Link href="/bots" className="text-accent underline underline-offset-4">
              All {AGENTS.length} tracked crawlers
            </Link>
          </p>
        </section>
      ) : null}

      <section className="mb-14" aria-labelledby="worst">
        <h2 id="worst" className="text-2xl font-bold mb-1">
          Least agent-ready right now
        </h2>
        <p className="text-sm text-muted mb-5">
          Fully measured sites with the lowest scores. Partial assessments are excluded because a
          renormalised score is not comparable to a complete one.
        </p>
        <DomainTable rows={worst} caption="Lowest scoring domains in the index" />
        <p className="mt-3 text-sm">
          <Link href="/leaderboard" className="text-accent underline underline-offset-4">
            Full leaderboard, best and worst
          </Link>
        </p>
      </section>

      {changes.length ? (
        <section className="mb-14" aria-labelledby="changes">
          <h2 id="changes" className="text-2xl font-bold mb-1">
            Recent movements
          </h2>
          <p className="text-sm text-muted mb-5">
            Only real changes are recorded. A site's first measurement is a baseline, not an event.
          </p>
          <ul className="space-y-2 text-sm">
            {changes.map((c, i) => (
              <li key={`${c.domain}-${i}`} className="flex flex-wrap gap-x-3 gap-y-1 border-b border-rule pb-2">
                <time className="tnum text-muted shrink-0" dateTime={c.changedAt}>
                  {c.changedAt.slice(0, 10)}
                </time>
                <Link href={`/site/${c.domain}`} className="font-mono hover:text-accent underline underline-offset-4">
                  {c.domain}
                </Link>
                <span className="text-muted">{c.summary}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <Link href="/changes" className="text-accent underline underline-offset-4">
              All recorded changes
            </Link>
          </p>
        </section>
      ) : null}

      <section className="border-t border-rule pt-8">
        <h2 className="text-2xl font-bold mb-3">Why this exists</h2>
        <div className="max-w-2xl space-y-4 leading-relaxed text-muted">
          <p>
            Publishers are deciding, one robots.txt at a time, whether AI systems may read the web.
            Those decisions are made quietly, changed without announcement, and are individually
            trivial to check but collectively invisible.
          </p>
          <p>
            {SITE.name} checks them on a schedule and keeps the receipts. The rubric is published,
            every score is arithmetic over archived evidence, and no language model touches the
            numbers. The whole dataset is downloadable. If you disagree with a result you can read
            exactly how it was reached and recompute it yourself.
          </p>
          <p>
            <Link href="/methodology" className="text-accent underline underline-offset-4">
              Read the methodology
            </Link>
            {' . '}
            <Link href="/data" className="text-accent underline underline-offset-4">
              Download the dataset
            </Link>
          </p>
        </div>
      </section>

      <Attribution subject="The state of AI crawler access" measuredOn={stats?.day ?? null} />
    </>
  );
}
