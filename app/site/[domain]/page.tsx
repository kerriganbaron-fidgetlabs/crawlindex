import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AGENTS, agentSlug, TIER1 } from '../../../lib/agents';
import { badgeTier, isEmbeddable, TIER_NAME } from '../../../lib/badge';
import { allDomains, changesFor, getDomain, scoreHistogram } from '../../../lib/dataset';
import {
  ARCHETYPE_BLURB,
  ARCHETYPE_LABEL,
  POSTURE_BLURB,
  POSTURE_LABEL,
} from '../../../lib/facets';
import { contradictsStatedPolicy, describeCloaking } from '../../../lib/findings';
import { networkLabel, platformLabel } from '../../../lib/fingerprints';
import { normaliseDomain } from '../../../lib/http';
import { bodyIsStub } from '../../../lib/score';
import { absoluteUrl, SITE } from '../../../lib/site';
import { Attribution, PageHeader, PageMeta, ScoreChip } from '../../../components/ui';
import { BandBars, Histogram } from '../../../components/charts';
import { BadgeEmbed } from '../../../components/badge-embed';
import { Explain } from '../../../components/explain';

type Props = { params: Promise<{ domain: string }> };

/** Fully static. The dataset changes once a night and a deploy follows it, so there is
 *  nothing to revalidate and no reason for a request to ever touch a server. */
export const dynamicParams = false;

export function generateStaticParams() {
  return allDomains().map((r) => ({ domain: r.domain }));
}

