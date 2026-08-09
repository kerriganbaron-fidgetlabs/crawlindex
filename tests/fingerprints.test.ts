import { describe, expect, it } from 'vitest';
import { detectNetwork, detectPlatform, NETWORKS, PLATFORMS } from '../lib/fingerprints';
import { tldOf } from '../lib/probe';

describe('platform detection', () => {
  it('identifies Shopify from a header', () => {
    expect(detectPlatform('', { 'x-shopid': '12345' })).toBe('shopify');
  });

  it('identifies WordPress from markup', () => {
    expect(detectPlatform('<link href="/wp-content/themes/x/style.css">', {})).toBe('wordpress');
  });

  it('identifies Next.js from its build output path', () => {
    expect(detectPlatform('<script src="/_next/static/chunks/main.js">', {})).toBe('nextjs');
  });

  it('returns null rather than guessing on an unrecognised stack', () => {
    expect(detectPlatform('<html><body>hello</body></html>', { server: 'nginx' })).toBeNull();
  });

  it('does not label a page that merely mentions a vendor in its copy', () => {
    // The word appears in prose, not as an asset host or a header. A naive substring
    // match would file half the web's blog posts under Shopify.
    const html = '<p>We migrated away from Shopify last year and wrote about wordpress too.</p>';
    expect(detectPlatform(html, {})).toBeNull();
  });

  it('prefers the platform over the framework it is built with', () => {
    // A Shopify store with a Next.js front end is more usefully described as Shopify.
    const html = '<script src="/_next/static/x.js"></script><script src="https://cdn.shopify.com/s/x.js"></script>';
    expect(detectPlatform(html, {})).toBe('shopify');
  });

  it('does not label a consultancy that writes about the vendors it works with', () => {
    // This was a live false positive: fidgetlabs.io is a MACH consultancy, so its homepage
    // naturally names commercetools, Sitecore and WooCommerce in prose. A fingerprint that
    // matches the product NAME rather than an artefact of running it will file every
    // agency, analyst and vendor-comparison page under whatever they wrote about.
    const html = `<html><body><h1>Composable commerce consultancy</h1>
      <p>We implement commercetools, migrate teams off Sitecore, and rescue
      WooCommerce stores that have outgrown their plugins.</p></body></html>`;
    expect(detectPlatform(html, {})).toBeNull();
  });

  it('still identifies a real WooCommerce store', () => {
    expect(detectPlatform('<link href="/wp-content/plugins/woocommerce/assets/css/x.css">', {})).toBe('woocommerce');
  });

  it('only scans the head of a large document', () => {
    // A fingerprint buried a megabyte deep is not worth the CPU across thousands of sites.
    const html = 'x'.repeat(300_000) + '/wp-content/';
    expect(detectPlatform(html, {})).toBeNull();
  });
});

describe('network detection', () => {
  it('identifies Cloudflare from cf-ray', () => {
    expect(detectNetwork({ 'cf-ray': 'abc-LHR' })).toBe('cloudflare');
  });

  it('identifies Vercel', () => {
    expect(detectNetwork({ 'x-vercel-id': 'lhr1::abc' })).toBe('vercel');
  });

  it('identifies CloudFront from the via header', () => {
    expect(detectNetwork({ via: '1.1 abc.cloudfront.net (CloudFront)' })).toBe('cloudfront');
  });

  it('ignores the body entirely', () => {
    // Markup says nothing reliable about who served it, and a false CDN attribution would
    // poison the most interesting cross-tab in the dataset.
    expect(detectNetwork({})).toBeNull();
  });

  it('returns null for an unrecognised origin server', () => {
    expect(detectNetwork({ server: 'nginx/1.24.0' })).toBeNull();
  });
});

describe('registry hygiene', () => {
  it('has unique ids', () => {
    for (const list of [PLATFORMS, NETWORKS]) {
      const ids = list.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('matches networks on headers only', () => {
    for (const n of NETWORKS) expect(n.body ?? []).toHaveLength(0);
  });
});

describe('tldOf', () => {
  it('reads a simple TLD', () => {
    expect(tldOf('example.com')).toBe('com');
  });

  it('keeps a two-part public suffix together', () => {
    expect(tldOf('bbc.co.uk')).toBe('co.uk');
    expect(tldOf('example.com.au')).toBe('com.au');
  });

  it('does not mistake a subdomain for a suffix', () => {
    expect(tldOf('news.example.com')).toBe('com');
  });

  it('handles a bare label', () => {
    expect(tldOf('localhost')).toBe('');
  });
});
