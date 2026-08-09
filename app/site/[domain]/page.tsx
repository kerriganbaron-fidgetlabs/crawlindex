import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AGENTS, agentSlug, TIER1 } from '../../../lib/agents';
import { allDomains, changesFor, getDomain } from '../../../lib/dataset';
import { contradictsStatedPolicy, describeCloaking } from '../../../lib/findings';
import { networkLabel, platformLabel } from '../../../lib/fingerprints';
import { normaliseDomain } from '../../../lib/http';
import { absoluteUrl, SITE } from '../../../lib/site';
import { Attribution, PageHeader, ScoreChip } from '../../../components/ui';

type Props = { params: Promise<{ domain: string }> };

/** Fully static. The dataset changes once a night and a deploy follows it, so there is
 *  nothing to revalidate and no reason for a request to ever touch a server. */
export const dynamicParams = false;

export function generateStaticParams() {
  return allDomains().map((r) => ({ domain: r.domain }));
}

function describe(domain: string, score: number | null, blocked: number): string {
  if (score === null) return `${domain} could not be measured on its last crawl.`;
  const access =
    blocked === 0
      ? 'It allows every answer-surface AI crawler.'
      : `It blocks ${blocked} of ${TIER1.length} answer-surface AI crawlers.`;
  return `${domain} scores ${score} out of 100 for agent readiness. ${access}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const domain = normaliseDomain((await params).domain);
  const row = getDomain(domain);
  if (!row) return { title: domain, robots: { index: false, follow: true } };

  const description = describe(domain, row.score.total, row.obs.tier1Blocked.length);
  return {
    title: `${domain} agent readiness`,
    description,
    alternates: { canonical: `/site/${domain}` },
    openGraph: {
      title: `${domain}: agent readiness ${row.score.total ?? 'not scored'}`,
      description,
      url: absoluteUrl(`/site/${domain}`),
      type: 'article',
    },
  };
}

const BAND_LINES: Record<string, string[]> = {
  access: ['tier1-access', 'tier2-access', 'no-cloaking'],
  surface: ['robots', 'sitemap', 'llms-txt', 'agents-md'],
  structure: ['schema-org', 'schema-website', 'schema-other', 'ssr-text', 'single-h1', 'landmarks'],
};

export default async function DomainPage({ params }: Props) {
  const domain = normaliseDomain((await params).domain);
  const row = getDomain(domain);
  if (!row) notFound();

  const { obs, score } = row;
  const changes = changesFor(domain).slice(0, 10);
  const blockedSet = new Set([...obs.tier1Blocked, ...obs.tier2Blocked]);
  const measuredOn = obs.observedAt.slice(0, 10);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${domain} agent readiness measurement`,
    description: describe(domain, score.total, obs.tier1Blocked.length),
    url: absoluteUrl(`/site/${domain}`),
    isAccessibleForFree: true,
    license: SITE.licenceUrl,
    dateModified: obs.observedAt,
    creator: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    publisher: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    isPartOf: { '@type': 'Dataset', name: SITE.name, url: SITE.url },
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'CrawlIndex Score', value: score.total ?? 'unavailable' },
      { '@type': 'PropertyValue', name: 'Answer-surface crawlers blocked', value: obs.tier1Blocked.length },
      { '@type': 'PropertyValue', name: 'llms.txt published', value: String(obs.llmsTxt.present) },
      { '@type': 'PropertyValue', name: 'agents.md published', value: String(obs.agentsMd.present) },
    ],
  };

  const platform = platformLabel(obs.stack.platform);
  const network = networkLabel(obs.stack.network);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PageHeader
        kicker={row.rank ? `Tranco rank ${row.rank.toLocaleString()}` : 'Indexed domain'}
        title={domain}
        lede={describe(domain, score.total, obs.tier1Blocked.length)}
      />

      <div className="flex flex-wrap items-center gap-6 mb-10">
        <ScoreChip score={score.total} grade={score.grade} partial={score.partial} size="lg" />
        <dl className="text-sm space-y-1">
          <div className="flex gap-2">
            <dt className="text-muted">Last measured</dt>
            <dd className="tnum">{obs.observedAt.slice(0, 16).replace('T', ' ')} UTC</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">First seen</dt>
            <dd className="tnum">{row.firstSeen.slice(0, 10)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Rubric / probe</dt>
            <dd className="tnum">
              v{score.rubricVersion} / v{obs.probeVersion}
            </dd>
          </div>
        </dl>
      </div>

      {(platform || network) && (
        <p className="text-sm mb-10">
          {platform ? (
            <>
              Built on{' '}
              <Link href={`/platforms/${obs.stack.platform}`} className="text-accent underline underline-offset-4">
                {platform}
              </Link>
            </>
          ) : null}
          {platform && network ? ', served through ' : network ? 'Served through ' : null}
          {network ? (
            <Link href={`/networks/${obs.stack.network}`} className="text-accent underline underline-offset-4">
              {network}
            </Link>
          ) : null}
          . Compare against everything else on the same stack.
        </p>
      )}

      {obs.reachable === false ? (
        <p className="border border-rule rounded p-4 bg-raised mb-10">
          This domain did not respond on its last crawl, so it has no score.{' '}
          {obs.error ? <span className="font-mono text-sm">{obs.error}</span> : null} An unreachable
          site is recorded as unmeasured, never as a zero.
        </p>
      ) : null}

      {obs.control.kind === 'payment-required' ? (
        <div className="border-l-4 border-accent bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">This site charges agents for access</h2>
          <p className="text-sm">
            It answered with HTTP 402 Payment Required. That is a pay-per-crawl gateway, not an
            error: access for AI agents here is metered rather than free. Checks that depend on
            reading the page were excluded from the score.
          </p>
        </div>
      ) : obs.control.kind === 'robots-restricted' ? (
        <div className="border-l-4 border-warn bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">Closed to all crawlers</h2>
          <p className="text-sm">
            robots.txt disallows every crawler at the site root, so we read the policy and fetched
            no page. The access findings below stand; everything that would need the page itself
            was excluded rather than scored zero.
          </p>
        </div>
      ) : obs.control.challenged ? (
        <div className="border-l-4 border-warn bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">Partial assessment</h2>
          <p className="text-sm">
            Our measurement request was met with a bot challenge
            {obs.control.reason ? ` (${obs.control.reason})` : ''}. Anything we could otherwise read
            from the page describes that challenge rather than the site, so those checks were
            excluded and the score renormalised over what remained. The robots.txt findings are
            unaffected: that file is fetched separately and was served normally.
          </p>
        </div>
      ) : null}

      {contradictsStatedPolicy(obs) ? (
        <div className="border-l-4 border-bad bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">Stated policy and actual behaviour disagree</h2>
          <p className="text-sm">{describeCloaking(obs)}</p>
        </div>
      ) : null}

      {score.total !== null ? (
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4">How this score is made up</h2>
          <div className="space-y-6">
            {score.bands.map((band) => {
              const lines = score.lines.filter((l) => BAND_LINES[band.id]?.includes(l.id));
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
                            !l.available
                              ? 'text-muted'
                              : l.earned === l.max
                                ? 'text-good'
                                : l.earned === 0
                                  ? 'text-bad'
                                  : 'text-warn'
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
          {obs.robots.namedTokens.length > 0 ? (
            <>
              {' '}
              This operator names {obs.robots.namedTokens.length} AI crawler
              {obs.robots.namedTokens.length === 1 ? '' : 's'} explicitly, which means the policy is
              deliberate rather than inherited from a wildcard rule.
            </>
          ) : (
            <> This operator names no AI crawler explicitly.</>
          )}
        </p>
        <div className="overflow-x-auto border border-rule rounded">
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">AI crawler access policy for {domain}</caption>
            <thead>
              <tr className="bg-raised text-left">
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Crawler</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Operator</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Tier</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Named</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {AGENTS.map((a) => {
                const blocked = blockedSet.has(a.token);
                const named = obs.robots.namedTokens.includes(a.token);
                return (
                  <tr key={a.token} className="border-b border-rule last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/bots/${agentSlug(a.token)}`} className="font-mono hover:text-accent underline underline-offset-4">
                        {a.token}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{a.operator}</td>
                    <td className="px-3 py-2 tnum text-muted">{a.tier}</td>
                    <td className="px-3 py-2 text-muted">{named ? 'yes' : 'no'}</td>
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
            {changes.map((c, i) => (
              <li key={`${c.changedAt}-${i}`} className="flex gap-3 border-b border-rule pb-2">
                <time className="tnum text-muted shrink-0" dateTime={c.changedAt}>
                  {c.changedAt.slice(0, 10)}
                </time>
                <span>{c.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-bold mb-3">Show this score</h2>
        <p className="text-sm text-muted mb-4 max-w-2xl">
          Free to embed. Always reflects the latest measurement, and links back here so anyone can
          check the working.
        </p>
        <img
          src={`/badge/${domain}.svg`}
          alt={`CrawlIndex badge for ${domain}, score ${score.total ?? 'unavailable'}`}
          width={196}
          height={28}
          className="mb-4"
        />
        <pre className="overflow-x-auto text-xs bg-raised border border-rule rounded p-3">
          <code>{`<a href="${absoluteUrl(`/site/${domain}`)}"><img src="${absoluteUrl(`/badge/${domain}.svg`)}" alt="CrawlIndex agent readiness score for ${domain}" width="196" height="28"></a>`}</code>
        </pre>
        <p className="text-sm mt-4">
          <a href={`/api/v1/domain/${domain}.json`} className="text-accent underline underline-offset-4">
            This measurement as JSON
          </a>
        </p>
      </section>

      <Attribution subject={`${domain} agent readiness`} measuredOn={measuredOn} />
    </>
  );
}
