import { describe, it, expect } from 'vitest';
import { parseSitemapXml, isValidLastmodDate } from '@/features/sitemap-parser/xml-parser';

describe('Sitemap XML Parser', () => {
  it('parses standard XML sitemaps with default namespace', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/page-1</loc>
          <lastmod>2026-11-15T10:00:00Z</lastmod>
          <changefreq>daily</changefreq>
          <priority>0.8</priority>
        </url>
        <url>
          <loc>https://example.com/page-2</loc>
          <lastmod>2026-11-14</lastmod>
        </url>
      </urlset>`;

    const result = parseSitemapXml(xml, 'https://example.com/sitemap.xml');
    expect(result.isValid).toBe(true);
    expect(result.type).toBe('standard');
    expect(result.urls).toHaveLength(2);
    expect(result.urls[0].url).toBe('https://example.com/page-1');
    expect(result.urls[0].lastmod).toBe('2026-11-15T10:00:00Z');
    expect(result.urls[0].changefreq).toBe('daily');
    expect(result.urls[0].priority).toBe('0.8');
    expect(result.urls[1].url).toBe('https://example.com/page-2');
    expect(result.missingLastmodCount).toBe(0);
    expect(result.invalidLastmodCount).toBe(0);
  });

  it('parses sitemap index files and extracts child sitemap URLs', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap>
          <loc>https://example.com/post-sitemap.xml</loc>
          <lastmod>2026-11-16</lastmod>
        </sitemap>
        <sitemap>
          <loc>https://example.com/page-sitemap.xml</loc>
          <lastmod>2026-11-16</lastmod>
        </sitemap>
      </sitemapindex>`;

    const result = parseSitemapXml(xml, 'https://example.com/sitemap_index.xml');
    expect(result.isValid).toBe(true);
    expect(result.type).toBe('index');
    expect(result.childSitemaps).toEqual([
      'https://example.com/post-sitemap.xml',
      'https://example.com/page-sitemap.xml',
    ]);
  });

  it('tolerates custom namespace prefixes such as <sitemap:loc>', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sm:url>
          <sm:loc>https://example.com/prefixed-page</sm:loc>
          <sm:lastmod>2026-11-01</sm:lastmod>
        </sm:url>
      </sm:urlset>`;

    const result = parseSitemapXml(xml, 'https://example.com/sitemap.xml');
    expect(result.isValid).toBe(true);
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0].url).toBe('https://example.com/prefixed-page');
  });

  it('flags missing and invalid lastmod date strings', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/valid-date</loc>
          <lastmod>2026-10-31</lastmod>
        </url>
        <url>
          <loc>https://example.com/missing-date</loc>
        </url>
        <url>
          <loc>https://example.com/invalid-date</loc>
          <lastmod>not-a-real-date</lastmod>
        </url>
      </urlset>`;

    const result = parseSitemapXml(xml, 'https://example.com/sitemap.xml');
    expect(result.urls).toHaveLength(3);
    expect(result.missingLastmodCount).toBe(1);
    expect(result.invalidLastmodCount).toBe(1);
  });

  it('handles malformed XML with fallback regex extraction', () => {
    // Unclosed tags creating invalid XML syntax
    const malformedXml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/broken-syntax-1</loc>
        <url>
          <loc>https://example.com/broken-syntax-2</loc>
      </urlset>`;

    const result = parseSitemapXml(malformedXml, 'https://example.com/sitemap.xml');
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Fallback extraction salvages the URLs
    expect(result.urls.map((u) => u.url)).toEqual([
      'https://example.com/broken-syntax-1',
      'https://example.com/broken-syntax-2',
    ]);
  });

  it('parses plain text sitemaps', () => {
    const txt = `
      https://example.com/text-1
      https://example.com/text-2
      # comment
      https://example.com/text-3
    `;

    const result = parseSitemapXml(txt, 'https://example.com/urllist.txt');
    expect(result.type).toBe('text');
    expect(result.urls).toHaveLength(3);
    expect(result.urls[0].url).toBe('https://example.com/text-1');
  });

  it('correctly validates W3C/ISO lastmod dates', () => {
    expect(isValidLastmodDate('2026')).toBe(true);
    expect(isValidLastmodDate('2026-11')).toBe(true);
    expect(isValidLastmodDate('2026-11-16')).toBe(true);
    expect(isValidLastmodDate('2026-11-16T12:00:00Z')).toBe(true);
    expect(isValidLastmodDate('2026-11-16T12:00:00+02:00')).toBe(true);
    expect(isValidLastmodDate('invalid-date')).toBe(false);
    expect(isValidLastmodDate('16/11/2026')).toBe(false);
    expect(isValidLastmodDate('')).toBe(false);
  });
});
