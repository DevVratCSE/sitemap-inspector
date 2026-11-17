import { describe, it, expect, vi } from 'vitest';
import { discoverSitemaps } from '@/features/sitemap-discovery/discovery-orchestrator';
import { FetchedResource } from '@/services/resource-fetcher';
import { AuditConfig } from '@/types';

describe('Sitemap Discovery Orchestrator', () => {
  const defaultConfig: AuditConfig = {
    targetUrl: 'https://example.com',
    maxUrls: 500,
    concurrency: 3,
    timeoutMs: 5000,
    maxRedirectHops: 3,
    maxRetries: 0,
    sitemapRecursionDepth: 5,
  };

  it('discovers sitemaps declared in robots.txt and extracts URLs', async () => {
    const mockFetcher = vi.fn(async (url: string): Promise<FetchedResource> => {
      if (url === 'https://example.com/robots.txt') {
        return {
          url,
          content: 'User-agent: *\nSitemap: https://example.com/custom-sitemap.xml',
          contentType: 'text/plain',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 60,
        };
      }
      if (url === 'https://example.com/custom-sitemap.xml') {
        return {
          url,
          content: `<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/blog/post-1</loc></url>
              <url><loc>https://example.com/blog/post-2</loc></url>
            </urlset>`,
          contentType: 'application/xml',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 200,
        };
      }
      throw new Error('Not found');
    });

    const result = await discoverSitemaps(
      'https://example.com',
      defaultConfig,
      undefined,
      mockFetcher,
    );

    expect(result.robotsTxtFound).toBe(true);
    expect(result.sitemapInRobotsTxt).toBe(true);
    expect(result.discoveredSitemaps).toHaveLength(1);
    expect(result.discoveredSitemaps[0].url).toBe('https://example.com/custom-sitemap.xml');
    expect(result.urls).toHaveLength(2);
    expect(result.urls.map((u) => u.url)).toEqual([
      'https://example.com/blog/post-1',
      'https://example.com/blog/post-2',
    ]);
  });

  it('recursively traverses sitemap index files while detecting cycles', async () => {
    const mockFetcher = vi.fn(async (url: string): Promise<FetchedResource> => {
      if (url === 'https://example.com/robots.txt') {
        throw new Error('404');
      }
      if (url === 'https://example.com/sitemap.xml') {
        return {
          url,
          content: `<?xml version="1.0" encoding="UTF-8"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap><loc>https://example.com/child-1.xml</loc></sitemap>
              <sitemap><loc>https://example.com/sitemap.xml</loc></sitemap> <!-- Intentional Cycle -->
            </sitemapindex>`,
          contentType: 'application/xml',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 300,
        };
      }
      if (url === 'https://example.com/child-1.xml') {
        return {
          url,
          content: `<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/page-1</loc></url>
              <url><loc>https://example.com/page-2</loc></url>
            </urlset>`,
          contentType: 'application/xml',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 200,
        };
      }
      throw new Error('Not found');
    });

    const result = await discoverSitemaps(
      'https://example.com',
      defaultConfig,
      undefined,
      mockFetcher,
    );

    // Visited sitemaps should be index and child-1, cycle must be safely ignored
    expect(result.discoveredSitemaps.map((s) => s.url)).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/child-1.xml',
    ]);
    expect(result.urls).toHaveLength(2);
  });

  it('enforces configured maxUrls limit and reports limit reached', async () => {
    const mockFetcher = vi.fn(async (url: string): Promise<FetchedResource> => {
      return {
        url,
        content: `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/item-1</loc></url>
            <url><loc>https://example.com/item-2</loc></url>
            <url><loc>https://example.com/item-3</loc></url>
            <url><loc>https://example.com/item-4</loc></url>
            <url><loc>https://example.com/item-5</loc></url>
          </urlset>`,
        contentType: 'application/xml',
        isGzip: false,
        fetchedVia: 'direct',
        sizeBytes: 300,
      };
    });

    const limitedConfig: AuditConfig = {
      ...defaultConfig,
      maxUrls: 3,
    };

    const result = await discoverSitemaps(
      'https://example.com/sitemap.xml',
      limitedConfig,
      undefined,
      mockFetcher,
    );

    expect(result.urls).toHaveLength(3);
    expect(result.limitReached).toBe(true);
    expect(result.warnings.some((w) => w.includes('limit of 3 URLs reached'))).toBe(true);
  });

  it('detects and counts duplicate URLs across sitemaps', async () => {
    const mockFetcher = vi.fn(async (url: string): Promise<FetchedResource> => {
      return {
        url,
        content: `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/duplicate-item</loc></url>
            <url><loc>https://example.com/duplicate-item</loc></url>
            <url><loc>https://example.com/unique-item</loc></url>
          </urlset>`,
        contentType: 'application/xml',
        isGzip: false,
        fetchedVia: 'direct',
        sizeBytes: 300,
      };
    });

    const result = await discoverSitemaps(
      'https://example.com/sitemap.xml',
      defaultConfig,
      undefined,
      mockFetcher,
    );

    expect(result.urls).toHaveLength(2);
    expect(result.duplicateUrlCount).toBe(1);
  });

  it('probes protocol and www fallbacks when apex HTTPS robots.txt is unavailable', async () => {
    const mockFetcher = vi.fn(async (url: string): Promise<FetchedResource> => {
      // Simulate https://example.com/robots.txt failing (e.g. SSL or connection refused)
      if (url === 'https://example.com/robots.txt') {
        throw new Error('Connection refused');
      }
      // Protocol fallback succeeds
      if (url === 'http://example.com/robots.txt') {
        return {
          url,
          content: 'User-agent: *\nSitemap: https://example.com/fallback-sitemap.xml',
          contentType: 'text/plain',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 65,
        };
      }
      if (url === 'https://example.com/fallback-sitemap.xml') {
        return {
          url,
          content: `<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/item-from-protocol-fallback</loc></url>
            </urlset>`,
          contentType: 'application/xml',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 200,
        };
      }
      throw new Error('Not found');
    });

    const result = await discoverSitemaps(
      'https://example.com',
      defaultConfig,
      undefined,
      mockFetcher,
    );

    expect(result.robotsTxtFound).toBe(true);
    expect(result.sitemapInRobotsTxt).toBe(true);
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0].url).toBe('https://example.com/item-from-protocol-fallback');
  });

  it('discovers sitemaps from expanded standard fallbacks such as /wp-sitemap.xml', async () => {
    const mockFetcher = vi.fn(async (url: string): Promise<FetchedResource> => {
      if (url.includes('robots.txt')) {
        throw new Error('404');
      }
      if (url === 'https://example.com/wp-sitemap.xml') {
        return {
          url,
          content: `<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/wp-post-1</loc></url>
            </urlset>`,
          contentType: 'application/xml',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 200,
        };
      }
      throw new Error('404');
    });

    const result = await discoverSitemaps(
      'https://example.com',
      defaultConfig,
      undefined,
      mockFetcher,
    );

    expect(result.discoveredSitemaps).toHaveLength(1);
    expect(result.discoveredSitemaps[0].url).toBe('https://example.com/wp-sitemap.xml');
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0].url).toBe('https://example.com/wp-post-1');
  });

  it('recovers via standard fallback when robots.txt declared sitemap yields 0 URLs', async () => {
    const mockFetcher = vi.fn(async (url: string): Promise<FetchedResource> => {
      // robots.txt declares an obsolete sitemap.xml
      if (url === 'https://example.com/robots.txt') {
        return {
          url,
          content: 'User-agent: *\nSitemap: https://example.com/sitemap.xml',
          contentType: 'text/plain',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 60,
        };
      }
      // sitemap.xml is a broken index that yields 0 URLs
      if (url === 'https://example.com/sitemap.xml') {
        return {
          url,
          content: `<?xml version="1.0" encoding="UTF-8"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap><loc>https://example.com/sitemap.xml?page=1</loc></sitemap>
            </sitemapindex>`,
          contentType: 'application/xml',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 150,
        };
      }
      if (url === 'https://example.com/sitemap.xml?page=1') {
        // Returns the same index with 0 urls
        return {
          url,
          content: `<?xml version="1.0" encoding="UTF-8"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap><loc>https://example.com/sitemap.xml?page=1</loc></sitemap>
            </sitemapindex>`,
          contentType: 'application/xml',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 150,
        };
      }
      // Fallback recovery probes /sitemap_index.xml and finds active dynamic sitemap!
      if (url === 'https://example.com/sitemap_index.xml') {
        return {
          url,
          content: `<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/recovered-post-1</loc></url>
              <url><loc>https://example.com/recovered-post-2</loc></url>
            </urlset>`,
          contentType: 'application/xml',
          isGzip: false,
          fetchedVia: 'direct',
          sizeBytes: 250,
        };
      }
      throw new Error('Not found');
    });

    const result = await discoverSitemaps(
      'https://example.com',
      defaultConfig,
      undefined,
      mockFetcher,
    );

    // Initial broken sitemaps yielded 0 URLs, but Fallback Recovery found /sitemap_index.xml
    expect(result.urls).toHaveLength(2);
    expect(result.urls.map((u) => u.url)).toEqual([
      'https://example.com/recovered-post-1',
      'https://example.com/recovered-post-2',
    ]);
    expect(
      result.warnings.some((w) =>
        w.includes('Initial sitemaps yielded 0 URLs. Recovered active alternative sitemap'),
      ),
    ).toBe(true);
  });
});
