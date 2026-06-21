# Changelog

User-visible changes. Newest at top. Follow [Keep a Changelog](https://keepachangelog.com).

## [Unreleased] — Catalog v3: colorways + PDF seeding (2026-06)

### Changed

- **Catalog rows show specs on mobile.** The compact spec line (coverstock category · core type · RG · Diff) is now always visible on every catalog row, not just on `sm:` and wider.

### Added

- **Colorway display.** Catalog rows with multiple colorways show a "N colors" badge; the ball-detail page has a swipeable colorway carousel with pagination dots and the color name; the add-to-arsenal dialog has a colorway picker that saves the chosen `colorway_sku` on the ball.
- **Catalog seeded from Storm 2025 catalog.** 11 colorway-bearing Storm balls merged in (e.g. Tropical Surge with 4 colorways), via the new PDF pipeline.
- **Colorways schema (ADR-009).** New `Colorway { sku, color, imageThumb?, imageFull? }` and optional `colorways?: Colorway[]` on `CatalogBall` + `RawBall`; optional `colorway_sku?` on `Ball`. All non-indexed — no Dexie bump. UI (catalog-row badge, detail-page swipe carousel, arsenal colorway picker) is follow-on.
- **Deterministic PDF seeding pipeline (ADR-009).** `npm run usbc-index` (USBC PDF → searchable `usbc-index.json`), `npm run parse-catalog` (SPI year catalog → staging seed file, all three brands), `npm run parse-ball` (one tech-data PDF or pasted text → staging seed file). Ball name + brand reconciled against the USBC index; unresolved balls flagged for review. Wrapped in the `seed-catalog` skill. Costs ~0 model tokens vs LLM web search.

## [Unreleased] — Catalog v2: UX overhaul (2026-06)

### Changed

- **Catalog as full-screen modal.** `CatalogView` now renders as a `fixed inset-0 z-50` overlay, covering the bottom nav bar on all screen sizes.
- **Row/list view.** Catalog ball grid replaced with a compact single-column row list (thumbnail · brand · name · specs) for faster scanning and numeric comparison.
- **Dual-range slider: single track with filled segment.** RG and Diff sliders now render one track with the selected range highlighted; values commit only on pointer/touch/key release to avoid excess re-renders.
- **"Add to my arsenal" fix.** Fixed broken dialog from detail view — the confirm dialog is now always mounted at the overlay root, reachable from both list and detail view.
- **Spec list styling.** `SpecItem` rows in the detail panel are now rendered as key/value rows with a subtle divider instead of bordered white boxes that looked like input fields.
- **Arsenal: catalog specs line.** Arsenal ball rows now show a compact specs line (coverstock category, core, RG, Diff) when a catalog snapshot is present.
- **Arsenal: icon-only "Browse catalog" button.** The text label is dropped; the `BookOpen` icon remains with an `aria-label`.
- **Arsenal: weight field.** Add/edit form gains a weight selector (10–16 lb, default 15). Weight is saved on `Ball` and used to select per-weight specs from the catalog when the ball is catalog-linked.

### Added

- **"Owned" badge in catalog.** Catalog rows for balls already in the user's arsenal display a small "Owned" badge.
- `weight?: number` optional field on `Ball` type (non-indexed; no Dexie schema bump).

### Removed

- Release Year filter facet removed from catalog filters.
- "View on manufacturer site" link removed from catalog detail panel.

## [Unreleased] — Catalog v2: multi-weight schema + USBC discovery (2026-06)

### Added

- **Multi-weight ball specs schema.** `CatalogBall` and `RawBall` gain an
  optional `weights?: WeightSpec[]` array for per-weight RG/diff/mbDiff. The
  existing top-level fields remain the 15 lb default; `weights` is omitted when
  absent. Backward-compatible — no UI or sort/filter changes required.
- **USBC discovery script** (`scripts/sync-catalog/usbc/parse-usbc.ts`).
  Downloads the USBC approved-ball PDF, extracts all brand+name pairs
  deterministically (text layer; no OCR), and diffs against `balls.json` using
  `normalizeName`. Run with `npm run usbc-diff`. PDF cached in `tmp/` (gitignored).
- **Gather-ball-specs skill** (`.claude/skills/gather-ball-specs/SKILL.md`).
  Codifies the 2-source search protocol, field definitions, multi-weight rule,
  and post-add verification steps for adding new balls to the catalog.
- `DEFAULT_WEIGHT = 15` constant exported from `src/types/catalog.ts`.
- ADR-008 (multi-weight schema + USBC discovery) in `docs/DECISIONS.md`.

## [Unreleased] — Roadmap features (2026-06)

### Added

- **Bowling ball catalog.** Searchable, filterable reference catalog of
  manufacturer balls (Storm, Roto Grip, 900 Global, Motiv) with specs
  (coverstock, core, RG, Diff, MB Diff). Served as a static JSON from the CDN,
  hydrated into IndexedDB on first open, then searched/filtered 100% offline.
  Reached from a Dashboard widget and Settings → Arsenal; "Add from catalog"
  snapshots a catalog ball's specs into your arsenal. Data is hand-curated and
  source-cited (`scripts/sync-catalog`, `npm run sync-catalog`); see ADR-007.

### Changed

- **Inverted pin input.** Each shot now starts with all pins down; tap the pins
  left standing. Recording with no taps is a strike/spare. Stored data and
  scoring are unchanged (see ADR-006).
- **Slide-to-select pins.** Drag across the pin deck to toggle several pins in
  one stroke. The first pin sets the stroke's mode (select or deselect); the
  rest follow it, so a single drag never both adds and removes. Pure mode-lock
  logic in `src/lib/pinGesture.ts`.
- **Edit previous frames.** Tap any frame on the scorecard to re-score it; the
  frame highlights, the pin grid re-captures its shots, and totals + completion
  recompute on save. Later frames keep their recorded shots. Cancel restores the
  pre-edit state.
- **Deploy docs + skill.** `docs/DEPLOYMENT.md` documents the build + deploy
  flow (`npm run build` → `vercel --prod`, zero config). A local `deploy` skill
  (`.claude/skills/deploy/`) runs the verify-then-ship gate.

### Added

- **PWA / installable offline app.** App is now installable to the home screen
  and boots with no network. `vite-plugin-pwa` (Workbox) precaches the app
  shell on install; the service worker auto-updates on next load after a new
  deploy. Manifest uses felt-700 theme color and a 🎳 icon set generated by
  `scripts/generate-icons.mjs` (`npm run icons` to regenerate). IndexedDB data
  is untouched by the cache layer. Design:
  `docs/superpowers/specs/2026-06-07-pwa-offline-design.md`.
- **Playwright smoke tests** (`e2e/`). Chromium-only, run against the dev
  server at 390×844. Covers: strike/spare/open scoring with running-total
  assertion, session persistence into history, and the export → wipe →
  import backup round-trip. Run with `npm run test:e2e`. Unit tests
  (`npm test`) remain Playwright-free via the vitest `e2e/` exclude.
- **GitHub Actions CI** (`.github/workflows/ci.yml`). Runs on push + PR to
  `main`: `npm ci` → unit tests → build (typecheck + bundle + PWA) →
  Playwright e2e. Uploads the Playwright report as an artifact on failure.
  README shows a status badge.
- **Per-game notes.** Each game gets an optional free-text note (ball, lane
  move, what worked). Edited in a collapsible field on the active session
  screen, saved on blur; shown under the game in History. New `notes?` field
  on `Game` — non-indexed, so no Dexie migration (see DATA_MODEL). Backup
  validation accepts it; old backups without it import unchanged.
- **Stats dashboard.** New "Stats" tab (5th) aggregating across all sessions:
  average score, high game, completed-game count, strike %, spare %, and a
  by-alley breakdown. Pure aggregation in `src/lib/stats.ts` (no schema
  change) over the existing session history; UI in `StatsView` + `Stats`.
  Metric definitions recorded in DECISIONS ADR-005. Bottom tab bar goes
  4→5 columns on mobile.

## [Unreleased] — Thermo-nuclear review (2026-05)

### Fixed

- 10th-frame strike + shot 2 saved no longer marks the game complete and
  silently blocks the required third shot. Mid-game reload now resumes the
  correct shot (regression test: `frameController.test.ts` "hydrates a
  partially-filled 10th frame requiring shot 3"). See ADR-001.
- Double-tapping **Add game** no longer creates two games with the same
  `game_number`. The read-then-add is wrapped in a Dexie `rw` transaction
  and the button is disabled while in-flight.
- Saving a frame no longer clears the status message or resets local scorer
  state. `ActiveGameScorer` keys its hydrate effect on `gameKey` only.
- All-gutter games (`final_score === 0`) can now advance to the next game.
- Backup import will not overwrite an unrelated local row when ids happen to
  collide. Merge now matches by content key (date + alley_name for sessions,
  session_id + game_number for games, game_id + frame_number for frames). See
  [DECISIONS.md ADR-003](./DECISIONS.md#adr-003--backup-import-merges-by-content-key-never-by-id).
- Backup validation now bounds `game_number <= 99` and `final_score in [0, 300]`.

### Changed (UI)

- Mobile-first redesign across all views; no horizontal page overflow at
  390×844. See [DECISIONS.md ADR-004](./DECISIONS.md#adr-004--mobile-first-at-iphone-390x844).
- Bottom tab-bar navigation on mobile (icon + label), top bar on `sm+`.
- Scorecard renders as a 5×2 grid of compact frame chips on `<sm`; falls back
  to the traditional 10-cell row on `sm+`.
- Pin grid drops the legend; "click pin to knock it down" is the model.
  Standing = outlined white, down = filled felt.
- `SessionForm` collapses oil pattern + notes behind a `<details>` disclosure.
- `ActiveGameScorer` no longer accepts six display props. Single `mode` prop.
- `ActiveSessionView` header compacts to back arrow + alley name + Add game.
- `BackupRestoreView` collapses to one card with two buttons + drop zone.
- `DashboardView` drops the marketing hero. Single H1 + form.
- `SessionHistory` becomes a clickable card list with inline score chips.

### Changed (internals)

- Pin helpers (`ALL_PINS`, `knockedDownCount`, `uniquePins`,
  `pinsClearedBetween`) moved to `src/lib/pins.ts`. `scoring.ts` and
  `scoreDisplay.ts` no longer carry their own slightly-divergent copies.
- Repository return types tightened to `Promise<number>`. `SaveFrameInput`
  collapsed to `Omit<Frame, "game_id">`.
- tsconfig now enforces `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`.

### Added

- `docs/` folder with ARCHITECTURE, DATA_MODEL, DECISIONS, CHANGELOG, ROADMAP.
- Tests: 10th-frame strike chain (shot 3), 10th-frame hydrate-partial,
  10th-frame hydrate-complete, content-matched import merge,
  scorecard mobile-width regression. 21 → 26 tests.

### Removed

- `bowling-spec.md` — content split into `docs/ARCHITECTURE.md` and
  `docs/ROADMAP.md`.
- Unused `lane.700` and `lane.900` Tailwind shades.
- Duplicate `overflow-x-hidden` on `<main>` (kept on `html`/`body` only).

---

## [0.1.0] — Phase 1–4 foundation (2026-05)

- **Phase 1 — Project Scaffolding & Dexie DB Setup.** Vite + React + TS +
  Tailwind + Dexie. Repository helpers, scoring helpers, unit tests.
- **Phase 2 — Interactive 10-Pin Input & Scoring Engine.** `PinGrid` triangle,
  frame controller state machine, traditional scorecard with X / `/` symbols
  and rolling totals.
- **Phase 3 — Session Management & Entry UI.** Dashboard with start-session
  form, active session view, sequential game creation, session history.
- **Phase 4 — Backup, Restore & Data Safety.** JSON export with download,
  import-from-file with validation, merge with the local DB.
