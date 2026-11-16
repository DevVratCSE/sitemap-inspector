import { describe, it, expect, vi } from 'vitest';
import {
  inspectUrlWithManualRedirects,
  InspectionContext,
} from '../../worker/services/outbound-fetch';
import { handleCheckBatch } from '../../worker/routes/check-batch';
import { handleFetchResource } from '../../worker/routes/fetch-resource';

describe('Worker Gateway Integration Tests', () => {
  describe('Manual Redirect Tracking and Subrequest Budgeting', () => {
    it('follows redirects up to 3 hops and records the redirect chain', async () => {
      const mockFetch = vi.fn(async (url: string): Promise<Response> => {
        if (url === 'https://example.com/step-1') {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://example.com/step-2' },
          });
        }
        if (url === 'https://example.com/step-2') {
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://example.com/final' },
          });
        }
        if (url === 'https://example.com/final') {
          return new Response('OK', { status: 200 });
        }
        throw new Error('Not found');
      });

      const ctx: InspectionContext = {
        remainingSubrequests: 20,
        maxRedirectHops: 3,
      };

      const result = await inspectUrlWithManualRedirects(
        'https://example.com/step-1',
        ctx,
        mockFetch as unknown as typeof fetch,
      );

      expect(result.statusCode).toBe(200);
      expect(result.finalUrl).toBe('https://example.com/final');
      expect(result.redirectChain).toEqual([
        'https://example.com/step-1',
        'https://example.com/step-2',
      ]);
      expect(result.subrequestsUsed).toBe(3);
      expect(ctx.remainingSubrequests).toBe(17);
    });

    it('blocks redirect-based SSRF attempts to private IP ranges', async () => {
      const mockFetch = vi.fn(async (url: string): Promise<Response> => {
        if (url === 'https://example.com/sneaky') {
          return new Response(null, {
            status: 302,
            headers: { Location: 'http://169.254.169.254/latest/meta-data' },
          });
        }
        return new Response('OK', { status: 200 });
      });

      const ctx: InspectionContext = {
        remainingSubrequests: 20,
        maxRedirectHops: 3,
      };

      const result = await inspectUrlWithManualRedirects(
        'https://example.com/sneaky',
        ctx,
        mockFetch as unknown as typeof fetch,
      );

      expect(result.statusCode).toBe(302);
      expect(result.error).toMatch(/private or reserved/i);
      expect(result.subrequestsUsed).toBe(1);
    });

    it('detects and terminates redirect loops', async () => {
      const mockFetch = vi.fn(async (url: string): Promise<Response> => {
        if (url === 'https://example.com/loop-a') {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://example.com/loop-b' },
          });
        }
        if (url === 'https://example.com/loop-b') {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://example.com/loop-a' },
          });
        }
        return new Response('OK', { status: 200 });
      });

      const ctx: InspectionContext = {
        remainingSubrequests: 20,
        maxRedirectHops: 5,
      };

      const result = await inspectUrlWithManualRedirects(
        'https://example.com/loop-a',
        ctx,
        mockFetch as unknown as typeof fetch,
      );

      expect(result.error).toMatch(/redirect loop detected/i);
      expect(result.subrequestsUsed).toBe(2);
    });

    it('stops processing immediately when subrequest budget is exhausted', async () => {
      const mockFetch = vi.fn(async () => new Response('OK', { status: 200 }));
      const ctx: InspectionContext = {
        remainingSubrequests: 0, // Budget already 0
      };

      const result = await inspectUrlWithManualRedirects(
        'https://example.com/item',
        ctx,
        mockFetch as unknown as typeof fetch,
      );

      expect(result.error).toMatch(/budget exhausted/i);
      expect(result.subrequestsUsed).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckBatch Route Handler', () => {
    it('rejects batch requests exceeding 5 URLs', async () => {
      const request = new Request('http://localhost/api/check-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: [
            'https://example.com/1',
            'https://example.com/2',
            'https://example.com/3',
            'https://example.com/4',
            'https://example.com/5',
            'https://example.com/6',
          ],
        }),
      });

      const response = await handleCheckBatch(request, '192.0.2.1');
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/maximum limit of 5 URLs/i);
    });

    it('rejects malformed payloads with missing urls array', async () => {
      const request = new Request('http://localhost/api/check-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrongKey: [] }),
      });

      const response = await handleCheckBatch(request, '192.0.2.1');
      expect(response.status).toBe(400);
    });
  });

  describe('handleFetchResource Route Handler', () => {
    it('rejects SSRF destinations before attempting network connection', async () => {
      const request = new Request('http://localhost/api/fetch-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost/private.xml' }),
      });

      const response = await handleFetchResource(request, '192.0.2.1');
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toMatch(/forbidden host/i);
    });
  });
});
