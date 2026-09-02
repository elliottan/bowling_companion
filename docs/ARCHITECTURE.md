# Architecture

Headpin is a zero-backend single-page app. React renders the UI,
Dexie (IndexedDB) stores everything, and a small set of pure modules in
`src/lib/` own all the bowling rules.

## Layers

The map, not an inventory. Source of truth for the file list is `src/` itself.
Each layer's *role* and the *load-bearing* modules:

- `App.tsx`: shell + tab navigation; owns the active view + session id.
- `views/`: one page-level screen per tab. View-local state; orchestrate
  components + repositories. **No bowling logic here.**
- `components/`: presentation + interaction primitives; data via props
  (e.g. `PinGrid`, `Scorecard`, `ActiveGameScorer`).
- `services/*Repository.ts`: async layer wrapping **all** Dexie calls in named
  functions. The only place IndexedDB is touched.
- `lib/`: pure, React-free, Dexie-free, unit-tested functions. Load-bearing:
  `scoring.ts`, `frameController.ts` (shot state machine), `shotSeeding.ts`
  (what a shot opens with), `pins.ts`, `stats.ts`.
- `db/bowlingDb.ts`: Dexie class + versioned schema.
  `types/bowling.ts`: shared interfaces.

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
  they're testable in isolation, but `lib/` also holds the shared hooks
  (`useOverlay`, `useSheetDismiss`, `useLongPress`, `useHistoryRoute`,
  `useTheme`), which are UI behavior with no markup of their own. A new module
  here should be React-free unless it is specifically a hook.
- `services/*` may import `lib/*`, `db/*`, `types/*`. No React.
- `components/*` may import `lib/*`, `services/*`, `types/*`, other `components/*`.
- `views/*` may import everything below.
- `App.tsx` only orchestrates views.

The goal: a future developer can rewrite the UI without touching scoring, and
rewrite scoring without touching the UI.

## `components/ui/` and the shared shells

`components/ui/` holds every shared primitive: the controls (`Button`,
`IconButton`, `Chip`, `Fab`), the shells (`FormSheet`, `AnchoredMenu`,
`EmptyState`) and the class strings that keep chrome from drifting (`field.ts`,
`typography.ts`). `PushScreen` and `lib/useSheetDismiss.ts` own every screen and
overlay transition in the app, without exception. The rules for using them, and
the reasons behind them, live in `docs/DESIGN-LANGUAGE.md` (ADR-040, and ADR-034
for the tokens). They are not repeated here.

The layering point: a primitive exists here the moment a second screen needs it,
and the app has twice paid for the alternative. Field chrome was hand-written in
seven forms and five copies had silently lost their background class; the two
long-press menus were byte-identical markup in two files. Both were found by
reading, not by a failing test, which is the argument for the rule.

One structural note that belongs with the layering: `Chip` expands its tap
target with an `::after` overlay rather than growing its box, so rows of chips
stay dense. Any ancestor with a non-visible `overflow` clips that overhang, and
`overflow-x-auto` forces `overflow-y` to `auto`, so a scrolling chip row needs
vertical padding to survive.

## Why this layout

- The whole product is offline; storage stays on-device. Putting Dexie behind
  thin repository functions means we can replace it (SQLite, file-system API,
  Origin Private File System) by changing one file.
- Screens read those repositories through `useLiveQuery` (`dexie-react-hooks`),
  so a write updates every list showing that data. The alternative was what the
  app used to do: each screen loaded in a mount effect and every mutation had to
  remember to call back and refresh, which is a stale list one forgotten call
  away. Live queries observe in a **readonly** transaction, so a query may not
  write (seeding defaults runs in its own effect, see `SpareLinesView`), and the
  fallback for "not answered yet" must be a stable constant, or every `useMemo`
  downstream of it re-runs on each render.
- Scoring is the part that's mathematically delicate. Isolating it in
  `lib/scoring.ts` + `lib/frameController.ts` lets us drive it with cheap
  unit tests instead of slow component tests.
- Navigation gets the same treatment for the same reason. `lib/appNavigation.ts`
  is a plain reducer holding which tab, which session, which Settings section
  and what is stacked above them; `App.tsx` renders its state. The rules
  between those (what "back" means two overlays deep, which tab leaving a
  session returns to, what happens when the open session is deleted elsewhere)
  used to be spread across a dozen inline handlers that only the running app
  could exercise. `lib/appRoute.ts` projects that state onto the URL and
  `lib/useHistoryRoute.ts` keeps them in step, which is also what makes the
  system back button work (ADR-041).
- Views are intentionally thin so per-screen UX iteration is local.

## Where the tests live, and what holds them up

The split follows the layering: `lib/` and `services/` carry the logic a
regression can corrupt data with, so they are unit-tested and hold a coverage
floor (`vite.config.ts`: 90% of `lib/` and 83% of `services/`, by line, with
functions and branches held too). Screens
are covered by Playwright in `e2e/`, not by jsdom, because the failures worth
catching there are flow failures. Views sit at ~0% unit coverage on purpose:
that number is not the goal, the floors and the e2e flows are.

`npm run verify` runs the whole gate. ESLint is part of it, and exists mostly
for the hooks rules, which catch what `tsc` structurally cannot: stale
dependency arrays, conditional hooks, missing cleanups. Its two compiler-era
rules (`set-state-in-effect`, `refs`) are warnings, because the patterns they
flag are used deliberately throughout the app.
