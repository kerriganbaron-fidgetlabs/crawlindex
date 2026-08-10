import { describe, expect, it } from 'vitest';
import { detectChallenge, probeAtLeast, tldOf } from '../lib/probe';
import { parseDomain, rejectionReason } from '../worker/intake';
import type { FetchOutcome } from '../lib/http';

const res = (over: Partial<FetchOutcome> = {}): FetchOutcome => ({
  ok: true,
  status: 200,
  url: 'https://example.com/',
  headers: {},
  body: '<!doctype html><html><body><main><p>' + 'x'.repeat(5000) + '</p></main></body></html>',
  bytes: 20_000,
  elapsedMs: 100,
  ...over,
});

describe('challenge detection', () => {
  it('leaves an ordinary page alone', () => {
    expect(detectChallenge(res(), 5000).challenged).toBe(false);
  });

  it('reports 402 as a metered policy rather than an error', () => {
    const c = detectChallenge(res({ status: 402, bytes: 300, body: 'payment required' }), 20);
    expect(c.kind).toBe('payment-required');
    expect(c.reason).toContain('metered');
  });

  it('names the vendor when a fingerprint is present', () => {
    const c = detectChallenge(
      res({ body: '<html><head><title>Just a moment...</title></head></html>', bytes: 800 }),
      10,
    );
    expect(c.kind).toBe('bot-challenge');
    expect(c.reason).toContain('Cloudflare');
  });

  /**
   * The Amazon case. HTTP 200, 2,167 bytes, a `&nbsp;` title, zero extractable text.
   * Nothing above catches it, so eight body-derived score lines were charged to Amazon and
   * twenty of its country domains took over the bottom of the leaderboard.
   */
  it('catches a soft wall that answers 200 with nothing in it', () => {
    const c = detectChallenge(res({ status: 200, bytes: 2167, body: '<html><title>&nbsp;</title></html>' }), 0);
    expect(c.kind).toBe('unreadable');
    expect(c.challenged).toBe(true);
    expect(c.reason).toContain('stub');
  });

  it('catches the same wall behind an unusual success status', () => {
    // amazon.de answers HTTP 202 to a homepage GET, which is not an error and not a page.
    expect(detectChallenge(res({ status: 202, bytes: 2007, body: '<html></html>' }), 0).kind).toBe('unreadable');
  });

  it('does not mistake a large client-rendered app for a wall', () => {
    // tiktok.com: 362KB of shell, 22 characters of text. Correctly scored zero for
    // server-side readability rather than written off as unmeasurable.
    expect(detectChallenge(res({ bytes: 362_692 }), 22).challenged).toBe(false);
  });

  it('does not classify a small error page as a stub', () => {
    // A tiny 404 means there is no site here, which is a reachability fact and belongs to
    // the caller. Calling it a challenge would resurrect dead hosts as measurable ones.
    expect(detectChallenge(res({ status: 404, bytes: 400, body: 'not found' }), 9).challenged).toBe(false);
  });

  /**
   * Verified against live responses on 2026-08-10. Naming the wall is worth more than a
   * generic "something thin came back", and these four cover every case the size rule was
   * catching by accident.
   */
  it('names AWS WAF, which is what Amazon actually answers with', () => {
    const c = detectChallenge(
      res({ status: 202, bytes: 2007, body: '<html><head><title></title><script>window.awsWafCookieDomainList = []; window.gokuProps = {"key":"x"};</script></head></html>' }),
      4,
    );
    expect(c.kind).toBe('bot-challenge');
    expect(c.reason).toContain('AWS WAF');
  });

  it('names the Fastly challenge', () => {
    const c = detectChallenge(
      res({ bytes: 3036, body: '<html><head><link href="/_fs-ch-1T1wm/assets/styles.css" rel="stylesheet"/><title>Client Challenge</title></head></html>' }),
      226,
    );
    expect(c.reason).toContain('Fastly');
  });

  it('names the F5 block page', () => {
    const c = detectChallenge(
      res({ bytes: 243, body: '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected. Please consult with your administrator.</body></html>' }),
      118,
    );
    expect(c.reason).toContain('F5');
  });

  it('prefers the vendor name over the generic stub rule', () => {
    const c = detectChallenge(
      res({ status: 200, bytes: 1200, body: '<title>Just a moment...</title>' }),
      0,
    );
    expect(c.reason).toContain('Cloudflare');
  });
});

describe('probe version comparison', () => {
  it('orders versions numerically, not lexically', () => {
    expect(probeAtLeast('3.0.0', '3.0.0')).toBe(true);
    expect(probeAtLeast('10.0.0', '9.0.0')).toBe(true);
    expect(probeAtLeast('2.9.9', '3.0.0')).toBe(false);
    expect(probeAtLeast(undefined, '3.0.0')).toBe(false);
  });
});

describe('public suffix handling', () => {
  it('treats a two-part suffix as one label', () => {
    expect(tldOf('bbc.co.uk')).toBe('co.uk');
    expect(tldOf('example.com')).toBe('com');
    expect(tldOf('amazon.com.br')).toBe('com.br');
  });
});

describe('submission intake', () => {
  it('reads the domain out of an issue form body', () => {
    expect(parseDomain('### Domain\n\nexample.com\n\n### Why\n\nbecause', 'Add domain: ')).toBe('example.com');
  });

  it('falls back to the title when the body is hand-written', () => {
    expect(parseDomain('please add this one', 'Add domain: example.org')).toBe('example.org');
  });

  it('normalises a pasted URL', () => {
    expect(parseDomain('### Domain\n\nhttps://www.Example.com/path', 'x')).toBe('example.com');
  });

  it('accepts a real site', () => {
    expect(rejectionReason('bbc.co.uk')).toBeNull();
  });

  it('refuses infrastructure with a reason a human can act on', () => {
    const reason = rejectionReason('cdn.example.com');
    expect(reason).toBeTruthy();
    expect(reason).toContain('infrastructure');
  });

  it('refuses something that is not a hostname', () => {
    expect(rejectionReason('not a domain')).toBeTruthy();
    expect(rejectionReason(null)).toContain('No domain');
  });
});
