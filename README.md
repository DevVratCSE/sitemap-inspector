# Sitemap Inspector

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Platform-Cloudflare%20Workers%20Free-orange.svg)](https://developers.cloudflare.com/workers/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61dafb.svg)](https://react.dev/)
[![Privacy: Zero Data Retention](https://img.shields.io/badge/Privacy-Zero%20Data%20Retention-emerald.svg)](./PRIVACY.md)

**Sitemap Inspector** is an open-source, stateless, browser-first technical SEO auditing tool designed to run 100% within the **Cloudflare Workers Free Plan**.

It automatically discovers `robots.txt`, identifies XML sitemaps and nested sitemap indexes, audits HTTP status codes, tracks redirect chains, calculates transparent health metrics, and generates professional PDF and sanitized CSV reports **entirely inside your browser**.

---

## 🌟 Key Features

- **Automatic Sitemap Discovery:** Probes `robots.txt` for `Sitemap:` declarations, traverses nested sitemap indexes (up to depth 5), and handles standard fallback paths (`/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`).
- **Gzip & Format Support:** Decompresses `.xml.gz` sitemaps natively using Web Streams `DecompressionStream('gzip')` with strict 2 MB payload bounding.
- **Browser-First Architecture:** Discovery, XML parsing, URL queues, and scoring run client-side. The Cloudflare Worker is invoked **only** as a fallback when browser CORS prevents direct URL inspection.
- **Strict Free-Tier Budgeting:** Worker batch endpoint bundles up to 5 URLs per invocation with a hard ceiling of 20 subrequests and bounded outgoing connections (3 parallel sockets), consuming <0.1% of the daily Free quota for a standard audit.
- **Transparent Health Scoring:** Evaluates HTTP Health Score strictly on verified URL samples (excluding unverified/CORS blocked requests from the denominator) alongside a dedicated Sitemap Technical Quality Score.
- **100% In-Browser PDF & CSV Reports:**
  - **PDF Reports:** Styled, multi-page executive audit reports generated via `jsPDF` + `jspdf-autotable` with branding, KPI cards, actionable recommendations, and a paginated URL appendix.
  - **CSV Exports:** RFC 4180 compliant with UTF-8 BOM and spreadsheet formula injection defense (`=`, `+`, `-`, `@`, `\t`, `\r` escaped).
- **Zero Server Data Retention:** No databases, no KV/D1/R2, no user accounts, and no persistent audit logs. Ephemeral in-memory React state is discarded upon page refresh.

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Browser["User Browser (Client-Side)"]
        UI["React 18 + TypeScript + Vite UI"]
        State["Ephemeral State (0 Storage)"]
        DiscoveryEngine["Sitemap Discovery & Traversal"]
        XMLParser["Safe DOMParser + Fallback"]
        GzipProcessor["Native DecompressionStream"]
        ConcurrencyPool["Concurrency Pool (3-5 threads)"]
        Scoring["HTTP & Sitemap Quality Calculator"]
        ReportGen["jsPDF + Formula-Safe CSV Generator"]
        
        UI --> State
        UI --> DiscoveryEngine
        DiscoveryEngine --> XMLParser
        DiscoveryEngine --> GzipProcessor
        DiscoveryEngine --> ConcurrencyPool
        ConcurrencyPool --> Scoring
        Scoring --> ReportGen
    end

    subgraph DirectTarget["Target Public Website"]
        Robots["robots.txt"]
        Sitemaps["sitemap.xml / .xml.gz"]
        Pages["Discovered Web Pages"]
    end

    subgraph CloudflareGateway["Cloudflare Workers Free Gateway"]
        StaticAssets["Static Assets (Free/Unlimited Delivery)"]
        WorkerAPI["Worker API Gateway (/api/*)"]
        SSRF["Multi-Layer SSRF & IP Filter"]
        SubrequestBudget["Subrequest Counter (Max 20/call)"]
        ManualRedirects["Manual 3-Hop Redirect Engine"]
        
        StaticAssets -.-> Browser
        WorkerAPI --> SSRF
        SSRF --> SubrequestBudget
        SubrequestBudget --> ManualRedirects
    end

    Browser -- "1. Direct Fetch (CORS permitted)" --> DirectTarget
    Browser -- "2. CORS Blocked Fallback" --> WorkerAPI
    ManualRedirects -- "3. Validated Outbound Fetch" --> DirectTarget
```

---

## 🛡️ Cloudflare Free-Tier Safeguards

| Resource | Cloudflare Free Limit | Application Design Budget | Safety Strategy |
| :--- | :--- | :--- | :--- |
| **Worker Invocations** | 100,000 / day | ~100 per 500 URLs | Direct browser fetch handles CORS sites; fallback batches 5 URLs per invocation. |
| **Static Asset Requests** | Unlimited (Free) | Unlimited | Static frontend assets served via `[assets]` config; `run_worker_first: false` ensures zero Worker execution. |
| **CPU Time per Invocation** | 10 ms | < 2 ms | Network I/O wait does not consume CPU; response streams are cancelled immediately without reading bodies. |
| **Subrequests per Invocation** | 50 external requests | Hard cap of 20 | Invocations track remaining subrequests and stop gracefully if budget is exhausted. |
| **Simultaneous Outgoing Conns** | 6 connections | Max 3 | Outgoing requests inside batches are throttled to 3 parallel connections. |
| **Worker Storage (KV/D1/R2)** | Forbidden | 0 bytes | Fully stateless architecture. No database or disk persistence. |

---

## 🔒 Security & SSRF Defense Matrix

All outbound requests routed through the Cloudflare Worker pass through strict destination validation before any TCP/TLS connection is initialized:

- **Protocol Validation:** Only `http:` and `https:` permitted. Rejects `file:`, `data:`, `ftp:`, `javascript:`.
- **Credential Stripping:** Rejects embedded credentials (`https://user:pass@host`).
- **Port Whitelist:** Standard web ports `80` and `443` only. Non-standard ports (such as `22`, `3306`, `6379`, `8080`) are rejected to prevent port scanning.
- **Comprehensive IP Blocking:**
  - Loopback (`127.0.0.0/8`, `::1`), RFC 1918 Private Ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Carrier-Grade NAT (`100.64.0.0/10`), and Cloud Metadata addresses (`169.254.169.254`, `metadata.google.internal`).
  - Obfuscated decimal (`http://2130706433`), hex (`0x7f000001`), octal (`0177.0.0.1`), and IPv4-mapped IPv6 formats.
- **Manual Redirect Validation:** Outbound fetches use `redirect: 'manual'`. Every hop's `Location` header is resolved and re-run through the SSRF destination filter before proceeding, preventing redirect-based SSRF. Max 3 hops with cycle detection.
- **Fixed Outbound Headers:** Transmits a static `User-Agent` and `Accept` header. Never forwards client cookies or authorization headers.
- **CSV Formula Injection Defense:** All exported cells are sanitized per RFC 4180 against spreadsheet formula execution (`=`, `+`, `-`, `@`, `\t`, `\r`).

---

## 🚀 Quick Start & Local Development

### Prerequisites
- Node.js `v20+` or `v22+`
- npm `v10+`

### Installation

```bash
# Clone the repository
git clone https://github.com/DevVratCSE/sitemap-inspector.git
cd sitemap-inspector

# Install dependencies
npm install

# Start local frontend development server
npm run dev

# In a separate terminal, start local Cloudflare Worker gateway
npm run worker:dev
```

### Verification & Testing

```bash
# Run Vitest test suites (Unit, Integration & Security)
npm test

# Run TypeScript typechecks
npm run typecheck

# Run ESLint
npm run lint

# Check code formatting
npm run format:check

# Compile production build
npm run build
```

---

## 📦 Deployment to Cloudflare Workers

Sitemap Inspector deploys seamlessly to Cloudflare Workers using Static Assets:

```bash
# Authenticate Wrangler with Cloudflare
npx wrangler login

# Build frontend and deploy Worker
npm run deploy
```

Configuration in `wrangler.jsonc`:
```jsonc
{
  "name": "sitemap-inspector",
  "main": "worker/index.ts",
  "compatibility_date": "2024-11-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "single-page-application",
    "run_worker_first": false
  }
}
```

---

## 📖 Documentation Index

- [Architecture Design](./docs/ARCHITECTURE.md)
- [Security Policy & SSRF Matrix](./SECURITY.md)
- [Privacy Policy & Zero Retention](./PRIVACY.md)
- [API Contracts](./docs/API.md)
- [Technical Limitations](./docs/LIMITATIONS.md)
- [Development Guide](./docs/DEVELOPMENT.md)
- [Contributing Guidelines](./CONTRIBUTING.md)

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

Built with precision for professional technical SEO by [Devvrat](https://github.com/DevVratCSE).
