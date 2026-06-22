# Architecture decision log

Each entry: context, decision, consequences. New entries are appended at the
bottom. Never edit an accepted ADR — supersede it with a new one and link.

**Index:** ADR-001 standing-pins storage · ADR-002 snake_case wire format ·
ADR-003 backup merge-by-content · ADR-004 mobile-first 390×844 ·
ADR-005 stats definitions · ADR-006 inverted pin input ·
ADR-007 catalog data source · ADR-008 multi-weight + USBC discovery

---

## ADR-001 — Standing pins are the source of truth

**Status:** accepted (2026-05).

**Context.** Bowling scoring can be modeled by storing pinfall counts
(`shot_1_pinfall: 7`), pin masks (bitmask of knocked-down pins), or
standing-pin arrays (`shot_1_pins_standing: [7, 10]`). 10th-frame bonus shots
in particular need to know what was *racked* before a shot so we can compute
"pins cleared this shot" correctly.

**Decision.** Store the pins that remain standing after each shot. Strikes
become `[]`; gutter balls become the full rack.

**Consequences.**
- The user taps the pins they see still standing; storage matches input
  directly.
- Frame-level booleans (`is_strike`, `is_spare`) are derived, not authoritative.
  Backup validation re-derives them on import so a hand-edited JSON can't lie.
- Adding a "pin carry / message-board diagram" feature later is free: the data
  is already there.

---

## ADR-002 — `snake_case` on the wire, `camelCase` in the UI

**Status:** accepted (2026-05).

**Context.** TypeScript convention prefers camelCase fields, but Dexie stores
whatever you give it and JSON backups are user-visible. Mixing both inside a
single record would mean a translation layer at every read/write.

**Decision.** Persistent fields on `Session`, `Game`, `Frame` and the backup
JSON use snake_case. UI-only state (component props, hooks, local variables)
uses camelCase.

**Consequences.**
- Backups exported now are forward-compatible with any future export target
  (sqlite mirror, csv export, http sync).
- Repository return types are the same shape as DB rows — no mapping layer.
- Hand-written test fixtures don't need a key-rename helper.

---

## ADR-003 — Backup import merges by content key, never by id

**Status:** accepted (2026-05). Supersedes the prior "trust imported id"
implementation in `services/backupRepository.ts`.

**Context.** Auto-increment IDs from one device collide with auto-increment
IDs on another. The earlier implementation silently overwrote a local row
when the imported row carried the same `id` — even if the two were unrelated
sessions in different alleys on different days.

**Decision.** On import, match rows by content:
- Sessions match on `(date + alley_name)`.
- Games match on `(session_id + game_number)` after sessions are resolved.
- Frames match on `(game_id + frame_number)` after games are resolved.

Imported ids are never replayed. If no content match exists, the row is
inserted with a fresh local id.

**Consequences.**
- Reimporting a backup twice is idempotent.
- A user can merge a backup from another device without clobbering their own
  data, even with overlapping ids.
- Two sessions at the same alley on the same date are treated as one session.
  This is the right call in practice — bowlers don't usually start two
  separate-tracked sessions on the same day at the same house — but worth
  knowing if the rare "two leagues, same day, same house" case comes up.

---

## ADR-004 — Mobile-first at iPhone 390x844

**Status:** accepted (2026-05).

**Context.** The product is a bowler holding a phone at the alley. Anything
that requires a desktop browser to be usable is a failure.

**Decision.** Every screen must render and be operable at 390x844 with no
horizontal page overflow. Desktop and tablet layouts are bonus. When a
layout decision favors one or the other, mobile wins.

**Consequences.**
- The scorecard renders as a 5x2 grid on `<sm` and a 10-cell row on `sm+`.
- Navigation lives at the bottom of the viewport on mobile (thumb reach) and
  in the top bar on `sm+`.
- New views must be tested at 390x844 (see verification section in the spec).

---

## ADR-005 — Stats metric definitions

**Status:** accepted (2026-06).

