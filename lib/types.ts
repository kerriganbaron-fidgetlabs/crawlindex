/** Shared shapes for observations and scores. */

export type AccessMap = Record<string, boolean>;

export type ControlKind = 'none' | 'bot-challenge' | 'payment-required' | 'robots-restricted';

export type Observation = {
  domain: string;
  observedAt: string;
  /** Registry version the access map was computed against. */
  registryVersion: string;
  probeVersion: string;
  /**
   * Where the request came from. Origins serve differently by geography and IP
   * reputation, so an observation is only comparable with another from the same vantage.
   * Change detection refuses to diff across a mismatch.
   */
  vantage: string;

  reachable: boolean;
  httpStatus: number;
  finalUrl: string | null;
  error: string | null;

  /**
   * The operator disallowed CrawlIndexBot by name in robots.txt. We check this before
   * requesting anything else and stop there, so opting out costs the site one request
   * and the domain leaves the published index on the next crawl.
   */
  optedOut: boolean;

  /** True when the site answered over HTTPS. A plain-http-only site is a real finding. */
  https: boolean;

  control: {
    challenged: boolean;
    reason: string | null;
    /**
     * `payment-required` is HTTP 402, which in 2026 means a pay-per-crawl wall rather
     * than an error. `robots-restricted` means robots.txt denies all crawlers the root,
     * so we read the policy and fetched no page. Each is a different fact about the web
     * and they must never be averaged together.
     */
    kind: ControlKind;
  };

  robots: {
    present: boolean;
    blocksAllCrawlers: boolean;
    sitemapDeclared: boolean;
    /** Tokens the operator named explicitly, whether to allow or to block. */
    namedTokens: string[];
    /** Total user-agent groups. A proxy for how deliberate the policy is. */
    groupCount: number;
    /** Uses Allow: rules, which implies a curated policy rather than a blanket one. */
    usesAllowRules: boolean;
    crawlDelay: number | null;
    bytes: number;
  };

  /** token -> allowed. Computed for every agent in the registry. */
  access: AccessMap;
  tier1Blocked: string[];
  tier2Blocked: string[];

  cloaking: {
    tested: boolean;
    browserBytes: number;
    botStatus: number;
    botBytes: number;
    /** Bot was refused, or served materially less than the browser was. */
    detected: boolean;
  };

  llmsTxt: { present: boolean; specValid: boolean; issues: string[]; bytes: number; linkCount: number };
  agentsMd: { present: boolean; bytes: number };

  structured: {
    jsonLdTypes: string[];
    hasOrganization: boolean;
    hasWebSite: boolean;
  };

  content: {
    title: string | null;
    lang: string | null;
    ssrTextLength: number;
    h1Count: number;
    landmarks: string[];
    imagesTotal: number;
    imagesWithAlt: number;
    feed: boolean;
    canonical: boolean;
    metaNoindex: boolean;
  };

  /** Detected from the same bytes. Null means unrecognised, never guessed. */
  stack: {
    platform: string | null;
    network: string | null;
    server: string | null;
  };

  security: {
    hsts: boolean;
    csp: boolean;
    xContentTypeOptions: boolean;
  };
};

export type ScoreBand = {
  id: 'access' | 'surface' | 'structure';
  label: string;
  earned: number;
  /** Points available in this band after excluding unobservable lines. */
  max: number;
  /** Points the band is worth when everything is observable. */
  nominalMax: number;
};

export type ScoreLine = {
  id: string;
  label: string;
  earned: number;
  max: number;
  /**
   * False when we could not observe this honestly. Unavailable lines are excluded from
   * the total and the remaining points are renormalised to 100, so a site is never
   * punished for a measurement we failed to take.
   */
  available: boolean;
  /** Short, factual statement of what was observed. Rendered on the domain page. */
  detail: string;
};

export type Score = {
  /** null when the site could not be observed. An unobservable site is not a zero. */
  total: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  bands: ScoreBand[];
  lines: ScoreLine[];
  rubricVersion: string;
  /** True when some lines were excluded, so the total is renormalised over fewer points. */
  partial: boolean;
};
