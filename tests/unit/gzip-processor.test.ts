import { describe, it, expect } from 'vitest';
import { decompressGzip } from '@/features/sitemap-parser/gzip-processor';
import zlib from 'zlib';

describe('Gzip Processor', () => {
  it('decompresses valid gzip-compressed XML content', async () => {
    const rawXml = '<urlset><url><loc>https://example.com/gzip-test</loc></url></urlset>';
    const compressed = zlib.gzipSync(Buffer.from(rawXml, 'utf-8'));

    const decompressed = await decompressGzip(compressed);
    expect(decompressed).toBe(rawXml);
  });

  it('handles uncompressed buffers without crashing', async () => {
    const raw = 'Just plain text content';
    const buffer = Buffer.from(raw, 'utf-8');

    const result = await decompressGzip(buffer);
    expect(result).toBe(raw);
  });

  it('rejects oversized decompressed content exceeding limit', async () => {
    // 100 KB uncompressed string
    const largeData = 'A'.repeat(100 * 1024);
    const compressed = zlib.gzipSync(Buffer.from(largeData, 'utf-8'));

    // Set max limit to 50 KB
    await expect(decompressGzip(compressed, { maxBytes: 50 * 1024 })).rejects.toThrow(
      /exceeded maximum allowed limit/i,
    );
  });
});
