# Headpin Pro: the launch plan

The plan for ADR-154: a free app with one Pro unlock (US$9.99, one-time), sold
only through the store apps, with no accounts and no server. The iOS app ships
first. The app is free to download; Pro is one purchase inside it, tied to the
bowler's Apple ID, not an account or a second app. Its button can read "Unlock
everything" where "Pro" might sound like a subscription. This file is a plan, not a record. When the work is delivered it moves to
`archive/`, and what it settled lives in ADR-154, the code and the changelog.

## The rule behind the split

1. **Recording is free.** Anything a bowler enters can be entered without Pro:
   every shot, ball, line, lane, pattern and note. A bowler who buys Pro later
   finds their whole history already analysed.
2. **Reading deeper is Pro.** Pro is the analysis that turns those records into
   a decision: which ball, which line, which leave costs the most.
3. **Nothing a bowler has is ever locked.** History, backup and export are free
   forever, and a Pro screen never hides data, only the analysis of it.
4. **The catalog and patterns are free everywhere,** photos and sheets included
   (ADR-154, ADR-061).
5. **Whatever travels is free to see.** Share cards and shared links are how new
   bowlers find the app, so making and sending one is never behind Pro, and a
   link opens for anyone, on the web or in the app. Without Pro the sandbox and
   the layout lab open to read: the line or layout, shared or not, is drawn in
   full with its numbers, and it can be shared on. Moving the line or changing
   the layout is Pro. Turning the drawn ball to look at it is reading, so it
   stays free. Neither screen saves anything, so there is no copy to keep.

## Free and Pro, feature by feature

A proposal for the owner to confirm before the gating is built. Everything here
is built and free today, so with no bowlers yet nothing is taken from anyone.

| Area | Feature | Free | Pro | Why |
|---|---|---|---|---|
| Scoring | Pin-by-pin scoring, the 10th frame, fouls, undo, fixing a shot in a finished game | ✓ | | Table stakes in every app |
| Scoring | Sessions with alley, lane, pattern and type; score first, file later | ✓ | | Recording |
| Scoring | Ball, stance, target and breakpoint on each shot, strike-ball moves | ✓ | | Recording, and what Pro later reads |
| Scoring | Spare lines: the shot a leave opens with, and lines that follow your moves | ✓ | | Part of entering a shot, not analysis |
| History | Every session and game, filters, reopening a game | ✓ | | The bowler's own data |
| History | Backup, export and import | ✓ | | Never gate the bowler's data |
| Stats | Average, high game and series, game count, score trend chart | ✓ | | What every free app shows |
| Stats | Strike % on the chart, spare % on its card | ✓ | | Same |
| Stats | The First ball card: pocket, carry, strike on strike, first-ball pins, most strikes in a row, and the same on the chart | | ✓ | What competitors charge for |
| Stats | Leaves you leave most, leave shares, spare conversion by leave | | ✓ | PinPal, LaneTalk Pro and StrikeStat Pro charge for it |
| Stats | Ball performance rows against All balls | | ✓ | Equipment depth |
| Stats | Charts by game slot, and trend charts for the deeper metrics | | ✓ | Analysis |
| Home | Tonight, profile, first run, guides | ✓ | | Getting started |
| Alley report | The last session there: each line thrown and how it went | ✓ | | Your own record of one session, and the free taste of the report |
| Alley report | What you'd average with each ball, the best lines there, how your line moved between sessions | | ✓ | Reads across sessions, the deepest read in the app |
| Lane | A shot's line drawn on the lane, behind its info button | ✓ | | Seeing what you entered |
| Lane | The sandbox, read-only: any line drawn on the lane, its pattern, the other hand | ✓ | | Seeing a line, the best preview of Pro |
| Lane | The sandbox: moving the line, quick moves, its hook shape | | ✓ | A tool for planning, not recording |
| Lane | Lane notes | ✓ | | Recording |
| Arsenal | Your balls, unlimited, retiring a ball and keeping its history | ✓ | | Some apps cap the arsenal, but a cap gates the bowler's own data |
| Arsenal | A ball's layout written on it: PAP and the layout values | ✓ | | Recording |
| Layout lab | Reading a layout: the drilled ball, both notations, what it will do, turning the ball to look | ✓ | | Seeing a layout, the best preview of Pro |
| Layout lab | Changing a layout: the angles, pin buffer, presets, the core, your PAP, hand and grip | | ✓ | Equipment depth (the Paddock and BowlSheet sell this alone) |
| Catalog | Every ball, its specs and photo, search and filters, asking for a missing ball | ✓ | | ADR-154: nobody pays for the data |
| Patterns | Every pattern, its load table, the oil on the lane, its original sheet, asking for one | ✓ | | Same |
| Sharing | Night, line and layout share cards, and the links they carry | ✓ | | How new bowlers find the app |
| Sharing | Opening a shared line or layout to read | ✓ | | A link opens for anyone, and is the best preview of Pro |
| Sharing | Changing a shared line or layout (moving it, turning the ball) | | ✓ | That is the sandbox and the layout lab |

