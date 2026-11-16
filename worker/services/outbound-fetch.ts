import { validateOutboundUrl } from '../security/validate-url';

export interface InspectedUrlResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  redirectChain: string[];
  responseTimeMs: number;
  subrequestsUsed: number;
  error?: string;
}

export interface InspectionContext {
  remainingSubrequests: number;
  maxRedirectHops?: number; // default: 3
  timeoutMs?: number; // default: 10000 (10s)
}

const OUTBOUND_USER_AGENT =
  'SitemapInspector/1.0 (+https://github.com/DevVratCSE/sitemap-inspector)';

/**
 * Inspects a single URL by following redirects manually with SSRF checks at each hop.
 * Tracks subrequests against the remaining invocation budget.
 */
export async function inspectUrlWithManualRedirects(
  targetUrl: string,
  ctx: InspectionContext,
  fetchFn: typeof fetch = fetch,
): Promise<InspectedUrlResult> {
  const maxHops = ctx.maxRedirectHops ?? 3;
  const timeoutMs = ctx.timeoutMs ?? 10000;

  const redirectChain: string[] = [];
  const seenHops = new Set<string>();

  let currentUrl = targetUrl;
  let subrequestsUsed = 0;
  let finalStatus = 0;
  let errorMsg: string | undefined;

  const startTime = Date.now();
  let inspecting = true;

  try {
    while (inspecting) {
      // 1. SSRF destination validation for every hop
      const validation = validateOutboundUrl(currentUrl);
      if (!validation.isValid) {
        errorMsg = validation.error || 'Destination validation failed';
        inspecting = false;
        break;
      }

      // 2. Subrequest budget check
      if (ctx.remainingSubrequests <= 0) {
        errorMsg = 'Worker invocation subrequest budget exhausted';
        inspecting = false;
        break;
      }

      ctx.remainingSubrequests--;
      subrequestsUsed++;

      seenHops.add(currentUrl);

      // 3. Perform manual outbound fetch with AbortSignal timeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchFn(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': OUTBOUND_USER_AGENT,
            Accept: '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
          },
        });
      } catch (fetchErr: unknown) {
        clearTimeout(timer);
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          errorMsg = `Request timed out after ${timeoutMs}ms`;
        } else {
          errorMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        }
        inspecting = false;
        break;
      }

      clearTimeout(timer);
      finalStatus = response.status;

      // Discard response body immediately to minimize CPU and memory
      if (response.body) {
        try {
          await response.body.cancel();
        } catch {
          // Ignore stream cancel error
        }
      }

      // 4. Check for 3xx redirect status
      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (isRedirect) {
        const locationHeader = response.headers.get('location');
        if (!locationHeader) {
          errorMsg = `Redirect status ${response.status} returned without Location header`;
          inspecting = false;
          break;
        }

        let nextUrl: string;
        try {
          // Resolve relative redirect against current URL
          nextUrl = new URL(locationHeader, currentUrl).href;
        } catch {
          errorMsg = `Malformed redirect Location header: "${locationHeader}"`;
          inspecting = false;
          break;
        }

        redirectChain.push(currentUrl);

        // Check for redirect loop
        if (seenHops.has(nextUrl)) {
          errorMsg = `Redirect loop detected at ${nextUrl}`;
          currentUrl = nextUrl;
          inspecting = false;
          break;
        }

        // Check maximum hop depth
        if (redirectChain.length > maxHops) {
          errorMsg = `Exceeded maximum redirect depth of ${maxHops} hops`;
          currentUrl = nextUrl;
          inspecting = false;
          break;
        }

        currentUrl = nextUrl;
        // Continue loop to inspect next redirect hop
      } else {
        // Final destination reached (2xx, 4xx, 5xx)
        inspecting = false;
        break;
      }
    }
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const responseTimeMs = Date.now() - startTime;

  return {
    url: targetUrl,
    finalUrl: currentUrl,
    statusCode: finalStatus,
    redirectChain,
    responseTimeMs,
    subrequestsUsed,
    error: errorMsg,
  };
}
