import { UrlAuditResult, HttpMetrics, SitemapQualityMetrics, DiscoveredSitemap } from '@/types';
import { DiscoverySummary } from '../sitemap-discovery/discovery-orchestrator';

/**
 * Calculates HTTP Health Score based solely on verified URLs
 * Formula: (Verified 2xx URLs / Total Verified URLs) * 100
 */
export function calculateHttpMetrics(results: UrlAuditResult[]): HttpMetrics {
  let count2xx = 0;
  let count3xx = 0;
  let count4xx = 0;
  let count5xx = 0;
  let countNetworkErrors = 0;
  let countTimeouts = 0;
  let totalUnverified = 0;

  for (const item of results) {
    if (item.category === 'success') {
      count2xx++;
    } else if (item.category === 'redirect') {
      count3xx++;
    } else if (item.category === 'client_error' || item.category === 'blocked') {
      count4xx++;
    } else if (item.category === 'server_error') {
      count5xx++;
    } else if (item.category === 'timeout') {
      countTimeouts++;
    } else if (item.category === 'network_error') {
      countNetworkErrors++;
    } else {
      totalUnverified++;
    }
  }

  const totalDiscovered = results.length;
  const totalChecked = results.length;
  const totalVerified =
    count2xx + count3xx + count4xx + count5xx + countTimeouts + countNetworkErrors;

  // If no URLs could be verified, health score is 0 with explicit 0 verified sample
  const healthScore = totalVerified > 0 ? Math.round((count2xx / totalVerified) * 1000) / 10 : 0;

  return {
    totalDiscovered,
    totalChecked,
    totalVerified,
    totalUnverified,
    count2xx,
    count3xx,
    count4xx,
    count5xx,
    countNetworkErrors,
    countTimeouts,
    healthScore,
  };
}

/**
 * Calculates Sitemap Quality Score and identifies specific technical issues
 */
export function calculateSitemapQuality(
  discovery: DiscoverySummary,
  results: UrlAuditResult[],
): SitemapQualityMetrics {
  let score = 100;
  const issues: SitemapQualityMetrics['issues'] = [];

  // 1. Robots.txt discovery & sitemap declaration
  if (!discovery.robotsTxtFound) {
    score -= 10;
    issues.push({
      severity: 'warning',
      code: 'MISSING_ROBOTS_TXT',
      message: 'No robots.txt file was found at the root domain.',
    });
  } else if (!discovery.sitemapInRobotsTxt) {
    score -= 5;
    issues.push({
      severity: 'info',
      code: 'NO_SITEMAP_IN_ROBOTS',
      message: 'robots.txt does not contain a "Sitemap:" directive declaring sitemap locations.',
    });
  }

  // 2. XML Syntax / Sitemap Structure Validity
  const invalidSitemaps = discovery.discoveredSitemaps.filter((s: DiscoveredSitemap) => !s.isValid);
  if (invalidSitemaps.length > 0) {
    score -= 20;
    issues.push({
      severity: 'critical',
      code: 'INVALID_SITEMAP_XML',
      message: `${invalidSitemaps.length} sitemap file(s) contained XML syntax errors or invalid root schemas.`,
      count: invalidSitemaps.length,
    });
  }

  // 3. Duplicate URLs inside sitemaps
  if (discovery.duplicateUrlCount > 0) {
    const dupPenalty = Math.min(10, Math.ceil(discovery.duplicateUrlCount / 10) * 2);
    score -= dupPenalty;
    issues.push({
      severity: 'warning',
      code: 'DUPLICATE_URLS',
      message: `Encountered ${discovery.duplicateUrlCount} duplicate URL declaration(s) across sitemaps.`,
      count: discovery.duplicateUrlCount,
    });
  }

  // 4. Redirects in Sitemaps (Sitemaps should only include canonical 200 URLs)
  const redirectResults = results.filter((r) => r.category === 'redirect');
  if (redirectResults.length > 0) {
    const redirectPct = Math.round((redirectResults.length / results.length) * 100);
    const penalty = Math.min(15, Math.max(3, Math.ceil(redirectPct / 5) * 3));
    score -= penalty;
    issues.push({
      severity: 'warning',
      code: 'REDIRECTED_URLS_IN_SITEMAP',
      message: `${redirectResults.length} URL(s) (${redirectPct}%) redirect to another destination. Sitemaps should contain only canonical 200 URLs.`,
      count: redirectResults.length,
    });
  }

  // 5. Broken URLs in Sitemaps (4xx and 5xx)
  const clientErrors = results.filter(
    (r) => r.category === 'client_error' || r.category === 'blocked',
  );
  if (clientErrors.length > 0) {
    const brokenPct = Math.round((clientErrors.length / results.length) * 100);
    const penalty = Math.min(25, Math.max(5, Math.ceil(brokenPct / 3) * 5));
    score -= penalty;
    issues.push({
      severity: 'critical',
      code: 'BROKEN_4XX_URLS',
      message: `${clientErrors.length} broken URL(s) (${brokenPct}%) returned 4xx client errors (e.g. 404/410).`,
      count: clientErrors.length,
    });
  }

  const serverErrors = results.filter((r) => r.category === 'server_error');
  if (serverErrors.length > 0) {
    score -= 15;
    issues.push({
      severity: 'critical',
      code: 'SERVER_5XX_ERRORS',
      message: `${serverErrors.length} URL(s) returned 5xx server errors.`,
      count: serverErrors.length,
    });
  }

  // 6. Lastmod Date Hygiene
  let missingLastmod = 0;
  const invalidLastmod = 0;
  for (const url of discovery.urls) {
    if (!url.lastmod) {
      missingLastmod++;
    }
  }

  if (missingLastmod > 0 && discovery.urls.length > 0) {
    const missingPct = Math.round((missingLastmod / discovery.urls.length) * 100);
    if (missingPct > 20) {
      score -= 5;
      issues.push({
        severity: 'info',
        code: 'MISSING_LASTMOD',
        message: `${missingLastmod} URL(s) (${missingPct}%) are missing <lastmod> timestamps.`,
        count: missingLastmod,
      });
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    qualityScore: finalScore,
    robotsTxtFound: discovery.robotsTxtFound,
    sitemapInRobotsTxt: discovery.sitemapInRobotsTxt,
    xmlStructureValid: invalidSitemaps.length === 0,
    duplicateUrlCount: discovery.duplicateUrlCount,
    malformedUrlCount: 0,
    redirectUrlCount: redirectResults.length,
    brokenUrlCount: clientErrors.length + serverErrors.length,
    missingLastmodCount: missingLastmod,
    invalidLastmodCount: invalidLastmod,
    issues,
  };
}