The deeper reads come from the same records, so they need nothing new stored.

## Two web addresses

The free web app is `headpin.app/app`: the landing page, guides and shared
links all open it, and a home screen install from it opens it. The original
address, `headpin.app/score`, is the owner's copy and keeps every feature,
whatever `APP_STORE_URL` says. Both are the same shell (`src/lib/pro.ts`), and
the same browser keeps the same games at either address, since storage belongs
to the site, not the path.

## How Pro shows where it is locked

On the web always, and in the app before purchase. It follows
`docs/DESIGN-LANGUAGE.md` and invents no new chrome.

- **A locked card keeps its place on the screen, grayed out, with one line**
  saying what it would show, and a single action: "Get Headpin Pro" in the app,
  "Get the app" on the web, which opens the App Store.
- **No popups, no counters, no nags.** Nothing appears during scoring, nothing
  repeats on a timer, and a card the bowler has seen stays quiet.
- **The card may show the bowler's own count** ("Your 214 leaves, by pin") but
  not the analysis.
- **No timed trial.** A free period that ends is the complaint bowlers raise most
  ("worked for eight weeks, then asked for money").
- On the web, Android gets "Get the app" only once the Play listing exists, and
  until then the card names the iPhone app.

## Catalog and pattern updates without a connection

Nothing needs a connection to work. A connection only brings new balls and
patterns.

- **The web app today** fetches `catalog/catalog-manifest.json` whenever it is
  online and reloads the catalog when the version moved
  (`src/services/ballCatalogRepository.ts`). The service worker keeps the last
  copy for offline. Patterns ride the same bargain (ADR-104).
- **The store apps** ship a snapshot of `catalog.json` (about 1 MB) and
  `patterns.json` (about 0.3 MB), so a fresh install works offline. When online,
  they run the same version check against `https://headpin.app` and keep the
  newer copy on the device. A new ball reaches app users without an app release.
- **Photos and sheets are not bundled.** About 53 MB of photos and 57 MB of sheets
  live in `public/catalog/` today, and Capacitor would ship them by default. The
  app loads each one from headpin.app the first time it is needed and keeps it,
  as the web app does. The arsenal's photos are fetched ahead, as
  `warmArsenalImages` does on the web. A takedown is a server edit, with no app
  release.
- **What the spike found:** the iOS web view runs no service worker for the
  app's own scheme, so nothing Workbox keeps is kept. The catalogs need no store
  of their own: the ball catalog already lives in IndexedDB, and every catalog
  pattern is already a row of the bowler's own (ADR-105), so the snapshot only
  has to answer when headpin.app does not (ADR-155). The photos are what is
  left: the web view's HTTP cache, or a store of their own (IndexedDB or the
  Capacitor filesystem) if a device shows that cache does not hold offline.

## Moving games from the web to the app

Games bowled on the web live in that browser. The app's first run asks "Bowled
with Headpin on the web?" and gives the steps:

1. On headpin.app, open Settings, then Backup & restore, and export the file.
2. In the app, open Settings, then Backup & restore, import, and pick the file
   from Files.

The import is the existing merge (ADR-038). The web app tells a bowler the same
when they tap "Get the app", so the steps are in front of them before they
switch.

## Phases

### 0. Owner admin (before any build reaches review)

