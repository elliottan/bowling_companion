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

It is `npm run lint` (ESLint, mostly for the hooks rules), then
`npm run test:coverage` (vitest **with the coverage floors**), then
`npm run build` (tsc -b + vite build + PWA service worker/manifest), then
`npm run test:e2e` (Playwright, Chromium and WebKit). All four, every time.

`npm test` is the fast inner loop and skips coverage, so it is never the last
run before a push: CI runs `test:coverage`, and a gate weaker than the judge is
not a gate. e2e used to be the optional step, which is exactly how two specs sat
red on `main` for weeks: they assert on UI copy, so they rot silently whenever a
label changes, and that is the drift they exist to catch.

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
- `index.html` (the landing page), `score/index.html` (the app shell),
  `legal/index.html`, `404.html`, `guides/<id>/` (the page and preview card a
  shared guide link opens, committed by `npm run guide-pages`, and held to the
  guides by a test)
- hashed JS/CSS in `assets/`, split into the app chunk, `react`, `dexie` and a
  lazy chunk per screen that is not part of the core loop
- `sw.js` + `workbox-*.js` (service worker), `manifest.webmanifest`, `icons/`,
  `shots/`, `catalog/`

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

It carries redirects, two rewrites and the response headers.

The redirect is `www.headpin.app` to the bare `headpin.app`. That is not
cosmetic. Browser storage is scoped to an origin,
and `www.` is a different origin, so an app served on both would give a user
two databases, two installs and two halves of a history depending on which
link they happened to tap. One canonical origin, for ever.

The project's old address, `bowling-companion.vercel.app`, redirects to
`headpin.app` the same way, path kept, so an old link lands on the same page.
Storage does not follow the redirect: a browser that only ever used the old
origin keeps its games there, and they are not moved across.

The redirect is 307 rather than 308 deliberately: a permanent redirect is
cached hard by browsers and could not be reversed on a device that had already
seen it.

It could equally be a "Redirect to" setting on the domain in the Vercel
dashboard. It lives here instead so it is version-controlled, reviewable, and
survives the project being recreated.

The rewrites serve `/app` and `/legal` from their own `index.html`, because
both are linked, shared and installed without a trailing slash and hosts
disagree about resolving that themselves. `/app` is the web app, which the
landing page, guides and shared links open, and its install manifest
(`manifest.webmanifest`) opens it.

`/score`, the owner's copy that opened with every feature, is gone (ADR-190).
The redirects send `/score` and anything under it to `/app`, so an old bookmark
or home screen install still opens the app, locked as everyone's is. The games
are kept: storage belongs to the site, not the path.

The headers block is described under "Deploy to Vercel" above.

### Why nothing else is needed

- The app routes in the **hash fragment** (`/app#/home`, `/app#/session/4`),
  which a server never sees, so every request is for `/app` and no SPA rewrite
  rule is required beyond the one that resolves that path to its `index.html`. This is the reason, and it is load-bearing: move the routes into the
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

`/catalog/` also answers `Access-Control-Allow-Origin: *`. The store apps are
served from `capacitor://localhost` (iOS) and `https://localhost` (Android), and
their `fetch` of the ball and pattern catalogs from headpin.app is cross-origin
(ADR-155). The files are public
already, so allowing any origin to read them gives nothing away.

`public/404.html` is served from the output root for any unmatched path.

Any further config goes in the same `vercel.json`, with the reason documented
here.

### Web Analytics

The site carries Vercel Web Analytics on `/` and `/app` (not `/legal`), as a
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
  Dexie throws `VersionError`, `AppErrorBoundary` recognizes it, and
  `StaleShellScreen` offers the reload that actually activates the new worker. A
  plain `location.reload()` never does, because `updateSW(true)` only sends
  SKIP_WAITING and rides workbox's `controlling` event.

Hashed asset filenames mean stale assets never collide.

## The iOS app

The store app is the same build inside Capacitor (ADR-155). On a Mac with Xcode:

```bash
npm run build:ios   # web build, then dist-native/, then copied into ios/
npx cap open ios    # opens the Xcode project; run it on a simulator or phone
```

`dist-native/` is the build as the app carries it: the app shell as the root
page, the catalogs as an offline snapshot, and no photos, sheets or service
worker (`scripts/native/assemble.ts` says what is left out and why). Capacitor
copies it into `ios/App/App/public/`, which `ios/.gitignore` keeps out of git,
so a fresh checkout needs `npm run build:ios` before Xcode has anything to run.
The Xcode project itself, `ios/`, is committed: it carries the app's identity
(`app.headpin`), its orientation and the edge swipe (`SceneDelegate.swift`).

