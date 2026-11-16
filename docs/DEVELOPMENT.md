# Development Guide

## 1. Prerequisites
- Node.js `v20.0.0` or higher
- npm `v10.0.0` or higher
- Wrangler CLI (`npm i -g wrangler` or via local devDependencies)

---

## 2. Local Setup

```bash
# Clone repository
git clone https://github.com/DevVratCSE/sitemap-inspector.git
cd sitemap-inspector

# Install dependencies
npm install

# Start Vite frontend development server
npm run dev

# In a separate terminal, start local Cloudflare Worker gateway
npm run worker:dev
```

The Vite dev server runs at `http://localhost:5173` and proxies `/api/*` calls to the local Wrangler worker at `http://127.0.0.1:8787`.

---

## 3. Testing & Code Quality

```bash
# Run Vitest unit & integration test suites
npm test

# Run Vitest in interactive watch mode
npm run test:watch

# Run TypeScript typechecks
npm run typecheck

# Run ESLint
npm run lint

# Check code formatting
npm run format:check

# Format code with Prettier
npm run format
```

---

## 4. Production Build & Deployment

```bash
# Compile TypeScript and bundle frontend with Vite
npm run build

# Deploy to Cloudflare Workers with Static Assets
npm run deploy
```
