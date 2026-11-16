/**
 * Audit result category distinguishing HTTP statuses and verification outcomes
 */
export type AuditCategory =
  | 'success' // 2xx
  | 'redirect' // 3xx
  | 'client_error' // 4xx
  | 'server_error' // 5xx
  | 'network_error' // DNS failure, connection refused
  | 'timeout' // > request timeout
  | 'cors_blocked' // Direct browser fetch blocked by CORS
  | 'blocked' // 401 / 403
  | 'rate_limited' // 429
  | 'unknown'; // Unverified

export interface UrlAuditResult {
  url: string;
  finalUrl?: string;
  statusCode?: number;
  category: AuditCategory;
  redirectChain: string[];
  responseTimeMs?: number;
  attempts: number;
  checkedAt: string;
  sourceSitemap?: string;
  errorMessage?: string;
}

export interface DiscoveredUrl {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
  sourceSitemap: string;
}

export interface DiscoveredSitemap {
  url: string;
  type: 'standard' | 'index' | 'rss' | 'text';
  urlCount: number;
  discoveredVia: 'robots.txt' | 'fallback_guess' | 'manual' | 'index_child';
  isValid: boolean;
  error?: string;
  children?: string[];
}

export interface AuditConfig {
  targetUrl: string;
  maxUrls: number; // default: 500, max: 1000
  concurrency: number; // default: 3, max: 5
  timeoutMs: number; // default: 10000 (10s)
  maxRedirectHops: number; // default: 3
  maxRetries: number; // default: 0, max: 1
  sitemapRecursionDepth: number; // default: 5
}

export type AuditState =
  'idle' | 'discovering' | 'auditing' | 'paused' | 'completed' | 'cancelled' | 'error';

export interface HttpMetrics {
  totalDiscovered: number;
  totalChecked: number;
  totalVerified: number;
  totalUnverified: number;
  count2xx: number;
  count3xx: number;
  count4xx: number;
  count5xx: number;
  countNetworkErrors: number;
  countTimeouts: number;
  healthScore: number; // (count2xx / totalVerified) * 100
}

export interface SitemapQualityMetrics {
  qualityScore: number; // 0 - 100
  robotsTxtFound: boolean;
  sitemapInRobotsTxt: boolean;
  xmlStructureValid: boolean;
  duplicateUrlCount: number;
  malformedUrlCount: number;
  redirectUrlCount: number;
  brokenUrlCount: number;
  missingLastmodCount: number;
  invalidLastmodCount: number;
  issues: {
    severity: 'critical' | 'warning' | 'info';
    code: string;
    message: string;
    count?: number;
  }[];
}

export interface AuditSummary {
  domain: string;
  targetUrl: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  state: AuditState;
  httpMetrics: HttpMetrics;
  sitemapMetrics: SitemapQualityMetrics;
}

// Worker API Contracts
export interface CheckBatchUrlResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  redirectChain: string[];
  responseTimeMs: number;
  error?: string;
}

export interface WorkerCheckBatchRequest {
  urls: string[];
}

export interface WorkerCheckBatchResponse {
  results: CheckBatchUrlResult[];
  subrequestsUsed: number;
}

export interface WorkerFetchResourceRequest {
  url: string;
  maxSizeBytes?: number;
}

export interface WorkerFetchResourceResponse {
  url: string;
  contentType: string;
  content: string; // Base64 or UTF-8 text
  isGzip: boolean;
  sizeBytes: number;
}
