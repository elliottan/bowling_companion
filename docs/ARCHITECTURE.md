# Architecture

Bowling Companion is a zero-backend single-page app. React renders the UI,
Dexie (IndexedDB) stores everything, and a small set of pure modules in
`src/lib/` own all the bowling rules.

## Layers

The map, not an inventory — source of truth for the file list is `src/` itself.
Each layer's *role* and the *load-bearing* modules:

- `App.tsx` — shell + tab navigation; owns the active view + session id.
- `views/` — one page-level screen per tab. View-local state; orchestrate
  components + repositories. **No bowling logic here.**
- `components/` — presentation + interaction primitives; data via props
  (e.g. `PinGrid`, `Scorecard`, `ActiveGameScorer`).
- `services/*Repository.ts` — async layer wrapping **all** Dexie calls in named
  functions. The only place IndexedDB is touched.
- `lib/` — pure, React-free, Dexie-free, unit-tested functions. Load-bearing:
  `scoring.ts`, `frameController.ts` (shot state machine), `pins.ts`, `stats.ts`.
- `db/bowlingDb.ts` — Dexie class + versioned schema.
  `types/bowling.ts` — shared interfaces.

## Data flow

```
User taps pin                                       Frame saved to IndexedDB
   │                                                          ▲
   ▼                                                          │
PinGrid (component)                                services/bowlingRepository
   │ onChange                                                 │
   ▼                                                          │
ActiveGameScorer.recordShot                                   │
   │                                                          │
   ▼                                                          │
lib/frameController.submitShot ──────► savedFrame ────────────┘
   │ result.state                                             │
   ▼                                                          │
local useState                                                │
   │                                                          │
   ▼                                                          │
Scorecard re-renders <──── lib/scoring.calculateGameScore ────┘
```

## Layering rules

- `lib/*` may import only `types/*` and other `lib/*`. No React. No Dexie.
- `services/*` may import `lib/*`, `db/*`, `types/*`. No React.
- `components/*` may import `lib/*`, `services/*`, `types/*`, other `components/*`.
- `views/*` may import everything below.
- `App.tsx` only orchestrates views.

The goal: a future developer can rewrite the UI without touching scoring, and
rewrite scoring without touching the UI.

## Why this layout

- The whole product is offline; storage stays on-device. Putting Dexie behind
  thin repository functions means we can replace it (SQLite, file-system API,
  Origin Private File System) by changing one file.
- Scoring is the part that's mathematically delicate. Isolating it in
  `lib/scoring.ts` + `lib/frameController.ts` lets us drive it with cheap
  unit tests instead of slow component tests.
- Views are intentionally thin so per-screen UX iteration is local.
