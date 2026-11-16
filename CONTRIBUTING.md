# Contributing to Sitemap Inspector

Thank you for your interest in contributing to **Sitemap Inspector**! We welcome community contributions that preserve our core principles: zero server persistence, free-tier compatibility, and browser-first privacy.

---

## Code of Conduct
We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful and constructive in all interactions.

---

## How to Contribute

1. **Fork the Repository:** Create a fork of `DevVratCSE/sitemap-inspector` on GitHub.
2. **Create a Feature Branch:** `git checkout -b feat/my-improvement`.
3. **Write Tests:** Ensure new features include unit, integration, or security tests in `tests/`.
4. **Follow Architecture Constraints:**
   - No databases (D1, KV, SQL, NoSQL).
   - No server-side PDF or CSV processing.
   - Respect Cloudflare Workers Free-tier limits (<10ms CPU, <20 subrequests/invocation).
5. **Run Verification:**
   ```bash
   npm run typecheck
   npm run lint
   npm run format:check
   npm test
   npm run build
   ```
6. **Submit a Pull Request:** Open a PR against the `main` branch with a clear description of the problem solved.
