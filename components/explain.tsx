import Link from 'next/link';
import { getTerm } from '../lib/glossary';

/**
 * Inline definitions.
 *
 * Built on `<details>` rather than a hover tooltip, on purpose. A hover tooltip is
 * unreachable on a touch screen, awkward from a keyboard, invisible to a crawler, and
 * gone from a printed page. `<details>` is a native disclosure: it works everywhere,
 * needs no JavaScript at all, and the definition is in the HTML, which means the search
 * engines and answer engines this site is about can read it too.
 *
 * There is no client component in this file and there does not need to be one.
 */

export function Explain({ id, children }: { id: string; children?: React.ReactNode }) {
  const term = getTerm(id);
  if (!term) return <>{children ?? id}</>;

  return (
    <details className="inline-block group align-baseline">
      <summary
        className="inline cursor-help list-none marker:content-none underline decoration-dotted decoration-from-font underline-offset-4 hover:text-accent"
        aria-label={`What ${term.term} means`}
      >
        {children ?? term.term}
      </summary>
      <span className="block mt-2 mb-1 text-sm font-normal text-muted border-l-2 border-accent pl-3 max-w-prose">
        {term.short}{' '}
        {term.href ? (
          <Link href={term.href} className="text-accent underline underline-offset-4 whitespace-nowrap">
            More
          </Link>
        ) : (
          <Link href={`/glossary#${term.id}`} className="text-accent underline underline-offset-4 whitespace-nowrap">
            Glossary
          </Link>
        )}
      </span>
    </details>
  );
}

/**
 * A definition attached to a heading or a table caption, where an inline disclosure would
 * disturb the layout. Renders as a short line of prose underneath.
 */
export function ExplainNote({ id, className = '' }: { id: string; className?: string }) {
  const term = getTerm(id);
  if (!term) return null;
  return (
    <p className={`text-sm text-muted max-w-2xl ${className}`}>
      <strong className="font-medium text-ink">{term.term}.</strong> {term.short}
    </p>
  );
}
