# Bowling Score Keeper Technical Spec

## Summary
Create `bowling-spec.md` as the project source-of-truth for a fresh offline-first React SPA in `/Users/elliottan/Developer/bowling-companion`. The spec will define a clean Vite + React + TypeScript + Tailwind app using Dexie.js for IndexedDB storage, with no backend, no fetch-based app data flow, and no `localStorage` for relational data.

Assumptions:
- The repo is currently unscaffolded, so Phase 1 starts from a fresh Vite React TypeScript project.
- Use `npm` because existing launch metadata expects `npm run dev`.
- UI should be simple, touch-friendly, score-entry-first, and mobile-first.
- Mobile browser usability is the priority. Desktop layouts may be basic or ignored if needed.

## `bowling-spec.md` Structure
The file will include:
- Architecture overview
- Proposed file layout
- Data models and Dexie schema
- Scoring engine design
- UI component boundaries
- Backup/restore strategy
- Five phased implementation checklists
- Unit-testable slices and visual verification checkpoints per phase

## Architecture Overview
- The application is a zero-backend SPA built with React 18+, Vite, TypeScript, Tailwind CSS, and Lucide React.
- All relational bowling data is stored locally in IndexedDB through Dexie.js.
- The app must work offline after the initial browser load and must not rely on server APIs for scorekeeping data.
- Domain logic such as scoring, frame interpretation, backup validation, and import merge decisions should live in pure, unit-testable modules.
- React components should remain focused on input, rendering, and orchestration.

## Mobile-First UI Requirements
- Treat an iPhone-width viewport, especially 390 x 844, as the primary design target.
- Fix mobile layout issues before adding new desktop polish. Desktop can remain plain if the mobile workflow is clean.
- The active scoring screen must show the current frame/shot, pin grid, record controls, and useful score context without horizontal clipping.
- Avoid wide desktop-first grids on mobile. Stack sections vertically, reduce padding, and keep action buttons within the visible viewport.
- The 10-pin grid must always fit within the viewport width and remain centered; no pin should be partially off-screen.
- The scorecard must have a mobile-safe presentation. It may use horizontal scroll, compact frame chips, or a collapsed current-frame-first view, but it must not force the entire page wider than the viewport.
- Navigation should be compact on mobile. Prefer icon-sized or short-label controls when space is tight.
- Session controls such as "Add game" and "Dashboard" should not dominate the top of the active scoring flow; scoring input is the primary task.
- Before completing any UI phase, manually verify the app at 390 x 844 and ensure there is no accidental horizontal page overflow.

## Proposed File Layout
```txt
bowling-companion/
  package.json
  vite.config.ts
  tsconfig.json
  tailwind.config.js
  postcss.config.js
  index.html
  src/
    main.tsx
    App.tsx
    index.css
    types/
      bowling.ts
    db/
      bowlingDb.ts
    services/
      bowlingRepository.ts
      backupRepository.ts
    lib/
      scoring.ts
      frameController.ts
      backupValidation.ts
    components/
      PinGrid.tsx
      Scorecard.tsx
      SessionForm.tsx
      SessionHistory.tsx
      ActiveSession.tsx
      LaneVisualization.tsx
    views/
      DashboardView.tsx
      ActiveSessionView.tsx
      HistoryView.tsx
      BackupRestoreView.tsx
      LaneVisualizationView.tsx
    test/
      setup.ts
```

## Public Interfaces And Types
The spec will require these core TypeScript models:

```ts
type PinNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface Session {
  id?: number;
  date: string;
  alley_name: string;
  oil_pattern?: string;
  general_notes?: string;
}

interface Game {
  id?: number;
  session_id: number;
  game_number: number;
  lane_number?: string;
  final_score?: number;
}

interface Frame {
  id?: number;
  game_id: number;
  frame_number: number;
  shot_1_pins_standing: PinNumber[];
  shot_2_pins_standing?: PinNumber[];
  shot_3_pins_standing?: PinNumber[];
  is_strike: boolean;
  is_spare: boolean;
  shot_1_notes?: string;
  shot_2_notes?: string;
}
```

The spec will define service APIs:
- `createSession(input)`
- `addGameToSession(sessionId, input)`
- `saveFrame(gameId, frame)`
- `getSessionHistory()`
- `exportBackup()`
- `importBackup(fileOrJson)`

## Dexie Schema Design
- Database name: `BowlingCompanionDB`.
- Version 1 tables:
  - `sessions`: `++id, date, alley_name`
  - `games`: `++id, session_id, game_number, lane_number, final_score`
  - `frames`: `++id, game_id, frame_number, is_strike, is_spare`
- `session_id` and `game_id` are local relational references, not server identifiers.
- Future schema versions should use Dexie migrations rather than destructive rebuilds.

## Scoring Engine Design
- Scoring helpers should derive knocked-down pins from standing-pin arrays.
- A shot with `[]` standing after shot 1 is a strike.
- A frame is a spare when shot 1 plus shot 2 clears all 10 pins without a strike.
- Open frames score only knocked-down pins in that frame.
- Strike and spare bonus calculations should be based on subsequent shot pinfall.
- The 10th frame must allow a third shot only after a strike or spare.
- Scoring functions should accept plain frame objects and return display-friendly frame totals and rolling totals.

