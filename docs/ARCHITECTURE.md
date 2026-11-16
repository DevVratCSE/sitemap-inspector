# Sitemap Inspector — System Architecture

## 1. Overview & Core Philosophy

**Sitemap Inspector** is an open-source, stateless, browser-first technical SEO auditing tool designed to run entirely within the **Cloudflare Workers Free Plan** with zero server-side storage, zero databases, and zero external paid APIs.

The core architecture operates under one central design principle:
> **The user's browser performs almost all computation (discovery, parsing, crawling queues, classification, scoring, CSV generation, and PDF rendering). The Cloudflare Worker acts strictly as a lightweight, rate-limited HTTP gateway for requests blocked by browser CORS restrictions.**

---

## 2. Platform Component Breakdown

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER BROWSER (Client-Side)                      │
│                                                                        │
│  React 18 + TypeScript + Vite + Tailwind CSS                           │
│  - robots.txt discovery & parser                                       │
│  - XML DOMParser & namespace tolerance                                 │
│  - Recursive sitemap index traversal with cycle detection              │
│  - Native gzip decompression (DecompressionStream)                     │
│  - Bounded concurrency queue (3-5 simultaneous browser fetches)        │
│  - Transparent HTTP health & sitemap quality scoring                   │
│  - Formula-injection-safe CSV generator                                │
│  - Professional PDF generator (jsPDF + jspdf-autotable)                │
│  - Ephemeral memory only (0 localStorage / 0 cookies / 0 IndexedDB)   │
└───────────────────▲───────────────────────────────▲────────────────────┘
                    │                               │
        1. Direct Fetch (CORS allowed)    2. Direct Fetch Failed (CORS error)
                    │                               │
                    ▼                               ▼
      ┌───────────────────────────┐   ┌───────────────────────────────────┐
      │   TARGET PUBLIC WEBSITE   │   │     CLOUDFLARE WORKER GATEWAY     │
      │                           │   │                                   │
      │   - robots.txt            │   │   - Cloudflare Free Tier          │
      │   - sitemap.xml / .xml.gz │   │   - Multi-layer SSRF filter       │
      │   - Discovered Web Pages  │   │   - Manual 3-hop redirect follower│
      │                           │   │   - Subrequest budget (max 20)    │
      │                           │   │   - Batched inspection (max 5)    │
      │                           │   │   - Immediate body discard        │
      │                           │   │   - Ephemeral in-isolate rate-lim │
      └───────────────────────────┘   └─────────────────▲─────────────────┘
                                                        │
                                        3. Validated Outbound Fetch
                                                        │
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │       TARGET PUBLIC WEBSITE       │
                                      └───────────────────────────────────┘
```

---

## 3. Cloudflare Free-Tier Safeguards

| Resource | Official Limit | Application Budget | Protection Mechanism |
| :--- | :--- | :--- | :--- |
| **Worker Invocations** | 100,000 / day | ~100 per 500 URLs | Direct browser fetch handles CORS sites; fallback batches 5 URLs per invocation. |
| **Static Asset Requests** | Unlimited (Free) | Unlimited | Static frontend assets served via `[assets]` config; `run_worker_first: false` ensures zero Worker execution. |
| **CPU Time per Invocation** | 10 ms | < 2 ms | Network I/O wait does not consume CPU; response streams are cancelled immediately without reading bodies. |
| **Subrequests per Invocation** | 50 external requests | Hard cap of 20 | Invocations track remaining subrequests and stop gracefully if budget is exhausted. |
| **Simultaneous Outgoing Conns** | 6 connections | Max 3 | Outgoing requests inside batches are throttled to 3 parallel connections. |
| **Worker Storage (KV/D1/R2)** | Forbidden | 0 bytes | Fully stateless architecture. No database or disk persistence. |

---

## 4. Multi-Layer Security & SSRF Defense

All outbound requests routed through the Cloudflare Worker pass through strict destination validation before any TCP/TLS connection is initialized:

1. **Protocol Validation:** Only `http:` and `https:` permitted. Rejects `file:`, `data:`, `ftp:`, `javascript:`.
2. **Credential Stripping:** Rejects embedded credentials (`https://user:pass@host`).
3. **Port Filter:** Restricts connections to standard web ports `80` and `443`.
4. **IP Filtering:**
   - Detects standard IPv4, octal, hex (`0x7f000001`), and decimal integer (`2130706433`) representations.
   - Detects IPv6, link-local (`fe80::/10`), unique local (`fc00::/7`), and IPv4-mapped IPv6 (`::ffff:7f00:1`).
   - Blocks Loopback (`127.0.0.0/8`, `::1`), RFC 1918 Private Ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Carrier-Grade NAT (`100.64.0.0/10`), and Cloud Metadata addresses (`169.254.169.254`, `metadata.google.internal`).
5. **Redirect Hop Verification:** Outbound fetches use `redirect: 'manual'`. Every hop's `Location` header is resolved and re-run through the SSRF destination filter before proceeding, preventing redirect-based SSRF. Max 3 hops with cycle detection.
6. **Fixed Headers Policy:** Transmits a static `User-Agent` and `Accept` header. Never forwards client cookies or authorization headers.
