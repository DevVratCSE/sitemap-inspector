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
 * or when declared sitemaps yield 0 URLs.
 * Prioritizes dynamic CMS sitemap indexes (/sitemap_index.xml, /wp-sitemap.xml)
 * followed by standard static and feed locations.
 */
const STANDARD_SITEMAP_FALLBACKS = [
  '/sitemap_index.xml',
  '/wp-sitemap.xml',
  '/sitemap.xml',
  '/sitemap-index.xml',
  '/sitemap.xml.gz',
  '/sitemap_index.xml.gz',
  '/post-sitemap.xml',
  '/page-sitemap.xml',
  '/category-sitemap.xml',
  '/sitemap/sitemap.xml',
  '/sitemap/index.xml',
  '/sitemap1.xml',
  '/sitemap.rss',
  '/rss.xml',
  '/feed/',
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
    urlObj.pathname.endsWith('.rss') ||
    urlObj.pathname.toLowerCase().includes('sitemap');

  if (isDirectSitemap) {
    sitemapQueue.push({
      url: targetUrl,
      depth: 1,
      discoveredVia: 'manual',
    });
  } else {
    // Step 1: Probe robots.txt (with fallback to alternate protocol or www/non-www variant)
    onProgress?.({
      phase: 'robots',
      message: `Checking robots.txt at ${origin}/robots.txt...`,
      sitemapsFound: 0,
      urlsDiscovered: 0,
    });

    const candidateRobotsUrls = [`${origin}/robots.txt`];
    if (urlObj.protocol === 'https:') {
      candidateRobotsUrls.push(`http://${urlObj.host}/robots.txt`);
    }
    if (!urlObj.hostname.startsWith('www.')) {
      candidateRobotsUrls.push(`${urlObj.protocol}//www.${urlObj.host}/robots.txt`);
    } else {
      const nonWwwHost = urlObj.host.replace(/^www\./, '');
      candidateRobotsUrls.push(`${urlObj.protocol}//${nonWwwHost}/robots.txt`);
    }

    for (const robotsUrl of candidateRobotsUrls) {
      try {
        const robotsResource = await fetcher(robotsUrl);
        if (robotsResource && robotsResource.content && robotsResource.content.trim().length > 0) {
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
            break;
          }
        }
      } catch {
        // Try next candidate robots URL
      }
    }

    if (!robotsTxtFound) {
      warnings.push(`robots.txt could not be retrieved from ${origin}/robots.txt`);
    }

    // Step 2: If robots.txt had no sitemaps, probe standard fallback paths
    if (sitemapQueue.length === 0) {
      onProgress?.({
        phase: 'probe',
        message: 'No sitemaps found in robots.txt. Checking standard sitemap locations...',
        sitemapsFound: 0,
        urlsDiscovered: 0,
      });

      const fallbackOrigins = [origin];
      if (!urlObj.hostname.startsWith('www.')) {
        fallbackOrigins.push(`${urlObj.protocol}//www.${urlObj.host}`);
      }

      for (const baseOrigin of fallbackOrigins) {
        if (sitemapQueue.length > 0) break;
        for (const fallbackPath of STANDARD_SITEMAP_FALLBACKS) {
          const fallbackUrl = `${baseOrigin}${fallbackPath}`;
          try {
            const res = await fetcher(fallbackUrl);
            if (
              res &&
              res.content &&
              (res.content.includes('<urlset') ||
                res.content.includes('<sitemapindex') ||
                res.content.includes('<sitemap') ||
                res.content.includes('<rss') ||
                res.content.includes('<feed'))
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
  }

  // If no sitemaps found anywhere, record warning
  if (sitemapQueue.length === 0 && !isDirectSitemap) {
    warnings.push(`No XML sitemaps found in robots.txt or standard paths for ${targetDomain}.`);
  }

  // Step 3: Traversal of sitemaps
  const processQueue = async (queue: typeof sitemapQueue) => {
    while (queue.length > 0) {
      if (visitedSitemaps.size >= maxSitemapCount) {
        warnings.push(`Reached maximum sitemap count limit (${maxSitemapCount}).`);
        break;
      }

      const current = queue.shift()!;
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
                queue.push({
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
  };

  onProgress?.({
    phase: 'traversal',
    message: `Traversing ${sitemapQueue.length} identified sitemap(s)...`,
    sitemapsFound: sitemapQueue.length,
    urlsDiscovered: 0,
  });

  await processQueue(sitemapQueue);

  // Step 4: Fallback Recovery
  // If initial discovery produced 0 URLs (e.g. obsolete or degenerate sitemaps declared in robots.txt),
  // probe standard fallback locations (e.g. /sitemap_index.xml, /wp-sitemap.xml) to recover active sitemaps
  if (urlMap.size === 0 && !isDirectSitemap) {
    onProgress?.({
      phase: 'probe',
      message: 'Initial sitemaps yielded 0 URLs. Checking standard fallback locations...',
      sitemapsFound: discoveredSitemaps.length,
      urlsDiscovered: 0,
    });

    const fallbackOrigins = [origin];
    if (!urlObj.hostname.startsWith('www.')) {
      fallbackOrigins.push(`${urlObj.protocol}//www.${urlObj.host}`);
    } else {
      const nonWwwHost = urlObj.host.replace(/^www\./, '');
      fallbackOrigins.push(`${urlObj.protocol}//${nonWwwHost}`);
    }

    const recoveryQueue: typeof sitemapQueue = [];

    for (const baseOrigin of fallbackOrigins) {
      if (recoveryQueue.length > 0) break;
      for (const fallbackPath of STANDARD_SITEMAP_FALLBACKS) {
        const fallbackUrl = `${baseOrigin}${fallbackPath}`;
        if (visitedSitemaps.has(fallbackUrl)) continue;

        try {
          const res = await fetcher(fallbackUrl);
          if (
            res &&
            res.content &&
            (res.content.includes('<urlset') ||
              res.content.includes('<sitemapindex') ||
              res.content.includes('<sitemap') ||
              res.content.includes('<rss') ||
              res.content.includes('<feed'))
          ) {
            recoveryQueue.push({
              url: fallbackUrl,
              depth: 1,
              discoveredVia: 'fallback_guess',
            });
            break; // Stop at first valid standard fallback
          }
        } catch {
          // Continue probing
        }
      }
    }

    if (recoveryQueue.length > 0) {
      warnings.push(
        `Initial sitemaps yielded 0 URLs. Recovered active alternative sitemap at ${recoveryQueue[0].url}.`,
      );
      await processQueue(recoveryQueue);
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
