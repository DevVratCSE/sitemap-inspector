# Privacy Policy — Sitemap Inspector

## 1. Zero Application Data Retention

Sitemap Inspector is designed with a strict zero-retention privacy architecture:

- **No User Accounts:** The application does not require or support user accounts, logins, or authentication cookies.
- **No Server Storage:** Target URLs, discovered sitemap contents, HTTP status codes, response times, and audit results are **never stored on our servers, databases, KV stores, or file storage**.
- **No Report Uploads:** Generated PDF and CSV reports are created **entirely inside your browser** using JavaScript and HTML5 Blob APIs. They are never transmitted to our servers or third-party cloud services.
- **No Client Persistence:** Audit results are stored solely in ephemeral React state in your browser tab's RAM. No audit records are persisted to `localStorage`, `sessionStorage`, or `IndexedDB`. Closing or refreshing the page instantly discards all data.

---

## 2. Infrastructure Operational Metadata Disclosure

While Sitemap Inspector's application layer never logs, retains, or stores audit datasets:

- The application is hosted on Cloudflare Workers and Cloudflare Workers Static Assets.
- As with standard Internet infrastructure, Cloudflare's edge network processes basic HTTP request metadata (such as client IP address, user-agent, and request timestamp) for routing, DDoS mitigation, and operational telemetry according to the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).
- We do not claim zero infrastructure metadata retention, but we guarantee zero application-level audit logging or URL dataset persistence.

---

## 3. Third-Party Analytics & Tracking

Sitemap Inspector does not include third-party tracking scripts, advertising trackers, or session recording libraries (such as Google Analytics, Hotjar, or FullStory).
