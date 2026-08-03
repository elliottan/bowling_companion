# PWA + Offline — design

**Date:** 2026-06-07
**Status:** approved
**Feature:** 1 of 5 (roadmap batch: PWA, e2e, CI, per-game notes, stats)

## Context

Bowling Companion is an offline-first scorer (React 18 + Vite 5 + TS + Tailwind
+ Dexie/IndexedDB, no backend). Data already lives on-device. Missing piece:
the app itself isn't installable and won't load without network. A bowler at
the alley with no signal can't open it. This adds the delivery-channel layer:
installable to home screen, app shell cached, full offline boot.

## Decisions (locked)

- **Install prompt:** browser-native only. No custom in-app banner, no React
  changes.
- **Icons:** generated from 🎳 emoji on a felt-700 background via a one-off
  `sharp` script. Output committed.
- **Cache strategy:** precache app shell on install (cache-first). App boots
  instantly from cache offline. SW auto-updates on new deploy.
- **Plugin:** `vite-plugin-pwa` (Workbox under the hood). Rejected manual SW
  (fragile hashed-filename cache lists) and standalone workbox-cli (extra build
  step the plugin already covers).

## Architecture

Build-config + static assets only. Zero runtime React code.

```
vite.config.ts        + VitePWA({ registerType:'autoUpdate', manifest, workbox })
index.html            + theme-color meta + apple-touch-icon link
scripts/
  generate-icons.mjs  one-off: 🎳 SVG -> PNG via sharp
public/
  icons/
    icon-192.png
    icon-512.png
    icon-512-maskable.png   (safe-zone padding for Android adaptive)
```

### Manifest fields

```
name:             "Bowling Companion"
short_name:       "Bowling"
description:      "Offline bowling score keeper"
theme_color:      "#1b5148"   (felt-700)
background_color: "#fff8ed"   (lane-50)
display:          "standalone"
orientation:      "portrait"
start_url:        "/"
icons:            192, 512, 512-maskable
```

### Workbox

`registerType: 'autoUpdate'` — new SW activates on next load, no user prompt.
`globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}']` — precache all
hashed build output. Dexie data is untouched (IndexedDB, not SW cache).

## Verification

1. `npm run build` → assert `dist/sw.js` and `dist/manifest.webmanifest` exist.
2. `npm run preview` → Lighthouse PWA category ≥ 90, "installable" check passes.
3. DevTools → Application → Service Workers shows registered + activated.
4. Offline toggle in DevTools → reload → app still boots and scores.
5. `npm test` still green (no regressions; no source changed).

## Out of scope

- Custom install UX, update-available toast, push notifications.
- Background sync (no backend to sync to — see ADR-003 export/import).
