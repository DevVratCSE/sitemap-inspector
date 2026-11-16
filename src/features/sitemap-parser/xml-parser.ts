import { DiscoveredUrl } from '@/types';

export interface ParsedSitemapResult {
  type: 'standard' | 'index' | 'rss' | 'text' | 'unknown';
  isValid: boolean;
  urls: DiscoveredUrl[];
  childSitemaps: string[];
  errors: string[];
  warnings: string[];
  hasMalformedUrls: boolean;
  missingLastmodCount: number;
  invalidLastmodCount: number;
}

/**
 * Validates whether a date string conforms to valid W3C/ISO 8601 format
 */
export function isValidLastmodDate(dateStr?: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;

  const trimmed = dateStr.trim();
  // Validates YYYY, YYYY-MM, YYYY-MM-DD, or ISO 8601 with time and timezone
  const isoPattern =
    /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?)?$/;
  if (!isoPattern.test(trimmed)) {
    return false;
  }

  const parsed = Date.parse(trimmed);
  return !isNaN(parsed);
}

/**
 * Helper to safely extract child element text content ignoring XML namespaces
 */
function getDirectChildText(parent: Element, tagName: string): string | undefined {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const localName = child.localName || child.tagName.split(':').pop() || '';
    if (localName.toLowerCase() === tagName.toLowerCase()) {
      return child.textContent?.trim() || undefined;
    }
  }
  return undefined;
}

/**
 * Extracts all elements matching a local tag name across the document, regardless of namespace
 */
function findElementsByLocalName(doc: Document | Element, tagName: string): Element[] {
  const elements: Element[] = [];
  const targetName = tagName.toLowerCase();

  // Try standard getElementsByTagName
  const list = doc.getElementsByTagName('*');
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    const localName = el.localName || el.tagName.split(':').pop() || '';
    if (localName.toLowerCase() === targetName) {
      elements.push(el);
    }
  }

  return elements;
}

/**
 * Regex fallback extractor for partially malformed XML documents
 */
function regexFallbackExtract(
  content: string,
  sourceSitemap: string,
): { urls: DiscoveredUrl[]; childSitemaps: string[] } {
  const urls: DiscoveredUrl[] = [];
  const childSitemaps: string[] = [];

  const locRegex = /<loc\b[^>]*>(.*?)<\/loc>/gi;
  let match: RegExpExecArray | null;

  const isIndex = /<sitemapindex\b/i.test(content) || /<sitemap\b/i.test(content);

  while ((match = locRegex.exec(content)) !== null) {
    const rawLoc = match[1]?.trim();
    if (rawLoc) {
      try {
        const parsed = new URL(rawLoc);
        if (['http:', 'https:'].includes(parsed.protocol)) {
          if (isIndex && (rawLoc.endsWith('.xml') || rawLoc.includes('sitemap'))) {
            childSitemaps.push(parsed.href);
          } else {
            urls.push({
              url: parsed.href,
              sourceSitemap,
            });
          }
        }
      } catch {
        // Skip invalid URL in fallback
      }
    }
  }

  return { urls, childSitemaps };
}

/**
 * Parses XML sitemap content safely into structured data
 *
 * @param content - XML or text content of the sitemap
 * @param sourceSitemap - URL of the sitemap being parsed
 */
