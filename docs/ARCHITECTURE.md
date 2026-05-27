# Architecture

Bowling Companion is a zero-backend single-page app. React renders the UI,
Dexie (IndexedDB) stores everything, and a small set of pure modules in
`src/lib/` own all the bowling rules.

```
src/
  main.tsx               React entry point. Mounts <App/>.
  App.tsx                Shell: header + 4-tab navigation. Owns active view + session id.
  index.css              Tailwind layer imports + 3 global resets.

  views/                 Page-level screens. One per app tab. Hold view-local state and
    DashboardView.tsx      orchestrate components + repositories. No bowling logic here.
    ActiveSessionView.tsx
    HistoryView.tsx
    BackupRestoreView.tsx

  components/            Presentation + interaction primitives. Receive data via props.
    ActiveGameScorer.tsx  Owns one game's scoring loop (frame controller state).
    Scorecard.tsx         Renders 10 frames with rolling totals.
    PinGrid.tsx           Triangle of pin buttons. Toggle standing/down.
    SessionForm.tsx       Start-session form with collapsed "More details".
    SessionHistory.tsx    Card list of past sessions with score chips.

  services/              Async repository layer. Wrap Dexie calls in named functions.
    bowlingRepository.ts   createSession, addGameToSession, saveFrame, getSessionDetails, ...
    backupRepository.ts    createBackup, exportBackup, importBackup, mergeBackup.

  lib/                   Pure functions. No React. No Dexie. Unit-tested.
    scoring.ts             calculateGameScore, isStrike, isSpare.
    scoreDisplay.ts        getFrameShotSymbols (X / / numbers for the scorecard).
    frameController.ts     submitShot, hydrateFrameController — state machine.
    backupValidation.ts    validateBackup — JSON-shape + range checks.
    pins.ts                ALL_PINS, knockedDownCount, pinsClearedBetween, uniquePins.

  db/
    bowlingDb.ts         Dexie database class + version schema.

  types/
    bowling.ts           TypeScript interfaces shared everywhere.

  test/
    setup.ts             vitest setup: fake-indexeddb + jest-dom.
```

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