**Context.** "Strike %" and "spare %" are ambiguous — they can be measured per
ball, per frame, or per opportunity, and the 10th frame carries up to three
fresh-rack balls. Averages can include or exclude unfinished games. Without a
written definition the numbers drift as the code changes.

**Decision.** `src/lib/stats.ts` computes:

- **Average score / high game** — over **completed** games only (`final_score`
  set). Unfinished games are excluded from both.
- **Strike %** = strike balls ÷ first-ball (fresh-rack) opportunities. Frames
  1–9 contribute one opportunity each. The 10th frame contributes one for
  ball 1, plus one for each later ball that lands on a fresh rack (i.e. after
  the previous ball cleared the lane). A "strike" is any fresh-rack ball that
  clears all ten.
- **Spare %** = spares made ÷ spare opportunities. An opportunity is a
  non-strike frame in which a second ball was thrown; it is "made" when that
  second ball clears what the first ball left. The 10th frame contributes a
  spare opportunity only when ball 1 was not a strike and ball 2 was thrown.
- Rates return `null` (rendered "—") when there are zero opportunities, never
  `0/0 → NaN`.

**Consequences.**
- A clean game of all strikes reads 100% strikes and `—` spares (no spare was
  ever attempted), which matches how bowlers talk about a game.
- The definitions live next to the code and are unit-tested in
  `stats.test.ts`; changing them requires updating this ADR (maintenance rule).

---

## ADR-006 — Inverted pin input (start down, tap to leave standing)

**Status:** accepted (2026-06).

**Context.** Most balls knock most pins down, so "tap the few left standing" is
fewer taps than "knock down the many." The stored representation (pins left
standing, ADR-001) is the same either way; only the input seed differs.

**Decision.** Each shot starts with no pins marked standing (`standingPins =
[]`); the bowler taps the pins that remain up. Recording with no taps is a
strike (shot 1) or spare (shot 2). This replaces the previous "start standing,
tap to knock down" model entirely — no settings toggle.

**Consequences.**
- `frameController` seeds `standingPins` to `[]` everywhere; `availablePins`
  keeps gating which pins are tappable.
- The persisted data and the scoring engine are unchanged (ADR-001 holds).
- One-time muscle-memory change for the existing user; acceptable per the
  replace-entirely decision.

---

## ADR-007 — Ball catalog: curated data source, append-only client sync

**Status:** accepted (2026-06).

**Context.** The ball catalog needs manufacturer specs (RG, Diff, coverstock,
core) for Storm, Roto Grip, 900 Global, and Motiv. The plan assumed scraping
the manufacturer sites, but all are bot-walled (Roto Grip + 900 Global redirect
into `stormbowling.com`, which sits behind reCAPTCHA; Motiv returns 403).
Automated scraping is infeasible and legally fraught.

**Decision.** Source the catalog from a hand-curated, source-cited data file
(`scripts/sync-catalog/data/balls.json`). A deterministic, network-free build
(`npm run sync-catalog`) normalizes/validates it into a static
`public/catalog/catalog.json` + manifest served by the Vercel CDN. The client
fetches it lazily on catalog-view open, hydrates IndexedDB, and runs all
search/filter offline. Client hydration is **append-only** (only new ids added).

**Consequences.**
- No server, no scraping, free hosting; the dataset is small and slow-changing.
- Coverstock strings lacking a solid/pearl/hybrid/urethane keyword are flagged
  for human classification, never guessed (e.g. Motiv "Turmoil MFS Solid").
- Updates are manual: edit the data file → `npm run sync-catalog` → open a PR.
- Append-only client means a corrected spec won't update an already-synced
  device until a future manual reconciliation/audit step exists.
- New read-only `ball_catalog` Dexie table (schema v5) plus optional
  `catalog_ref_id` / `catalog_snapshot` on `Ball` for arsenal quick-fill
  (non-indexed → no further version bump).

---

## ADR-008 — Multi-weight-capable schema + USBC discovery tooling

