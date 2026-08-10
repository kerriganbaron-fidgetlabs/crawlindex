/**
 * The embeddable mark.
 *
 * ## Why the original failed
 *
 * It was a 196x28 shields.io lookalike printing `crawlindex | 62 D`. Nobody embedded it: it
 * could say F, it meant nothing without a referent, nothing on the site explained it
 * existed, and it looked like a build-pipeline artefact rather than an independent
 * measurement.
 *
 * ## Why the first rebuild still had a problem
 *
 * The tiered version fixed the substance and got the typography wrong. The wordmark was 8px
 * monospace in muted grey, sitting 30px above a 38px numeral: illegible, unbranded, and
 * crowded against the score. And the palette was fixed dark on the theory that a mark should
 * carry its own ground, which reads badly on a light page.
 *
 * ## What this does
 *
 * - **The wordmark is the site's own**, `crawl` in ink and `index` in the rust accent, at a
 *   size you can actually read, set clear of the score.
 * - **Three themes.** An SVG cannot know the background it was pasted onto, so this is an
 *   explicit choice: `auto` follows the viewer's `prefers-color-scheme`, and `light` and
 *   `dark` are pinned for an operator who knows their own page.
 *
 * ## Constraints
 *
 * It renders on somebody else's page: no external font, no external fetch, no script, fixed
 * dimensions, escaped input. `tests/facets.test.ts` pins all of that.
 */

export type BadgeTier = 'ready' | 'friendly' | 'measured' | 'unscored';
export type BadgeVariant = 'flat' | 'seal' | 'card';
export type BadgeTheme = 'auto' | 'light' | 'dark';

export const BADGE_THEMES: BadgeTheme[] = ['auto', 'light', 'dark'];

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

// --- palette ----------------------------------------------------------------

type Palette = {
  ground: string;
  ink: string;
  dim: string;
  rule: string;
  /** The accent half of the wordmark. Must clear AA on `ground`. */
  accent: string;
};

/**
 * Both palettes derive from the site's own tokens rather than being invented for the badge,
 * so an operator who has seen crawlindex.org recognises the mark. The accent is the light
 * theme's rust and the dark theme's warmer variant, which is the same pairing `globals.css`
 * uses and is already contrast-checked on each ground.
 */
const LIGHT: Palette = {
  ground: '#fbfaf7',
  ink: '#1a1813',
  dim: '#5e5b52',
  rule: '#e0ddd2',
  accent: '#a33d17',
};

const DARK: Palette = {
  ground: '#17150f',
  ink: '#faf8f4',
  dim: '#a8a399',
  rule: '#302d26',
  accent: '#e8875a',
};

/** Tier colours per theme. Each clears AA for its own text on its own ground. */
const TIER_COLOUR: Record<BadgeTheme extends never ? never : 'light' | 'dark', Record<BadgeTier, string>> = {
  light: { ready: '#1c7a52', friendly: '#2f6b3d', measured: '#57534a', unscored: '#57534a' },
  dark: { ready: '#4cb98a', friendly: '#6cc396', measured: '#8a857a', unscored: '#8a857a' },
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
  const pct = b.percentile !== null ? `, ahead of ${b.percentile}% of measured sites` : '';
  const when = b.measuredOn ? `, measured ${b.measuredOn}` : '';
  return `CrawlIndex ${TIER_NAME[tier]}: ${b.domain} scores ${b.score} out of 100, grade ${b.grade}${pct}${when}.`;
}

/**
 * Theming.
 *
 * `light` and `dark` resolve to literal hex, so the file is entirely static. `auto` emits
 * CSS custom properties with a `prefers-color-scheme` override, which works when the SVG is
 * loaded through `<img>` because the media query resolves against the viewer's own setting.
 *
 * The honest caveat, stated on the badge page: `auto` follows the *viewer*, not the host
 * page. A dark-mode reader on a white site gets the dark mark. That is why `light` and
 * `dark` exist, and why the embed builder previews on both grounds.
 */
