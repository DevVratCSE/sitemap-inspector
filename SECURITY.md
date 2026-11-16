# Security Policy — Sitemap Inspector

## 1. Threat Model & Outbound Network Gateway

Sitemap Inspector accepts user-supplied URLs to audit public XML sitemaps and website pages. Because the Cloudflare Worker makes outbound HTTP requests on behalf of users when browser CORS restricts direct client fetches, strict destination control and Server-Side Request Forgery (SSRF) defense are foundational design requirements.

---

## 2. SSRF Prevention Controls

The application enforces the following defensive controls in `worker/security/validate-url.ts` before every outbound connection:

- **Protocol Restriction:** Only `http:` and `https:` schemes are permitted.
- **Credential Stripping:** Embedded user credentials (`user:password@host`) are strictly rejected.
- **Port Whitelist:** Standard web ports `80` and `443` only. Non-standard ports (such as `22`, `3306`, `6379`, `8080`) are rejected to prevent port scanning.
- **Comprehensive IP Blocking:**
  - `0.0.0.0/8` (Current network)
  - `10.0.0.0/8` (RFC 1918 Private)
  - `100.64.0.0/10` (Shared Address Space / CGNAT)
  - `127.0.0.0/8` (Loopback)
  - `169.254.0.0/16` (Link-local & Cloud Metadata: `169.254.169.254`)
  - `172.16.0.0/12` (RFC 1918 Private)
  - `192.0.0.0/24` (IETF Protocol Assignments)
  - `192.0.2.0/24` (TEST-NET-1)
  - `192.88.99.0/24` (6to4 Relay)
  - `192.168.0.0/16` (RFC 1918 Private)
  - `198.18.0.0/15` (Benchmarking)
  - `198.51.100.0/24` (TEST-NET-2)
  - `203.0.113.0/24` (TEST-NET-3)
  - `224.0.0.0/4` (Multicast)
  - `240.0.0.0/4` (Reserved)
  - `255.255.255.255/32` (Broadcast)
  - IPv6 Loopback (`::1`), Link-Local (`fe80::/10`), Unique Local (`fc00::/7`), and IPv4-mapped IPv6.
- **Obfuscation Filter:** Rejects or normalizes hexadecimal, octal, and decimal integer IP representations (e.g. `2130706433`).
- **Internal Domain Names:** Rejects `localhost`, `*.local`, `*.internal`, `*.lan`, `*.arpa`, and `metadata.google.internal`.
- **Redirect-Based SSRF:** Outbound fetches use manual redirect resolution. Every redirect destination is re-validated through the full SSRF filter before being fetched.

---

## 3. CSV Injection Defense

When generating CSV reports locally, all cell values are sanitized against spreadsheet formula injection (DDE attacks). Any cell beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` is prepended with a single apostrophe `'` and escaped per RFC 4180.

---

## 4. Reporting a Security Vulnerability

If you discover a security vulnerability in Sitemap Inspector, please report it privately via GitHub Security Advisories or by emailing `devvrat@brightrays.com`. Please allow up to 48 hours for an initial response.
