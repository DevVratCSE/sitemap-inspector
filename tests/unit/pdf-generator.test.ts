import { describe, it, expect } from 'vitest';
import { generateRecommendations } from '@/features/report-generator/recommendations';
import { generatePdfReport } from '@/features/report-generator/pdf-generator';
import { HttpMetrics, SitemapQualityMetrics, UrlAuditResult } from '@/types';
import { DiscoverySummary } from '@/features/sitemap-discovery/discovery-orchestrator';

describe('PDF Report Generator & Recommendations Engine', () => {
  const mockDiscovery: DiscoverySummary = {
    targetDomain: 'example.com',
    robotsTxtFound: false,
    sitemapInRobotsTxt: false,
    discoveredSitemaps: [
      {
        url: 'https://example.com/sitemap.xml',
        type: 'standard',
        urlCount: 3,
        discoveredVia: 'fallback_guess',
        isValid: true,
      },
    ],
    urls: [
      { url: 'https://example.com/1', sourceSitemap: 'sitemap.xml' },
      { url: 'https://example.com/2', sourceSitemap: 'sitemap.xml' },
      { url: 'https://example.com/3', sourceSitemap: 'sitemap.xml' },
    ],
    duplicateUrlCount: 0,
    limitReached: false,
    configuredMaxUrls: 500,
    totalDiscoveredCount: 3,
    errors: [],
    warnings: [],
  };

  const mockHttp: HttpMetrics = {
    totalDiscovered: 3,
    totalChecked: 3,
    totalVerified: 3,
    totalUnverified: 0,
    count2xx: 1,
    count3xx: 1,
    count4xx: 1,
    count5xx: 0,
    countNetworkErrors: 0,
    countTimeouts: 0,
    healthScore: 33.3,
  };

  const mockQuality: SitemapQualityMetrics = {
    qualityScore: 70,
    robotsTxtFound: false,
    sitemapInRobotsTxt: false,
    xmlStructureValid: true,
    duplicateUrlCount: 0,
    malformedUrlCount: 0,
    redirectUrlCount: 1,
    brokenUrlCount: 1,
    missingLastmodCount: 3,
    invalidLastmodCount: 0,
    issues: [],
  };

  const mockResults: UrlAuditResult[] = [
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
      finalUrl: 'https://example.com/target',
      category: 'redirect',
      statusCode: 301,
      redirectChain: ['https://example.com/2'],
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
  ];

  describe('generateRecommendations', () => {
    it('generates prioritized recommendations based on detected audit issues', () => {
      const recs = generateRecommendations(mockDiscovery, mockHttp, mockQuality, mockResults);

      expect(recs.length).toBeGreaterThan(0);
      // High priority broken 4xx recommendation
      expect(recs.some((r) => r.priority === 'high' && r.title.includes('Broken (4xx)'))).toBe(
        true,
      );
      // Medium priority redirect recommendation
      expect(
        recs.some((r) => r.priority === 'medium' && r.title.includes('Redirected (3xx)')),
      ).toBe(true);
      // Medium priority robots.txt recommendation
      expect(recs.some((r) => r.title.includes('robots.txt'))).toBe(true);
    });
  });

  describe('generatePdfReport', () => {
    it('successfully compiles and downloads the PDF report without error', async () => {
      await expect(
        generatePdfReport(mockDiscovery, mockHttp, mockQuality, mockResults, {
          domain: 'example.com',
          targetUrl: 'https://example.com',
          auditState: 'completed',
          durationMs: 3200,
        }),
      ).resolves.not.toThrow();
    });
  });
});