**Status:** accepted (2026-06).

**Context.** Ball specs (RG, Diff, MB Diff) vary by ball weight, but the catalog
initially stored only one set (the 15 lb numbers). Separately, deciding *which*
balls to add was ad hoc; the USBC publishes an authoritative approved-ball list
(a PDF) that can drive discovery deterministically.

**Decision.**
- Extend `CatalogBall` and the curated `RawBall` input with an optional
  `weights?: WeightSpec[]` (`{ weight, rg, diff, mbDiff }`). The top-level
  rg/diff/mbDiff stay as the 15 lb default (`DEFAULT_WEIGHT = 15`); `weights`
  is additive and omitted when absent, so existing sort/filter/display are
  unchanged. Per-weight rows are filled opportunistically, not backfilled.
- Add a deterministic USBC discovery script
  (`scripts/sync-catalog/usbc/parse-usbc.ts`, `npm run usbc-diff`): downloads
  the approved-ball PDF, extracts brand+name pairs from its text layer (no OCR,
  no LLM), whitelists the four brands, and diffs against `balls.json` to report
  missing balls. The PDF is cached under `tmp/` (gitignored).
- Codify the manual spec-gathering protocol as the `gather-ball-specs` skill
  (field schema, 2-source cross-check, never-invent-a-number, flag-don't-guess
  coverstock).

**Consequences.**
- The schema is multi-weight-ready with no data migration; UI can add a weight
  selector that falls back to the 15 lb default.
- USBC discovery is deterministic and token-free — it finds *candidates* but
  does not gather specs; that stays the curated, cited process.
- No Dexie change; the catalog is still rebuilt wholesale and client sync is
  unchanged (ADR-007 holds).

---

## ADR-009 — Colorways + deterministic PDF seeding pipeline

**Status:** accepted (2026-06).

**Context.** Gathering specs by LLM web search cost ~24k tokens and ~19 tool
calls per ball (measured: ~290k tokens for 20 balls, 8 of which failed) — too
expensive to scale the catalog. Separately, a ball ships in several **colorways**
that share one spec block (same core/coverstock), and the arsenal/detail UI wants
to let the user pick and see the colorway they own. ADR-007 ruled out scraping
manufacturer HTML (bot-walled), but Storm publishes spec data as **direct-CDN
PDFs with no auth** (per-ball tech sheets + full year catalogs).

**Decision.**
- **Colorway model (nested).** Add `Colorway { sku, color, imageThumb?, imageFull? }`
  and an optional `colorways?: Colorway[]` to `CatalogBall` and the curated
  `RawBall`; `colorways[0]` is the default. The arsenal `Ball` gains an optional
  `colorway_sku?` recording the user's chosen variant. All fields are non-indexed
  and optional — **no Dexie migration** (the catalog manifest hash changes, which
  re-syncs `ball_catalog` wholesale per ADR-007). Image fields stay null until the
  image pipeline (future) populates them.
- **Deterministic PDF seeding.** Parse official SPI PDFs into staging seed files
  (`scripts/sync-catalog/data/seed/`) for human review before merge into
  `balls.json` — never written directly. Three deterministic, no-LLM scripts share
  `catalog/parse-blocks.ts`: `parse-catalog` (year catalog → many balls, all three
  SPI brands), `parse-ball` (one tech-data PDF *or pasted text* → one ball), and
  `usbc-index` (approved-ball PDF → searchable `data/usbc-index.json`). Ball
  **name + brand are reconciled against the USBC index** (logo-derived ALL-CAPS
  names fuzzy-matched to canonical names); unresolved balls carry `_needsReview`.
  Codified as the `seed-catalog` skill. `gather-ball-specs` (ADR-008) remains the
  web fallback for balls with no PDF.

**Consequences.**
- Seeding a ball from a PDF costs ~0 model tokens (deterministic extraction; the
  PDF text is never loaded into a model context) vs ~24k via web search.
