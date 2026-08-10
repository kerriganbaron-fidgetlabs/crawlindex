/** Shared shapes for observations and scores. */

export type AccessMap = Record<string, boolean>;

export type ControlKind =
  | 'none'
  | 'bot-challenge'
  | 'payment-required'
  | 'robots-restricted'
  /**
   * The control request answered, but with a body too small to contain a page and with no
   * extractable text. Amazon answers our crawler with a 2KB stub under an HTTP 200; scoring
   * that body charged amazon.com eight failures for a page it never served. An unreadable
   * body is a measurement we failed to take, not a finding about the site.
   */
  | 'unreadable';

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

  /**
   * Signals added in probe 3.0.0. Optional because records archived by an older probe do
   * not have them, and inventing a `false` for a question we never asked would publish a
   * fabricated decline the night the probe was upgraded. Absent means unobserved, and
   * every score line that reads this group is marked unavailable when it is missing.
   *
   * Everything here except `agentCard` is derived from bytes the probe already had in
   * hand, so the whole group costs one extra request per domain.
   */
  signals?: {
    /**
     * RSL 1.0 `License:` directive in robots.txt. A site pointing at machine-readable
     * licence terms is doing something categorically different from blocking, and no
     * other index records it.
     */
    licenseUrl: string | null;
    /** `<link rel="license">` on the homepage. The HTML-side equivalent. */
    licenseLink: boolean;
    /**
     * Raw `Content-Signal:` directive, e.g. `search=yes,ai-train=no,use=reference`.
     * Granular consent rather than a binary allow. Cloudflare injects this into managed
     * robots.txt, which makes its adoption curve a direct measurement of this project's
     * central claim: that the edge network, not the operator, is setting AI policy.
     */
    contentSignal: string | null;
    /** `crawler-price` header on a 402. What a metered site is actually asking. */
    crawlerPrice: string | null;
    /** `/.well-known/agent-card.json`, the A2A agent card. The one extra request. */
    agentCard: boolean;
    agentCardBytes: number;

    /** Dateline. Answer engines discount undated pages heavily. */
    datePublished: boolean;
    dateModified: boolean;
    /** JSON-LD `author` or `rel="author"`. */
    hasAuthor: boolean;

    /**
     * Extraction profile. Recorded and displayed, deliberately not scored: it describes
     * how cheap a page is for a retrieval pipeline to chunk, which is a useful thing to
     * publish and a bad thing to compress into a single grade.
     */
    h2Count: number;
    h3Count: number;
    listCount: number;
    tableCount: number;
    /** Extractable text as a fraction of total bytes. Low means expensive to read. */
    textRatio: number;

    /**
     * Paths the probe ran out of time to request, on a deadline-bounded run.
     *
     * Only `/check` sets a deadline, because it runs inside a serverless function with a
     * hard ceiling. A skipped check is **not** an absence: scoring `/llms.txt` as missing
     * because we gave up before asking would charge the site for our own impatience, which
     * is design rule 3. Every line reading a path listed here is marked unavailable.
     */
    skippedChecks?: string[];
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
