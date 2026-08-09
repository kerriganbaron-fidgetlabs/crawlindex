import type { MetadataRoute } from 'next';
import { AGENTS, agentSlug } from '../lib/agents';
import { getAllIndexedDomains } from '../lib/queries';
import { getReportMonths } from '../lib/report';
import { absoluteUrl } from '../lib/site';

// Regenerated daily. The domain list is the bulk of the search surface, so a stale or
// truncated sitemap is the difference between thousands of indexed pages and a handful.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/leaderboard'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/bots'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/changes'), changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/methodology'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/api'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/reports'), changeFrequency: 'monthly', priority: 0.8 },
  ];

  const bots: MetadataRoute.Sitemap = AGENTS.map((a) => ({
    url: absoluteUrl(`/bots/${agentSlug(a.token)}`),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  let reports: MetadataRoute.Sitemap = [];
  try {
    reports = (await getReportMonths()).map((m) => ({
      url: absoluteUrl(`/reports/${m}`),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch {
    /* a database hiccup degrades the sitemap, it does not break the build */
  }

  let domains: MetadataRoute.Sitemap = [];
  try {
    const rows = await getAllIndexedDomains();
    domains = rows.map((r) => ({
      url: absoluteUrl(`/site/${r.domain}`),
      lastModified: r.observed_at ? new Date(r.observed_at) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch {
    // A database hiccup should degrade the sitemap, not break the build.
  }

  return [...statics, ...bots, ...reports, ...domains];
}
