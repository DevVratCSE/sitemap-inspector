import { describe, it, expect } from 'vitest';
import { parseRobotsTxt } from '@/features/sitemap-discovery/robots-parser';

describe('Robots.txt Parser', () => {
  it('extracts sitemap declarations with case-insensitivity and whitespace tolerance', () => {
    const robots = `
      # Comment header
      User-agent: *
      Disallow: /admin/
      Disallow: /private/

      sitemap: https://example.com/sitemap.xml
      Sitemap: https://example.com/sitemap-news.xml # trailing comment
      SITEMAP: https://example.com/sitemap-video.xml
    `;

    const parsed = parseRobotsTxt(robots, 'https://example.com');
    expect(parsed.hasRobotsTxt).toBe(true);
    expect(parsed.sitemaps).toHaveLength(3);
    expect(parsed.sitemaps).toContain('https://example.com/sitemap.xml');
    expect(parsed.sitemaps).toContain('https://example.com/sitemap-news.xml');
    expect(parsed.sitemaps).toContain('https://example.com/sitemap-video.xml');
    expect(parsed.disallowedPaths).toEqual(['/admin/', '/private/']);
  });

  it('resolves relative sitemap paths against base URL', () => {
    const robots = `
      User-agent: *
      Sitemap: /custom-sitemap.xml
    `;

    const parsed = parseRobotsTxt(robots, 'https://sub.example.com/folder/');
    expect(parsed.sitemaps).toEqual(['https://sub.example.com/custom-sitemap.xml']);
  });

  it('deduplicates identical sitemap declarations', () => {
    const robots = `
      Sitemap: https://example.com/sitemap.xml
      Sitemap: https://example.com/sitemap.xml
    `;

    const parsed = parseRobotsTxt(robots, 'https://example.com');
    expect(parsed.sitemaps).toHaveLength(1);
  });

  it('handles empty or malformed robots content gracefully', () => {
    const parsed = parseRobotsTxt('', 'https://example.com');
    expect(parsed.hasRobotsTxt).toBe(false);
    expect(parsed.sitemaps).toEqual([]);
    expect(parsed.disallowedPaths).toEqual([]);
  });
});
