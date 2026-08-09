/** Shared shapes for observations and scores. */

export type AccessMap = Record<string, boolean>;

export type Observation = {
  domain: string;
  observedAt: string;
  /** Registry version the access map was computed against. */
  registryVersion: string;
  probeVersion: string;

  reachable: boolean;
  httpStatus: number;
  finalUrl: string | null;
  error: string | null;

  /**
   * The operator disallowed CrawlIndexBot in robots.txt. We check this before requesting
   * anything else and stop there, so opting out costs the site one request rather than
   * five and the domain leaves the published index on the next crawl.
   */
  optedOut: boolean;

  /**
   * Whether OUR OWN control request was interfered with (bot challenge, WAF interstitial).
   * When it was, everything we infer from the HTML body is an artefact of being blocked
   * rather than a property of the site, and must be excluded from scoring instead of
   * counted as failure. robots.txt findings remain valid: that fetch is independent.
   */
  control: {
    challenged: boolean;
    reason: string | null;
    /**
     * `payment-required` is HTTP 402, which in 2026 means a pay-per-crawl wall rather
     * than an error. It is tracked separately from an ordinary bot challenge because
     * "this publisher charges agents for access" is a different fact about the web than
     * "this publisher blocks agents", and the two should never be averaged together.
     */
    kind: 'none' | 'bot-challenge' | 'payment-required';
  };

  robots: {
    present: boolean;
    /** A `User-agent: * / Disallow: /` style blanket block. */
    blocksAllCrawlers: boolean;
    sitemapDeclared: boolean;
    /** Tokens the operator named explicitly, whether to allow or to block. */
    namedTokens: string[];
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

  llmsTxt: { present: boolean; specValid: boolean; issues: string[] };
  agentsMd: { present: boolean };

  structured: {
    jsonLdTypes: string[];
    hasOrganization: boolean;
    hasWebSite: boolean;
  };

  content: {
    title: string | null;
    ssrTextLength: number;
    h1Count: number;
    landmarks: string[];
    imagesTotal: number;
    imagesWithAlt: number;
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

export type DomainRow = {
  domain: string;
  rank: number | null;
  category: string | null;
  score: number | null;
  grade: string | null;
  tier1_blocked: string[];
  tier2_blocked: string[];
  llms_txt: boolean;
  agents_md: boolean;
  cloaking: boolean;
  reachable: boolean;
  observed_at: string;
  first_seen: string;
  observation: Observation;
};
