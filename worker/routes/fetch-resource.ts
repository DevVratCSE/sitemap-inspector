import { validateOutboundUrl } from '../security/validate-url';
import { globalRateLimiter } from '../security/rate-limit';

const MAX_RESOURCE_BYTES = 2 * 1024 * 1024; // 2 MB strict hard limit
const DEFAULT_RESOURCE_BYTES = 1 * 1024 * 1024; // 1 MB default
const OUTBOUND_USER_AGENT =
  'SitemapInspector/1.0 (+https://github.com/DevVratCSE/sitemap-inspector)';

/**
 * Handles POST /api/fetch-resource
 */
export async function handleFetchResource(request: Request, clientIp: string): Promise<Response> {
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
  let body: { url?: unknown; maxSizeBytes?: unknown };
  try {
    body = (await request.json()) as { url?: unknown; maxSizeBytes?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!body.url || typeof body.url !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing or invalid "url" in payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const targetUrl = body.url.trim();
  const maxBytes = Math.min(
    typeof body.maxSizeBytes === 'number' && body.maxSizeBytes > 0
      ? body.maxSizeBytes
      : DEFAULT_RESOURCE_BYTES,
    MAX_RESOURCE_BYTES,
  );

  // 3. SSRF Destination Validation
  const validation = validateOutboundUrl(targetUrl);
  if (!validation.isValid) {
    return new Response(
      JSON.stringify({ error: validation.error || 'Destination validation failed' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    );
  }

  // 4. Outbound Fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(validation.normalizedUrl || targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': OUTBOUND_USER_AGENT,
        Accept: 'application/xml, text/xml, application/gzip, text/plain, */*',
      },
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Outbound fetch failed: ${msg}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  clearTimeout(timer);

  if (!response.ok) {
    return new Response(
      JSON.stringify({
        error: `Target server returned HTTP ${response.status}: ${response.statusText}`,
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    );
  }

  // 5. Check Content-Length Header
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    if (response.body) {
      await response.body.cancel();
    }
    return new Response(
      JSON.stringify({
        error: `Resource size (${contentLength} bytes) exceeds maximum permitted limit of ${maxBytes} bytes`,
      }),
      {
        status: 413,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    );
  }

  // 6. Read Stream with Byte Limit
  const reader = response.body?.getReader();
  if (!reader) {
    return new Response(JSON.stringify({ error: 'Failed to open response stream' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let reading = true;

  try {
    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        break;
      }
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel('Resource size exceeded maximum limit');
          return new Response(
            JSON.stringify({
              error: `Resource exceeded maximum permitted size limit of ${maxBytes} bytes`,
            }),
            {
              status: 413,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            },
          );
        }
        chunks.push(value);
      }
    }
  } catch (streamErr: unknown) {
    const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
    return new Response(JSON.stringify({ error: `Stream reading error: ${msg}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Concatenate bytes
  const concatenated = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    concatenated.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // 7. Detect Gzip & Encode Content
  const contentType = response.headers.get('content-type') || 'application/xml';
  const isGzip =
    targetUrl.toLowerCase().endsWith('.gz') ||
    (concatenated.length >= 2 && concatenated[0] === 0x1f && concatenated[1] === 0x8b);

  let finalContent: string;
  if (isGzip) {
    // Binary safe base64 encoding
    let binary = '';
    const len = concatenated.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(concatenated[i]);
    }
    finalContent = btoa(binary);
  } else {
    finalContent = new TextDecoder('utf-8').decode(concatenated);
  }

  return new Response(
    JSON.stringify({
      url: response.url || targetUrl,
      contentType,
      content: finalContent,
      isGzip,
      sizeBytes: totalBytes,
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
