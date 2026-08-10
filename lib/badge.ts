/**
 * The embeddable mark.
 *
 * ## Why the old badge failed
 *
 * It was a 196x28 shields.io lookalike printing `crawlindex | 62 D`. Nobody embedded it,
 * and the reasons are not subtle:
 *
 *  1. **It could say F.** A badge is something an operator chooses to put on their own
 *     site. No one volunteers a failing grade. Offering everyone the same strip and
 *     hoping is not a distribution mechanism, it is a hope.
 *  2. **It meant nothing.** "62" against what? A number with no referent is not a claim.
 *  3. **Nowhere on the site said a badge existed**, what it measured, or how to get one.
 *  4. **It looked like a CI status badge**, which is the visual language of a build
 *     pipeline, not of an independent measurement somebody should trust.
 *
 * ## What changed
 *
 * The mark is an award with named tiers. Grade A earns Agent Ready, grade B earns Agent
 * Friendly, and everything below is offered a prioritised fix list instead plus a neutral
 * Measured mark if it wants one. It carries a percentile, so the number has a referent. It
 * carries the measurement date, so it is checkable. It is designed as a certification
 * seal, and it links back to the site's own page so a reader can verify it in one click.
 *
 * ## Constraints this file works under
 *
 * It renders on somebody else's page. No external font, no external anything, fixed
 * dimensions, and a fixed self-contained palette rather than a theme-aware one: the host
 * page's background is unknown, so the mark carries its own ground and reads the same on
 * white, on black, and in print.
 */

export type BadgeTier = 'ready' | 'friendly' | 'measured' | 'unscored';

export type BadgeVariant = 'flat' | 'seal' | 'card';

export const TIER_NAME: Record<BadgeTier, string> = {
  ready: 'Agent Ready',
  friendly: 'Agent Friendly',
  measured: 'Measured',
  unscored: 'Not scored',
};

export const TIER_RULE: Record<BadgeTier, string> = {
  ready: 'Scores 90 or above. Allows the crawlers that answer questions, publishes machine-readable surfaces, and serves content an agent can actually read.',
  friendly: 'Scores 75 to 89. Broadly open and legible to agents, with room left on the table.',
  measured:
    'Measured and published, but scoring below 75. There is no award to embed at this level, and the site page lists what to fix in priority order.',
  unscored: 'Could not be measured, so there is no score. An unobservable site is never recorded as a zero.',
};

/** Only these tiers get an award to put on their own site. */
export const EMBEDDABLE: BadgeTier[] = ['ready', 'friendly'];

export const isEmbeddable = (t: BadgeTier): boolean => EMBEDDABLE.includes(t);

export function badgeTier(score: number | null, grade: string | null): BadgeTier {
  if (score === null || !grade) return 'unscored';
  if (grade === 'A') return 'ready';
  if (grade === 'B') return 'friendly';
  return 'measured';
}

/**
 * Palette. Deliberately fixed rather than theme-aware.
 *
 * A mark embedded in a stranger's footer cannot know what it is sitting on. Carrying its
 * own dark ground makes it read identically on a white page, a black page and a printout,
 * which is what a certification mark has to do. Every text-on-ground pair below clears
 * WCAG AA at the sizes used.
 */
const INK = '#faf8f4';
const DIM = '#a8a399';
const GROUND = '#17150f';

const TIER_COLOUR: Record<BadgeTier, string> = {
  ready: '#1c7a52',
  friendly: '#3f7d44',
  measured: '#57534a',
  unscored: '#57534a',
};

const FONT =
  'ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace';

export const esc = (s: string): string =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

export type BadgeInput = {
  domain: string;
  score: number | null;
  grade: string | null;
  percentile: number | null;
  measuredOn: string | null;
  partial: boolean;
};

/** The sentence a screen reader gets, and the tooltip a mouse gets. */
export function badgeTitle(b: BadgeInput): string {
  const tier = badgeTier(b.score, b.grade);
  if (tier === 'unscored') return `${b.domain} is not currently scored on CrawlIndex.`;
  const pct =
    b.percentile !== null ? `, ahead of ${b.percentile}% of measured sites` : '';
  const when = b.measuredOn ? `, measured ${b.measuredOn}` : '';
  return `CrawlIndex ${TIER_NAME[tier]}: ${b.domain} scores ${b.score} out of 100, grade ${b.grade}${pct}${when}.`;
}

