import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE, absoluteUrl } from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name}. ${SITE.tagline}.`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.publisher, url: SITE.publisherUrl }],
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    title: `${SITE.name}. ${SITE.tagline}.`,
    description: SITE.description,
    url: SITE.url,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

const NAV = [
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/bots', label: 'Crawlers' },
  { href: '/changes', label: 'Changes' },
  { href: '/methodology', label: 'Method' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Declared once, at the root, so every page inherits a resolvable publisher entity.
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': absoluteUrl('/#organization'),
        name: SITE.name,
        url: SITE.url,
        description: SITE.description,
        parentOrganization: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website'),
        name: SITE.name,
        url: SITE.url,
        description: SITE.description,
        publisher: { '@id': absoluteUrl('/#organization') },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: absoluteUrl('/check?domain={search_term_string}') },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        <header className="border-b border-rule">
          <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Link href="/" className="font-mono text-lg font-bold tracking-tight no-underline text-ink">
              crawl<span className="text-accent">index</span>
            </Link>
            <nav aria-label="Primary" className="flex gap-5 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-muted hover:text-accent underline-offset-4">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main id="main" className="flex-1 mx-auto w-full max-w-5xl px-4 py-10">
          {children}
        </main>

        <footer className="border-t border-rule mt-16">
          <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted space-y-3">
            <p>
              {SITE.name} measures publicly served files. It reads robots.txt, homepages and
              well-known paths, exactly as any crawler would. It stores no personal data.
            </p>
            <p className="flex flex-wrap gap-x-5 gap-y-1">
              <Link href="/methodology" className="hover:text-accent">Methodology</Link>
              <Link href="/about" className="hover:text-accent">About</Link>
              <Link href="/api" className="hover:text-accent">API</Link>
              <a href="/llms.txt" className="hover:text-accent">llms.txt</a>
              <a href={`mailto:${SITE.contact}`} className="hover:text-accent">{SITE.contact}</a>
            </p>
            <p>
              Published by{' '}
              <a href={SITE.publisherUrl} className="hover:text-accent underline underline-offset-4">
                {SITE.publisher}
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
