'use client';

import { useState } from 'react';
import { BADGE_SIZES, embedHtml, embedJsx, embedMarkdown, type BadgeVariant } from '../lib/badge';

/**
 * The embed builder.
 *
 * An operator who has decided they want the mark should not then have to hand-assemble an
 * anchor around an image and guess the dimensions. Pick a shape, pick a syntax, copy. The
 * whole point of the redesign is to remove every reason not to embed it, and "I would have
 * to write the HTML" is a real reason.
 *
 * Client-side because copying to the clipboard and switching tabs are client concerns. The
 * preview is a plain `<img>` against the same static SVG anyone else would embed, so what
 * is shown here is exactly what ships.
 */

const VARIANTS: Array<{ id: BadgeVariant; label: string; note: string }> = [
  { id: 'seal', label: 'Seal', note: 'Circular. For a footer or an about page.' },
  { id: 'flat', label: 'Strip', note: 'Compact. For a README or a status row.' },
  { id: 'card', label: 'Card', note: 'Wide. For a press or trust page.' },
];

const SYNTAXES = ['HTML', 'Markdown', 'JSX'] as const;
type Syntax = (typeof SYNTAXES)[number];

export function BadgeEmbed({
  origin,
  defaultDomain,
  /** Lock the domain when this is rendered on a specific site's page. */
  fixed = false,
}: {
  origin: string;
  defaultDomain: string;
  fixed?: boolean;
}) {
  const [domain, setDomain] = useState(defaultDomain);
  const [variant, setVariant] = useState<BadgeVariant>('seal');
  const [syntax, setSyntax] = useState<Syntax>('HTML');
  const [copied, setCopied] = useState(false);

  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || defaultDomain;
  const alt = `CrawlIndex agent readiness score for ${clean}`;

  const snippet =
    syntax === 'Markdown'
      ? embedMarkdown(origin, clean, variant, alt)
      : syntax === 'JSX'
        ? embedJsx(origin, clean, variant, alt)
        : embedHtml(origin, clean, variant, alt);

  const src = variant === 'flat' ? `${origin}/badge/${clean}.svg` : `${origin}/badge/${variant}/${clean}.svg`;
  const { w, h } = BADGE_SIZES[variant];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // Clipboard denied. The textarea below is still selectable.
    }
  };

  return (
    <div className="border border-rule rounded-lg overflow-hidden">
      <div className="p-4 sm:p-5 space-y-4 bg-raised">
        {!fixed ? (
          <div>
            <label htmlFor="badge-domain" className="block text-sm font-medium mb-1">
              Your domain
            </label>
            <input
              id="badge-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full max-w-sm border border-rule rounded px-3 py-2 bg-paper text-ink font-mono text-sm"
              placeholder="example.com"
              spellCheck={false}
            />
          </div>
        ) : null}

        <fieldset>
          <legend className="text-sm font-medium mb-2">Shape</legend>
          <div className="flex flex-wrap gap-2">
            {VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariant(v.id)}
                aria-pressed={variant === v.id}
                className={`text-sm rounded px-3 py-1.5 border-2 ${
                  variant === v.id
                    ? 'border-accent text-accent bg-accent-soft font-medium'
                    : 'border-rule hover:border-accent'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">{VARIANTS.find((v) => v.id === variant)!.note}</p>
        </fieldset>
      </div>

      <div className="p-6 flex items-center justify-center border-y border-rule bg-paper min-h-32">
        {/* Deliberately a plain img against the real static file, not a re-implementation. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={w} height={h} alt={alt} />
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Snippet format" className="flex gap-1">
            {SYNTAXES.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={syntax === s}
                onClick={() => setSyntax(s)}
                className={`text-xs rounded px-2.5 py-1 border ${
                  syntax === s ? 'border-accent text-accent bg-accent-soft' : 'border-rule text-muted hover:border-accent'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copy}
            className="ml-auto text-xs border-2 border-accent text-accent rounded px-3 py-1.5 font-medium hover:bg-accent-soft"
          >
            {copied ? 'Copied' : 'Copy snippet'}
          </button>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? 'Snippet copied to the clipboard.' : ''}
          </span>
        </div>

        <label htmlFor="badge-snippet" className="sr-only">
          Embed snippet
        </label>
        <textarea
          id="badge-snippet"
          readOnly
          value={snippet}
          rows={syntax === 'Markdown' ? 2 : 6}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full font-mono text-xs bg-raised border border-rule rounded p-3 resize-y"
        />
        <p className="text-xs text-muted">
          The mark links back to this site&apos;s page for your domain, so anyone can check the claim
          in one click. It regenerates nightly, which means it stays true and it can change.
        </p>
      </div>
    </div>
  );
}
