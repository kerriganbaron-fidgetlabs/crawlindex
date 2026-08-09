import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AGENTS, agentSlug } from '../../../lib/agents';
import { contradictsStatedPolicy, describeCloaking } from '../../../lib/findings';
import { normaliseDomain } from '../../../lib/http';
import { getChangesFor, getDomain } from '../../../lib/queries';
import { absoluteUrl, SITE } from '../../../lib/site';
import { PageHeader, ScoreChip } from '../../../components/ui';

// The corpus is re-measured nightly, so a day-old page is never wrong by more than a day.
export const revalidate = 43200;

type Props = { params: Promise<{ domain: string }> };

function describe(domain: string, score: number | null, blocked: number, total: number): string {
  if (score === null) return `${domain} could not be measured on its last crawl.`;
  const access =
    blocked === 0
      ? 'It allows every answer-surface AI crawler.'
      : `It blocks ${blocked} of ${total} answer-surface AI crawlers.`;
  return `${domain} scores ${score} out of 100 for agent readiness. ${access}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const domain = normaliseDomain((await params).domain);
  const row = await getDomain(domain).catch(() => null);
  if (!row) return { title: `${domain}`, robots: { index: false, follow: true } };

  const tier1Total = AGENTS.filter((a) => a.tier === 1).length;
  const description = describe(domain, row.score, row.tier1_blocked.length, tier1Total);

  return {
    title: `${domain} agent readiness`,
    description,
    alternates: { canonical: `/site/${domain}` },
    openGraph: {
      title: `${domain}: agent readiness ${row.score ?? 'not scored'}`,
      description,
      url: absoluteUrl(`/site/${domain}`),
      type: 'article',
    },
  };
}

export default async function DomainPage({ params }: Props) {
  const raw = (await params).domain;
  const domain = normaliseDomain(raw);
  const row = await getDomain(domain);
  if (!row) notFound();

  const obs = row.observation;
  const detail = row.score_detail;
  const changes = await getChangesFor(domain, 10);
  const tier1 = AGENTS.filter((a) => a.tier === 1);
  const tier2 = AGENTS.filter((a) => a.tier === 2);
  const blockedSet = new Set([...row.tier1_blocked, ...row.tier2_blocked]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${domain} agent readiness measurement`,
    description: describe(domain, row.score, row.tier1_blocked.length, tier1.length),
    url: absoluteUrl(`/site/${domain}`),
    isAccessibleForFree: true,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    dateModified: row.observed_at ?? undefined,
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'CrawlIndex Score', value: row.score ?? 'unavailable' },
      { '@type': 'PropertyValue', name: 'Answer-surface crawlers blocked', value: row.tier1_blocked.length },
      { '@type': 'PropertyValue', name: 'llms.txt published', value: String(row.llms_txt) },
      { '@type': 'PropertyValue', name: 'agents.md published', value: String(row.agents_md) },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PageHeader
        kicker={row.rank ? `Tranco rank ${row.rank.toLocaleString()}` : 'Indexed domain'}
        title={domain}
        lede={describe(domain, row.score, row.tier1_blocked.length, tier1.length)}
      />

      <div className="flex flex-wrap items-center gap-6 mb-10">
        <ScoreChip score={row.score} grade={row.grade} partial={row.partial} size="lg" />
        <dl className="text-sm space-y-1">
          <div className="flex gap-2">
            <dt className="text-muted">Last measured</dt>
            <dd className="tnum">
              {row.observed_at ? new Date(row.observed_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">First seen</dt>
            <dd className="tnum">{new Date(row.first_seen).toISOString().slice(0, 10)}</dd>
          </div>
          {detail ? (
            <div className="flex gap-2">
              <dt className="text-muted">Rubric</dt>
              <dd className="tnum">v{detail.rubricVersion}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {row.reachable === false ? (
        <p className="border border-rule rounded p-4 bg-raised mb-10">
          This domain did not respond on its last crawl, so it has no score.{' '}
          {obs?.error ? <span className="font-mono text-sm">{obs.error}</span> : null} An unreachable
          site is recorded as unmeasured, never as a zero.
        </p>
      ) : null}

      {row.challenged ? (
        <div className="border-l-4 border-warn bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">Partial assessment</h2>
          <p className="text-sm">
            Our measurement request was met with a bot challenge
            {obs?.control.reason ? ` (${obs.control.reason})` : ''}. Everything we could otherwise
            read from the page describes that challenge rather than the site, so those checks were
            excluded and the score was renormalised over what remained. The robots.txt findings
            below are unaffected: that file is fetched separately and was served normally.
          </p>
        </div>
      ) : null}

      {contradictsStatedPolicy(obs) ? (
        <div className="border-l-4 border-bad bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">Stated policy and actual behaviour disagree</h2>
          <p className="text-sm">{describeCloaking(obs)}</p>
        </div>
      ) : null}

      {detail && detail.total !== null ? (
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4">How this score is made up</h2>
          <div className="space-y-6">
            {detail.bands.map((band) => {
              const lines = detail.lines.filter((l) => {
                const ids: Record<string, string[]> = {
                  access: ['tier1-access', 'tier2-access', 'no-cloaking'],
                  surface: ['robots', 'sitemap', 'llms-txt', 'agents-md'],
                  structure: ['schema-org', 'schema-website', 'schema-other', 'ssr-text', 'single-h1', 'landmarks'],
                };
                return ids[band.id]?.includes(l.id);
              });
              return (
                <div key={band.id}>
                  <h3 className="font-semibold flex items-baseline justify-between border-b border-rule pb-1 mb-2">
                    <span>{band.label}</span>
                    <span className="tnum text-sm text-muted">
                      {band.max === 0 ? 'not assessed' : `${band.earned} / ${band.max}`}
                    </span>
                  </h3>
                  <ul className="space-y-2">
                    {lines.map((l) => (
                      <li key={l.id} className="text-sm flex gap-3">
                        <span
                          aria-hidden="true"
                          className={`tnum shrink-0 w-14 text-right font-medium ${
                            !l.available ? 'text-muted' : l.earned === l.max ? 'text-good' : l.earned === 0 ? 'text-bad' : 'text-warn'
                          }`}
                        >
                          {l.available ? `${l.earned}/${l.max}` : 'n/a'}
                        </span>
                        <span>
                          <span className="font-medium">{l.label}.</span>{' '}
                          <span className="text-muted">{l.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mb-12">
        <h2 className="text-xl font-bold mb-1">Crawler policy</h2>
        <p className="text-sm text-muted mb-4">
          Read from {domain}/robots.txt. A crawler is listed as blocked when the rules deny it the
          site root.
        </p>
        <div className="overflow-x-auto border border-rule rounded">
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">AI crawler access policy for {domain}</caption>
            <thead>
              <tr className="bg-raised text-left">
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Crawler</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Operator</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Tier</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...tier1, ...tier2].map((a) => {
                const blocked = blockedSet.has(a.token);
                return (
                  <tr key={a.token} className="border-b border-rule last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/bots/${agentSlug(a.token)}`} className="font-mono hover:text-accent underline underline-offset-4">
                        {a.token}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{a.operator}</td>
                    <td className="px-3 py-2 tnum text-muted">{a.tier}</td>
                    <td className={`px-3 py-2 font-medium ${blocked ? 'text-bad' : 'text-good'}`}>
                      {blocked ? 'Blocked' : 'Allowed'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {changes.length ? (
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4">Recorded changes</h2>
          <ul className="space-y-2 text-sm">
            {changes.map((c) => (
              <li key={c.id} className="flex gap-3 border-b border-rule pb-2">
                <time className="tnum text-muted shrink-0" dateTime={c.changed_at}>
                  {c.changed_at.slice(0, 10)}
                </time>
                <span>{c.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-rule pt-8">
        <h2 className="text-xl font-bold mb-3">Show this score</h2>
        <p className="text-sm text-muted mb-4 max-w-2xl">
          The badge is free to embed and always reflects the latest measurement. It links back to
          this page so anyone can check the working.
        </p>
        <img
          src={`/badge/${domain}.svg`}
          alt={`CrawlIndex badge for ${domain}, score ${row.score ?? 'unavailable'}`}
          width={196}
          height={28}
          className="mb-4"
        />
        <pre className="overflow-x-auto text-xs bg-raised border border-rule rounded p-3">
          <code>{`<a href="${absoluteUrl(`/site/${domain}`)}"><img src="${absoluteUrl(`/badge/${domain}.svg`)}" alt="CrawlIndex agent readiness score for ${domain}" width="196" height="28"></a>`}</code>
        </pre>
        <p className="text-sm mt-4">
          <a href={`/api/v1/domain/${domain}`} className="text-accent underline underline-offset-4">
            This measurement as JSON
          </a>
        </p>
      </section>
    </>
  );
}
