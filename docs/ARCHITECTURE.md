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

- `lib/*` may import only `types/*` and other `lib/*`. No Dexie. **Mostly** no
  React: the pure modules (scoring, geometry, stats) must stay React-free so
  they're testable in isolation, but `lib/` also holds the shared hooks —
  `useLongPress`, `useOverlay`, `useTheme` — which are UI behaviour with no
  markup of their own. A new module here should be React-free unless it is
  specifically a hook.
- `services/*` may import `lib/*`, `db/*`, `types/*`. No React.
- `components/*` may import `lib/*`, `services/*`, `types/*`, other `components/*`.
- `views/*` may import everything below.
- `App.tsx` only orchestrates views.

The goal: a future developer can rewrite the UI without touching scoring, and
rewrite scoring without touching the UI.

## `components/ui/` — the primitives

`Button`, `IconButton` and `Chip` are the shared control primitives; every
control should be built from them rather than hand-rolled. They exist to make
the accessibility floor structural rather than a review checklist: both `Button`
sizes and `IconButton` clear Apple's 44pt minimum tap target, and `IconButton`
takes `label` as a **required** prop so an icon button with no accessible name
does not type-check.

Two rules when working with them:

- **Colour goes in a variant, never in `className`.** Tailwind resolves
  competing utilities by stylesheet order, not by the order they appear in the
  class attribute, so a colour passed via `className` silently loses to the
  variant's. Add a variant instead.
- **`Chip` expands its tap target with a `::after` overlay** rather than growing
  its box, so rows of chips stay dense. That overhang is clipped by any ancestor
  with a non-visible `overflow` — note `overflow-x-auto` forces `overflow-y` to
  `auto` — so a scrolling chip row needs vertical padding to survive.

See `docs/DECISIONS.md` ADR-034 for the token system these primitives draw on.

## Why this layout

- The whole product is offline; storage stays on-device. Putting Dexie behind
  thin repository functions means we can replace it (SQLite, file-system API,
  Origin Private File System) by changing one file.
- Scoring is the part that's mathematically delicate. Isolating it in
  `lib/scoring.ts` + `lib/frameController.ts` lets us drive it with cheap
  unit tests instead of slow component tests.
- Views are intentionally thin so per-screen UX iteration is local.
