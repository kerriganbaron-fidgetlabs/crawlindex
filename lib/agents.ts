/**
 * The AI crawler registry.
 *
 * Version-pinned on purpose. The index is only comparable over time if the set of
 * tokens being measured does not drift silently underneath the data. Adding a token
 * is a REGISTRY_VERSION bump, and every snapshot records the version it was scored
 * under so historical rows stay interpretable.
 *
 * Upstream reference: https://github.com/ai-robots-txt/ai.robots.txt
 */

export const REGISTRY_VERSION = '1.0.0';
export const REGISTRY_SNAPSHOT_DATE = '2026-08-09';

export type AgentRole = 'training' | 'search' | 'assistant' | 'dataset';

export type Agent = {
  /** The robots.txt user-agent token, matched case-insensitively. */
  token: string;
  operator: string;
  role: AgentRole;
  /** Tier 1 bots surface content to users right now. Blocking them has immediate cost. */
  tier: 1 | 2;
  /** Short human explanation used on the per-bot pages. */
  blurb: string;
};

export const AGENTS: Agent[] = [
  // --- Tier 1: answer-surface bots -----------------------------------------
  { token: 'GPTBot', operator: 'OpenAI', role: 'training', tier: 1, blurb: 'Collects training data for OpenAI models.' },
  { token: 'OAI-SearchBot', operator: 'OpenAI', role: 'search', tier: 1, blurb: 'Builds the index behind ChatGPT search results.' },
  { token: 'ChatGPT-User', operator: 'OpenAI', role: 'assistant', tier: 1, blurb: 'Fetches a page live when a ChatGPT user asks about it.' },
  { token: 'ClaudeBot', operator: 'Anthropic', role: 'training', tier: 1, blurb: 'Collects training data for Anthropic models.' },
  { token: 'Claude-User', operator: 'Anthropic', role: 'assistant', tier: 1, blurb: 'Fetches a page live on behalf of a Claude user.' },
  { token: 'Claude-SearchBot', operator: 'Anthropic', role: 'search', tier: 1, blurb: 'Builds the index behind Claude search results.' },
  { token: 'PerplexityBot', operator: 'Perplexity', role: 'search', tier: 1, blurb: 'Builds the Perplexity answer index.' },
  { token: 'Perplexity-User', operator: 'Perplexity', role: 'assistant', tier: 1, blurb: 'Fetches a page live for a Perplexity user query.' },
  { token: 'Google-Extended', operator: 'Google', role: 'training', tier: 1, blurb: 'Controls use in Gemini training and grounding. Does not affect Google Search ranking.' },
  { token: 'Applebot-Extended', operator: 'Apple', role: 'training', tier: 1, blurb: 'Controls use in Apple Intelligence training.' },
  { token: 'meta-externalagent', operator: 'Meta', role: 'training', tier: 1, blurb: 'Collects training data for Meta AI.' },

  // --- Tier 2: index and training breadth ----------------------------------
  { token: 'CCBot', operator: 'Common Crawl', role: 'dataset', tier: 2, blurb: 'Feeds the Common Crawl corpus, which most open models train on.' },
  { token: 'Amazonbot', operator: 'Amazon', role: 'assistant', tier: 2, blurb: 'Powers Alexa and Rufus answers.' },
  { token: 'Bytespider', operator: 'ByteDance', role: 'training', tier: 2, blurb: 'Collects training data for ByteDance models.' },
  { token: 'cohere-ai', operator: 'Cohere', role: 'assistant', tier: 2, blurb: 'Retrieval for Cohere assistants.' },
  { token: 'MistralAI-User', operator: 'Mistral', role: 'assistant', tier: 2, blurb: 'Fetches a page live for a Le Chat user.' },
  { token: 'YouBot', operator: 'You.com', role: 'search', tier: 2, blurb: 'Builds the You.com answer index.' },
  { token: 'DuckAssistBot', operator: 'DuckDuckGo', role: 'assistant', tier: 2, blurb: 'Powers DuckAssist summaries.' },
  { token: 'kagi-fetcher', operator: 'Kagi', role: 'assistant', tier: 2, blurb: 'Fetches pages for Kagi assistant features.' },
  { token: 'Diffbot', operator: 'Diffbot', role: 'dataset', tier: 2, blurb: 'Builds a commercial knowledge graph.' },
  { token: 'Google-NotebookLM', operator: 'Google', role: 'assistant', tier: 2, blurb: 'Fetches sources for NotebookLM notebooks.' },
  { token: 'TavilyBot', operator: 'Tavily', role: 'dataset', tier: 2, blurb: 'Retrieval API used by agent frameworks.' },
  { token: 'FirecrawlAgent', operator: 'Firecrawl', role: 'dataset', tier: 2, blurb: 'Retrieval API used by agent frameworks.' },
];

export const TIER1 = AGENTS.filter((a) => a.tier === 1);
export const TIER2 = AGENTS.filter((a) => a.tier === 2);

/** URL-safe slug for a token, used in /bots/[slug] routes. */
export function agentSlug(token: string): string {
  return token.toLowerCase();
}

export function agentBySlug(slug: string): Agent | undefined {
  return AGENTS.find((a) => agentSlug(a.token) === slug.toLowerCase());
}

/**
 * User agents used for the live cloaking test.
 *
 * These are real published UA strings. We send them so we can compare what a bot is
 * served against what a browser is served. We do not disguise the probe beyond the UA:
 * every request also carries a `from` header pointing at the methodology page.
 */
export const LIVE_TEST_AGENTS = [
  {
    id: 'browser',
    role: 'control' as const,
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    id: 'gptbot',
    role: 'ai' as const,
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot',
  },
];
