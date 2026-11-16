# Technical Limitations & Free-Tier Boundaries

Sitemap Inspector intentionally prioritizes reliability, user privacy, and zero server hosting costs over unbounded crawler scope.

---

## 1. Scope & Crawling Limits

- **Sitemap-Driven Auditing:** Sitemap Inspector audits URLs discovered through `robots.txt`, sitemaps, and sitemap indexes. It is **not** an unbounded whole-site spider/crawler that scrapes HTML pages for arbitrary hyperlinks.
- **URL Cap:** Default audit size is capped at 500 URLs (configurable up to 1,000 URLs in Advanced Settings). Websites with tens of thousands of URLs are truncated at the configured ceiling to prevent client browser tab memory exhaustion.
- **Sitemap Traversal Depth:** Traverses sitemap indexes up to 5 levels deep, processing a maximum of 25 distinct sitemap files.

---

## 2. Network & Verification Boundaries

- **Direct Fetch vs. Gateway:** Many target websites restrict cross-origin browser requests via CORS. When CORS blocks direct inspection, URLs are sent in batches of up to 5 to the Cloudflare Worker gateway.
- **Redirect Limit:** Capped at 3 redirect hops per URL. Longer redirect chains are flagged as redirect issues.
- **Timeout Threshold:** Single-request timeout is set to 10 seconds.
- **Subrequest Budget:** The Cloudflare Worker enforces a hard cap of 20 external subrequests per batch invocation, comfortably inside Cloudflare's Free-tier limit of 50.

---

## 3. SEO Health vs. HTTP Status

- **HTTP 200 ≠ Good SEO:** A 200 OK status indicates only that a URL resolved without server or client error. It does not measure on-page content quality, keyword rankings, canonical tag accuracy, schema markup, or Core Web Vitals.
- **Sample Size Transparency:** The HTTP Health Score is calculated exclusively over verified URLs, and the verified sample size is always prominently displayed alongside the metric.
