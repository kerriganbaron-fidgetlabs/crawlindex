import type { MetadataRoute } from 'next';
import { AGENTS, agentSlug } from '../lib/agents';
import { allDomains, networkCohorts, platformCohorts, tldCohorts } from '../lib/dataset';
import { getReportMonths } from '../lib/report';
import { absoluteUrl } from '../lib/site';

/**
 * Everything the index publishes, in one file.
 *
 * The domain pages are the bulk of the search surface, so a truncated sitemap is the
 * difference between thousands of indexed pages and a handful. Reports and cohort pages
 * are derived from the data, so new ones appear here automatically the night they exist.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const statics: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/leaderboard'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/networks'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/platforms'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/tlds'), changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/bots'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/changes'), changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/reports'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/data'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/check'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/methodology'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/api'), changeFrequency: 'monthly', priority: 0.5 },
  ];

  const bots = AGENTS.map((a) => ({
    url: absoluteUrl(`/bots/${agentSlug(a.token)}`),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  const reports = getReportMonths().map((m) => ({
    url: absoluteUrl(`/reports/${m}`),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const cohorts = [
    ...platformCohorts().map((c) => absoluteUrl(`/platforms/${c.id}`)),
    ...networkCohorts().map((c) => absoluteUrl(`/networks/${c.id}`)),
    ...tldCohorts().map((c) => absoluteUrl(`/tlds/${c.id}`)),
  ].map((url) => ({ url, changeFrequency: 'weekly' as const, priority: 0.7 }));

  const domains = allDomains().map((r) => ({
    url: absoluteUrl(`/site/${r.domain}`),
    lastModified: new Date(r.obs.observedAt),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...statics, ...bots, ...reports, ...cohorts, ...domains];
}
