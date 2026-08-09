import type { Metadata } from 'next';
import Link from 'next/link';
import { allChanges, latestStats } from '../../lib/dataset';
import { Attribution, PageHeader } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Recent changes',
  description:
    'Sites that changed how they treat AI crawlers: newly blocked or newly allowed bots, llms.txt added or removed, and score movements. Updated nightly.',
  alternates: { canonical: '/changes' },
};

const KIND_LABEL: Record<string, string> = {
  access: 'Crawler policy',
  surface: 'Agent files',
  score: 'Score',
  reachability: 'Availability',
};

export default function ChangesPage() {
  const changes = allChanges().slice(0, 300);
  const stats = latestStats();

  return (
    <>
      <PageHeader
        kicker="Change feed"
        title="What moved recently"
        lede="Robots.txt edits are never announced. This is every movement the crawler has detected, newest first. A domain's first measurement is a baseline and is not listed, and comparisons are never made across a probe change or a change of crawl location."
      />

      {changes.length === 0 ? (
        <p className="border border-rule rounded p-4 bg-raised">
          No changes recorded yet. The index needs at least two comparable crawls of a domain
          before it can report movement, so the first entries appear after the next run.
        </p>
      ) : (
        <div className="overflow-x-auto border border-rule rounded">
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">Recorded changes to AI crawler treatment</caption>
            <thead>
              <tr className="bg-raised text-left">
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-28">Date</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold w-36">Type</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">Domain</th>
                <th scope="col" className="px-3 py-2 border-b border-rule font-semibold">What changed</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={`${c.domain}-${i}`} className="border-b border-rule last:border-0">
                  <td className="px-3 py-2 tnum text-muted whitespace-nowrap">
                    <time dateTime={c.changedAt}>{c.changedAt.slice(0, 10)}</time>
                  </td>
                  <td className="px-3 py-2 text-muted">{KIND_LABEL[c.kind] ?? c.kind}</td>
                  <td className="px-3 py-2">
                    <Link href={`/site/${c.domain}`} className="font-mono hover:text-accent underline underline-offset-4">
                      {c.domain}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{c.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Attribution subject="Changes in AI crawler policy" measuredOn={stats?.day ?? null} />
    </>
  );
}
