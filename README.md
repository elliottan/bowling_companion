# Bowling Companion

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

| Doc | Purpose |
|---|---|
| [docs/README.md](./docs/README.md) | Documentation index |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Module map and data flow |
| [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) | Types, Dexie schema, scoring rules |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | ADR-light log of load-bearing choices |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | User-visible changes |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Build + deploy (Vercel) |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Future work |

Maintenance rule: any change to **scoring**, **the data model**, or
**import/merge rules** updates [DECISIONS.md](./docs/DECISIONS.md) **and**
[CHANGELOG.md](./docs/CHANGELOG.md) in the same PR.