function themeVars(theme: BadgeTheme, tier: BadgeTier): { defs: string; p: Palette; tier: string } {
  if (theme === 'light') return { defs: '', p: LIGHT, tier: TIER_COLOUR.light[tier] };
  if (theme === 'dark') return { defs: '', p: DARK, tier: TIER_COLOUR.dark[tier] };

  const v: Palette = {
    ground: 'var(--ci-ground)',
    ink: 'var(--ci-ink)',
    dim: 'var(--ci-dim)',
    rule: 'var(--ci-rule)',
    accent: 'var(--ci-accent)',
  };
  const defs = `<style>
    :root{--ci-ground:${LIGHT.ground};--ci-ink:${LIGHT.ink};--ci-dim:${LIGHT.dim};--ci-rule:${LIGHT.rule};--ci-accent:${LIGHT.accent};--ci-tier:${TIER_COLOUR.light[tier]}}
    @media (prefers-color-scheme:dark){:root{--ci-ground:${DARK.ground};--ci-ink:${DARK.ink};--ci-dim:${DARK.dim};--ci-rule:${DARK.rule};--ci-accent:${DARK.accent};--ci-tier:${TIER_COLOUR.dark[tier]}}}
  </style>`;
  return { defs, p: v, tier: 'var(--ci-tier)' };
}

/**
 * The wordmark, in the site's own two-tone treatment.
 *
 * Emitted as one `<text>` with a coloured `<tspan>` rather than two positioned elements, so
 * the kerning between "crawl" and "index" is the font's rather than something guessed at a
 * fixed offset.
 */
const wordmark = (x: number, y: number, size: number, p: Palette) =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" font-weight="700" letter-spacing="-0.2" fill="${p.ink}">crawl<tspan fill="${p.accent}">index</tspan></text>`;

