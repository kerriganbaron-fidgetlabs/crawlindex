import type { Metadata } from 'next';
import Link from 'next/link';
import { allDomains } from '../../lib/dataset';
import { SITE } from '../../lib/site';
import { PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Add a domain',
  description:
    'Submit any domain to be measured nightly by CrawlIndex and given a permanent page. Free, automatic, no account beyond GitHub.',
  alternates: { canonical: '/submit' },
};

const NEW_ISSUE = `${SITE.repo}/issues/new?template=add-domain.yml`;

export default function SubmitPage() {
  const count = allDomains().length;

  return (
    <>
      <PageHeader
        kicker="Submit"
        title="Add a domain to the index"
        lede={`The nightly crawl covers ${count.toLocaleString()} domains, drawn from the most-visited sites on the web. Anything outside that can be added here, and it costs nothing.`}
      />

      <section className="mb-12 max-w-2xl">
        <a
          href={NEW_ISSUE}
          className="inline-block border-2 border-accent text-accent font-medium rounded px-5 py-2.5 hover:bg-accent-soft"
        >
          Open the submission form
        </a>
        <p className="text-sm text-muted mt-3">
          Opens a prefilled issue on GitHub. It asks for one thing: the hostname.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold mb-1">
          What happens next
        </h2>
        <p className="text-sm text-muted mb-5 max-w-2xl">
          Nobody reviews it. There is no queue and no approval step, which is why this is worth
          doing rather than being another form that goes nowhere.
        </p>
        <ol className="space-y-3 max-w-2xl">
          {[
            ['You file the issue', 'One field. GitHub handles the account and the spam filtering, so this site needs neither.'],
            [
              'Tonight, the crawler reads it',
              'At 02:30 UTC the nightly run picks up every open submission, validates the domain and adds the valid ones to the corpus.',
            ],
            [
              'It gets measured on the same run',
              'Same probe, same rubric, same treatment as every other domain. No preferential handling for a site that asked to be here.',
            ],
            [
              'The issue closes with a link',
              'Either to the new page, or with the specific reason the domain was refused. Either way you get an answer within a day and it is a public one.',
            ],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="tnum shrink-0 w-7 h-7 rounded-full border-2 border-accent text-accent font-bold text-sm flex items-center justify-center">
                {i + 1}
              </span>
              <span>
                <strong className="block">{title}</strong>
                <span className="text-muted text-sm leading-relaxed">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12 max-w-2xl" aria-labelledby="refused">
        <h2 id="refused" className="text-2xl font-bold mb-3">
          What gets refused
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          Only two things, and neither is a judgement about the site.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="border-l-2 border-rule pl-3">
            <strong>Anything that is not a valid hostname.</strong> No schemes, no paths, no ports.
          </li>
          <li className="border-l-2 border-rule pl-3">
            <strong>Infrastructure rather than a site.</strong> CDN hosts, analytics endpoints, ad
            exchanges, nameservers and deeply nested subdomains. They rank highly because everything
            embeds them, they have no homepage anyone reads, and scoring them would distort every
            aggregate on the index. The rule is a published pattern list, not a decision somebody
            makes case by case.
          </li>
        </ul>
        <p className="text-muted leading-relaxed mt-4">
          Notably not on that list: whether the site scores well, whether you own it, or whether the
          operator would like to be measured. Everything here is read from files those servers
          already hand to every crawler on the internet.
        </p>
      </section>

      <section className="mb-12 max-w-2xl border border-rule rounded p-5 bg-raised">
        <h2 className="text-lg font-bold mb-2">If you want a domain out</h2>
        <p className="text-sm leading-relaxed">
          Disallow <code className="font-mono">CrawlIndexBot</code> in the site&apos;s robots.txt. It
          is checked before any other request is made, so opting out costs the server exactly one
          request, and the domain leaves the published index on the next crawl. No message to
          anyone, no waiting on a person, and no account.
        </p>
        <p className="text-sm text-muted mt-3">
          A blanket <code className="font-mono">User-agent: * / Disallow: /</code> is honoured by
          fetching no pages, but it is not treated as an opt-out. Deleting the most restrictive
          operators on the web from an index about restrictiveness would make the index useless, so
          only naming the token counts.
        </p>
      </section>

      <p className="text-sm">
        <Link href="/check" className="text-accent underline underline-offset-4">
          Measure a domain right now instead
        </Link>
        {' . '}
        <Link href="/coverage" className="text-accent underline underline-offset-4">
          See what the index does and does not cover
        </Link>
      </p>
    </>
  );
}
