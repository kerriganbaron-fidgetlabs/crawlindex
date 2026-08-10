import type { Metadata } from 'next';
import Link from 'next/link';
import { EMBEDDABLE, TIER_NAME, TIER_RULE, badgeTier, type BadgeTier } from '../../lib/badge';
import { latestStats, leaderboard, scoredRows } from '../../lib/dataset';
import { SITE, absoluteUrl } from '../../lib/site';
import { BadgeEmbed } from '../../components/badge-embed';
import { PageHeader } from '../../components/ui';
import { Reveal } from '../../components/motion';

export const metadata: Metadata = {
  title: 'The Agent Ready mark',
  description:
    'What the CrawlIndex mark is, what it measures, how a site earns one, and how to embed it. Independently measured, updated nightly, free.',
  alternates: { canonical: '/badge' },
};

export default function BadgePage() {
  const stats = latestStats();
  const scored = scoredRows();

  const counts = { ready: 0, friendly: 0, measured: 0, unscored: 0 } as Record<BadgeTier, number>;
  for (const r of scored) counts[badgeTier(r.score.total, r.score.grade)]++;
  const qualifying = counts.ready + counts.friendly;

  // Real examples, not mockups. Whatever is genuinely at the top today.
  const examples = leaderboard('top', 3);
  const example = examples[0]?.domain ?? 'crawlindex.org';

  const faq = [
    {
      q: 'What does the mark actually certify?',
      a: 'That on the measurement date shown, an independent crawler requested this site the way an AI agent would and recorded the result. It certifies a measurement, not an endorsement, and every input is published.',
    },
    {
      q: 'Does it cost anything?',
      a: 'No. There is no account, no payment, no application and nothing to sign. The dataset is CC BY 4.0 and the mark is generated automatically for every domain that qualifies.',
    },
    {
      q: 'Can I lose it?',
      a: 'Yes, and that is the point. The mark regenerates from the nightly crawl. If the site starts blocking answer-surface crawlers or drops its structured data, the mark changes to match. A mark that could not be lost would not be worth showing.',
    },
    {
      q: 'What if the score is wrong?',
      a: 'Every line of it is arithmetic over archived evidence, and the evidence is downloadable. Open the site page, read which checks were awarded and why, and recompute it. If a check is genuinely misfiring, that is a bug worth reporting.',
    },
    {
      q: 'Will it slow my page down?',
      a: 'It is a static SVG of about one kilobyte served from a CDN with a long cache, marked lazy-loading in the snippet. It carries no script, no tracking and no cookie.',
    },
    {
      q: 'Will it look right on my site?',
      a: 'Pick the theme. An SVG cannot detect the background it was pasted onto, so there are three files: light, dark, and auto. Auto follows the reader’s own light or dark setting, which means a dark-mode visitor to a light site sees the dark mark. If that matters, pin light or dark instead. The builder below previews the mark on a white ground and a black ground side by side so you can see the outcome before copying.',
    },
    {
      q: 'Why is there no mark for lower scores?',
      a: 'Because nobody would embed one, so offering it would be a pretence. Below grade B the useful thing is not a graphic, it is the prioritised list of what to change, which is on the site page and is usually shorter than people expect.',
    },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PageHeader
        kicker="The mark"
        title="Agent Ready"
        lede="A site that AI systems can actually read is doing something most of the web is not. The mark says so, in a form you can put in your own footer, and links back to the evidence."
      />

      <section className="mb-14 flex flex-wrap items-center gap-8">
        <div className="shrink-0">
          {/* The real file, on the real path. Nothing here is a mockup. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/badge/seal/${example}.svg`}
            width={148}
            height={148}
            alt={`The CrawlIndex Agent Ready seal, as currently issued to ${example}`}
          />
        </div>
        <div className="max-w-md space-y-3">
          <p className="leading-relaxed">
            <strong className="tnum">{qualifying.toLocaleString()}</strong> of the{' '}
            <span className="tnum">{scored.length.toLocaleString()}</span> fully measured sites in
            the index qualify for a mark today. That is{' '}
            <strong className="tnum">
              {scored.length ? Math.round((qualifying / scored.length) * 100) : 0}%
            </strong>
            .
          </p>
          <p className="text-muted leading-relaxed">
            No application, no account, no fee. If your site qualifies, the file already exists at a
            permanent URL and you can embed it right now.
          </p>
        </div>
      </section>

      <Reveal>
        <section className="mb-14" aria-labelledby="levels">
          <h2 id="levels" className="text-2xl font-bold mb-1">
            The three levels
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            Two of them are awards. The third is a statement of fact, offered because some
            organisations want to show they are measured whatever the number says, and refusing them
            that would be its own kind of dishonesty.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {(['ready', 'friendly', 'measured'] as BadgeTier[]).map((t) => (
              <div
                key={t}
                className={`border rounded p-4 ${EMBEDDABLE.includes(t) ? 'border-good bg-raised' : 'border-rule'}`}
              >
                <h3 className="font-bold">{TIER_NAME[t]}</h3>
                <p className="tnum text-sm text-muted mt-0.5">
                  {counts[t].toLocaleString()} sites
                </p>
                <p className="text-sm mt-2 leading-relaxed">{TIER_RULE[t]}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-14" aria-labelledby="earn">
          <h2 id="earn" className="text-2xl font-bold mb-1">
            How a site earns one
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            There is nothing to submit. Every domain in the nightly crawl is scored on the same
            rubric, and the mark follows the score.
          </p>
          <ol className="space-y-3 max-w-2xl">
            {[
              [
                'Be in the index',
                'The corpus is the most-visited domains on the web, plus anything anyone submits. Submitting takes one form and no account.',
              ],
              [
                'Let the crawlers that answer questions read you',
                'Forty-five of the hundred points. This is the one that moves scores, and for most sites it is a robots.txt edit rather than a project.',
              ],
              [
                'Publish something machine-readable',
                'A sitemap declared in robots.txt, an llms.txt, licence terms. Twenty-five points, and the cheapest points on the board.',
              ],
              [
                'Serve content a crawler can read without running JavaScript',
                'Thirty points, covering structured data, a dateline, an author, and text present in the server response.',
              ],
              [
                'Score 75 or above',
                'The mark is generated on the next nightly crawl. Nobody has to approve anything.',
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
          <p className="mt-5 text-sm">
            <Link href="/check" className="text-accent underline underline-offset-4">
              Measure your site now
            </Link>
            {' . '}
            <Link href="/methodology" className="text-accent underline underline-offset-4">
              Read the full rubric
            </Link>
            {' . '}
            <Link href="/submit" className="text-accent underline underline-offset-4">
              Add a domain to the index
            </Link>
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-14" aria-labelledby="embed">
          <h2 id="embed" className="text-2xl font-bold mb-1">
            Take it
          </h2>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            Three shapes, three themes, three syntaxes. Every combination is a static file that
            already exists. Enter your domain to get the exact snippet, and check it against both a
            light and a dark ground before you paste it.
          </p>
          <BadgeEmbed origin={SITE.url} defaultDomain={example} />
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-14" aria-labelledby="faq">
          <h2 id="faq" className="text-2xl font-bold mb-5">
            The obvious questions
          </h2>
          <div className="space-y-3 max-w-2xl">
            {faq.map((f) => (
              <details key={f.q} className="border border-rule rounded p-4 bg-raised">
                <summary className="font-medium cursor-pointer">{f.q}</summary>
                <p className="mt-2 text-muted leading-relaxed text-sm">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </Reveal>

      <section className="border-t border-rule pt-8 max-w-2xl">
        <h2 className="text-xl font-bold mb-3">Currently at the top</h2>
        <p className="text-sm text-muted mb-4">
          Measured {stats?.day ?? 'on the last crawl'}. These change.
        </p>
        <ul className="space-y-2">
          {examples.map((r) => (
            <li key={r.domain} className="flex items-center gap-3 text-sm border-b border-rule pb-2">
              <span className="tnum font-semibold w-8">{r.score.total}</span>
              <Link href={`/site/${r.domain}`} className="font-mono text-accent underline underline-offset-4">
                {r.domain}
              </Link>
              <span className="text-muted">{TIER_NAME[badgeTier(r.score.total, r.score.grade)]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm text-muted">
          Published by{' '}
          <a href={SITE.publisherUrl} className="text-accent underline underline-offset-4">
            {SITE.publisher}
          </a>
          . The mark, the rubric and the underlying data are free to use under {SITE.licence}.{' '}
          <a href={absoluteUrl('/data')} className="text-accent underline underline-offset-4">
            Download the dataset
          </a>
          .
        </p>
      </section>
    </>
  );
}
