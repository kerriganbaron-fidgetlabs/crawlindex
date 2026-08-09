/**
 * Platform and network fingerprinting, from bytes we already have.
 *
 * Every signal here is read off the homepage HTML and response headers that the probe
 * fetches anyway, so the whole file costs zero additional requests. That matters: the
 * cheapest way to make a measurement project more valuable is to derive more from the
 * same fetch, not to fetch more.
 *
 * Why bother. The single most interesting question this dataset can answer is not "who
 * blocks GPTBot" but "who DECIDED to block GPTBot". A merchant on Shopify and a publisher
 * behind Cloudflare mostly did not sit down and form a policy on AI crawlers; their
 * platform or their CDN formed one for them, by default, and they inherited it. Being
 * able to cross-tabulate blocking against platform and network turns a list of facts into
 * an argument about how the web's AI policy is actually being set.
 *
 * Matching rules:
 *  - Ordered. First match wins, so specific fingerprints precede generic ones.
 *  - Header evidence beats body evidence, because headers are far harder to spoof
 *    incidentally. A page that merely mentions "shopify" in copy must not be Shopify.
 *  - Never guess. An unrecognised stack is `null`, which the site renders as "unidentified"
 *    and excludes from cross-tabs. A wrong label is worse than no label.
 */

export type Fingerprint = {
  id: string;
  label: string;
  /** Grouping for the cross-tab pages. */
  kind: 'commerce' | 'cms' | 'framework' | 'builder' | 'enterprise';
  headers?: Array<[string, RegExp | true]>;
  body?: RegExp[];
};

