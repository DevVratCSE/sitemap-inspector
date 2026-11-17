import { describe, it, expect, vi } from 'vitest';
import { classifyStatus, startUrlAudit } from '@/features/url-checker/url-auditor';
import { DiscoveredUrl, AuditConfig } from '@/types';

describe('URL Auditor & Status Classifier', () => {
  describe('classifyStatus', () => {
    it('accurately maps HTTP status codes to audit categories', () => {
      expect(classifyStatus(200)).toBe('success');
      expect(classifyStatus(204)).toBe('success');
      expect(classifyStatus(301)).toBe('redirect');
      expect(classifyStatus(302)).toBe('redirect');
      expect(classifyStatus(401)).toBe('blocked');
      expect(classifyStatus(403)).toBe('blocked');
      expect(classifyStatus(404)).toBe('client_error');
      expect(classifyStatus(410)).toBe('client_error');
      expect(classifyStatus(429)).toBe('rate_limited');
      expect(classifyStatus(500)).toBe('server_error');
      expect(classifyStatus(503)).toBe('server_error');
    });

    it('classifies network failures, timeouts, and CORS errors', () => {
      expect(classifyStatus(0, 'Request timed out after 10000ms')).toBe('timeout');
      expect(classifyStatus(0, 'TypeError: Failed to fetch (CORS)')).toBe('cors_blocked');
      expect(classifyStatus(0, 'Connection refused')).toBe('network_error');
      expect(classifyStatus(undefined, 'Validation failed')).toBe('blocked');
      expect(classifyStatus(0, 'Too many requests. Please slow down.')).toBe('rate_limited');
      expect(classifyStatus(undefined, 'Rate limit exceeded')).toBe('rate_limited');
    });
  });

  describe('startUrlAudit Execution & Concurrency', () => {
    const config: AuditConfig = {
      targetUrl: 'https://example.com',
      maxUrls: 10,
      concurrency: 2,
      timeoutMs: 5000,
      maxRedirectHops: 3,
      maxRetries: 0,
      sitemapRecursionDepth: 5,
    };

    const mockUrls: DiscoveredUrl[] = [
      { url: 'https://example.com/page-1', sourceSitemap: 'sitemap.xml' },
      { url: 'https://example.com/page-2', sourceSitemap: 'sitemap.xml' },
    ];

    it('processes direct browser fetches when CORS is enabled', async () => {
      const mockDirectFetch = vi.fn(async (_url: string): Promise<Response> => {
        return new Response('OK', { status: 200 });
      });

      const mockWorkerCaller = vi.fn();

      const controller = startUrlAudit(mockUrls, config, undefined, {
        directFetchFn: mockDirectFetch as unknown as typeof fetch,
        workerBatchCaller: mockWorkerCaller,
      });

      const results = await controller.promise;

      expect(results).toHaveLength(2);
      expect(results[0].category).toBe('success');
      expect(results[0].statusCode).toBe(200);
      expect(results[0].attempts).toBe(1);
      // Worker should NOT be called when direct browser fetch succeeds!
      expect(mockWorkerCaller).not.toHaveBeenCalled();
    });

    it('falls back to Worker batch check when direct browser fetch is blocked by CORS', async () => {
      const mockDirectFetch = vi.fn(async (): Promise<Response> => {
        throw new TypeError('Failed to fetch (CORS blocked)');
      });

      const mockWorkerCaller = vi.fn(async (urls: string[]) => {
        return urls.map((url) => ({
          url,
          finalUrl: url,
          statusCode: 200,
          redirectChain: [],
          responseTimeMs: 85,
        }));
      });

      const controller = startUrlAudit(mockUrls, config, undefined, {
        directFetchFn: mockDirectFetch as unknown as typeof fetch,
        workerBatchCaller: mockWorkerCaller,
      });

      const results = await controller.promise;

      expect(results).toHaveLength(2);
      expect(results[0].category).toBe('success');
      expect(results[0].statusCode).toBe(200);
      expect(results[0].attempts).toBe(2);
      // Worker was invoked as fallback
      expect(mockWorkerCaller).toHaveBeenCalled();
    });

    it('aggregates multiple CORS failures into batched Worker calls (up to 5 per batch)', async () => {
      const mockDirectFetch = vi.fn(async (): Promise<Response> => {
        throw new TypeError('Failed to fetch (CORS blocked)');
      });

      const calledBatches: string[][] = [];
      const mockWorkerCaller = vi.fn(async (urls: string[]) => {
        calledBatches.push(urls);
        return urls.map((url) => ({
          url,
          finalUrl: url,
          statusCode: 200,
          redirectChain: [],
          responseTimeMs: 20,
        }));
      });

      const fiveUrls: DiscoveredUrl[] = [
        { url: 'https://example.com/p1', sourceSitemap: 'sitemap.xml' },
        { url: 'https://example.com/p2', sourceSitemap: 'sitemap.xml' },
        { url: 'https://example.com/p3', sourceSitemap: 'sitemap.xml' },
        { url: 'https://example.com/p4', sourceSitemap: 'sitemap.xml' },
        { url: 'https://example.com/p5', sourceSitemap: 'sitemap.xml' },
      ];

      const controller = startUrlAudit(fiveUrls, { ...config, concurrency: 5 }, undefined, {
        directFetchFn: mockDirectFetch as unknown as typeof fetch,
        workerBatchCaller: mockWorkerCaller,
      });

      const results = await controller.promise;
      expect(results).toHaveLength(5);
      // Rather than 5 individual calls of size 1, it should batch them
      expect(calledBatches.length).toBeLessThanOrEqual(2);
      expect(calledBatches[0].length).toBeGreaterThan(1);
    });
  });
});