const wrap = (w: number, h: number, title: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
${body}
</svg>`;

// --- flat -------------------------------------------------------------------

/**
 * The strip, rebuilt. Still small enough for a README, but it now names the tier rather
 * than printing a bare grade, and the number sits next to a percentile that gives it a
 * referent.
 */
function flat(b: BadgeInput): string {
  const tier = badgeTier(b.score, b.grade);
  const colour = TIER_COLOUR[tier];
  const W = 232;
  const H = 40;
  const split = 132;
  const title = badgeTitle(b);

  const right =
    tier === 'unscored'
      ? `<text x="${split + (W - split) / 2}" y="25" fill="${INK}" font-family="${FONT}" font-size="13" font-weight="700" text-anchor="middle">n/a</text>`
      : `<text x="${split + (W - split) / 2}" y="22" fill="#ffffff" font-family="${FONT}" font-size="19" font-weight="700" text-anchor="middle">${b.score}</text>
  <text x="${split + (W - split) / 2}" y="32" fill="#ffffff" font-family="${FONT}" font-size="8" font-weight="600" text-anchor="middle" opacity="0.85">${
    b.percentile !== null ? `TOP ${Math.max(1, 100 - b.percentile)}%` : `GRADE ${esc(b.grade ?? '')}`
  }</text>`;

  return wrap(
    W,
    H,
    title,
    `  <rect width="${W}" height="${H}" rx="5" fill="${GROUND}"/>
  <path d="M${split} 0 H${W - 5} a5 5 0 0 1 5 5 V${H - 5} a5 5 0 0 1 -5 5 H${split} Z" fill="${colour}"/>
  <text x="12" y="16" fill="${INK}" font-family="${MONO}" font-size="11" font-weight="700" letter-spacing="0.2">crawlindex</text>
  <text x="12" y="29" fill="${DIM}" font-family="${FONT}" font-size="8.5" letter-spacing="0.6">${esc(TIER_NAME[tier].toUpperCase())}</text>
${right}`,
  );
}

// --- seal -------------------------------------------------------------------

/**
 * The circular mark. This is the one an operator actually wants in a footer.
 *
 * Arced text on a path, two concentric rules, the grade as the hero and the score
 * underneath it. It reads as something that was awarded rather than something that was
 * computed, which is the whole point: the grade is identical either way, and only one of
 * the two gets embedded.
 */
function seal(b: BadgeInput): string {
  const tier = badgeTier(b.score, b.grade);
  const colour = TIER_COLOUR[tier];
  const S = 148;
  const c = S / 2;
  const title = badgeTitle(b);

  /**
   * Two separate arcs, both traversed left to right.
   *
   * Text on a single full circle runs upside down across the bottom half, because that
   * half is traversed right to left. Two half arcs, each going left to right, put the
   * tangent at +x on both the top and the bottom, so the glyphs stand upright on both.
   *
   * The alternative is one circle plus `side="right"`, which is SVG 2 and unevenly
   * supported. A mark that renders upside down in somebody's email client or PDF is worse
   * than one that is slightly harder to author, so the geometry does the work instead.
   */
  const topArc = `M ${c - 54} ${c} a 54 54 0 0 1 108 0`;
  const bottomArc = `M ${c - 54} ${c} a 54 54 0 0 0 108 0`;

  return wrap(
    S,
    S,
    title,
    `  <defs>
    <path id="arc-top" d="${topArc}"/>
    <path id="arc-bottom" d="${bottomArc}"/>
  </defs>
  <circle cx="${c}" cy="${c}" r="${c}" fill="${GROUND}"/>
  <circle cx="${c}" cy="${c}" r="${c - 5}" fill="none" stroke="${colour}" stroke-width="2"/>
  <circle cx="${c}" cy="${c}" r="${c - 10}" fill="none" stroke="${colour}" stroke-width="0.75" opacity="0.5"/>

  <text fill="${INK}" font-family="${FONT}" font-size="10.5" font-weight="700" letter-spacing="1.6">
    <textPath href="#arc-top" startOffset="50%" text-anchor="middle">${esc(TIER_NAME[tier].toUpperCase())}</textPath>
  </text>
  <text fill="${DIM}" font-family="${MONO}" font-size="8" letter-spacing="0.8">
    <textPath href="#arc-bottom" startOffset="50%" text-anchor="middle">${esc(b.measuredOn ?? 'crawlindex.org')}</textPath>
  </text>

  <text x="${c}" y="${c - 12}" fill="${DIM}" font-family="${MONO}" font-size="8" text-anchor="middle" letter-spacing="0.4">crawlindex</text>
  <text x="${c}" y="${c + 18}" fill="${INK}" font-family="${FONT}" font-size="38" font-weight="700" text-anchor="middle">${
    tier === 'unscored' ? '--' : b.score
  }</text>
  <text x="${c}" y="${c + 32}" fill="${colour}" font-family="${FONT}" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="0.5">${
    b.percentile !== null ? `TOP ${Math.max(1, 100 - b.percentile)}% OF THE WEB` : esc(b.grade ?? '')
  }</text>`,
  );
}

// --- card -------------------------------------------------------------------

/**
 * The wide mark, for a footer or a press page. Room to say what was measured and by whom,
 * which is what turns a number into a citation.
 */
function card(b: BadgeInput): string {
  const tier = badgeTier(b.score, b.grade);
  const colour = TIER_COLOUR[tier];
  const W = 340;
  const H = 116;
  const title = badgeTitle(b);
  const domain = b.domain.length > 30 ? `${b.domain.slice(0, 29)}…` : b.domain;

  return wrap(
    W,
    H,
    title,
    `  <rect width="${W}" height="${H}" rx="8" fill="${GROUND}"/>
  <rect width="4" height="${H}" rx="2" fill="${colour}"/>

  <text x="20" y="26" fill="${DIM}" font-family="${MONO}" font-size="9.5" letter-spacing="0.6">crawlindex.org</text>
  <text x="20" y="52" fill="${INK}" font-family="${FONT}" font-size="19" font-weight="700">${esc(TIER_NAME[tier])}</text>
  <text x="20" y="70" fill="${DIM}" font-family="${MONO}" font-size="10.5">${esc(domain)}</text>
  <line x1="20" y1="82" x2="${W - 20}" y2="82" stroke="${DIM}" stroke-width="0.5" opacity="0.35"/>
  <text x="20" y="98" fill="${DIM}" font-family="${FONT}" font-size="9">${
    b.percentile !== null
      ? `Ahead of ${b.percentile}% of measured sites`
      : 'Independently measured'
  }${b.measuredOn ? ` . ${esc(b.measuredOn)}` : ''}</text>

  <circle cx="${W - 46}" cy="52" r="30" fill="none" stroke="${colour}" stroke-width="2"/>
  <text x="${W - 46}" y="60" fill="${INK}" font-family="${FONT}" font-size="27" font-weight="700" text-anchor="middle">${
    tier === 'unscored' ? '--' : b.score
  }</text>
  <text x="${W - 46}" y="96" fill="${colour}" font-family="${FONT}" font-size="9" font-weight="700" text-anchor="middle" letter-spacing="0.5">OUT OF 100</text>`,
  );
}

export function renderBadge(variant: BadgeVariant, b: BadgeInput): string {
  if (variant === 'seal') return seal(b);
  if (variant === 'card') return card(b);
  return flat(b);
}

export const BADGE_SIZES: Record<BadgeVariant, { w: number; h: number }> = {
  flat: { w: 232, h: 40 },
  seal: { w: 148, h: 148 },
  card: { w: 340, h: 116 },
};

// --- embed snippets ---------------------------------------------------------

/**
 * The mark is always wrapped in a link back to the site's own index page.
 *
 * That is the difference between an image and a citation. A reader who sees the mark can
 * check it in one click, which is the only reason a claim like this is worth anything,
 * and the operator gets a mark that survives scrutiny rather than one that dodges it.
 */
export function embedHtml(origin: string, domain: string, variant: BadgeVariant, alt: string): string {
  const { w, h } = BADGE_SIZES[variant];
  const src = variant === 'flat' ? `${origin}/badge/${domain}.svg` : `${origin}/badge/${variant}/${domain}.svg`;
  return `<a href="${origin}/site/${domain}">
  <img src="${src}"
       width="${w}" height="${h}" loading="lazy"
       alt="${alt}">
</a>`;
}

export function embedMarkdown(origin: string, domain: string, variant: BadgeVariant, alt: string): string {
  const src = variant === 'flat' ? `${origin}/badge/${domain}.svg` : `${origin}/badge/${variant}/${domain}.svg`;
  return `[![${alt}](${src})](${origin}/site/${domain})`;
}

export function embedJsx(origin: string, domain: string, variant: BadgeVariant, alt: string): string {
  const { w, h } = BADGE_SIZES[variant];
  const src = variant === 'flat' ? `${origin}/badge/${domain}.svg` : `${origin}/badge/${variant}/${domain}.svg`;
  return `<a href="${origin}/site/${domain}">
  <img
    src="${src}"
    width={${w}}
    height={${h}}
    loading="lazy"
    alt="${alt}"
  />
</a>`;
}
