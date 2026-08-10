import type { Metadata } from 'next';
import Link from 'next/link';
import { allDomains, getMeta, observedRows, scoredRows } from '../../lib/dataset';
import { Attribution, PageHeader, PageMeta } from '../../components/ui';
import { GrowBar, Reveal } from '../../components/motion';

export const metadata: Metadata = {
  title: 'Coverage and its limits',
  description:
    'What CrawlIndex measures, what it drops and why: the full funnel from attempted domains to fully scored ones, every reason a site falls out, and the limits of a single vantage point.',
  alternates: { canonical: '/coverage' },
};

/**
 * The honesty page.
 *
 * Every measurement project has a funnel from "domains we tried" to "domains we can make a
 * claim about", and almost none of them publish it. Ours loses roughly a third of the
 * corpus before scoring, for reasons ranging from dead DNS to bot walls, and a reader who
 * cannot see that cannot judge any percentage on the rest of the site. So it goes here,
 * generated from the same data, with the failure reasons counted rather than summarised.
 */
export default function CoveragePage() {
  const meta = getMeta();
  const all = allDomains();
  const observed = observedRows();
  const scored = scoredRows();

  const attempted = meta?.crawl.attempted ?? all.length;
  const published = all.length;
  const unreachable = all.filter((r) => !r.obs.reachable).length;
  const partial = observed.length - scored.length;

  // Group the failure reasons rather than listing four thousand strings. The prefix before
  // a colon is the transport-level cause, which is the level a reader can act on.
  const reasons = new Map<string, number>();
  for (const r of all) {
    if (r.obs.reachable) continue;
    const raw = r.obs.error ?? 'no response';
    const key = raw.split(':')[0].trim().slice(0, 48);
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const partialReasons = new Map<string, number>();
  for (const r of observed) {
    if (!r.score.partial) continue;
    partialReasons.set(r.obs.control.kind, (partialReasons.get(r.obs.control.kind) ?? 0) + 1);
  }

  const KIND_LABEL: Record<string, string> = {
    'bot-challenge': 'A bot wall answered instead of the site',
    unreadable: 'A stub with no readable content was served to our crawler',
    'payment-required': 'HTTP 402, access is metered rather than free',
    'robots-restricted': 'robots.txt bars every crawler, so no page was fetched',
    none: 'Measured before the current probe, so newer checks were never asked',
  };

  const funnel = [
    { label: 'Domains attempted on the last crawl', n: attempted },
    { label: 'Published records', n: published },
    { label: 'Reachable and observed', n: observed.length },
    { label: 'Fully scored and comparable', n: scored.length },
  ];

  return (
    <>
      <PageHeader
        kicker="Coverage"
        title="What this index does not cover"
        lede="Every measurement project has a funnel between the domains it tries and the domains it can make a claim about. Most do not publish theirs. Ours loses roughly a third of the corpus before scoring, and you cannot judge any percentage on this site without knowing that."
      />

      <section className="mb-14" aria-labelledby="funnel">
        <h2 id="funnel" className="text-2xl font-bold mb-5">
          The funnel
        </h2>
        <ul className="space-y-4 max-w-2xl">
          {funnel.map((f) => (
            <li key={f.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{f.label}</span>
                <span className="tnum text-muted">
                  {f.n.toLocaleString()}{' '}
                  <span className="text-xs">({Math.round((f.n / Math.max(1, attempted)) * 100)}%)</span>
                </span>
              </div>
              <GrowBar percent={(f.n / Math.max(1, attempted)) * 100} label={`${f.label}: ${f.n}`} />
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted mt-5 max-w-2xl leading-relaxed">
          Everything on the site that says "of measured sites" uses the third number as its
          denominator. Everything ranked uses the fourth. Neither uses the first, because counting
          a domain we could not reach as a failing site would be a claim we have no evidence for.
        </p>
      </section>

      <Reveal>
        <section className="mb-14" aria-labelledby="unreachable">
          <h2 id="unreachable" className="text-2xl font-bold mb-1">
            Why {unreachable.toLocaleString()} domains could not be reached
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            A ranking of the most-visited domains contains a surprising amount of rubble: hosts that
            have moved, parked, expired, or never served a website in the first place. A domain
            failing three consecutive crawls is demoted out of the published population with the
            reason recorded.
          </p>
          <div className="overflow-x-auto border border-rule rounded">
            <table className="w-full text-sm border-collapse">
              <caption className="sr-only">Transport-level reasons a domain could not be measured</caption>
              <thead>
                <tr className="bg-raised text-left">
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Reason</th>
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-24">Domains</th>
                  <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">What it means</th>
                </tr>
              </thead>
              <tbody>
                {topReasons.map(([reason, n]) => (
                  <tr key={reason} className="border-b border-rule last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{reason}</td>
                    <td className="px-3 py-2 tnum">{n.toLocaleString()}</td>
                    <td className="px-3 py-2 text-muted text-xs">{EXPLAIN[reason] ?? 'A transport failure reported by the runtime.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-14" aria-labelledby="partial">
          <h2 id="partial" className="text-2xl font-bold mb-1">
            Why {partial.toLocaleString()} more are measured but not ranked
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            These sites answered, but something stopped us observing part of the rubric honestly.
            Those checks are removed from the total rather than failed, which leaves a score
            renormalised over fewer points, which is not comparable with a complete one. So they
            are published on their own pages and kept out of ranked lists.
          </p>
          <ul className="space-y-2 max-w-2xl">
            {[...partialReasons.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([kind, n]) => (
                <li key={kind} className="flex gap-4 text-sm border-b border-rule pb-2">
                  <span className="tnum shrink-0 w-16 text-right font-semibold">{n.toLocaleString()}</span>
                  <span>{KIND_LABEL[kind] ?? kind}</span>
                </li>
              ))}
          </ul>
          <p className="text-sm text-muted mt-5 max-w-2xl leading-relaxed">
            This is the rule that keeps the index honest and it has been wrong in both directions.
            Reddit once scored 3 because our crawler hit a proof-of-work wall, which would have been
            a lie about Reddit. Amazon scored 8 across twenty country domains because a 2KB
            anti-automation stub slipped past the challenge detector and every check derived from
            that stub was charged to Amazon. Both are now excluded rather than counted.
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-14 max-w-2xl scroll-mt-20" id="health" aria-labelledby="health-h">
          <h2 id="health-h" className="text-2xl font-bold mb-4">
            What happens when a crawl goes wrong
          </h2>
          <p className="text-muted leading-relaxed mb-4">
            Every guard in this project used to protect against the crawl <em>failing</em>. None
            protected against the crawl succeeding in a changed world. If a network starts refusing
            our crawler, several hundred origins become unreachable, drop out of the denominator,
            and the surviving subset gets published as the headline with tonight&apos;s date on it.
            Every process exits zero and nothing says a word. Checking a vendor status page cannot
            catch that, because the infrastructure is fine and the measurement environment is not.
          </p>
          <p className="text-muted leading-relaxed mb-4">
            So each run is now compared against the last one that passed. Reachability, the size of
            the measured population, the size of the published population, the mean score, and the
            volume of change records all have to stay within a sane range of the previous night. A
            run that fails any of those is <strong className="text-ink">quarantined</strong>.
          </p>
          <ul className="space-y-2 mb-4">
            {[
              ['The observations are still written', 'They are the evidence needed to work out what went wrong.'],
              ['No change records are recorded', 'A change record is a claim about a named site, and a run we do not trust must not make claims about anybody.'],
              ['The day is excluded from monthly reports', 'A sealed report is never rewritten, so this is the one consequence a later re-crawl could not undo.'],
              ['The site keeps showing the last day that passed', 'With a banner naming the reasons, rather than quietly serving old numbers under a new date.'],
            ].map(([term, def]) => (
              <li key={term} className="border-l-2 border-rule pl-3">
                <strong className="block text-sm">{term}</strong>
                <span className="text-muted text-sm leading-relaxed">{def}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted leading-relaxed">
            Recovery is a re-run. Nothing is deleted and nothing is hidden, and the quarantine
            clears the moment a clean crawl replaces the day.
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-14 max-w-2xl" aria-labelledby="limits">
          <h2 id="limits" className="text-2xl font-bold mb-4">
            Limits that no amount of crawling fixes
          </h2>
          <dl className="space-y-5">
            {[
              [
                'One vantage point',
                `Everything is measured from GitHub's runners in the US and EU. Origins genuinely serve differently by geography and IP reputation, so this index describes what an agent on that network sees. The vantage is recorded on every record and change detection refuses to compare across a change to it, but the geographic bias is real.`,
              ],
              [
                'One page per site',
                'The probe reads the homepage, robots.txt and three well-known paths. A site with a superb, well-structured article section and a thin homepage scores the thin homepage. Six requests per domain is what makes a nightly crawl of thousands of sites free and polite; fifteen would not be.',
              ],
              [
                'Cloaking detection is conservative',
                'Only an outright refusal or a response under a quarter the size of the browser response counts. Dynamic pages vary legitimately, so treat an individual result as indicative and the aggregate as sound.',
              ],
              [
                'Fingerprints drift',
                'Platforms and CDNs change their headers. A wrong label poisons a cross-tab, so the rule is never to guess: an unrecognised stack is null, not a guess, and cohorts under 25 sites are not published at all.',
              ],
              [
                'The corpus is the popular web',
                'Tranco ranks the most-visited domains. That is the right population for a longitudinal index and the wrong one for a claim about the web as a whole, which is mostly small sites nobody ranks.',
              ],
            ].map(([term, def]) => (
              <div key={term}>
                <dt className="font-bold">{term}</dt>
                <dd className="text-muted leading-relaxed mt-1">{def}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Reveal>

      <section className="border-t border-rule pt-8 max-w-2xl">
        <h2 className="text-xl font-bold mb-3">Something missing?</h2>
        <p className="text-muted leading-relaxed">
          <Link href="/submit" className="text-accent underline underline-offset-4">
            Add a domain
          </Link>{' '}
          and it is measured on the next crawl.{' '}
          <Link href="/check" className="text-accent underline underline-offset-4">
            Check one live
          </Link>{' '}
          without adding it. Or{' '}
          <Link href="/data" className="text-accent underline underline-offset-4">
            take the dataset
          </Link>{' '}
          and compute your own denominators.
        </p>
      </section>

      <PageMeta />
      <Attribution subject="CrawlIndex coverage and limits" measuredOn={null} />
    </>
  );
}

/** Plain-language notes for the transport errors that actually turn up in the corpus. */
const EXPLAIN: Record<string, string> = {
  ENOTFOUND: 'DNS has no record. The domain is parked, expired, or was never a website.',
  UND_ERR_CONNECT_TIMEOUT: 'The host accepted no connection before the timeout.',
  timeout: 'A connection was made but no response arrived in time.',
  ETIMEDOUT: 'The connection attempt itself timed out.',
  ECONNREFUSED: 'Something is at that address and it actively refused the connection.',
  ECONNRESET: 'The connection was closed mid-response.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'The certificate does not cover this hostname.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'The certificate chain could not be verified.',
  CERT_HAS_EXPIRED: 'The TLS certificate has expired.',
  'redirect count exceeded': 'A redirect loop, or a chain longer than any browser would follow.',
  EAI_AGAIN: 'A temporary DNS resolution failure.',
  'no response': 'The request produced nothing the runtime could describe.',
};
