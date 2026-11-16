# Sitemap Inspector — API Documentation

The Cloudflare Worker exposes three stateless endpoints designed exclusively as a lightweight HTTP fallback gateway.

---

## 1. `GET /api/health`

Returns operational health status and active Free-tier resource safeguard parameters.

### Response `200 OK`
```json
{
  "status": "ok",
  "service": "sitemap-inspector-gateway",
  "timestamp": "2026-11-16T12:00:00.000Z",
  "version": "1.0.0",
  "freeTierSafeguards": {
    "maxBatchUrls": 5,
    "subrequestBudget": 20,
    "maxRedirectHops": 3,
    "maxResourceBytes": "2 MB"
  }
}
```

---

## 2. `POST /api/check-batch`

Inspects a small batch of up to 5 URLs sequentially or with bounded concurrency (3 parallel sockets), following redirects manually with SSRF checks at every hop.

### Request Body
```json
{
  "urls": [
    "https://example.com/page-1",
    "https://example.com/page-2"
  ]
}
```

### Constraints
- Array length: Minimum 1, Maximum 5.
- Subrequest budget: Maximum 20 external subrequests per invocation.
- Redirect hops: Maximum 3 hops per URL.

### Response `200 OK`
```json
{
  "results": [
    {
      "url": "https://example.com/page-1",
      "finalUrl": "https://example.com/page-1",
      "statusCode": 200,
      "redirectChain": [],
      "responseTimeMs": 142,
      "subrequestsUsed": 1
    },
    {
      "url": "https://example.com/page-2",
      "finalUrl": "https://example.com/canonical-page",
      "statusCode": 200,
      "redirectChain": ["https://example.com/page-2"],
      "responseTimeMs": 280,
      "subrequestsUsed": 2
    }
  ],
  "subrequestsUsed": 3
}
```

---

## 3. `POST /api/fetch-resource`

Retrieves `robots.txt` or XML sitemap resources when direct browser fetch is blocked by CORS.

### Request Body
```json
{
  "url": "https://example.com/sitemap.xml",
  "maxSizeBytes": 1048576
}
```

### Constraints
- `maxSizeBytes`: Default 1 MB, hard maximum 2 MB.
- Stream aborts immediately if bytes exceed threshold.

### Response `200 OK`
```json
{
  "url": "https://example.com/sitemap.xml",
  "contentType": "application/xml",
  "content": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
  "isGzip": false,
  "sizeBytes": 2048
}
```
*(Gzip resources are returned base64-encoded with `"isGzip": true` for client-side decompression).*