## UI Component Boundaries
- `PinGrid` renders the triangle pin layout and emits selected standing pins.
- `Scorecard` renders symbols and rolling totals without owning persistence.
- `ActiveSession` coordinates scoring state, frame saves, and game progression.
- `SessionHistory` reads summarized historical data from Dexie-backed repository functions.
- `LaneVisualization` remains independent from core scorekeeping in its first version.
- All visual components must be designed mobile-first, then optionally enhanced for larger screens.

## Backup And Restore Strategy
- Export reads all Dexie tables into one JSON object with metadata and version.
- Import validates top-level shape and record-level fields before writing.
- Import should merge into the existing database instead of blindly replacing it.
- The UI must clearly show import success and validation failures.
- Backup files should be timestamped and human-identifiable.

## Phase Checklists

### Mobile UI Correction Checkpoint
- [x] Rework active session layout for a 390px-wide mobile viewport.
- [x] Ensure the pin grid is fully visible and centered on mobile.
- [x] Reduce top session-management chrome so scoring appears sooner.
- [x] Make scorecard mobile-safe without forcing page-level horizontal overflow.
- [ ] Verify dashboard, active scoring, and history at 390 x 844.
- [ ] Desktop improvements are optional and lower priority than mobile usability.

### Phase 1: Project Scaffolding & Dexie DB Setup
- [x] Scaffold Vite React TypeScript app.
- [x] Install Tailwind CSS, Dexie.js, Lucide React, and test tooling.
- [x] Configure Tailwind content paths and base app styles.
- [x] Create `src/types/bowling.ts` with exact data model interfaces.
- [x] Create `src/db/bowlingDb.ts` with Dexie database class, tables, indexes, and versioning.
- [x] Create `src/services/bowlingRepository.ts` with CRUD operations.
- [x] Create `src/lib/scoring.ts` with pure scoring helpers based on standing-pin arrays.
- [x] Add tests for strike, spare, open frame, tenth-frame bonus, and full-game totals.
- [x] Verification: app boots, DB initializes, unit tests pass.

### Phase 2: Interactive 10-Pin Input & Scoring Engine
- [x] Build reusable `PinGrid` triangle component for pins 1-10.
- [x] Support toggling pins standing after each shot.
- [x] Build frame controller state machine for shot progression.
- [x] Detect strike/spare/open frame from raw standing-pin arrays.
- [x] Implement 10th-frame behavior with up to three shots.
- [x] Build traditional scorecard UI with X, `/`, misses, pin counts, and rolling totals.
- [x] Add tests for frame advancement and score rendering helpers.
- [x] Visual checkpoint: pin grid is touch-friendly on mobile and scorecard is readable on desktop/mobile.

### Phase 3: Session Management & Entry UI
- [x] Create dashboard with "Start New Session".
- [x] Add session form fields: alley name, lane, date, optional oil pattern, notes.
- [x] Create active session view with sequential game creation.
- [x] Persist frames as the user scores.
- [x] Update game final score automatically when complete.
- [x] Create session history view with sessions, games, frames, and final scores.
- [x] Add loading, empty, and error states for Dexie reads.
- [x] Visual checkpoint: user can start a session, score a game, leave, return, and see saved history.

### Phase 4: Backup, Restore & Data Safety
- [x] Implement JSON export reading all Dexie tables.
- [x] Trigger browser download with timestamped `.json` backup filename.
- [x] Implement JSON import from selected/dropped file.
- [x] Validate backup shape before writing.
- [x] Merge imported sessions/games/frames without blindly corrupting existing data.
- [x] Show import success/failure feedback.
- [x] Add tests for backup validation and import merge behavior.
- [ ] Verification: export a backup, clear DB in dev tools, import backup, confirm history restores.

### Phase 5: Bowling Line Visualisation
- [ ] Add a bowling lane visualization view.
- [ ] Model bowler inputs: stance board, release board, target arrows, breakpoint, pocket target.
- [ ] Render lane boards, arrows, breakpoint, and intended path.
- [ ] Support simple path presets: straight, inside-out, outside-in, hook.
- [ ] Save optional visualization metadata to sessions or games in a later schema version.
- [ ] Keep v1 visualization lightweight and independent from scorekeeping.
- [ ] Visual checkpoint: users can understand where to stand, release, aim, and expect breakpoint.

## Testing And Acceptance
- Unit tests cover pure scoring and backup validation.
- Component tests cover scorecard symbols, frame state transitions, and pin-grid selection.
- Manual visual checks prioritize mobile score entry at 390 x 844, including no clipped pin grid, no page-level horizontal overflow, and reachable primary actions.
- Desktop scorecard readability is secondary and must not drive layout decisions that harm mobile.
- No backend routes, server APIs, or app data fetch calls are introduced.
- Relational bowling data lives in IndexedDB through Dexie only.

## Implementation Default
When execution is requested, first create `bowling-spec.md` exactly from this plan, then stop before Phase 1 application code until the user explicitly says `Execute Phase 1`.