- Colorway *specs* are reliable; colorway *grouping* from the year catalog can
  bleed across a spec-block boundary (a ball's SKU/logo prints above its own
  table), so the staging-review step is mandatory before merge.
- One SPI catalog seeds Storm + Roto Grip + 900 Global; brand is resolved per
  ball, not assumed.
- UI (catalog row badge, detail-page swipe carousel, arsenal colorway picker) and
  the Storm-CDN image pipeline are follow-on work; the schema is ready for both.

---

## ADR-010 — Catalog sync: upsert-all + NetworkFirst (supersedes append-only)

**Status:** accepted (2026-06). Supersedes the append-only client-sync rule of ADR-007.

**Context.** ADR-007 made client catalog hydration **append-only** (insert ids not
already present) and cached `catalog.json`/`-manifest.json` with
**StaleWhileRevalidate**. In practice this stranded devices on stale data: a user
stayed on the original 12-ball catalog even after a 34-ball catalog deployed, and
in-app "refresh" did nothing. Root cause was a three-way interaction — SWR serves
a version-stale response, sync **gates on `version` before fetching** the data, and
append-only never updates existing rows — so the version setting could advance to
the new number while the actually-applied data was still the old cached file,
permanently skipping the real update. Append-only also meant corrected specs, new
colorways, and ball images (ADR-009) never reached already-synced devices.

**Decision.**
- **Upsert-all.** `syncCatalog` now `bulkPut`s every remote ball (read-only,
  server-authoritative, keyed by stable id), updating existing rows and inserting
  new ones, then deletes local ids absent from remote. The user's arsenal (`balls`
  table) is separate and untouched. No Dexie change.
- **NetworkFirst** (with `networkTimeoutSeconds: 5`, cache fallback) for
  `catalog.json` and `catalog-manifest.json`, replacing StaleWhileRevalidate, so an
  online client reads the *current* manifest/catalog and syncs a freshly deployed
  catalog on the first refresh. Images stay StaleWhileRevalidate.

**Consequences.**
- A new catalog version reaches online devices on the next open/refresh (the SW
  auto-updates via `registerType: "autoUpdate"`); offline devices still work from
  cache and reconcile when back online.
- Spec corrections, colorways, and images now propagate to existing devices — the
  ADR-007 limitation is resolved.
- Sync transfers the full catalog.json each version bump (small, slow-changing), an
  acceptable trade for correctness over the append-only diff.

---

## ADR-011 — Breakpoint distance + lane line visualizer

**Status:** accepted (2026-06).

**Context.** Lines were captured as board numbers only (stance/laydown/target/
breakpoint). There was no down-lane distance for the breakpoint, so the ball's
hook shape could not be drawn (see the prior TODO in `ActiveGameScorer`). Two
entry surfaces also diverged: score entry captured stance/target/breakpoint,
the spare form captured stance/laydown/target.

**Decision.**
- Add optional `breakpoint_distance` (feet from the foul line) to `LineSpec`,
  defaulting to 42 ft for drawing when unset. The path's foul-line start board
  is `laydown ?? stance` (matches `derivePinBoard`).
- Add `breakpoint` + `breakpoint_distance` inputs to the spare form so spares
  can describe a hook too.
- Render lines with a reusable `LaneVisualizer`: one flat SVG lane plane tilted
  via a CSS-3D `perspective() rotateX()` camera (continuous top-down⇄bowler-eye
  morph), read-only when angled, with 2D drag-handle editing only when snapped
  to top-down. Geometry lives in a pure, view-agnostic `laneGeometry.ts`.

**Consequences.**
- No Dexie bump and no backup migration: `breakpoint_distance` is optional and
  nested inside already-serialized `LineSpec` objects; `validateBackup` does not
  inspect `LineSpec` internals. Backup `version` stays 3.
- The hook uses a fixed 1-3 pocket board (17.5, mirrored for left-handers) and a
  quadratic bend through the breakpoint; it is an illustration, not a physics
  simulation (rev rate / axis tilt are not captured).
