---
name: deploy
description: Build and deploy Bowling Companion to production. Use when the user wants to ship/release/deploy the app, push a new version live, or run the pre-deploy verification gate. Runs tests + build (+ optional e2e), then `vercel --prod`.
---

# Deploy Bowling Companion

Static offline-first Vite SPA. Full reference: `docs/DEPLOYMENT.md`.

**Normal path is a push:** merging or pushing to `main` makes Vercel's Git
integration build and ship prod, so run the verify gate below and then push.
Use `vercel --prod` only when the push path is unavailable (no remote access,
or shipping a build that is deliberately not on `main`).

## Steps

Run from the repo root. Stop and report if any step fails; never deploy a red build.

1. **Verify** (the CI gate: unit tests, then build, then e2e):
   ```bash
   npm run verify
   ```
   Every step, every deploy, quick fixes included. e2e was optional once and
   two specs sat red on `main` unnoticed.

2. **Deploy:**
   ```bash
   vercel --prod
   ```
   Vercel auto-detects Vite, rebuilds, and serves `dist/`. First run links the
   project interactively (one-time); after that it ships straight to prod.

3. **Report** the production URL Vercel prints.

## Rules

- If any step of `npm run verify` fails, fix or report. Do NOT run `vercel`.
- No env vars, no `vercel.json`, no backend. If a deploy seems to need one,
  something changed — check `docs/DEPLOYMENT.md` before improvising.
- `dist/` is a build artifact (git-ignored). Don't commit it.
- Don't `git push` as part of deploy unless asked; Vercel deploys from the
  local build, independent of git.

## Post-deploy smoke check (offer to the user)

On the prod URL: score a frame + reload (persists), confirm "Add to Home
Screen" appears, and that the installed app boots in airplane mode (offline).

## Rollback

Vercel keeps every deployment — promote a previous one from the dashboard, or
`vercel --prod` from a known-good commit.
