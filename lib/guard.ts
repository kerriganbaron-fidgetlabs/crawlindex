/**
 * Abuse guards for the one route that makes outbound requests on a stranger's instruction.
 *
 * `/check` takes a domain from an unauthenticated GET and fires up to six requests at it.
 * That is a useful feature and, unguarded, also a reflected-amplification primitive: anyone
 * can make crawlindex.org hammer a third party from Vercel IPs, and bill us for the
 * privilege. Nothing here is exotic; it is the minimum that stops the obvious abuse.
 *
 * Both guards are pure functions so they can be tested without a network or a request.
 */

/**
 * Hosts a public measurement service must never be pointed at.
 *
 * `isValidDomain` only checks the shape of a hostname, so `192.168.1.1`, `localhost.localdomain`
 * and cloud metadata endpoints all pass it. Probing those turns the checker into a scanner
 * for whatever network the function happens to be running in.
 *
 * This is a hostname-level filter and it does not resolve DNS, so a name that resolves to a
 * private address still gets through. That is a known and accepted limit: the fix is
 * egress-level, not application-level, and the value here is closing the trivial case.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const BLOCKED_PATTERNS: RegExp[] = [
  /^127\./, // loopback
  /^10\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918
  /^169\.254\./, // link-local, includes cloud metadata at 169.254.169.254
  /^0\./, // "this network"
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
  /^(::1?|fe80:|fc00:|fd00:)/i, // IPv6 loopback, link-local, unique-local
  /\.local$/i, // mDNS
  /\.internal$/i,
  /\.localhost$/i,
];

export type GuardVerdict = { allowed: boolean; reason?: string };

export function isProbeTarget(hostname: string): GuardVerdict {
  const h = hostname.trim().toLowerCase();
  if (!h) return { allowed: false, reason: 'No hostname given.' };

  if (BLOCKED_HOSTNAMES.has(h)) {
    return { allowed: false, reason: 'That hostname refers to the machine running this service.' };
  }
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(h)) {
      return {
        allowed: false,
        reason:
          'That address is on a private, loopback or link-local network. A public measurement service will not probe those, because doing so would make it a scanner for whatever network it happens to sit in.',
      };
    }
  }
  return { allowed: true };
}

/**
 * A fixed-window rate limiter over an in-memory map.
 *
 * ## The honest caveat, stated because it would otherwise look like a fix
 *
 * This is **per-instance**. Serverless functions scale horizontally, so a caller spread
 * across many concurrent instances gets many buckets. It raises the cost of casual abuse
 * from zero to some effort, and it does not stop a determined attacker.
 *
 * The real control belongs at the edge, where it can see every request: a Vercel Firewall
 * rate-limit rule on `/check`. That is configuration rather than code, so it is written down
 * in `docs/HANDOVER.md` rather than living here. This function is the in-app backstop, and
 * calling it a solution on its own would be the same mistake as the per-host politeness gate
 * in `lib/http.ts`, which has never coordinated across instances either.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const RATE_LIMIT = { max: 8, windowMs: 60_000 } as const;

export function rateLimit(
  key: string,
  now = Date.now(),
  limits: { max: number; windowMs: number } = RATE_LIMIT,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  // Opportunistic sweep. Without it a long-lived instance accumulates a bucket per caller.
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + limits.windowMs });
    return { allowed: true, remaining: limits.max - 1, retryAfterSeconds: 0 };
  }

  existing.count++;
  if (existing.count > limits.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: limits.max - existing.count, retryAfterSeconds: 0 };
}

/** Test seam. Never called in production. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Who is asking.
 *
 * Vercel sets `x-forwarded-for`; the leftmost entry is the client. Falls back to a single
 * shared bucket rather than to no limit at all, because an unattributable request is exactly
 * the one that should not get an exemption.
 */
export function callerKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unattributed';
}
