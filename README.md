# Headpin

[![CI](https://github.com/elliottan/bowling_companion/actions/workflows/ci.yml/badge.svg)](https://github.com/elliottan/bowling_companion/actions/workflows/ci.yml)

Offline-first bowling score keeper. Runs in the browser, stores everything
locally in IndexedDB, no backend.

## Quick start

```bash
npm install
npm run dev       # vite dev server on http://localhost:5173
npm test          # vitest run (unit)
npm run test:e2e  # playwright smoke tests
npm run build     # tsc -b && vite build (+ PWA)
```

## Deploy

Merging to `main` is the deploy: Vercel's Git integration builds and ships it.
The gate is `npm run verify`, which `.githooks/pre-push` runs before any push
to `main`.

```bash
npm run verify              # lint, coverage, build, e2e. Ship only when green.
git push origin main        # Vercel picks it up from here
```

Full guide: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). There is also a `deploy`
skill, as the manual fallback when the Git integration is not an option.

## Tech stack

React 18 · Vite · TypeScript · Tailwind CSS · Dexie.js (IndexedDB) · Vitest · Playwright.

## Documentation

[docs/README.md](./docs/README.md) routes everything by task, and carries the
maintenance rules. [AGENTS.md](./AGENTS.md) is the same map for coding agents.
