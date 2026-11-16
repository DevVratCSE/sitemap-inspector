import { DiscoveredUrl } from '@/types';

/**
 * Parses plain text sitemap (one URL per line)
 */
export function parseTextSitemap(content: string, sourceSitemap: string): DiscoveredUrl[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const urls: DiscoveredUrl[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    try {
      const parsed = new URL(trimmed);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        urls.push({
          url: parsed.href,
          sourceSitemap,
        });
      }
    } catch {
      // Ignore invalid URL lines
    }
  }

  return urls;
}
