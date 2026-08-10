import type { Metadata } from 'next';
import Link from 'next/link';
import { GLOSSARY } from '../../lib/glossary';
import { PageHeader } from '../../components/ui';
import { absoluteUrl } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Glossary',
  description:
    'What every term on CrawlIndex means: answer-surface crawlers, policy posture, policy gap, cloaking, partial assessments, stub responses, llms.txt, agent cards, Content-Signal and pay-per-crawl.',
  alternates: { canonical: '/glossary' },
};

export default function GlossaryPage() {
  // A DefinedTermSet is the schema.org type for exactly this, and it gives an answer
  // engine a clean way to quote a single definition rather than the whole page.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'CrawlIndex glossary',
    url: absoluteUrl('/glossary'),
    hasDefinedTerm: GLOSSARY.map((t) => ({
      '@type': 'DefinedTerm',
      '@id': absoluteUrl(`/glossary#${t.id}`),
      name: t.term,
      description: t.short,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PageHeader
        kicker="Reference"
        title="What everything here means"
        lede="Every term used on a table, a chip or a score line, defined once. If a page shows you a word and does not explain it, that is a bug and it belongs here."
      />

      <nav aria-label="Jump to a term" className="mb-10 flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
        {GLOSSARY.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="text-muted hover:text-accent link-draw">
            {t.term}
          </a>
        ))}
      </nav>

      <dl className="space-y-8">
        {GLOSSARY.map((t) => (
          <div key={t.id} id={t.id} className="scroll-mt-6 border-l-2 border-rule pl-4">
            <dt className="text-lg font-bold">{t.term}</dt>
            <dd className="mt-1.5 leading-relaxed text-muted max-w-2xl">
              {t.short}
              {t.long ? <span className="block mt-2">{t.long}</span> : null}
              {t.href ? (
                <span className="block mt-2 text-sm">
                  <Link href={t.href} className="text-accent underline underline-offset-4">
                    See it in the data
                  </Link>
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
