# Build & Deploy

Headpin is a static, offline-first SPA (Vite build → `dist/`). No
backend, no env vars, no database to provision. Deploying is just shipping the
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

It is `npm run lint` (ESLint, mostly for the hooks rules), then `npm test`
(vitest), then `npm run build` (tsc -b + vite build + PWA service
worker/manifest), then `npm run test:e2e` (Playwright: scoring, backup, oil
patterns). All four, every time. e2e used to be the optional step, which
is exactly how two specs sat red on `main` for weeks: they assert on UI copy,
so they rot silently whenever a label changes, and that is the drift they exist
to catch.

### Why the gate has to hold locally

Pushing to `main` **is** the deploy: Vercel's Git integration builds whatever
lands there and never reads the CI result. In August 2026 four consecutive
pushes shipped on a red CI run for that reason. So `.githooks/pre-push` runs
`npm run verify` before any push to `main` and refuses the push if it fails.

`npm install` points git at the hooks directory (the `prepare` script); to wire
it up by hand, or after cloning fresh:

```bash
git config core.hooksPath .githooks
```

Bypass with `git push --no-verify` (or `SKIP_VERIFY=1 git push`) when you mean
to, for example pushing a branch that is not `main` from a machine without
browsers installed. CI still runs on every push, and a failure on `main` now
files a `ci-failure` issue instead of waiting to be noticed.

Two things this does not do, because both need access outside the repo, and
they are worth setting up in the Vercel and GitHub dashboards:

- **Gate the Vercel deploy on CI.** An *Ignored Build Step* that checks the
  commit's status, or deploying from the workflow with a `VERCEL_TOKEN` secret.
  Until then a `--no-verify` push still ships.
- **Protect `main`** so changes arrive through a PR with the CI check required.

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

`dist/` is git-ignored: it is a build artifact, never committed.

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

### What `vercel.json` is for

It carries **one** rule: `www.headpin.app` redirects to the bare
`headpin.app`. That is not cosmetic. Browser storage is scoped to an origin,
and `www.` is a different origin, so an app served on both would give a user
two databases, two installs and two halves of a history depending on which
link they happened to tap. One canonical origin, for ever.

The redirect is 307 rather than 308 deliberately: a permanent redirect is
cached hard by browsers and could not be reversed on a device that had already
seen it.

It could equally be a "Redirect to" setting on the domain in the Vercel
dashboard. It lives here instead so it is version-controlled, reviewable, and
survives the project being recreated.

### Why nothing else is needed

- The app routes in the **hash fragment** (`/#/home`, `/#/session/4`), which a
  server never sees, so every request is for `/` and no SPA rewrite rule is
  required. This is the reason, and it is load-bearing: move the routes into the
  path and a rewrite becomes mandatory. Routing itself is real, see ADR-041 and
  `src/lib/appRoute.ts`.
- It needs **no env vars or serverless functions**: everything runs in the
  browser against IndexedDB.
- Vite's framework preset on Vercel already maps build output to `dist/`.

`vercel.json` also carries the response headers, applied to every path:
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` denying camera,
microphone and geolocation, and HSTS. There is no CSP yet: the three HTML
shells each run an inline theme script, which a CSP would need nonces for, and
nonces need a server rendering step this site does not have (ROADMAP).

`public/404.html` is served from the output root for any unmatched path.

Any further config goes in the same `vercel.json`, with the reason documented
here.

### Web Analytics

The site carries Vercel Web Analytics on `/` and `/score` (not `/legal`), as a
`<script defer src="/_vercel/insights/script.js">`. It is cookieless, stores no
identifier, and counts page views, referrers and rough country. It has to be
switched on once in the Vercel dashboard, under the project's Analytics tab, or
the script 404s and counts nothing. `/legal` discloses it.

### Service worker / cache note

The PWA uses `registerType: "prompt"`, with the prompt applied automatically
wherever a reload costs the user nothing (`src/lib/swUpdate.ts`).

- A waiting worker is applied on its own when the app is off the Active tab,
  with no keyboard up and no session being started. Every shot is already
  persisted and the session id is in the hash, so the reload lands on the same
  screen with nothing lost.
- On the Active tab the toast waits instead. Its x hides the toast for that page
  only; the update still applies the moment the bowler leaves the tab.
- Returning to the foreground checks for a newer worker, which an installed app
  left in the background for weeks would otherwise never see. A check, never an
  apply.
- A tab left open across a deploy can open a database newer than its own shell.
  Dexie throws `VersionError`, `AppErrorBoundary` recognises it, and
  `StaleShellScreen` offers the reload that actually activates the new worker. A
  plain `location.reload()` never does, because `updateSW(true)` only sends
  SKIP_WAITING and rides workbox's `controlling` event.

Hashed asset filenames mean stale assets never collide.

## Post-deploy smoke check

1. Open the production URL on a phone.
2. Score a frame, reload: data persists (IndexedDB).
3. Browser offers "Add to Home Screen"; installed app launches standalone.
4. Toggle airplane mode and reload the installed app: it still boots (offline).

## Rollback

Vercel keeps every deployment. To roll back, promote a previous deployment from
the Vercel dashboard (Deployments → pick one → Promote to Production), or
redeploy a known-good commit with `vercel --prod`.
