import type { Metadata } from 'next';
import Link from 'next/link';
import { allDomains, getMeta, latestStats } from '../../lib/dataset';
import { SITE, citation } from '../../lib/site';
import { PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Download the dataset',
  description:
    'The complete CrawlIndex dataset, free under CC BY 4.0: every measured domain, the full daily statistics series, and the change log. JSON Lines, updated nightly.',
  alternates: { canonical: '/data' },
};

const FILES = [
  {
    path: '/data/domains.jsonl',
    name: 'domains.jsonl',
    what: 'One JSON object per measured domain, sorted by domain. Contains the complete archived observation each score was computed from.',
  },
  {
    path: '/data/stats.json',
    name: 'stats.json',
    what: 'The full daily statistics series since the index began, including per-crawler, per-platform and per-network breakdowns.',
  },
  {
    path: '/data/changes.jsonl',
    name: 'changes.jsonl',
    what: 'Every recorded change in crawler policy, agent files, score or reachability.',
  },
  {
    path: '/data/meta.json',
    name: 'meta.json',
    what: 'When the last crawl ran, from where, and under which probe and rubric versions.',
  },
];

export default function DataPage() {
  const meta = getMeta();
  const stats = latestStats();
  const count = allDomains().length;

  return (
    <>
      <PageHeader
        kicker="Open data"
        title="Take the whole thing"
        lede="The entire dataset is a handful of files you can download, diff and re-run. There is no API key, no rate limit and no signup, because a public measurement project that makes its data awkward to obtain is not really public."
      />

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Files</h2>
        <div className="space-y-4">
          {FILES.map((f) => (
            <div key={f.path} className="border border-rule rounded p-4">
              <p className="font-mono text-sm font-semibold">
                <a href={f.path} className="text-accent underline underline-offset-4">
                  {f.name}
                </a>
              </p>
              <p className="text-sm text-muted mt-2">{f.what}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted mt-4">
          {count.toLocaleString()} domains in the current file.
          {meta ? (
            <>
              {' '}
              Last crawl {meta.generatedAt.slice(0, 16).replace('T', ' ')} UTC from {meta.vantage},
              probe v{meta.probeVersion}, rubric v{meta.rubricVersion}.
            </>
          ) : null}
        </p>
      </section>

      <section className="mb-12 max-w-2xl space-y-4 leading-relaxed">
        <h2 className="text-2xl font-bold">Every past version, too</h2>
        <p>
          The dataset lives in a public git repository and is rewritten by the nightly crawl, so
          every state the index has ever been in is a commit. That makes any figure permanently
          checkable: if a report quotes a number from three months ago, you can check out that
          commit and recompute it.
        </p>
        <p>
          <a href={SITE.repo} className="text-accent underline underline-offset-4">
            The repository
          </a>{' '}
          holds the code, the data and the history.
        </p>

        <h2 className="text-2xl font-bold pt-4">Recomputing a score yourself</h2>
        <p>
          Each record archives the observation, not just the verdict. Scoring is a pure function
          over that object, so running <code className="font-mono text-sm">scoreObservation</code>{' '}
          on a stored record reproduces the published score exactly. If it does not, that is a bug
          worth reporting.
        </p>

        <h2 className="text-2xl font-bold pt-4">Two fields that decide what a score means</h2>
        <p>
          <code className="font-mono text-sm">score: null</code> means the site could not be
          measured. It is not a zero and should be excluded from averages rather than coerced.
        </p>
        <p>
          <code className="font-mono text-sm">partial: true</code> means some checks could not be
          observed, usually because the request met a bot wall, so the total was renormalised over
          the points that remained. A partial 80 and a complete 80 are not the same claim. Do not
          rank them together.
        </p>
      </section>

      <section className="border-t border-rule pt-8 max-w-2xl">
        <h2 className="text-xl font-bold mb-3">Licence and credit</h2>
        <p className="text-sm text-muted mb-3">
          The data is licensed{' '}
          <a href={SITE.licenceUrl} className="text-accent underline underline-offset-4">
            {SITE.licence}
          </a>
          . Use it in research, journalism or a commercial product. The only condition is credit to{' '}
          {SITE.publisher}.
        </p>
        <pre className="overflow-x-auto text-xs bg-raised border border-rule rounded p-3">
          <code>{citation('CrawlIndex dataset', stats?.day ?? null)}</code>
        </pre>
        <p className="text-sm mt-4">
          <Link href="/methodology" className="text-accent underline underline-offset-4">
            How the measurements are taken
          </Link>
        </p>
      </section>
    </>
  );
}
