import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/site';

/**
 * We measure who blocks AI crawlers, so we allow all of them without exception. Anything
 * else would be indefensible.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/').replace(/\/$/, ''),
  };
}
