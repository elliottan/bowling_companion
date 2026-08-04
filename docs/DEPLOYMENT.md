# Build & Deploy

Bowling Companion is a static, offline-first SPA (Vite build → `dist/`). No
backend, no env vars, no database to provision — deploying is just shipping the
built static assets to any host. Vercel is the current target.

## Prerequisites

- Node 20+ and npm.
- Dependencies installed: `npm install`.
- (Deploy only) Vercel CLI: `npm i -g vercel`, logged in via `vercel login`.

## Local checks before deploying

One command runs the whole gate, so a deploy never ships a broken build:

```bash
npm run verify
```

It is `npm test` (vitest), then `npm run build` (tsc -b + vite build + PWA
service worker/manifest), then `npm run test:e2e` (Playwright: scoring, backup,
oil patterns). All three, every time. e2e used to be the optional step, which
is exactly how two specs sat red on `main` for weeks: they assert on UI copy,
so they rot silently whenever a label changes, and that is the drift they exist
to catch.

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

Push to `main`:

```bash
git push origin main
```

Vercel's Git integration builds and promotes it to production. That is the
whole deploy for normal work.

The CLI path stays as the fallback for when the remote is unavailable, or for
shipping a build that is deliberately not on `main`:

```bash
vercel --prod
```

Vercel auto-detects Vite, runs `npm run build`, and serves `dist/`. The first
CLI run links the directory to a Vercel project (interactive, one-time).

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
`archive/2026-06-07-pwa-offline-design.md`). On a new deploy, returning visitors pick up
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
