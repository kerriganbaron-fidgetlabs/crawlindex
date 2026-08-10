import type { Metadata } from 'next';
import Link from 'next/link';
import { allDomains } from '../../lib/dataset';
import { normaliseDomain } from '../../lib/http';
import { DomainTable, PageHeader } from '../../components/ui';

/**
 * The search page.
 *
 * This exists so search works with JavaScript switched off, on a text browser, and for a
 * crawler following a link. The dialog in the header is the fast path; this is the
 * guarantee underneath it. Rendered at request time because a static page cannot answer
 * an arbitrary query, which is the same exception `/check` already takes.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search the index',
  description:
    'Look up any of the domains measured by CrawlIndex: which AI crawlers it blocks, whether it publishes llms.txt or agents.md, and how it scores.',
  alternates: { canonical: '/search' },
};

type Props = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: Props) {
  const raw = (await searchParams).q?.trim() ?? '';
  const needle = normaliseDomain(raw);

  const results =
    needle.length >= 2
      ? allDomains()
          .filter((r) => r.domain.includes(needle))
          .sort((a, b) => {
            // Exact first, then prefix, then substring; rank breaks ties inside a tier.
            const tier = (d: string) => (d === needle ? 0 : d.startsWith(needle) ? 1 : 2);
            const t = tier(a.domain) - tier(b.domain);
            return t !== 0 ? t : (a.rank ?? 1e9) - (b.rank ?? 1e9);
          })
          .slice(0, 100)
      : [];

  return (
    <>
      <PageHeader
        kicker="Search"
        title="Look up a domain"
        lede={`Searches the ${allDomains().length.toLocaleString()} domains in the nightly index. A domain that is not here can still be measured live.`}
      />

      <form method="get" action="/search" className="mb-10 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-64">
          <label htmlFor="q" className="block text-sm font-medium mb-1">
            Domain
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={raw}
            placeholder="bbc.co.uk"
            className="w-full border border-rule rounded px-3 py-2 bg-paper text-ink font-mono"
          />
        </div>
        <button
          type="submit"
          className="border-2 border-accent text-accent font-medium rounded px-5 py-2 hover:bg-accent-soft"
        >
          Search
        </button>
      </form>

      {raw && needle.length < 2 ? (
        <p className="text-muted">Enter at least two characters.</p>
      ) : raw && results.length === 0 ? (
        <div className="border border-rule rounded p-5 bg-raised">
          <h2 className="text-lg font-bold mb-2">Nothing in the index matches {raw}</h2>
          <p className="text-sm text-muted mb-3">
            The index covers the most-visited domains on the web plus anything submitted, so plenty
            of real sites are not in it.
          </p>
          <p className="text-sm flex flex-wrap gap-x-5 gap-y-1">
            <Link href={`/check?domain=${encodeURIComponent(raw)}`} className="text-accent underline underline-offset-4">
              Measure it live
            </Link>
            <Link href="/submit" className="text-accent underline underline-offset-4">
              Add it to the nightly index
            </Link>
          </p>
        </div>
      ) : results.length ? (
        <section>
          <h2 className="text-lg font-bold mb-4">
            {results.length === 100 ? 'First 100 matches' : `${results.length} match${results.length === 1 ? '' : 'es'}`}
          </h2>
          <DomainTable rows={results} caption={`Domains matching ${needle}`} showStack />
        </section>
      ) : null}
    </>
  );
}