/** Content platforms and frameworks, most specific first. */
export const PLATFORMS: Fingerprint[] = [
  // --- commerce ----------------------------------------------------------
  {
    id: 'shopify',
    label: 'Shopify',
    kind: 'commerce',
    headers: [['x-shopid', true], ['x-shopify-stage', true], ['powered-by', /shopify/i]],
    body: [/cdn\.shopify\.com/i, /Shopify\.theme/i, /shopify-features/i],
  },
  {
    id: 'bigcommerce',
    label: 'BigCommerce',
    kind: 'commerce',
    headers: [['x-bc-crid', true]],
    body: [/cdn\d*\.bigcommerce\.com/i, /bigcommerce\.com\/s-/i],
  },
  {
    id: 'woocommerce',
    label: 'WooCommerce',
    kind: 'commerce',
    body: [/wp-content\/plugins\/woocommerce/i, /woocommerce\/assets\//i, /class="[^"]*woocommerce-page/i],
  },
  {
    id: 'magento',
    label: 'Magento / Adobe Commerce',
    kind: 'commerce',
    headers: [['x-magento-cache-debug', true]],
    body: [/\/static\/version\d+\//i, /Magento_/],
  },
  {
    id: 'salesforce-commerce',
    label: 'Salesforce Commerce Cloud',
    kind: 'commerce',
    body: [/\/on\/demandware\.(store|static)/i, /dwsid/i],
  },

  // --- enterprise / DXP ---------------------------------------------------
  {
    id: 'aem',
    label: 'Adobe Experience Manager',
    kind: 'enterprise',
    body: [/\/etc\.clientlibs\//i, /cq:template/i, /\/content\/dam\//i],
  },
  {
    id: 'sitecore',
    label: 'Sitecore',
    kind: 'enterprise',
    body: [/\/-\/media\/[a-z0-9]/i, /sc_site=/i, /\/sitecore\/service\//i],
  },
  {
    id: 'hubspot',
    label: 'HubSpot CMS',
    kind: 'enterprise',
    headers: [['x-hs-hub-id', true]],
    body: [/hs-scripts\.com/i, /hubspotusercontent/i, /hs-banner\.com/i],
  },
  {
    id: 'contentful',
    label: 'Contentful',
    kind: 'enterprise',
    body: [/images\.ctfassets\.net/i, /cdn\.contentful\.com/i],
  },
  {
    id: 'storyblok',
    label: 'Storyblok',
    kind: 'enterprise',
    body: [/a\.storyblok\.com/i, /storyblok\.com\/f\//i],
  },
  {
    id: 'sanity',
    label: 'Sanity',
    kind: 'enterprise',
    body: [/cdn\.sanity\.io/i],
  },

  // --- classic CMS --------------------------------------------------------
  {
    id: 'wordpress',
    label: 'WordPress',
    kind: 'cms',
    body: [/<meta[^>]+name=["']generator["'][^>]+WordPress/i, /\/wp-content\//i, /\/wp-includes\//i],
  },
  {
    id: 'drupal',
    label: 'Drupal',
    kind: 'cms',
    headers: [['x-generator', /drupal/i], ['x-drupal-cache', true]],
    body: [/<meta[^>]+name=["']generator["'][^>]+Drupal/i, /\/sites\/(default|all)\/files\//i],
  },
  {
    id: 'joomla',
    label: 'Joomla',
    kind: 'cms',
    body: [/<meta[^>]+name=["']generator["'][^>]+Joomla/i, /\/media\/jui\//i],
  },
  {
    id: 'typo3',
    label: 'TYPO3',
    kind: 'cms',
    body: [/<meta[^>]+name=["']generator["'][^>]+TYPO3/i, /\/typo3(conf|temp)\//i],
  },
  {
    id: 'ghost',
    label: 'Ghost',
    kind: 'cms',
    body: [/<meta[^>]+name=["']generator["'][^>]+Ghost/i, /ghost\.io/i],
  },
  {
    id: 'craft',
    label: 'Craft CMS',
    kind: 'cms',
    headers: [['x-powered-by', /craft cms/i]],
  },

  // --- site builders ------------------------------------------------------
  {
    id: 'wix',
    label: 'Wix',
    kind: 'builder',
    headers: [['x-wix-request-id', true], ['x-wix-published-version', true]],
    body: [/static\.wixstatic\.com/i, /wix\.com\/website-builder/i],
  },
  {
    id: 'squarespace',
    label: 'Squarespace',
    kind: 'builder',
    headers: [['x-servedby', /squarespace/i]],
    body: [/static1\.squarespace\.com/i, /squarespace-cdn\.com/i],
  },
  {
    id: 'webflow',
    label: 'Webflow',
    kind: 'builder',
    body: [/<meta[^>]+content=["']Webflow["']/i, /assets(-global)?\.website-files\.com/i],
  },
  {
    id: 'duda',
    label: 'Duda',
    kind: 'builder',
    body: [/irp-cdn\.multiscreensite\.com/i, /\bdudaone\b/i],
  },
  {
    id: 'framer',
    label: 'Framer',
    kind: 'builder',
    body: [/framerusercontent\.com/i, /<meta[^>]+content=["']Framer/i],
  },

  // --- JS frameworks. Last, because a Shopify or WordPress front end may also
  //     be built with one, and the platform is the more informative label.
  {
    id: 'nextjs',
    label: 'Next.js',
    kind: 'framework',
    headers: [['x-powered-by', /next\.js/i]],
    body: [/\/_next\/static\//i, /__NEXT_DATA__/],
  },
  {
    id: 'nuxt',
    label: 'Nuxt',
    kind: 'framework',
    body: [/\/_nuxt\//i, /__NUXT__/],
  },
  {
    id: 'astro',
    label: 'Astro',
    kind: 'framework',
    body: [/<meta[^>]+content=["']Astro/i, /astro-island/i],
  },
  {
    id: 'gatsby',
    label: 'Gatsby',
    kind: 'framework',
    body: [/___gatsby/, /gatsby-image|gatsby-script/i],
  },
  {
    id: 'sveltekit',
    label: 'SvelteKit',
    kind: 'framework',
    body: [/\/_app\/immutable\//i, /__sveltekit/i],
  },
  {
    id: 'remix',
    label: 'Remix / React Router',
    kind: 'framework',
    body: [/__remixContext/],
  },
  {
    id: 'angular',
    label: 'Angular',
    kind: 'framework',
    body: [/ng-version=/i],
  },
];

/**
 * Edge networks and CDNs.
 *
 * Header-only by design. The body of a page says nothing reliable about who is serving it,
 * and a false CDN attribution would poison the most interesting cross-tab in the dataset.
 */
export const NETWORKS: Fingerprint[] = [
  { id: 'cloudflare', label: 'Cloudflare', kind: 'framework', headers: [['cf-ray', true], ['server', /cloudflare/i], ['cf-cache-status', true]] },
  { id: 'fastly', label: 'Fastly', kind: 'framework', headers: [['x-served-by', /cache-/i], ['x-fastly-request-id', true], ['server', /fastly/i]] },
  { id: 'akamai', label: 'Akamai', kind: 'framework', headers: [['server', /akamai/i], ['x-akamai-transformed', true], ['akamai-grn', true]] },
  { id: 'cloudfront', label: 'Amazon CloudFront', kind: 'framework', headers: [['x-amz-cf-id', true], ['via', /cloudfront/i]] },
  { id: 'vercel', label: 'Vercel', kind: 'framework', headers: [['x-vercel-id', true], ['server', /vercel/i]] },
  { id: 'netlify', label: 'Netlify', kind: 'framework', headers: [['x-nf-request-id', true], ['server', /netlify/i]] },
  { id: 'azure-frontdoor', label: 'Azure Front Door', kind: 'framework', headers: [['x-azure-ref', true], ['x-cache', /azure/i]] },
  { id: 'google', label: 'Google Cloud / GFE', kind: 'framework', headers: [['server', /^(gws|gse|Google Frontend|ESF)/i], ['via', /1\.1 google/i]] },
  { id: 'imperva', label: 'Imperva', kind: 'framework', headers: [['x-iinfo', true], ['x-cdn', /incapsula/i]] },
  { id: 'sucuri', label: 'Sucuri', kind: 'framework', headers: [['x-sucuri-id', true]] },
  { id: 'bunny', label: 'Bunny', kind: 'framework', headers: [['server', /BunnyCDN/i]] },
  { id: 'keycdn', label: 'KeyCDN', kind: 'framework', headers: [['server', /keycdn/i]] },
  { id: 'varnish', label: 'Varnish', kind: 'framework', headers: [['via', /varnish/i], ['x-varnish', true]] },
  { id: 'gcore', label: 'Gcore', kind: 'framework', headers: [['server', /gcore/i]] },
  { id: 'alibaba', label: 'Alibaba Cloud CDN', kind: 'framework', headers: [['server', /Tengine/i], ['eagleid', true]] },
  { id: 'tencent', label: 'Tencent Cloud CDN', kind: 'framework', headers: [['x-nws-log-uuid', true]] },
  { id: 'baidu', label: 'Baidu Cloud', kind: 'framework', headers: [['server', /bfe/i]] },
];

function matches(fp: Fingerprint, html: string, headers: Record<string, string>): boolean {
  for (const [name, test] of fp.headers ?? []) {
    const v = headers[name];
    if (v === undefined) continue;
    if (test === true || test.test(v)) return true;
  }
  // Bound the body scan. Fingerprints live in the head and early markup, and scanning
  // megabytes of a page body per pattern is the difference between a 40-minute crawl
  // and a two-hour one.
  const window = html.slice(0, 250_000);
  for (const re of fp.body ?? []) if (re.test(window)) return true;
  return false;
}

export function detectPlatform(html: string, headers: Record<string, string>): string | null {
  for (const fp of PLATFORMS) if (matches(fp, html, headers)) return fp.id;
  return null;
}

export function detectNetwork(headers: Record<string, string>): string | null {
  for (const fp of NETWORKS) if (matches(fp, '', headers)) return fp.id;
  return null;
}

const byId = (list: Fingerprint[]) => new Map(list.map((f) => [f.id, f]));
const PLATFORM_BY_ID = byId(PLATFORMS);
const NETWORK_BY_ID = byId(NETWORKS);

export const platformLabel = (id: string | null) => (id && PLATFORM_BY_ID.get(id)?.label) || null;
export const networkLabel = (id: string | null) => (id && NETWORK_BY_ID.get(id)?.label) || null;
export const platformKind = (id: string | null) => (id && PLATFORM_BY_ID.get(id)?.kind) || null;
