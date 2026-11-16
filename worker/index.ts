/**
 * Cloudflare Worker Gateway for Sitemap Inspector
 * Minimal, stateless HTTP inspection gateway adhering strictly to Free-tier resource limits.
 */

import { handleCheckBatch } from './routes/check-batch';
import { handleFetchResource } from './routes/fetch-resource';

export interface Env {
  ASSETS?: Fetcher;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Handle CORS Preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // Extract client IP for rate limiting
    const clientIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      '127.0.0.1';

    // 2. Health Check
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'sitemap-inspector-gateway',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          freeTierSafeguards: {
            maxBatchUrls: 5,
            subrequestBudget: 20,
            maxRedirectHops: 3,
            maxResourceBytes: '2 MB',
          },
        }),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // 3. Batch Check Endpoint
    if (url.pathname === '/api/check-batch' && request.method === 'POST') {
      const res = await handleCheckBatch(request, clientIp);
      // Merge CORS headers
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        res.headers.set(key, value);
      }
      return res;
    }

    // 4. Resource Fetcher Endpoint
    if (url.pathname === '/api/fetch-resource' && request.method === 'POST') {
      const res = await handleFetchResource(request, clientIp);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        res.headers.set(key, value);
      }
      return res;
    }

    // 5. Static Assets fallback (when invoked directly)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
    });
  },
};