function describe(domain: string, score: number | null, blocked: number, percentile: number | null): string {
  if (score === null) return `${domain} could not be measured on its last crawl.`;
  const access =
    blocked === 0
      ? 'It allows every answer-surface AI crawler.'
      : `It blocks ${blocked} of ${TIER1.length} answer-surface AI crawlers.`;
  const rank = percentile !== null ? ` That is ahead of ${percentile}% of measured sites.` : '';
  return `${domain} scores ${score} out of 100 for agent readiness. ${access}${rank}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const domain = normaliseDomain((await params).domain);
  const row = getDomain(domain);
  if (!row) return { title: domain, robots: { index: false, follow: true } };

  const description = describe(domain, row.score.total, row.obs.tier1Blocked.length, row.percentile);
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
  surface: ['robots', 'sitemap', 'llms-txt', 'agents-md', 'declared-licence', 'content-signal', 'agent-card'],
  structure: [
    'schema-org',
    'schema-website',
    'schema-other',
    'ssr-text',
    'single-h1',
    'landmarks',
    'dateline',
    'authorship',
  ],
};

export default async function DomainPage({ params }: Props) {
  const domain = normaliseDomain((await params).domain);
  const row = getDomain(domain);
  if (!row) notFound();

  const { obs, score, percentile } = row;
  const changes = changesFor(domain).slice(0, 10);
  const blockedSet = new Set([...obs.tier1Blocked, ...obs.tier2Blocked]);
  const measuredOn = obs.observedAt.slice(0, 10);
  const tier = badgeTier(score.total, score.grade);
  const sig = obs.signals;

  /**
   * The fix list. Only lines we could actually observe and that did not earn full marks,
   * heaviest first.
   *
   * This is what a site scoring 41 gets instead of a badge, and it is the more useful of
   * the two: the points are usually concentrated in two or three changes, and saying which
   * ones is the difference between a scolding and a to-do list.
   */
  const fixes = score.lines
    .filter((l) => l.available && l.earned < l.max)
    .map((l) => ({ ...l, gap: Number((l.max - l.earned).toFixed(1)) }))
    .sort((a, b) => b.gap - a.gap);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${domain} agent readiness measurement`,
    description: describe(domain, score.total, obs.tier1Blocked.length, percentile),
    url: absoluteUrl(`/site/${domain}`),
    isAccessibleForFree: true,
    license: SITE.licenceUrl,
    dateModified: obs.observedAt,
    creator: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    publisher: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    isPartOf: { '@type': 'Dataset', name: SITE.name, url: SITE.url },
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'CrawlIndex Score', value: score.total ?? 'unavailable' },
      { '@type': 'PropertyValue', name: 'Percentile', value: percentile ?? 'unavailable' },
      { '@type': 'PropertyValue', name: 'Policy posture', value: POSTURE_LABEL[row.posture] },
      { '@type': 'PropertyValue', name: 'Access archetype', value: ARCHETYPE_LABEL[row.archetype] },
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
        lede={describe(domain, score.total, obs.tier1Blocked.length, percentile)}
      />

      <div className="flex flex-wrap items-start gap-8 mb-10">
        <div>
          <ScoreChip score={score.total} grade={score.grade} partial={score.partial} size="lg" />
          {tier !== 'unscored' ? (
            <p className="mt-2 text-sm font-medium">{TIER_NAME[tier]}</p>
          ) : null}
        </div>

        {percentile !== null ? (
          <div>
            <Histogram
              buckets={scoreHistogram()}
              markAt={score.total}
              markLabel={`Ahead of ${percentile}% of fully measured sites`}
            />
          </div>
        ) : null}

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
          <div className="flex gap-2">
            <dt className="text-muted">
              <Explain id="vantage">Vantage</Explain>
            </dt>
            <dd className="font-mono">{obs.vantage}</dd>
          </div>
        </dl>
      </div>

      {/* The facets. Two sentences that say more about the site than the number does. */}
      <section className="mb-10 grid gap-4 sm:grid-cols-2">
        <div className="border border-rule rounded p-4">
          <h2 className="text-sm font-semibold">
            <Explain id="posture">Policy posture</Explain>
          </h2>
          <p className="text-lg font-bold mt-1">{POSTURE_LABEL[row.posture]}</p>
          <p className="text-sm text-muted mt-1 leading-relaxed">{POSTURE_BLURB[row.posture]}</p>
        </div>
        <div className="border border-rule rounded p-4">
          <h2 className="text-sm font-semibold">
            <Explain id="archetype">Access archetype</Explain>
          </h2>
          <p className="text-lg font-bold mt-1">{ARCHETYPE_LABEL[row.archetype]}</p>
          <p className="text-sm text-muted mt-1 leading-relaxed">{ARCHETYPE_BLURB[row.archetype]}</p>
        </div>
      </section>

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

      {row.gap.gap ? (
        <div className="border-l-4 border-bad bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">
            <Explain id="policy-gap">This site&apos;s stated policy is not the one being enforced</Explain>
          </h2>
          <p className="text-sm">
            {row.gap.reason} Nothing in robots.txt asked for that, so it is almost certainly an edge
            rule applied above the operator rather than a decision they made. It is worth knowing
            about either way, because agents experience the enforcement and not the file.
          </p>
        </div>
      ) : null}

      {obs.reachable === false ? (
        <p className="border border-rule rounded p-4 bg-raised mb-10">
          This domain did not respond on its last crawl, so it has no score.{' '}
          {obs.error ? <span className="font-mono text-sm">{obs.error}</span> : null} An unreachable
          site is recorded as unmeasured, never as a zero.
        </p>
      ) : null}

      {obs.control.kind === 'payment-required' ? (
        <div className="border-l-4 border-accent bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">
            <Explain id="pay-per-crawl">This site charges agents for access</Explain>
          </h2>
          <p className="text-sm">
            It answered with HTTP 402 Payment Required. That is a pay-per-crawl gateway, not an
            error: access for AI agents here is metered rather than free.
            {sig?.crawlerPrice ? (
              <>
                {' '}
                The advertised price is <code className="font-mono">{sig.crawlerPrice}</code>.
              </>
            ) : null}{' '}
            Checks that depend on reading the page were excluded from the score.
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
      ) : obs.control.kind === 'unreadable' || bodyIsStub(obs) ? (
        // Two ways to land here. A probe-3 crawl records `unreadable` with its own reason
        // string. An older archived record has `kind: 'none'`, and the same conclusion is
        // re-derived from stored evidence at score time, so the explanation has to be
        // reconstructed here rather than read off the record.
        <div className="border-l-4 border-warn bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">
            <Explain id="stub">We were served a wall, not the site</Explain>
          </h2>
          <p className="text-sm">
            {obs.control.reason ??
              `The homepage answered with ${obs.cloaking.browserBytes.toLocaleString()} bytes and ${obs.content.ssrTextLength} characters of text${
                obs.cloaking.botStatus >= 400
                  ? `, then refused a request carrying an AI user agent with HTTP ${obs.cloaking.botStatus}`
                  : ''
              }.`}{' '}
            Everything that would be read from that response describes an anti-automation
            placeholder rather than anything {domain} publishes, so those checks were excluded and
            the score renormalised over what remained. Charging them to the site would be a claim
            about a page it never served us.
          </p>
        </div>
      ) : obs.control.challenged ? (
        <div className="border-l-4 border-warn bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">
            <Explain id="partial">Partial assessment</Explain>
          </h2>
          <p className="text-sm">
            Our measurement request was met with a bot challenge
            {obs.control.reason ? ` (${obs.control.reason})` : ''}. Anything we could otherwise read
            from the page describes that challenge rather than the site, so those checks were
            excluded and the score renormalised over what remained. The robots.txt findings are
            unaffected: that file is fetched separately and was served normally.
          </p>
        </div>
      ) : null}

      {contradictsStatedPolicy(obs) && !row.gap.gap ? (
        <div className="border-l-4 border-bad bg-raised p-4 mb-10">
          <h2 className="font-semibold mb-1">Stated policy and actual behaviour disagree</h2>
          <p className="text-sm">{describeCloaking(obs)}</p>
        </div>
      ) : null}

      {score.total !== null ? (
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4">How this score is made up</h2>
          <div className="mb-8 max-w-lg">
            <BandBars bands={score.bands} />
          </div>
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

      {fixes.length && score.total !== null ? (
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-1">What would move this score</h2>
          <p className="text-sm text-muted mb-4 max-w-2xl">
            The observable checks that did not earn full marks, heaviest first. Only these; a check
            we could not observe is not on the list, because it is not a fact about the site.
          </p>
          <ol className="space-y-2">
            {fixes.slice(0, 8).map((f) => (
              <li key={f.id} className="text-sm flex gap-3 border-b border-rule pb-2">
                <span className="tnum shrink-0 w-14 text-right font-semibold text-accent">
                  +{f.gap}
                </span>
                <span>
                  <span className="font-medium">{f.label}.</span>{' '}
                  <span className="text-muted">{f.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sig ? (
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-1">Extraction profile</h2>
          <p className="text-sm text-muted mb-4 max-w-2xl">
            How cheap this page is for a retrieval pipeline to chunk. Recorded and published,
            deliberately not scored: it describes a shape rather than a pass or a fail, and
            compressing it into the grade would destroy the useful part.
          </p>
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-sm">
            {[
              ['Server text', `${obs.content.ssrTextLength.toLocaleString()} chars`],
              ['Text density', `${Math.round(sig.textRatio * 100)}%`],
              ['Subheadings', `${sig.h2Count + sig.h3Count}`],
              ['Lists', `${sig.listCount}`],
              ['Tables', `${sig.tableCount}`],
              ['Feed', obs.content.feed ? 'yes' : 'no'],
            ].map(([k, v]) => (
              <div key={k} className="border border-rule rounded p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="tnum font-semibold mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
          {sig.licenseUrl || sig.contentSignal || sig.agentCard ? (
            <ul className="mt-4 space-y-1.5 text-sm">
              {sig.licenseUrl ? (
                <li>
                  <Explain id="rsl">Declares licence terms</Explain> at{' '}
                  <span className="font-mono text-xs">{sig.licenseUrl}</span>
                </li>
              ) : null}
              {sig.contentSignal ? (
                <li>
                  <Explain id="content-signal">Content-Signal</Explain>:{' '}
                  <code className="font-mono text-xs">{sig.contentSignal}</code>
                </li>
              ) : null}
              {sig.agentCard ? (
                <li>
                  Serves an <Explain id="agent-card">agent card</Explain> at
                  /.well-known/agent-card.json
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="mb-12">
        <h2 className="text-xl font-bold mb-1">Crawler policy</h2>
        <p className="text-sm text-muted mb-4 max-w-2xl">
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
        {isEmbeddable(tier) ? (
          <>
            <h2 className="text-xl font-bold mb-1">
              {domain} has earned the {TIER_NAME[tier]} mark
            </h2>
            <p className="text-sm text-muted mb-5 max-w-2xl">
              Free to embed, no account and no fee. It regenerates from the nightly crawl, so it
              stays true, and it links back to this page so anyone can check the working in one
              click.{' '}
              <Link href="/badge" className="text-accent underline underline-offset-4">
                What the mark means
              </Link>
              .
            </p>
            <BadgeEmbed origin={SITE.url} defaultDomain={domain} fixed />
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1">No mark at this score</h2>
            <p className="text-sm text-muted mb-4 max-w-2xl">
              The embeddable mark starts at grade B, because offering a graphic nobody would put on
              their own site is a pretence rather than a feature. The list above is the useful
              version: for most sites the points are concentrated in two or three changes.{' '}
              <Link href="/badge" className="text-accent underline underline-offset-4">
                How the mark works
              </Link>
              .
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/badge/${domain}.svg`}
              alt={`CrawlIndex mark for ${domain}, score ${score.total ?? 'unavailable'}`}
              width={232}
              height={40}
              className="mb-4"
            />
            <p className="text-xs text-muted max-w-2xl">
              The neutral mark above exists and is free to use if you want to show that the site is
              independently measured whatever the number says.
            </p>
          </>
        )}

        <p className="text-sm mt-6">
          <a href={`/api/v1/domain/${domain}.json`} className="text-accent underline underline-offset-4">
            This measurement as JSON
          </a>
        </p>
      </section>

      <PageMeta />
      <Attribution subject={`${domain} agent readiness`} measuredOn={measuredOn} />
    </>
  );
}
