/**
 * Polite HTTP for unsolicited measurement.
 *
 * CrawlIndex fetches other people's servers without being asked. That imposes rules:
 * identify honestly, rate limit per host, cap body size, hard timeout, never retry a
 * 4xx. A measurement project that behaves like an abusive scraper deserves to be blocked.
 */

/** The robots.txt token operators can use to opt out. Honoured before any other request. */
export const PROBE_TOKEN = 'CrawlIndexBot';

export const PROBE_UA = `${PROBE_TOKEN}/1.0 (+https://crawlindex.org/methodology)`;

export const DEFAULT_TIMEOUT_MS = 12_000;

/** Max bytes of body we keep. Enough for parsing, small enough to survive a hostile origin. */
const MAX_BODY_BYTES = 2_000_000;

/** One request per host per interval. Concurrency happens ACROSS hosts, never within one. */
const lastRequestAt = new Map<string, number>();
const MIN_INTERVAL_MS = 1200;

async function gate(host: string): Promise<void> {
  const last = lastRequestAt.get(host) ?? 0;
  const wait = MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(host, Date.now());
}

/** Drop host entries we have not touched recently so long crawls do not leak memory. */
export function pruneGate(olderThanMs = 300_000): void {
  const cutoff = Date.now() - olderThanMs;
  for (const [host, at] of lastRequestAt) if (at < cutoff) lastRequestAt.delete(host);
}

export type FetchOpts = {
  ua?: string;
  timeoutMs?: number;
  redirect?: RequestRedirect;
  headers?: Record<string, string>;
  method?: 'GET' | 'HEAD';
  skipGate?: boolean;
};

export type FetchOutcome = {
  ok: boolean;
  status: number;
  url: string;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  error?: string;
  elapsedMs: number;
};

/** Unwrap Node's opaque "fetch failed" into something a human can act on. */
export function describeFetchError(err: unknown): string {
  if (err instanceof Error && err.name === 'AbortError') return 'timeout';
  const top = err instanceof Error ? err.message : String(err);
  const cause = (err as { cause?: unknown })?.cause;
  if (!cause) return top;

  const code = (cause as { code?: string }).code;
  const msg = (cause as { message?: string }).message;
  const detail = code ?? msg;
  if (!detail) return top;
  // "fetch failed" adds nothing once we have the real reason.
  return top === 'fetch failed' ? detail : `${top}: ${detail}`;
}

const FAILED = (url: string, error: string, elapsedMs = 0): FetchOutcome => ({
  ok: false,
  status: 0,
  url,
  headers: {},
  body: '',
  bytes: 0,
  error,
  elapsedMs,
});

export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<FetchOutcome> {
  const started = Date.now();
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return FAILED(url, 'invalid url');
  }
  if (!opts.skipGate) await gate(host);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      redirect: opts.redirect ?? 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': opts.ua ?? PROBE_UA,
        // An operator who wants us gone has a name and a page to go to.
        from: 'bot@crawlindex.org',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en',
        ...opts.headers,
      },
    });

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    let body = '';
    if (opts.method !== 'HEAD') {
      body = (await res.text()).slice(0, MAX_BODY_BYTES);
    }

    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      headers,
      body,
      bytes: body.length,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    // Node's fetch reports every transport failure as the string "fetch failed" and puts
    // the actual reason (DNS, TLS, ECONNREFUSED, timeout) on `cause`. Without unwrapping
    // it, every network problem in the corpus looks identical and none can be diagnosed.
    return FAILED(url, describeFetchError(err), Date.now() - started);
  } finally {
    clearTimeout(timer);
  }
}

export function normaliseDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

export function isValidDomain(d: string): boolean {
  if (d.length > 253) return false;
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(d);
}

/**
 * Run `fn` over `items` with bounded concurrency.
 * Results come back in input order. A thrown task yields null rather than killing the run.
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
    }
  });

  await Promise.all(workers);
  return out;
}
