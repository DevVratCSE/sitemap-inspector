import { HttpMetrics, SitemapQualityMetrics, UrlAuditResult } from '@/types';
import { DiscoverySummary } from '../sitemap-discovery/discovery-orchestrator';

export interface AuditRecommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
  affectedCount?: number;
}

/**
 * Generates deterministic technical recommendations strictly based on actual audit findings
 */
export function generateRecommendations(
  discovery: DiscoverySummary,
  httpMetrics: HttpMetrics,
  sitemapMetrics: SitemapQualityMetrics,
  results: UrlAuditResult[],
): AuditRecommendation[] {
  const recommendations: AuditRecommendation[] = [];

  // 1. Broken 4xx URLs
  const brokenUrls = results.filter(
    (r) => r.category === 'client_error' || r.category === 'blocked',
  );
  if (brokenUrls.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Remove Broken (4xx) URLs from Sitemaps',
      description: `${brokenUrls.length} URL(s) returned 4xx client errors (such as 404 Not Found or 410 Gone). Sitemaps must only list live, indexable URLs.`,
      action:
        'Update or remove the 4xx URLs from your XML sitemaps to prevent wasting search engine crawl budget.',
      affectedCount: brokenUrls.length,
    });
  }

  // 2. Server 5xx Errors
  const serverErrorUrls = results.filter((r) => r.category === 'server_error');
  if (serverErrorUrls.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Resolve Server (5xx) Failures',
      description: `${serverErrorUrls.length} URL(s) returned 5xx internal server errors during audit inspection.`,
      action:
        'Inspect web server application logs, database connections, and hosting timeouts for these URLs.',
      affectedCount: serverErrorUrls.length,
    });
  }

  // 3. Redirected URLs in Sitemaps
  const redirectUrls = results.filter((r) => r.category === 'redirect');
  if (redirectUrls.length > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Replace Redirected (3xx) URLs with Canonical Targets',
      description: `${redirectUrls.length} URL(s) in your sitemap returned 3xx redirects. Google and search engines recommend listing only final 200 canonical URLs.`,
      action:
        'Update your sitemap generation script to emit the final canonical destination URL directly rather than the redirect origin.',
      affectedCount: redirectUrls.length,
    });
  }

  // 4. Missing Robots.txt
  if (!discovery.robotsTxtFound) {
    recommendations.push({
      priority: 'medium',
      title: 'Deploy robots.txt at Domain Root',
      description: 'No robots.txt file was found at /robots.txt.',
      action:
        'Create a robots.txt file at domain root declaring user-agent crawl guidelines and sitemap declarations.',
    });
  } else if (!discovery.sitemapInRobotsTxt) {
    recommendations.push({
      priority: 'low',
      title: 'Declare Sitemap Locations in robots.txt',
      description: 'Your robots.txt exists but does not contain a "Sitemap:" directive.',
      action:
        'Add "Sitemap: https://yourdomain.com/sitemap.xml" to robots.txt to ensure search engine crawlers find your sitemaps automatically.',
    });
  }

  // 5. XML Syntax or Schema Issues
  const invalidSitemaps = discovery.discoveredSitemaps.filter((s) => !s.isValid);
  if (invalidSitemaps.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Fix Invalid XML Sitemap Syntax',
      description: `${invalidSitemaps.length} sitemap file(s) failed standard XML validation.`,
      action:
        'Validate your XML output against the sitemaps.org schema and ensure UTF-8 encoding without unescaped XML entities.',
      affectedCount: invalidSitemaps.length,
    });
  }

  // 6. Duplicate URLs
  if (discovery.duplicateUrlCount > 0) {
    recommendations.push({
      priority: 'low',
      title: 'Eliminate Duplicate Sitemaps Declarations',
      description: `${discovery.duplicateUrlCount} duplicate URL declaration(s) were found across your sitemap files.`,
      action:
        'Deduplicate sitemap generation logic to guarantee each canonical URL appears exactly once.',
      affectedCount: discovery.duplicateUrlCount,
    });
  }

  // 7. Missing Lastmod Timestamps
  if (sitemapMetrics.missingLastmodCount > 0 && discovery.urls.length > 0) {
    const missingPct = Math.round(
      (sitemapMetrics.missingLastmodCount / discovery.urls.length) * 100,
    );
    if (missingPct > 20) {
      recommendations.push({
        priority: 'low',
        title: 'Provide Accurate <lastmod> Timestamps',
        description: `${sitemapMetrics.missingLastmodCount} URL(s) (${missingPct}%) are missing <lastmod> timestamps.`,
        action:
          'Include valid W3C/ISO 8601 <lastmod> dates so search engines know when content was last modified.',
        affectedCount: sitemapMetrics.missingLastmodCount,
      });
    }
  }

  return recommendations;
}
