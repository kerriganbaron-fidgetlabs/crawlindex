'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Motion primitives.
 *
 * One rule governs every component in this file, and it is not negotiable: **the server
 * renders the true final value, and animation is only ever an enhancement on top of it.**
 *
 * The tempting implementation is to render zero and count up on scroll. It produces a site
 * that reads as broken. A reader who scrolls fast, has JavaScript off, is on a slow
 * connection, is printing the page, or is an AI crawler sees `0%` presented as a finding.
 * For an index whose entire value is that its numbers are correct, that is the worst
 * possible failure, and it fails silently because it looks fine to whoever built it.
 *
 * So: markup is always correct and complete. Every component here reaches into the DOM
 * *after* hydration, and only for elements that are off-screen at that moment, so nothing
 * a reader is already looking at can flicker. `prefers-reduced-motion` skips all of it.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** useLayoutEffect warns during SSR. On the server there is nothing to lay out anyway. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Run `onEnter` once, when the element first scrolls into view.
 *
 * `startedVisible` reports whether the element was already on screen at hydration. Callers
 * use it to skip the animation entirely for content the reader can already see, which is
 * what prevents an above-the-fold flash.
 */
function useInView<T extends HTMLElement>(onEnter: (startedVisible: boolean) => void) {
  const ref = useRef<T>(null);
  const fired = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || fired.current) return;

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      return; // Leave the server-rendered final state exactly as it is.
    }

    const alreadyVisible = el.getBoundingClientRect().top < window.innerHeight;
    if (alreadyVisible) {
      fired.current = true;
      onEnter(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || fired.current) continue;
          fired.current = true;
          onEnter(false);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // onEnter is recreated each render; firing once is guarded by `fired`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

/** Ease-out cubic. Fast at the start, settles rather than stops. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A number that counts up to its real value.
 *
 * `children` is the fully formatted final string and is what the server renders. The
 * animation writes interim text into the same node and then restores `children` exactly,
 * so whatever formatting the caller used survives untouched.
 */
export function CountUp({
  value,
  children,
  durationMs = 900,
  suffix = '',
  decimals = 0,
}: {
  value: number;
  /** The final, formatted text. Rendered on the server. Restored when the count ends. */
  children: string;
  durationMs?: number;
  /**
   * Interim formatting, as data rather than a callback.
   *
   * A `format` function would be the obvious API and cannot cross the server boundary:
   * every caller here is a server component, and React refuses to serialise a function
   * prop. Two scalars cover every use on the site.
   */
  suffix?: string;
  decimals?: number;
}) {
  const fmt = (n: number) => `${n.toFixed(decimals)}${suffix}`;

  const ref = useInView<HTMLSpanElement>(() => {
    const el = ref.current;
    if (!el) return;

    const from = 0;
    const started = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      if (t >= 1) {
        el.textContent = children; // exact final string, formatting and all
        return;
      }
      el.textContent = fmt(from + (value - from) * easeOut(t));
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  return (
    <span ref={ref} className="tnum">
      {children}
    </span>
  );
}

/**
 * A bar that grows to its real width.
 *
 * The server renders the bar at its final width with an inline style. On enter, the width
 * is snapped to zero and released on the next frame so the CSS transition runs. If any of
 * that fails the bar is simply already correct.
 */
export function GrowBar({
  percent,
  className = '',
  delayMs = 0,
  label,
}: {
  percent: number;
  className?: string;
  delayMs?: number;
  label?: string;
}) {
  const width = `${Math.max(0.8, Math.min(100, percent))}%`;

  const ref = useInView<HTMLDivElement>(() => {
    const el = ref.current;
    if (!el) return;
    const fill = el.firstElementChild as HTMLElement | null;
    if (!fill) return;

    fill.style.transition = 'none';
    fill.style.width = '0%';
    // Two frames: one to commit the zero width, one to release it with the transition on.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fill.style.transition = `width 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms`;
        fill.style.width = width;
      });
    });
  });

  return (
    <div
      ref={ref}
      className="h-2 bg-rule rounded-full overflow-hidden"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className={`h-full bg-accent ${className}`} style={{ width }} />
    </div>
  );
}

/**
 * Fade and lift a section as it enters.
 *
 * Only ever applied to content that was below the fold at hydration, so there is no
 * possibility of hiding something the reader is currently looking at.
 */
export function Reveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const [hidden, setHidden] = useState(false);

  const ref = useInView<HTMLDivElement>((startedVisible) => {
    if (startedVisible) return;
    setHidden(false);
  });

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setHidden(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? 'translateY(12px)' : 'none',
        transition: `opacity 500ms ease ${delayMs}ms, transform 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
