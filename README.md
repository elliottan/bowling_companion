# Headpin

[![CI](https://github.com/elliottan/bowling_companion/actions/workflows/ci.yml/badge.svg)](https://github.com/elliottan/bowling_companion/actions/workflows/ci.yml)

Offline-first bowling score keeper. Runs in the browser, stores everything
locally in IndexedDB, no backend.

## Quick start

```bash
npm install
npm run dev       # vite dev server on http://127.0.0.1:5173
npm test          # vitest run (unit)
npm run test:e2e  # playwright smoke tests
npm run build     # tsc -b && vite build (+ PWA)
```

## Deploy

```bash
npm test && npm run build   # verify first
vercel --prod               # ship dist/ to Vercel (zero config)
```

Full guide: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). There's also a `deploy`
skill that runs the verify-then-ship flow.

## Tech stack

React 18 · Vite · TypeScript · Tailwind CSS · Dexie.js (IndexedDB) · Vitest · Playwright.

## Documentation

[docs/README.md](./docs/README.md) routes everything by task, and carries the
maintenance rules. [AGENTS.md](./AGENTS.md) is the same map for coding agents.