**Trying Headpin Pro.** Run the app from Xcode with the shared `App` scheme: it
selects `ios/App/App/Headpin.storekit`, so the purchase, Ask to Buy and
refunds can be tried in the simulator against a local copy of the product,
with no App Store Connect (Debug menu: StoreKit, Manage Transactions, to
refund or start over). The real product must be named `app.headpin.pro`
(ADR-158).

**Icons.** `node scripts/native/icons.mjs` draws both apps' icons and launch
screens from the same pin as the web app's (`scripts/pin-mark.mjs`).

**Universal links** need the paid Developer Program: the Associated Domains
entitlement is signed into Release builds only, and headpin.app must serve
`/.well-known/apple-app-site-association` naming the Team ID (ADR-159).

Neither store app deploys with a merge. Its code is what it was built with, and
only its catalogs refresh from headpin.app (ADR-154).

## The Android app

The same build in the same way, for Android Studio and its emulator:

```bash
npm run build:android   # web build, then dist-native/, then copied into android/
npx cap open android    # opens the project in Android Studio; run it on an emulator
```

Or, without Android Studio's editor, with an emulator already running:

```bash
npx cap run android     # builds a debug APK, installs it and launches it
```

`android/` is committed and `android/app/src/main/assets/public/` is not, so a
fresh checkout needs `npm run build:android` first, as for iOS. The project
targets SDK 36 and needs JDK 21. `MainActivity.java` carries the back button
(ADR-155), and `HeadpinStorePlugin.java` sells Pro through Play Billing
(ADR-277).

**The emulator walk.** `.github/workflows/android-device-check.yml` builds the
debug APK on every change under `android/` and walks the app on an emulator
(`scripts/native/device-check/android.ts`). Its image has no Play Store, so
Billing never connects there: it checks that Pro is locked and offered, not a
purchase.

**The upload key.** Play wants a signed App Bundle (`.aab`). With Play App
Signing, Google holds the key that signs what bowlers install, and the owner
holds an upload key that only proves an upload came from them. Make it once,
on the owner's own machine, and keep it and its password somewhere backed up
(a lost upload key can be reset through Play support, but it takes days):

```bash
keytool -genkeypair -v -keystore ~/headpin-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then copy `android/keystore.properties.example` to `android/keystore.properties`
and fill in the path and passwords. Git ignores that file and any `.jks` or
`.keystore`, and none of them may ever be committed. CI can pass the same four
values as `HEADPIN_UPLOAD_STORE_FILE`, `HEADPIN_UPLOAD_STORE_PASSWORD`,
`HEADPIN_UPLOAD_KEY_ALIAS` and `HEADPIN_UPLOAD_KEY_PASSWORD` instead.

**A release.**

```bash
npm run bundle:android   # web build, copied in, then gradlew bundleRelease
# android/app/build/outputs/bundle/release/app-release.aab
```

Without the key the bundle still builds, unsigned, and Play refuses it. The
versionCode is read from `package.json` (`0.107.0` is `107000`), which every
merge bumps, so each upload has a larger one; the version bowlers see,
`versionName`, is the store version in `android/app/build.gradle`, `1.0` for
the first release. The first upload goes to Internal testing in Play Console,
where Play App Signing is turned on, and its SHA-256 (Setup, App signing) is
what `/.well-known/assetlinks.json` names for App Links. The listing text is
[PLAY-LISTING.md](./PLAY-LISTING.md).

## Manual checks

Two things the suite cannot do, both on a real device.

**Rotation.** `docs/VIEWPORT-BUG.md` explains why: the bug it documents lives in
the browser's own viewport handling, and neither jsdom nor a headless browser
reproduces it. On an iPhone, in the installed app:

1. Score a frame in portrait, rotate to landscape, rotate back. The scorer is
   still on the same frame and the page is not scrolled somewhere else.
2. Open a sheet (the ball picker), rotate, close it. The tab bar is where it
   was and nothing is under the home indicator.
3. Focus a notes field, rotate with the keyboard up, dismiss it. The layout
   comes back to full height.

**The update flow.** `swUpdate` is unit-tested (applies when safe, holds while
unsafe, once per page, foreground check), but a real service worker taking over
a real page is not. After a deploy, with the app already installed: open it,
leave it on Home, and confirm it picks the new version up without a prompt;
then repeat on the Active tab and confirm the toast waits there instead.

## Post-deploy smoke check

1. Open the production URL on a phone.
2. Score a frame, reload: data persists (IndexedDB).
3. Browser offers "Add to Home Screen"; installed app launches standalone.
4. Toggle airplane mode and reload the installed app: it still boots (offline).
   Chromium's half of this runs on every push (`e2e/offline-boot.spec.ts`,
   against the production build); this step is for Safari on a real iPhone,
   which Playwright cannot take offline under a service worker.

## Rollback

Vercel keeps every deployment. To roll back, promote a previous deployment from
the Vercel dashboard (Deployments → pick one → Promote to Production), or
redeploy a known-good commit with `vercel --prod`.
