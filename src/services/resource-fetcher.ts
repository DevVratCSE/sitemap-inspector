import { decompressGzip, MAX_DECOMPRESSED_BYTES } from '@/features/sitemap-parser/gzip-processor';

export interface FetchedResource {
  url: string;
  content: string;
  contentType: string;
  isGzip: boolean;
  fetchedVia: 'direct' | 'worker_fallback';
  sizeBytes: number;
}

export interface ResourceFetcherOptions {
  timeoutMs?: number; // default: 10000 (10s)
  maxBytes?: number; // default: 2 MB
  allowWorkerFallback?: boolean; // default: true
}

/**
 * Fetches robots.txt or sitemap XML resources, attempting direct browser fetch first
 * and falling back to Cloudflare Worker `/api/fetch-resource` if CORS is blocked.
 */
export async function fetchSitemapResource(
  url: string,
  options?: ResourceFetcherOptions,
): Promise<FetchedResource> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const maxBytes = options?.maxBytes ?? MAX_DECOMPRESSED_BYTES;
  const allowWorkerFallback = options?.allowWorkerFallback ?? true;

  const isGzipUrl = url.toLowerCase().endsWith('.gz');

  // Attempt 1: Direct Browser Fetch
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
      headers: {
        Accept: 'application/xml, text/xml, application/gzip, text/plain, */*',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new Error(
        `Resource size (${contentLength} bytes) exceeds maximum limit of ${maxBytes} bytes`,
      );
    }

    const contentType = response.headers.get('content-type') || 'application/xml';
    const contentEncoding = response.headers.get('content-encoding') || '';
    const isGzipped =
      isGzipUrl ||
      contentEncoding.includes('gzip') ||
      contentType.includes('gzip') ||
      contentType.includes('application/x-gzip');

    if (isGzipped) {
      const buffer = await response.arrayBuffer();
      const content = await decompressGzip(buffer, { maxBytes });
      return {
        url,
        content,
        contentType,
        isGzip: true,
        fetchedVia: 'direct',
        sizeBytes: buffer.byteLength,
      };
    } else {
      const text = await response.text();
      return {
        url,
        content: text,
        contentType,
        isGzip: false,
        fetchedVia: 'direct',
        sizeBytes: new TextEncoder().encode(text).length,
      };
    }
  } catch (directErr: unknown) {
    // If not allowed to fallback or error is an explicit size rejection, rethrow
    const errMsg = directErr instanceof Error ? directErr.message : String(directErr);
    if (!allowWorkerFallback || errMsg.includes('exceeds maximum limit')) {
      throw directErr;
    }

    // Attempt 2: Cloudflare Worker Fallback Gateway
    try {
      const workerResponse = await fetch('/api/fetch-resource', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          maxSizeBytes: maxBytes,
        }),
      });

      if (!workerResponse.ok) {
        const errorData = (await workerResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          errorData.error ||
            `Worker Gateway error: HTTP ${workerResponse.status} ${workerResponse.statusText}`,
        );
      }

      const data = (await workerResponse.json()) as {
        url: string;
        contentType: string;
        content: string;
        isGzip: boolean;
        sizeBytes: number;
      };

      let finalContent = data.content;
      if (data.isGzip) {
        // Base64 decoded buffer
        const binaryStr = atob(data.content);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        finalContent = await decompressGzip(bytes, { maxBytes });
      }

      return {
        url: data.url,
        content: finalContent,
        contentType: data.contentType,
        isGzip: data.isGzip,
        fetchedVia: 'worker_fallback',
        sizeBytes: data.sizeBytes,
      };
    } catch (workerErr: unknown) {
      const workerMsg = workerErr instanceof Error ? workerErr.message : String(workerErr);
      throw new Error(`Failed to fetch resource directly and via Worker gateway: ${workerMsg}`);
    }
  }
}