const wrap = (w: number, h: number, title: string, defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>${defs}
${body}
</svg>`;

// --- flat -------------------------------------------------------------------

/** The strip, for a README or a status row. Wordmark upper-left, as asked. */
function flat(b: BadgeInput, theme: BadgeTheme): string {
  const t = badgeTier(b.score, b.grade);
  const { defs, p, tier } = themeVars(theme, t);
  const W = 260;
  const H = 56;
  const split = 178;
  const title = badgeTitle(b);

  const right =
    t === 'unscored'
      ? `<text x="${split + (W - split) / 2}" y="33" fill="${p.dim}" font-family="${FONT}" font-size="14" font-weight="700" text-anchor="middle">n/a</text>`
      : `<text x="${split + (W - split) / 2}" y="30" fill="${tier}" font-family="${FONT}" font-size="24" font-weight="700" text-anchor="middle">${b.score}</text>
  <text x="${split + (W - split) / 2}" y="43" fill="${p.dim}" font-family="${FONT}" font-size="8" font-weight="600" text-anchor="middle" letter-spacing="0.4">${
    b.percentile !== null ? `TOP ${Math.max(1, 100 - b.percentile)}%` : `GRADE ${esc(b.grade ?? '')}`
  }</text>`;

  return wrap(
    W,
    H,
    title,
    defs,
    `  <rect width="${W}" height="${H}" rx="6" fill="${p.ground}" stroke="${p.rule}" stroke-width="1"/>
  ${wordmark(14, 24, 14, p)}
  <text x="14" y="40" fill="${tier}" font-family="${FONT}" font-size="10.5" font-weight="700" letter-spacing="0.3">${esc(TIER_NAME[t].toUpperCase())}</text>
  <line x1="${split - 12}" y1="12" x2="${split - 12}" y2="${H - 12}" stroke="${p.rule}" stroke-width="1"/>
${right}`,
  );
}

// --- seal -------------------------------------------------------------------

/**
 * The circular mark, for a footer.
 *
 * A circle has no upper-left, so the wordmark takes the upper third at a readable size and
 * the score moves down to sit clear of it. The arc across the top carries the tier and the
 * arc across the bottom carries the measurement date.
 */
function seal(b: BadgeInput, theme: BadgeTheme): string {
  const t = badgeTier(b.score, b.grade);
  const { defs, p, tier } = themeVars(theme, t);
  const S = 168;
  const c = S / 2;
  const title = badgeTitle(b);

  /**
   * Two arcs, both traversed left to right. Text on a single full circle runs upside down
   * across the bottom half because that half is traversed right to left. Two half arcs put
   * the tangent at +x on both, so the glyphs stand upright on each. The alternative,
   * `side="right"`, is SVG 2 and unevenly supported, and a mark that renders upside down in
   * somebody's email client is worse than one that is harder to author.
   */
  const topArc = `M ${c - 62} ${c} a 62 62 0 0 1 124 0`;
  const bottomArc = `M ${c - 62} ${c} a 62 62 0 0 0 124 0`;

  return wrap(
    S,
    S,
    title,
    defs,
    `  <defs>
    <path id="ci-arc-top" d="${topArc}"/>
    <path id="ci-arc-bottom" d="${bottomArc}"/>
  </defs>
  <circle cx="${c}" cy="${c}" r="${c - 1}" fill="${p.ground}" stroke="${p.rule}" stroke-width="1"/>
  <circle cx="${c}" cy="${c}" r="${c - 6}" fill="none" stroke="${tier}" stroke-width="2"/>
  <circle cx="${c}" cy="${c}" r="${c - 11}" fill="none" stroke="${tier}" stroke-width="0.75" opacity="0.45"/>

  <text fill="${p.dim}" font-family="${FONT}" font-size="9.5" font-weight="700" letter-spacing="1.5">
    <textPath href="#ci-arc-top" startOffset="50%" text-anchor="middle">INDEPENDENTLY MEASURED</textPath>
  </text>
  <text fill="${p.dim}" font-family="${MONO}" font-size="8" letter-spacing="0.6">
    <textPath href="#ci-arc-bottom" startOffset="50%" text-anchor="middle">${esc(b.measuredOn ?? 'crawlindex.org')}</textPath>
  </text>

  <g text-anchor="middle">
    ${wordmark(c, c - 26, 15, p)}
    <text x="${c}" y="${c + 6}" fill="${tier}" font-family="${FONT}" font-size="11.5" font-weight="700" letter-spacing="0.4">${esc(TIER_NAME[t].toUpperCase())}</text>
    <text x="${c}" y="${c + 40}" fill="${p.ink}" font-family="${FONT}" font-size="34" font-weight="700">${t === 'unscored' ? '--' : b.score}</text>
    <text x="${c}" y="${c + 53}" fill="${p.dim}" font-family="${FONT}" font-size="8.5" font-weight="600" letter-spacing="0.4">${
      b.percentile !== null ? `TOP ${Math.max(1, 100 - b.percentile)}% OF THE WEB` : 'OUT OF 100'
    }</text>
  </g>`,
  );
}

// --- card -------------------------------------------------------------------

/** The wide mark, for a footer or a press page. Wordmark upper-left. */
function card(b: BadgeInput, theme: BadgeTheme): string {
  const t = badgeTier(b.score, b.grade);
  const { defs, p, tier } = themeVars(theme, t);
  const W = 360;
  const H = 128;
  const title = badgeTitle(b);
  const domain = b.domain.length > 30 ? `${b.domain.slice(0, 29)}…` : b.domain;

  return wrap(
    W,
    H,
    title,
    defs,
    `  <rect width="${W}" height="${H}" rx="8" fill="${p.ground}" stroke="${p.rule}" stroke-width="1"/>
  <rect width="5" height="${H}" rx="2.5" fill="${tier}"/>

  ${wordmark(22, 32, 17, p)}
  <text x="22" y="60" fill="${p.ink}" font-family="${FONT}" font-size="20" font-weight="700">${esc(TIER_NAME[t])}</text>
  <text x="22" y="78" fill="${p.dim}" font-family="${MONO}" font-size="10.5">${esc(domain)}</text>
  <line x1="22" y1="92" x2="${W - 22}" y2="92" stroke="${p.rule}" stroke-width="1"/>
  <text x="22" y="108" fill="${p.dim}" font-family="${FONT}" font-size="9">${
    b.percentile !== null ? `Ahead of ${b.percentile}% of measured sites` : 'Independently measured'
  }${b.measuredOn ? ` . ${esc(b.measuredOn)}` : ''}</text>

  <circle cx="${W - 52}" cy="58" r="33" fill="none" stroke="${tier}" stroke-width="2"/>
  <text x="${W - 52}" y="67" fill="${p.ink}" font-family="${FONT}" font-size="29" font-weight="700" text-anchor="middle">${
    t === 'unscored' ? '--' : b.score
  }</text>
  <text x="${W - 52}" y="106" fill="${p.dim}" font-family="${FONT}" font-size="8.5" font-weight="700" text-anchor="middle" letter-spacing="0.4">OUT OF 100</text>`,
  );
}

export function renderBadge(variant: BadgeVariant, b: BadgeInput, theme: BadgeTheme = 'auto'): string {
  if (variant === 'seal') return seal(b, theme);
  if (variant === 'card') return card(b, theme);
  return flat(b, theme);
}

export const BADGE_SIZES: Record<BadgeVariant, { w: number; h: number }> = {
  flat: { w: 260, h: 56 },
  seal: { w: 168, h: 168 },
  card: { w: 360, h: 128 },
};

// --- paths and embed snippets -----------------------------------------------

/**
 * Theme rides in the filename rather than as a route segment.
 *
 * `/badge/seal/example.com.svg` beside `/badge/seal/light/example.com.svg` would need a
 * dynamic segment at the same position as `[slug]`, and Next refuses two differently-named
 * dynamic segments there. The build passes and then every route on the site throws at
 * runtime, which this project has already shipped once.
 */
export function badgeSlug(domain: string, theme: BadgeTheme): string {
  return theme === 'auto' ? `${domain}.svg` : `${domain}.${theme}.svg`;
}

export function parseBadgeSlug(slug: string): { domain: string; theme: BadgeTheme } {
  const withoutExt = slug.replace(/\.svg$/i, '');
  for (const theme of ['light', 'dark'] as const) {
    if (withoutExt.toLowerCase().endsWith(`.${theme}`)) {
      return { domain: withoutExt.slice(0, -(theme.length + 1)), theme };
    }
  }
  return { domain: withoutExt, theme: 'auto' };
}

export function badgeUrl(origin: string, domain: string, variant: BadgeVariant, theme: BadgeTheme): string {
  const file = badgeSlug(domain, theme);
  return variant === 'flat' ? `${origin}/badge/${file}` : `${origin}/badge/${variant}/${file}`;
}

/**
 * The mark is always wrapped in a link back to the site's own index page. That is the
 * difference between an image and a citation: a reader can check it in one click.
 */
export function embedHtml(origin: string, domain: string, variant: BadgeVariant, alt: string, theme: BadgeTheme): string {
  const { w, h } = BADGE_SIZES[variant];
  return `<a href="${origin}/site/${domain}">
  <img src="${badgeUrl(origin, domain, variant, theme)}"
       width="${w}" height="${h}" loading="lazy"
       alt="${alt}">
</a>`;
}

export function embedMarkdown(origin: string, domain: string, variant: BadgeVariant, alt: string, theme: BadgeTheme): string {
  return `[![${alt}](${badgeUrl(origin, domain, variant, theme)})](${origin}/site/${domain})`;
}

export function embedJsx(origin: string, domain: string, variant: BadgeVariant, alt: string, theme: BadgeTheme): string {
  const { w, h } = BADGE_SIZES[variant];
  return `<a href="${origin}/site/${domain}">
  <img
    src="${badgeUrl(origin, domain, variant, theme)}"
    width={${w}}
    height={${h}}
    loading="lazy"
    alt="${alt}"
  />
</a>`;
}
