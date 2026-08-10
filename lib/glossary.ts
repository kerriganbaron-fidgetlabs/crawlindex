/**
 * One definition per term, in one place.
 *
 * Every element on this site was previously unexplained. A reader arriving at a table
 * headed "Answer-surface crawlers" with a cell reading "9 blocked" and a chip reading
 * "62 D" had no way to learn what any of that meant without reading the methodology page
 * end to end, and almost nobody does that.
 *
 * These strings are used in three places at once: the inline definition popovers, the
 * glossary page, and the `dfn` title attributes. Keeping them in one module is what stops
 * the tooltip and the methodology from drifting into saying different things.
 */

export type Term = {
  id: string;
  term: string;
  short: string;
  /** The longer entry, shown on /glossary. */
  long?: string;
  /** Where the full treatment lives, if there is one. */
  href?: string;
};

export const GLOSSARY: Term[] = [
  {
    id: 'answer-surface',
    term: 'Answer-surface crawler',
    short:
      'A crawler whose output reaches a person as an answer today: the ones behind ChatGPT, Claude, Perplexity, Gemini, Apple Intelligence and Meta AI. Blocking one has an immediate, visible cost.',
    long: 'Tier 1 in the registry. Separated from the rest because blocking Common Crawl affects a future model, while blocking OAI-SearchBot removes you from an answer somebody is reading right now. Averaging the two would hide the difference.',
    href: '/bots',
  },
  {
    id: 'secondary-crawler',
    term: 'Secondary crawler',
    short:
      'Dataset builders and smaller assistants. Common Crawl, Bytespider, Diffbot, retrieval APIs. Blocking these has a slower and more diffuse effect.',
    href: '/bots',
  },
  {
    id: 'score',
    term: 'CrawlIndex Score',
    short:
      'Zero to one hundred, from three bands: whether AI crawlers are allowed at all (45 points), whether the site publishes machine-readable surfaces (25), and whether its content is structured enough to be read (30). Arithmetic over archived evidence. No model is involved.',
    href: '/methodology',
  },
  {
    id: 'partial',
    term: 'Partial assessment',
    short:
      'Some checks could not be observed, usually because a bot wall answered instead of the site, so those points were removed from the total rather than failed. The remaining points are renormalised to one hundred. A partial score is not comparable with a complete one, which is why partial sites are kept out of ranked lists.',
    href: '/methodology',
  },
  {
    id: 'stub',
    term: 'Stub response',
    short:
      'A homepage that answered with under 5,000 bytes and no readable text. That is an anti-automation placeholder served to our crawler, not the site. Everything derived from it is discarded rather than counted against the operator.',
    href: '/methodology',
  },
  {
    id: 'cloaking',
    term: 'Cloaking',
    short:
      'Serving a crawler materially less than a browser gets, or refusing it outright, while robots.txt says nothing about it. Measured by fetching the same homepage twice, once as a browser and once as GPTBot, and comparing.',
    href: '/methodology',
  },
  {
    id: 'policy-gap',
    term: 'Policy gap',
    short:
      'robots.txt permits GPTBot and the server refuses GPTBot anyway. The operator published one policy and a different one is being enforced, almost always by an edge rule switched on above them.',
    href: '/findings#policy-gap',
  },
  {
    id: 'posture',
    term: 'Policy posture',
    short:
      'Whether anyone actually decided. Deliberate means robots.txt names AI crawlers by token. Inherited means it names none, so whatever AI policy exists is a side effect of generic rules. Blanket means one rule for everyone. Absent means no robots.txt at all.',
    href: '/findings#who-decides',
  },
  {
    id: 'archetype',
    term: 'Access archetype',
    short:
      'The shape of the policy rather than its size. Open, no training, assistant only, selective, walled, metered, or undeclared.',
    href: '/findings#who-decides',
  },
  {
    id: 'edge-network',
    term: 'Edge network',
    short:
      'The CDN or reverse proxy in front of the origin: Cloudflare, Akamai, Fastly, CloudFront. It can block a crawler before the site ever sees the request, which is why blocking correlates better with the CDN than with anything the operator published.',
    href: '/networks',
  },
  {
    id: 'platform',
    term: 'Publishing platform',
    short:
      'What the site is built on: WordPress, Shopify, Next.js, Squarespace. Detected from artefacts of running it, never from a page merely mentioning the vendor by name.',
    href: '/platforms',
  },
  {
    id: 'llms-txt',
    term: 'llms.txt',
    short:
      'A markdown file at the site root that points an AI agent at the pages worth reading. A community convention rather than a ratified standard, and adoption is still small.',
    href: '/methodology',
  },
  {
    id: 'agents-md',
    term: 'agents.md',
    short: 'A root-level markdown file describing how agents should behave on the site. Also a convention rather than a standard.',
    href: '/methodology',
  },
  {
    id: 'agent-card',
    term: 'Agent card',
    short:
      'A JSON document at /.well-known/agent-card.json advertising an agent-to-agent interface. Adoption across the most-visited domains is currently close to zero, which is why tracking the curve from the start is worth doing.',
    href: '/methodology',
  },
  {
    id: 'content-signal',
    term: 'Content-Signal',
    short:
      'A robots.txt directive expressing granular preferences, for example search=yes, ai-train=no, use=reference. Cloudflare writes it into managed robots.txt, so its spread is partly a measure of Cloudflare rather than of publisher intent.',
    href: '/methodology',
  },
  {
    id: 'rsl',
    term: 'RSL licensing',
    short:
      'Really Simple Licensing. A License: line in robots.txt pointing at machine-readable reuse terms. A third answer to "may an AI read this" beyond yes and no.',
    href: '/methodology',
  },
  {
    id: 'pay-per-crawl',
    term: 'Pay per crawl',
    short:
      'HTTP 402 Payment Required answered to an unpaid agent. Access is being metered and sold rather than refused, and it is tracked as its own category because averaging it with a block would misdescribe both.',
    href: '/methodology',
  },
  {
    id: 'vantage',
    term: 'Vantage',
    short:
      'Where the request came from. Origins serve differently by geography and IP reputation, so an observation is only comparable with another taken from the same place. Everything here is measured from GitHub runners in the US and EU.',
    href: '/methodology',
  },
  {
    id: 'percentile',
    term: 'Percentile',
    short:
      'The share of fully measured sites this one scores at least as well as. A score without a percentile has no referent.',
  },
];

export const TERM_BY_ID = new Map(GLOSSARY.map((t) => [t.id, t]));
export const getTerm = (id: string): Term | undefined => TERM_BY_ID.get(id);
