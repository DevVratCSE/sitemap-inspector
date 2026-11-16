/**
 * Robots.txt parser for extracting Sitemap directives and crawl policies
 */

export interface ParsedRobotsTxt {
  hasRobotsTxt: boolean;
  sitemaps: string[];
  disallowedPaths: string[];
  rawContent?: string;
  error?: string;
}

/**
 * Parses the raw text content of a robots.txt file.
 *
 * @param content - Plain text content of robots.txt
 * @param baseUrl - Base URL to resolve relative sitemap directives
 */
export function parseRobotsTxt(content: string, baseUrl: string): ParsedRobotsTxt {
  if (!content || typeof content !== 'string') {
    return {
      hasRobotsTxt: false,
      sitemaps: [],
      disallowedPaths: [],
    };
  }

  const sitemaps: string[] = [];
  const disallowedPaths: string[] = [];
  const seenSitemaps = new Set<string>();

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    // Strip comments and leading/trailing whitespace
    const commentIndex = line.indexOf('#');
    const cleanLine = (commentIndex !== -1 ? line.substring(0, commentIndex) : line).trim();

    if (!cleanLine) {
      continue;
    }

    const colonIndex = cleanLine.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const directive = cleanLine.substring(0, colonIndex).trim().toLowerCase();
    const value = cleanLine.substring(colonIndex + 1).trim();

    if (!value) {
      continue;
    }

    if (directive === 'sitemap') {
      try {
        // Resolve relative URLs against baseUrl
        const resolvedUrl = new URL(value, baseUrl).href;
        if (!seenSitemaps.has(resolvedUrl)) {
          seenSitemaps.add(resolvedUrl);
          sitemaps.push(resolvedUrl);
        }
      } catch {
        // If malformed, skip invalid URL
      }
    } else if (directive === 'disallow') {
      disallowedPaths.push(value);
    }
  }

  return {
    hasRobotsTxt: true,
    sitemaps,
    disallowedPaths,
    rawContent: content,
  };
}
