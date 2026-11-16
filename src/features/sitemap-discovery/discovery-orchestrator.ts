import { DiscoveredSitemap, DiscoveredUrl, AuditConfig } from '@/types';
import { parseRobotsTxt } from './robots-parser';
import { parseSitemapXml } from '../sitemap-parser/xml-parser';
import { fetchSitemapResource, FetchedResource } from '@/services/resource-fetcher';

export interface DiscoveryProgress {
  phase: 'robots' | 'probe' | 'traversal' | 'complete';
  message: string;
  sitemapsFound: number;
  urlsDiscovered: number;
}

export interface DiscoverySummary {
  targetDomain: string;
  robotsTxtFound: boolean;
  sitemapInRobotsTxt: boolean;
  discoveredSitemaps: DiscoveredSitemap[];
  urls: DiscoveredUrl[];
  duplicateUrlCount: number;
  limitReached: boolean;
  configuredMaxUrls: number;
  totalDiscoveredCount: number;
  errors: string[];
  warnings: string[];
}

export type DiscoveryProgressCallback = (progress: DiscoveryProgress) => void;

/**
 * Standard fallback sitemap paths checked when robots.txt yields no sitemap directives
 */
const STANDARD_SITEMAP_FALLBACKS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/wp-sitemap.xml',
];

/**
 * Executes automatic sitemap discovery and recursive URL extraction
 */
