import { beforeEach, describe, expect, it } from 'vitest';
import { callerKey, isProbeTarget, rateLimit, resetRateLimits } from '../lib/guard';
import { isValidDomain } from '../lib/http';

/**
 * `/check` takes a hostname from an unauthenticated GET and fires six requests at it. These
 * are the two guards that stop it being a scanner for whatever network it sits in, and a
 * free amplifier for anyone who finds the URL.
 */
describe('probe targets', () => {
  it('allows an ordinary public hostname', () => {
    for (const h of ['example.com', 'bbc.co.uk', 'sub.example.org', '1drv.ms']) {
      expect(isProbeTarget(h).allowed, h).toBe(true);
    }
  });

  /**
   * Every one of these passes `isValidDomain`, which only checks the shape of a hostname.
   * That is why this guard has to exist separately.
   */
  it('refuses loopback, private and link-local addresses', () => {
    const blocked = [
      'localhost',
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '169.254.169.254', // cloud metadata
      '0.0.0.0',
      'foo.local',
      'db.internal',
      'app.localhost',
      'metadata.google.internal',
    ];
    for (const h of blocked) {
      expect(isProbeTarget(h).allowed, h).toBe(false);
      expect(isProbeTarget(h).reason, h).toBeTruthy();
    }
  });

  it('is not fooled by case or surrounding space', () => {
    expect(isProbeTarget('  LOCALHOST ').allowed).toBe(false);
    expect(isProbeTarget('192.168.0.1').allowed).toBe(false);
  });

  it('does not block a public address that merely looks similar', () => {
    // 172.32 is outside RFC1918; 100.128 is outside carrier-grade NAT.
    expect(isProbeTarget('172.32.0.1').allowed).toBe(true);
    expect(isProbeTarget('100.128.0.1').allowed).toBe(true);
    expect(isProbeTarget('10example.com').allowed).toBe(true);
  });

  it('closes a hole that hostname validation alone leaves open', () => {
    // The point of the pairing: shape-valid and absolutely not probeable.
    expect(isValidDomain('192.168.1.1')).toBe(true);
    expect(isProbeTarget('192.168.1.1').allowed).toBe(false);
  });
});

describe('rate limiting', () => {
  beforeEach(resetRateLimits);

  it('allows a burst up to the limit and then refuses', () => {
    const limits = { max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('a', 1_000, limits).allowed, `request ${i + 1}`).toBe(true);
    }
    const fourth = rateLimit('a', 1_000, limits);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps callers in separate buckets', () => {
    const limits = { max: 1, windowMs: 60_000 };
    expect(rateLimit('a', 1_000, limits).allowed).toBe(true);
    expect(rateLimit('b', 1_000, limits).allowed).toBe(true);
    expect(rateLimit('a', 1_000, limits).allowed).toBe(false);
  });

  it('lets the window expire', () => {
    const limits = { max: 1, windowMs: 60_000 };
    expect(rateLimit('a', 1_000, limits).allowed).toBe(true);
    expect(rateLimit('a', 30_000, limits).allowed).toBe(false);
    expect(rateLimit('a', 70_000, limits).allowed).toBe(true);
  });

  it('reports how much budget is left', () => {
    const limits = { max: 2, windowMs: 60_000 };
    expect(rateLimit('a', 0, limits).remaining).toBe(1);
    expect(rateLimit('a', 0, limits).remaining).toBe(0);
  });
});

describe('identifying the caller', () => {
  it('takes the leftmost forwarded address', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' });
    expect(callerKey(h)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(callerKey(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('buckets an unattributable request rather than exempting it', () => {
    // A request we cannot attribute is exactly the one that should not get a free pass.
    expect(callerKey(new Headers())).toBe('unattributed');
  });
});
