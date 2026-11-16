import {
  inspectUrlWithManualRedirects,
  InspectionContext,
  InspectedUrlResult,
} from '../services/outbound-fetch';
import { globalRateLimiter } from '../security/rate-limit';

const MAX_BATCH_SIZE = 5;
const INVOCATION_SUBREQUEST_BUDGET = 20;

/**
 * Handles POST /api/check-batch
 */
export async function handleCheckBatch(request: Request, clientIp: string): Promise<Response> {
  // 1. Rate Limiting Check
  const rateLimit = globalRateLimiter.isAllowed(clientIp);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Too many requests. Please slow down.',
        retryAfter: rateLimit.retryAfterSec,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfterSec || 60),
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  // 2. Parse and Validate Request Body
  let body: { urls?: unknown };
  try {
    body = (await request.json()) as { urls?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!body.urls || !Array.isArray(body.urls) || body.urls.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Payload must contain a non-empty "urls" array' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    );
  }

  if (body.urls.length > MAX_BATCH_SIZE) {
    return new Response(
      JSON.stringify({
        error: `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE} URLs per invocation`,
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    );
  }

  const urls: string[] = [];
  for (const item of body.urls) {
    if (typeof item === 'string' && item.trim().length > 0) {
      urls.push(item.trim());
    } else {
      return new Response(
        JSON.stringify({ error: 'All elements in "urls" array must be non-empty strings' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        },
      );
    }
  }

  // 3. Process Batch with Bounded Concurrency and Shared Subrequest Budget
  const ctx: InspectionContext = {
    remainingSubrequests: INVOCATION_SUBREQUEST_BUDGET,
    maxRedirectHops: 3,
    timeoutMs: 10000,
  };

  const results: InspectedUrlResult[] = [];
  let totalSubrequestsUsed = 0;

  // Process up to 3 URLs concurrently to respect Cloudflare's 6 simultaneous connection limit
  const CONCURRENCY = 3;
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    if (ctx.remainingSubrequests <= 0) {
      // Subrequest budget exhausted, stop remaining URLs in batch
      for (let j = i; j < urls.length; j++) {
        results.push({
          url: urls[j],
          finalUrl: urls[j],
          statusCode: 0,
          redirectChain: [],
          responseTimeMs: 0,
          subrequestsUsed: 0,
          error: 'Skipped: Invocation subrequest budget exhausted',
        });
      }
      break;
    }

    const chunk = urls.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((url) => inspectUrlWithManualRedirects(url, ctx)),
    );

    for (const res of chunkResults) {
      results.push(res);
      totalSubrequestsUsed += res.subrequestsUsed;
    }
  }

  return new Response(
    JSON.stringify({
      results,
      subrequestsUsed: totalSubrequestsUsed,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    },
  );
}
