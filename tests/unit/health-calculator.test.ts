import { describe, it, expect } from 'vitest';
import {
  calculateHttpMetrics,
  calculateSitemapQuality,
} from '@/features/health-scoring/health-calculator';
import { UrlAuditResult } from '@/types';
import { DiscoverySummary } from '@/features/sitemap-discovery/discovery-orchestrator';

describe('Health & Quality Calculator', () => {
  describe('calculateHttpMetrics', () => {
    it('calculates HTTP Health percentage strictly on verified URLs sample', () => {
      const results: UrlAuditResult[] = [
        {
          url: 'https://example.com/1',
          category: 'success',
          statusCode: 200,
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        },
        {
          url: 'https://example.com/2',
          category: 'success',
          statusCode: 200,
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        },
        {
          url: 'https://example.com/3',
          category: 'client_error',
          statusCode: 404,
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        },
        {
          url: 'https://example.com/4',
          category: 'unknown',
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        }, // unverified
      ];

      const metrics = calculateHttpMetrics(results);

      expect(metrics.totalDiscovered).toBe(4);
      expect(metrics.totalVerified).toBe(3);
      expect(metrics.totalUnverified).toBe(1);
      expect(metrics.count2xx).toBe(2);
      expect(metrics.count4xx).toBe(1);
      // Health score = 2 / 3 * 100 = 66.7%
      expect(metrics.healthScore).toBe(66.7);
    });

    it('returns 0 health score with 0 verified when all requests fail verification', () => {
      const results: UrlAuditResult[] = [
        {
          url: 'https://example.com/1',
          category: 'unknown',
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        },
      ];

      const metrics = calculateHttpMetrics(results);
      expect(metrics.totalVerified).toBe(0);
      expect(metrics.healthScore).toBe(0);
    });
  });

  describe('calculateSitemapQuality', () => {
    const mockDiscovery: DiscoverySummary = {
      targetDomain: 'example.com',
      robotsTxtFound: true,
      sitemapInRobotsTxt: true,
      discoveredSitemaps: [
        {
          url: 'https://example.com/sitemap.xml',
          type: 'standard',
          urlCount: 2,
          discoveredVia: 'robots.txt',
          isValid: true,
        },
      ],
      urls: [
        { url: 'https://example.com/1', sourceSitemap: 'sitemap.xml', lastmod: '2026-11-01' },
        { url: 'https://example.com/2', sourceSitemap: 'sitemap.xml', lastmod: '2026-11-01' },
      ],
      duplicateUrlCount: 0,
      limitReached: false,
      configuredMaxUrls: 500,
      totalDiscoveredCount: 2,
      errors: [],
      warnings: [],
    };

    it('awards 100 score for pristine discovery with 200 OK canonical URLs', () => {
      const results: UrlAuditResult[] = [
        {
          url: 'https://example.com/1',
          category: 'success',
          statusCode: 200,
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        },
        {
          url: 'https://example.com/2',
          category: 'success',
          statusCode: 200,
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        },
      ];

      const quality = calculateSitemapQuality(mockDiscovery, results);
      expect(quality.qualityScore).toBe(100);
      expect(quality.issues).toHaveLength(0);
    });

    it('deducts points for missing robots.txt and duplicate URLs', () => {
      const discoveryWithIssues: DiscoverySummary = {
        ...mockDiscovery,
        robotsTxtFound: false,
        sitemapInRobotsTxt: false,
        duplicateUrlCount: 5,
      };

      const results: UrlAuditResult[] = [
        {
          url: 'https://example.com/1',
          category: 'success',
          statusCode: 200,
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        },
      ];

      const quality = calculateSitemapQuality(discoveryWithIssues, results);
      expect(quality.qualityScore).toBeLessThan(90);
      expect(quality.issues.some((i) => i.code === 'MISSING_ROBOTS_TXT')).toBe(true);
      expect(quality.issues.some((i) => i.code === 'DUPLICATE_URLS')).toBe(true);
    });

    it('penalizes redirects and 404 client errors in sitemap', () => {
      const results: UrlAuditResult[] = [
        {
          url: 'https://example.com/1',
          category: 'redirect',
          statusCode: 301,
          redirectChain: ['https://example.com/1'],
          attempts: 1,
          checkedAt: '',
        },
        {
          url: 'https://example.com/2',
          category: 'client_error',
          statusCode: 404,
          redirectChain: [],
          attempts: 1,
          checkedAt: '',
        },
      ];

      const quality = calculateSitemapQuality(mockDiscovery, results);
      expect(quality.issues.some((i) => i.code === 'REDIRECTED_URLS_IN_SITEMAP')).toBe(true);
      expect(quality.issues.some((i) => i.code === 'BROKEN_4XX_URLS')).toBe(true);
      expect(quality.brokenUrlCount).toBe(1);
      expect(quality.redirectUrlCount).toBe(1);
    });
  });
});