export function parseSitemapXml(content: string, sourceSitemap: string): ParsedSitemapResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const urls: DiscoveredUrl[] = [];
  const childSitemaps: string[] = [];
  let hasMalformedUrls = false;
  let missingLastmodCount = 0;
  let invalidLastmodCount = 0;

  if (!content || typeof content !== 'string' || !content.trim()) {
    return {
      type: 'unknown',
      isValid: false,
      urls: [],
      childSitemaps: [],
      errors: ['Empty sitemap content'],
      warnings: [],
      hasMalformedUrls: false,
      missingLastmodCount: 0,
      invalidLastmodCount: 0,
    };
  }

  const trimmed = content.trim();

  // Detect plain text sitemaps
  if (
    !trimmed.startsWith('<') &&
    (trimmed.startsWith('http://') || trimmed.startsWith('https://'))
  ) {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const line of lines) {
      try {
        const parsed = new URL(line.trim());
        urls.push({ url: parsed.href, sourceSitemap });
      } catch {
        hasMalformedUrls = true;
      }
    }
    return {
      type: 'text',
      isValid: true,
      urls,
      childSitemaps: [],
      errors: [],
      warnings: ['Plain text format detected instead of standard XML sitemap'],
      hasMalformedUrls,
      missingLastmodCount: urls.length,
      invalidLastmodCount: 0,
    };
  }

  // Parse using browser DOMParser
  const parser = new DOMParser();
  let doc: Document;

  try {
    doc = parser.parseFromString(trimmed, 'application/xml');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`XML Parsing exception: ${errorMsg}`);
    const fallback = regexFallbackExtract(trimmed, sourceSitemap);
    return {
      type: 'unknown',
      isValid: false,
      urls: fallback.urls,
      childSitemaps: fallback.childSitemaps,
      errors,
      warnings: ['Extracted partial URLs via fallback parser'],
      hasMalformedUrls: true,
      missingLastmodCount: fallback.urls.length,
      invalidLastmodCount: 0,
    };
  }

  // Check for DOMParser error document
  const parserErrors = doc.getElementsByTagName('parsererror');
  if (parserErrors.length > 0) {
    const errText = parserErrors[0].textContent || 'Unknown XML Syntax Error';
    errors.push(`XML Syntax Error: ${errText.substring(0, 200)}`);
    const fallback = regexFallbackExtract(trimmed, sourceSitemap);
    return {
      type: 'unknown',
      isValid: false,
      urls: fallback.urls,
      childSitemaps: fallback.childSitemaps,
      errors,
      warnings: ['Extracted URLs via fallback parser due to XML syntax error'],
      hasMalformedUrls: true,
      missingLastmodCount: fallback.urls.length,
      invalidLastmodCount: 0,
    };
  }

  const rootElement = doc.documentElement;
  const rootTag = (
    rootElement.localName ||
    rootElement.tagName.split(':').pop() ||
    ''
  ).toLowerCase();

  // 1. Sitemap Index (<sitemapindex>)
  if (rootTag === 'sitemapindex') {
    const sitemapNodes = findElementsByLocalName(doc, 'sitemap');
    const seenChildren = new Set<string>();

    for (const sitemapNode of sitemapNodes) {
      const loc = getDirectChildText(sitemapNode, 'loc');
      if (loc) {
        try {
          const parsed = new URL(loc);
          if (['http:', 'https:'].includes(parsed.protocol)) {
            if (!seenChildren.has(parsed.href)) {
              seenChildren.add(parsed.href);
              childSitemaps.push(parsed.href);
            }
          } else {
            hasMalformedUrls = true;
            warnings.push(`Non-HTTP/HTTPS protocol in child sitemap: ${loc}`);
          }
        } catch {
          hasMalformedUrls = true;
          warnings.push(`Malformed URL in child sitemap: ${loc}`);
        }
      }
    }

    return {
      type: 'index',
      isValid: true,
      urls: [],
      childSitemaps,
      errors,
      warnings,
      hasMalformedUrls,
      missingLastmodCount: 0,
      invalidLastmodCount: 0,
    };
  }

  // 2. Standard Sitemap (<urlset>)
  if (rootTag === 'urlset') {
    const urlNodes = findElementsByLocalName(doc, 'url');

    for (const urlNode of urlNodes) {
      const loc = getDirectChildText(urlNode, 'loc');
      const lastmod = getDirectChildText(urlNode, 'lastmod');
      const changefreq = getDirectChildText(urlNode, 'changefreq');
      const priority = getDirectChildText(urlNode, 'priority');

      if (!loc) {
        warnings.push('Encountered <url> tag without <loc>');
        continue;
      }

      try {
        const parsed = new URL(loc);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          hasMalformedUrls = true;
          warnings.push(`Invalid protocol in URL: ${loc}`);
          continue;
        }

        // Validate lastmod
        if (!lastmod) {
          missingLastmodCount++;
        } else if (!isValidLastmodDate(lastmod)) {
          invalidLastmodCount++;
          warnings.push(`Invalid lastmod date format "${lastmod}" for URL: ${loc}`);
        }

        urls.push({
          url: parsed.href,
          lastmod,
          changefreq,
          priority,
          sourceSitemap,
        });
      } catch {
        hasMalformedUrls = true;
        warnings.push(`Malformed URL in <loc>: ${loc}`);
      }
    }

    return {
      type: 'standard',
      isValid: true,
      urls,
      childSitemaps: [],
      errors,
      warnings,
      hasMalformedUrls,
      missingLastmodCount,
      invalidLastmodCount,
    };
  }

  // 3. RSS / Atom feed
  if (rootTag === 'rss' || rootTag === 'feed') {
    const itemNodes =
      rootTag === 'rss'
        ? findElementsByLocalName(doc, 'item')
        : findElementsByLocalName(doc, 'entry');

    for (const item of itemNodes) {
      const link =
        getDirectChildText(item, 'link') ||
        item.getElementsByTagName('link')[0]?.getAttribute('href') ||
        undefined;
      const pubDate = getDirectChildText(item, 'pubdate') || getDirectChildText(item, 'updated');

      if (link) {
        try {
          const parsed = new URL(link);
          urls.push({
            url: parsed.href,
            lastmod: pubDate,
            sourceSitemap,
          });
        } catch {
          hasMalformedUrls = true;
        }
      }
    }

    return {
      type: 'rss',
      isValid: true,
      urls,
      childSitemaps: [],
      errors,
      warnings: ['RSS/Atom feed detected rather than standard XML sitemap'],
      hasMalformedUrls,
      missingLastmodCount,
      invalidLastmodCount,
    };
  }

  // Unknown root element
  warnings.push(`Unrecognized root tag <${rootTag}>. Attempting fallback URL extraction.`);
  const fallback = regexFallbackExtract(trimmed, sourceSitemap);

  return {
    type: 'unknown',
    isValid: false,
    urls: fallback.urls,
    childSitemaps: fallback.childSitemaps,
    errors: [`Unrecognized root tag: <${rootTag}>`],
    warnings,
    hasMalformedUrls: true,
    missingLastmodCount: fallback.urls.length,
    invalidLastmodCount: 0,
  };
}
