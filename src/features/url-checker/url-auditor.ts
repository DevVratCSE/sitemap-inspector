import { DiscoveredUrl, UrlAuditResult, AuditCategory, AuditConfig } from '@/types';
import { ConcurrencyPool } from './concurrency-pool';

export interface AuditProgress {
  checkedCount: number;
  totalCount: number;
  currentUrl: string;
  latestResult: UrlAuditResult;
}

export type AuditProgressCallback = (progress: AuditProgress) => void;

/**
 * Classifies an HTTP status code or error into a structured AuditCategory
 */
export function classifyStatus(statusCode?: number, errorMsg?: string): AuditCategory {
  if (
    statusCode === 429 ||
    errorMsg?.toLowerCase().includes('too many requests') ||
    errorMsg?.toLowerCase().includes('rate limit') ||
    errorMsg?.toLowerCase().includes('429')
  ) {
    return 'rate_limited';
  }

  if (!statusCode || statusCode === 0) {
    if (
      errorMsg?.toLowerCase().includes('timed out') ||
      errorMsg?.toLowerCase().includes('timeout')
    ) {
      return 'timeout';
    }
    if (
      errorMsg?.toLowerCase().includes('cors') ||
      errorMsg?.toLowerCase().includes('failed to fetch')
    ) {
      return 'cors_blocked';
    }
    if (
      errorMsg?.toLowerCase().includes('forbidden') ||
      errorMsg?.toLowerCase().includes('validation failed')
    ) {
      return 'blocked';
    }
    return 'network_error';
  }

  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode >= 300 && statusCode < 400) return 'redirect';
  if (statusCode === 401 || statusCode === 403) return 'blocked';
  if (statusCode >= 400 && statusCode < 500) return 'client_error';
  if (statusCode >= 500 && statusCode < 600) return 'server_error';

  return 'unknown';
}

/**
 * Client for calling Cloudflare Worker POST /api/check-batch with retry on 429
 */
export async function callWorkerCheckBatch(
  urls: string[],
  signal?: AbortSignal,
  maxRetries = 1,
): Promise<
  {
    url: string;
    finalUrl: string;
    statusCode: number;
    redirectChain: string[];
    responseTimeMs: number;
    error?: string;
  }[]
> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    attempt++;
    const response = await fetch('/api/check-batch', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls }),
    });

    if (response.status === 429 && attempt <= maxRetries) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const waitSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) || 1 : 1;
      await new Promise((r) => setTimeout(r, Math.min(waitSec * 1000, 2000)));
      continue;
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(errorData.error || `Worker batch check failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      results: {
        url: string;
        finalUrl: string;
        statusCode: number;
        redirectChain: string[];
        responseTimeMs: number;
        error?: string;
      }[];
    };

    return data.results;
  }

  throw new Error('Worker batch check failed: maximum retries exceeded');
}

export interface BatchDispatcherItem {
  url: string;
  signal: AbortSignal;
  resolve: (res: {
    url: string;
    finalUrl: string;
    statusCode: number;
    redirectChain: string[];
    responseTimeMs: number;
    error?: string;
  }) => void;
  reject: (err: unknown) => void;
}

/**
 * Aggregates individual URL inspection fallback requests into batches of up to 5 URLs
 * to respect Cloudflare Workers Free-tier subrequest & invocation budgets.
 */
export class WorkerBatchDispatcher {
  private queue: BatchDispatcherItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private batchSize: number;
  private batchCaller: typeof callWorkerCheckBatch;

  constructor(batchCaller: typeof callWorkerCheckBatch, batchSize = 5) {
    this.batchCaller = batchCaller;
    this.batchSize = batchSize;
  }

  enqueue(
    url: string,
    signal: AbortSignal,
  ): Promise<{
    url: string;
    finalUrl: string;
    statusCode: number;
    redirectChain: string[];
    responseTimeMs: number;
    error?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        return reject(new DOMException('Audit aborted', 'AbortError'));
      }
      this.queue.push({ url, signal, resolve, reject });
      this.scheduleFlush();
    });
  }

  private scheduleFlush() {
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, 25);
    }
  }

  private async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return;

    const currentBatch = this.queue.splice(0, this.batchSize);
    const urls = currentBatch.map((b) => b.url);

    try {
      const results = await this.batchCaller(urls);
      const resultMap = new Map<string, (typeof results)[0]>();
      for (const r of results) {
        resultMap.set(r.url, r);
      }

      for (const item of currentBatch) {
        const matched = resultMap.get(item.url) || {
          url: item.url,
          finalUrl: item.url,
          statusCode: 0,
          redirectChain: [],
          responseTimeMs: 0,
          error: 'No response for URL in batch',
        };
        item.resolve(matched);
      }
    } catch (err: unknown) {
      for (const item of currentBatch) {
        item.reject(err);
      }
    }

    if (this.queue.length > 0) {
      this.scheduleFlush();
    }
  }

  flushNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

export interface AuditorController {
  promise: Promise<UrlAuditResult[]>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

/**
 * Executes the URL audit engine across discovered URLs
 */
export function startUrlAudit(
  urls: DiscoveredUrl[],
  config: AuditConfig,
  onProgress?: AuditProgressCallback,
  options?: {
    workerBatchCaller?: typeof callWorkerCheckBatch;
    directFetchFn?: typeof fetch;
  },
): AuditorController {
  const pool = new ConcurrencyPool({ concurrency: config.concurrency || 3 });
  const batchCaller = options?.workerBatchCaller ?? callWorkerCheckBatch;
  const directFetch = options?.directFetchFn ?? fetch;
  const dispatcher = new WorkerBatchDispatcher(batchCaller, 5);

  const results: UrlAuditResult[] = [];
  let checkedCount = 0;
  const totalCount = urls.length;

  // URL inspection function
  const inspectUrl = async (
    discovered: DiscoveredUrl,
    signal: AbortSignal,
  ): Promise<UrlAuditResult> => {
    const startMs = Date.now();
    let directSucceeded = false;
    let statusCode: number | undefined;
    let finalUrl = discovered.url;
    let redirectChain: string[] = [];
    let errorMsg: string | undefined;

    // Step 1: Direct Browser Fetch Attempt
    try {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort);

      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs || 10000);

      try {
        const response = await directFetch(discovered.url, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);

        // Discard body immediately
        if (response.body) {
          try {
            await response.body.cancel();
          } catch {
            // Ignore cancel error
          }
        }

        statusCode = response.status;
        finalUrl = response.url || discovered.url;
        directSucceeded = true;
      } catch (directErr: unknown) {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
        throw directErr;
      }
    } catch {
      // Direct fetch threw (CORS error or network failure)
      directSucceeded = false;
    }

    // Step 2: Cloudflare Worker Fallback Gateway (Batched)
    if (!directSucceeded) {
      try {
        const item = await dispatcher.enqueue(discovered.url, signal);
        statusCode = item.statusCode;
        finalUrl = item.finalUrl || discovered.url;
        redirectChain = item.redirectChain || [];
        errorMsg = item.error;
      } catch (workerErr: unknown) {
        errorMsg = workerErr instanceof Error ? workerErr.message : String(workerErr);
      }
    }

    const responseTimeMs = Date.now() - startMs;
    const category = classifyStatus(statusCode, errorMsg);

    const auditResult: UrlAuditResult = {
      url: discovered.url,
      finalUrl,
      statusCode: statusCode && statusCode > 0 ? statusCode : undefined,
      category,
      redirectChain,
      responseTimeMs,
      attempts: directSucceeded ? 1 : 2,
      checkedAt: new Date().toISOString(),
      sourceSitemap: discovered.sourceSitemap,
      errorMessage: errorMsg,
    };

    checkedCount++;
    onProgress?.({
      checkedCount,
      totalCount,
      currentUrl: discovered.url,
      latestResult: auditResult,
    });

    return auditResult;
  };

  const auditPromise = Promise.all(
    urls.map((u) =>
      pool
        .run((signal) => inspectUrl(u, signal))
        .then((res) => {
          results.push(res);
          return res;
        }),
    ),
  );

  return {
    promise: auditPromise,
    pause: () => pool.pause(),
    resume: () => pool.resume(),
    cancel: () => {
      pool.cancel();
      dispatcher.flushNow();
    },
  };
}