export async function discoverSitemaps(
  targetUrl: string,
  config: AuditConfig,
  onProgress?: DiscoveryProgressCallback,
  fetcher: (url: string) => Promise<FetchedResource> = fetchSitemapResource,
): Promise<DiscoverySummary> {
  const urlObj = new URL(targetUrl);
  const origin = urlObj.origin;
  const targetDomain = urlObj.hostname;

  const discoveredSitemaps: DiscoveredSitemap[] = [];
  const sitemapQueue: {
    url: string;
    depth: number;
    discoveredVia: DiscoveredSitemap['discoveredVia'];
  }[] = [];
  const visitedSitemaps = new Set<string>();

  const urlMap = new Map<string, DiscoveredUrl>();
  let duplicateUrlCount = 0;
  let totalDiscoveredCount = 0;
  let limitReached = false;

  const errors: string[] = [];
  const warnings: string[] = [];

  let robotsTxtFound = false;
  let sitemapInRobotsTxt = false;

  const maxUrls = config.maxUrls || 500;
  const maxDepth = config.sitemapRecursionDepth || 5;
  const maxSitemapCount = 25;

  // Check if initial URL is a direct sitemap
  const isDirectSitemap =
    urlObj.pathname.endsWith('.xml') ||
    urlObj.pathname.endsWith('.xml.gz') ||
    urlObj.pathname.endsWith('.txt') ||
    urlObj.pathname.toLowerCase().includes('sitemap');

  if (isDirectSitemap) {
    sitemapQueue.push({
      url: targetUrl,
      depth: 1,
      discoveredVia: 'manual',
    });
  } else {
    // Step 1: Probe robots.txt
    onProgress?.({
      phase: 'robots',
      message: `Checking robots.txt at ${origin}/robots.txt...`,
      sitemapsFound: 0,
      urlsDiscovered: 0,
    });

    const robotsUrl = `${origin}/robots.txt`;
    try {
      const robotsResource = await fetcher(robotsUrl);
      if (robotsResource && robotsResource.content) {
        robotsTxtFound = true;
        const parsedRobots = parseRobotsTxt(robotsResource.content, origin);

        if (parsedRobots.sitemaps.length > 0) {
          sitemapInRobotsTxt = true;
          for (const sitemapUrl of parsedRobots.sitemaps) {
            sitemapQueue.push({
              url: sitemapUrl,
              depth: 1,
              discoveredVia: 'robots.txt',
            });
          }
        }
      }
    } catch {
      warnings.push(`robots.txt could not be retrieved from ${robotsUrl}`);
    }

    // Step 2: If robots.txt had no sitemaps, probe standard fallback paths
    if (sitemapQueue.length === 0) {
      onProgress?.({
        phase: 'probe',
        message: 'No sitemaps found in robots.txt. Checking standard sitemap locations...',
        sitemapsFound: 0,
        urlsDiscovered: 0,
      });

      for (const fallbackPath of STANDARD_SITEMAP_FALLBACKS) {
        const fallbackUrl = `${origin}${fallbackPath}`;
        try {
          const res = await fetcher(fallbackUrl);
          if (
            res &&
            res.content &&
            (res.content.includes('<urlset') ||
              res.content.includes('<sitemapindex') ||
              res.content.includes('<sitemap'))
          ) {
            sitemapQueue.push({
              url: fallbackUrl,
              depth: 1,
              discoveredVia: 'fallback_guess',
            });
            break; // Stop at first valid standard location
          }
        } catch {
          // Continue probing
        }
      }
    }
  }

  // If still no sitemaps found, try root sitemap.xml as a last resort
  if (sitemapQueue.length === 0 && !isDirectSitemap) {
    sitemapQueue.push({
      url: `${origin}/sitemap.xml`,
      depth: 1,
      discoveredVia: 'fallback_guess',
    });
  }

  // Step 3: Traversal of sitemaps
  onProgress?.({
    phase: 'traversal',
    message: `Traversing ${sitemapQueue.length} identified sitemap(s)...`,
    sitemapsFound: sitemapQueue.length,
    urlsDiscovered: 0,
  });

  while (sitemapQueue.length > 0) {
    if (visitedSitemaps.size >= maxSitemapCount) {
      warnings.push(`Reached maximum sitemap count limit (${maxSitemapCount}).`);
      break;
    }

    const current = sitemapQueue.shift()!;
    if (visitedSitemaps.has(current.url)) {
      continue; // Prevent cycles
    }

    visitedSitemaps.add(current.url);

    onProgress?.({
      phase: 'traversal',
      message: `Parsing sitemap: ${current.url}`,
      sitemapsFound: visitedSitemaps.size,
      urlsDiscovered: urlMap.size,
    });

    try {
      const resource = await fetcher(current.url);
      const parsed = parseSitemapXml(resource.content, current.url);

      const sitemapMeta: DiscoveredSitemap = {
        url: current.url,
        type:
          parsed.type === 'index'
            ? 'index'
            : parsed.type === 'rss'
              ? 'rss'
              : parsed.type === 'text'
                ? 'text'
                : 'standard',
        urlCount: parsed.urls.length,
        discoveredVia: current.discoveredVia,
        isValid: parsed.isValid,
        error: parsed.errors.length > 0 ? parsed.errors.join('; ') : undefined,
        children: parsed.childSitemaps.length > 0 ? parsed.childSitemaps : undefined,
      };

      discoveredSitemaps.push(sitemapMeta);

      if (parsed.errors.length > 0) {
        errors.push(`Errors in ${current.url}: ${parsed.errors.join(', ')}`);
      }
      if (parsed.warnings.length > 0) {
        warnings.push(...parsed.warnings.map((w) => `[${current.url}] ${w}`));
      }

      // If sitemap index, enqueue children
      if (parsed.type === 'index' && parsed.childSitemaps.length > 0) {
        if (current.depth < maxDepth) {
          for (const childUrl of parsed.childSitemaps) {
            if (!visitedSitemaps.has(childUrl)) {
              sitemapQueue.push({
                url: childUrl,
                depth: current.depth + 1,
                discoveredVia: 'index_child',
              });
            }
          }
        } else {
          warnings.push(`Reached maximum recursion depth (${maxDepth}) at ${current.url}`);
        }
      }

      // Collect URLs
      for (const discoveredUrl of parsed.urls) {
        totalDiscoveredCount++;
        if (urlMap.has(discoveredUrl.url)) {
          duplicateUrlCount++;
        } else {
          if (urlMap.size >= maxUrls) {
            limitReached = true;
            // Stop processing once configured ceiling is reached
            break;
          }
          urlMap.set(discoveredUrl.url, discoveredUrl);
        }
      }

      if (limitReached) {
        warnings.push(
          `Configured audit limit of ${maxUrls} URLs reached. Stopping further discovery.`,
        );
        break;
      }
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      discoveredSitemaps.push({
        url: current.url,
        type: 'standard',
        urlCount: 0,
        discoveredVia: current.discoveredVia,
        isValid: false,
        error: msg,
      });
      errors.push(`Failed to fetch sitemap ${current.url}: ${msg}`);
    }
  }

  onProgress?.({
    phase: 'complete',
    message: `Discovery complete. Found ${discoveredSitemaps.length} sitemaps and ${urlMap.size} unique URLs.`,
    sitemapsFound: discoveredSitemaps.length,
    urlsDiscovered: urlMap.size,
  });

  return {
    targetDomain,
    robotsTxtFound,
    sitemapInRobotsTxt,
    discoveredSitemaps,
    urls: Array.from(urlMap.values()),
    duplicateUrlCount,
    limitReached,
    configuredMaxUrls: maxUrls,
    totalDiscoveredCount,
    errors,
    warnings,
  };
}