- [ ] Apple Developer Program, as an individual (US$99 a year).
- [ ] Apply to the App Store Small Business Program before the first sale, or
      Apple takes 30% instead of 15%.
- [ ] Paid Apps agreement, bank account and tax forms in App Store Connect.
- [ ] App record and the one non-consumable product, Headpin Pro, at US$9.99.
- [ ] Tell MOTIV the app now sells Pro (ADR-061).

### 1. The iOS shell (a spike first)

- [x] Capacitor around the Vite build, with photos and sheets kept out of the
      bundle (ADR-155, `npm run build:ios`). Not yet built in Xcode.
- [ ] Read `docs/VIEWPORT-BUG.md` in full before touching the shell: safe areas,
      rotation and the keyboard behave differently in the iOS web view. iPhone
      is portrait only; safe areas and the keyboard wait on a device.
- [ ] Back and the edge swipe through history (ADR-041), checked in the web view.
      WebKit's own swipe skipped Headpin's entries, so the app's own edge pan
      calls `history.back()` (`HeadpinViewController`, ADR-157).
- [x] Catalog, pattern and photo loading from `https://headpin.app`, with the
      built-in snapshot when offline (ADR-155).
- [ ] Photos kept on the device. The app has only the web view's HTTP cache
      today (30 days of `Cache-Control`); whether that holds offline is the
      first thing to check on a device, and an on-device store follows if not.
- [ ] Umami counts from the app (ADR-120), and the privacy label to match.
- [ ] Universal links, so a shared headpin.app link opens in the app when it is
      installed and in the web app when it is not (ADR-159). The apps claim the
      links and open their screens; left: headpin.app serving
      `/.well-known/apple-app-site-association` (needs the Apple Team ID) and
      `/.well-known/assetlinks.json` (needs the Play signing key's SHA-256).
- [ ] A shared line or layout opens read-only without Pro, with the locked
      controls locked as "How Pro shows where it is locked" describes.

### 2. Pro itself

- [x] One module that answers "is Pro open": `src/lib/pro.ts` and
      `useProAccess`. The web half is built, and stays open until
      `APP_STORE_URL` is set. The iOS half reads the receipt (`proStore.ts`).
- [x] A purchase plugin with Restore purchases: the app's own, on StoreKit 2
      (`HeadpinStorePlugin.swift`, ADR-158), product `app.headpin.pro`. Try it
      in the simulator from Xcode, with `Headpin.storekit` (the `App` scheme
      selects it).
- [x] The locked card, `components/ui/ProLock`, on Stats and the Alley report.
- [x] The sandbox and the layout lab: read-only without Pro, shared links
      included, with `ProNote` saying what waits on Pro.

### 3. Native work and cleanup

- [x] Share sheet for cards, links and backups, which saves to Files (ADR-156).
- [x] Haptics on the pin deck, no rubber band, no pinch zoom (ADR-160). Apple
      rejects a repackaged website (4.2).
- [ ] The first-run import steps.
- [x] Remove the donation link and the retailer link (ADR-119), their usage
      count, and their words on the legal page.
- [ ] The legal page and privacy policy say what the app stores and what the
      store does.

### 4. App Store submission

- [x] The app's icon and launch screen (`scripts/native/icons.mjs`), a privacy
      manifest, arm64, iPhone only for 1.0 (ADR-160), and no export
      compliance question (`ITSAppUsesNonExemptEncryption`).

- [ ] Screenshots, keywords and a description written for store search.
- [ ] Review notes that explain the app works offline and what Pro unlocks.
- [ ] Offer codes for bowling creators and league friends at launch.

### 5. Android (after iOS is live)

- [ ] Google Play account (US$25 once), and 12 or more testers opted in for 14
      days in a row.
- [x] The Android shell, from the same build (ADR-155, `npm run build:android`):
      portrait, edge to edge, and the back button through history. Builds a
      debug APK; not yet run on an emulator.
- [ ] Play Billing for the same product, and the web's "Get the app" gains
      Android.

## Still open

- How the version rule maps onto store builds (ADR-154, Consequences).
- Whether a creator's offer code needs anything beyond Apple's own.
