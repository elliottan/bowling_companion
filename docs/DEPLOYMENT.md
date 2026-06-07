# Build & Deploy

Bowling Companion is a static, offline-first SPA (Vite build → `dist/`). No
backend, no env vars, no database to provision — deploying is just shipping the
built static assets to any host. Vercel is the current target.

## Prerequisites

- Node 20+ and npm.
- Dependencies installed: `npm install`.
- (Deploy only) Vercel CLI: `npm i -g vercel`, logged in via `vercel login`.

## Local checks before deploying

Run the full gate the CI runs, so a deploy never ships a broken build:

```bash
npm test          # unit tests (vitest)
npm run build     # tsc -b + vite build + PWA service worker/manifest
npm run test:e2e  # Playwright smoke tests (scoring + backup + edit)
```

Optional: preview the production bundle locally (this is what gets deployed,
service worker included):

```bash
npm run preview   # serves dist/ at http://localhost:4173
```

## Build

```bash
npm run build
```

Produces `dist/`:
- `index.html`, hashed JS/CSS in `assets/`
- `sw.js` + `workbox-*.js` (service worker), `manifest.webmanifest`, `icons/`

`dist/` is git-ignored — it is a build artifact, never committed.

## Deploy to Vercel

From the repo root:

```bash
vercel --prod
```

That is the whole deploy. Vercel auto-detects Vite, runs `npm run build`, and
serves `dist/`. The first run links the directory to a Vercel project
(interactive, one-time); subsequent `vercel --prod` runs ship straight to
production.

### Why no `vercel.json` is needed

- The app has **no client-side router** — view state lives in React, the URL
  never changes — so no SPA rewrite rule is required.
- It needs **no env vars or serverless functions** — everything runs in the
  browser against IndexedDB.
- Vite's framework preset on Vercel already maps build output to `dist/`.

If a config is ever added (e.g. custom headers), put it in `vercel.json` at the
repo root and document the reason here.

### Service worker / cache note

The PWA uses `registerType: "autoUpdate"` (see
`2026-06-07-pwa-offline-design.md`). On a new deploy, returning visitors pick up
the new service worker on their next load and it activates automatically — no
manual cache busting. Hashed asset filenames mean stale assets never collide.

## Post-deploy smoke check

1. Open the production URL on a phone.
2. Score a frame, reload — data persists (IndexedDB).
3. Browser offers "Add to Home Screen"; installed app launches standalone.
4. Toggle airplane mode and reload the installed app — it still boots (offline).

## Rollback

Vercel keeps every deployment. To roll back, promote a previous deployment from
the Vercel dashboard (Deployments → pick one → Promote to Production), or
redeploy a known-good commit with `vercel --prod`.
