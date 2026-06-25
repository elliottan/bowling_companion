# Architecture decision log

Each entry: context, decision, consequences. New entries are appended at the
bottom. Never edit an accepted ADR — supersede it with a new one and link.

**Index:** ADR-001 standing-pins storage · ADR-002 snake_case wire format ·
ADR-003 backup merge-by-content · ADR-004 mobile-first 390×844 ·
ADR-005 stats definitions · ADR-006 inverted pin input ·
ADR-007 catalog data source · ADR-008 multi-weight + USBC discovery ·
ADR-016 baby splits + split-excluded spare rate · ADR-017 save-as-you-go + carry rules

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

## ADR-012 — Lane line model: skid → hook → roll, free final point

**Status:** accepted (2026-06). Refines ADR-011's drawing model.

**Context.** ADR-011 drew the line as one quadratic that *forced* the curve into
a fixed pocket while the breakpoint board floated independently of the skid —
producing physically nonsensical paths (a left-aimed skid snapping back to a
far-right breakpoint and then to the pocket). It also put the breakpoint marker
on the quad's control point, so the dot floated off the line.

**Decision.** Model a real shot as three phases and connect the control points
in down-lane order (no forced endpoint, so no impossible configuration):
- **Skid (straight):** `laydown ?? stance` (0 ft) → target (15 ft) → **hook-start**.
  The hook-start board is *derived* — it rides the laydown→target skid line; only
  its distance (`hook_start_distance`, ~30 ft default) is a free input.
- **Hook (smooth cubic):** hook-start → **breakpoint** apex. Breakpoint board
  (`breakpoint`) and distance (`breakpoint_distance`, ~42 ft) are both free; the
  cubic's end tangent matches the roll line so the join is smooth (the rounded
  transition the eye reads as the hook).
- **Roll (straight):** breakpoint → **final** (`final_board`, default pocket 17.5),
  a free board anywhere across the pin deck (gutter included). The breakpoint is a
  path vertex, so its marker is always on the line.
- Two new `LineSpec` fields: `hook_start_distance?`, `final_board?`.
- Editing is direct manipulation (each peg moves only its own DOF; everything else
  holds; distances clamp to keep down-lane order). Grabbing a peg snaps the camera
  to top-down; dragging empty background tilts.

**Consequences.**
- No Dexie bump / no backup migration: both new fields are optional and nested in
  `LineSpec`, which `validateBackup` does not inspect. Backup `version` stays 3.
- Still an illustration, not a physics sim (no rev rate / axis tilt); roll is
  approximated as straight.

## ADR-013 — Lane line v3: vertical-apex hook + recency-priority solver

**Status:** accepted (2026-06). Supersedes ADR-012's curve construction and
editing model; the three-phase framing (skid → hook → roll) is unchanged.

**Context.** ADR-012 left the breakpoint as a free apex whose cubic end-tangent
matched the *roll* heading. With the skid tangent driving the entry control
point, the curve bulged **right of the breakpoint** before recovering — the ball
appeared to "face further right" than its own trajectory, and the breakpoint was
not actually the rightmost point. The hook-start peg added a DOF users didn't
want, and there were no inputs for the laydown/target/breakpoint boards.

**Decision.**
- **Pegs:** four editable — laydown (board @ 0 ft), target (board; its down-lane
  distance snaps to the arrow chevron `arrowFeet`), breakpoint (board + distance,
  the apex), final (board @ 60 ft, default pocket 17.5, draggable). The
  **hook-start peg is removed**; `hook_start_distance` stays in `LineSpec` as a
  deprecated, unread optional field (no Dexie/backup change).
- **Curve:** straight skid `laydown → target`, then two C1-continuous cubics
  `target → breakpoint → final`. The first leaves the arrows along the skid
  heading (long handle, with `c1.x` clamped so it never crosses the apex) and
  arrives at the breakpoint with a **vertical tangent**; the second leaves
  vertical and eases into the roll heading. A vertical apex tangent makes the
  breakpoint the **strict rightmost** (RH) point by construction — the fix for
  the v2 overshoot.
- **Constraints** (hook side = higher board RH, lower LH): breakpoint on/hook-side
  of the skid line at its distance (can't go right of the aim, RH); breakpoint on
  the *anti*-hook side of `min(laydown, target)` (the **apex** rule — it can't sit
  past the aim, else it isn't the rightmost point and the curve bulges back);
  final on/hook-side of the breakpoint; feet ordered
  `0 < arrowFeet(target) < bpDist < 60`.
- **Recency-priority solver (`solveLine`).** The just-edited peg is *held*; on a
  violation the **least-recently-adjusted peg capable of fixing that rule** yields
  to its boundary, cascading to the next capable peg if it would leave the lane,
  and clamping the held peg only as a last resort. Final defaults to the pocket
  but yields to feasibility even when pinned. Typing an input runs the same
  solver as dragging the peg.
- **Target is a derived aim.** Like the pocket default, the target rides the
  `laydown → breakpoint` line (so the skid points straight at the breakpoint, no
  unnatural kink) *until the user drags it*, after which it's pinned (present in
  `recency`). Moving the laydown or breakpoint therefore re-aims the target. The
  derived board comes from a short fixed-point iteration (the arrows→breakpoint
  extrapolation amplifies the `arrowFeet(target)` self-reference).
- **Bowler view:** the tilt stage interpolates a translate+scale with the angle
  (identity at top-down → scales the whole lane up, centred, at the bowler
  angle). Inputs sit on the side in top-down and move to a **bottom bar** in the
  bowler view so the lane stays centred and fully visible.

**Consequences.**
- No Dexie bump / no backup migration: the line model gains no required fields.
- Solver-moved pegs are rounded to 2 dp (clean inputs, constraint kept exact);
  dragged/typed pegs snap to half-boards.
- Still an illustration, not a physics sim; the 5-phase real-shot feel is
  approximated by the two-cubic curvature profile, not modelled from ball motion.

## ADR-014 — Focal-line model + drawability solver

**Status:** accepted (2026-06). Replaces ADR-013's wall/apex solver and curve
construction; keeps the skid→hook→roll framing and the recency-priority idea.

**Context.** ADR-013 let the breakpoint sit anywhere on the hook side and forced a
vertical apex, so steep or left-aimed lines produced bulges (curve crossing back
the other way), kinks at the target, and finals that sat right of where a dead-
straight ball would end. The model had no single notion of "is this line even
drawable".

**Decision.** Introduce the **focal line** — `laydown→target` extended down the
lane (drawn as a dotted guide). The ball rides it on the skid and can only peel
off to one side (left for RH); it never crosses right of it. A line is *drawable*
iff (board space; hook side = higher board RH, lower LH):
- **focalBp** — breakpoint on/hook-side of the focal line at its distance.
- **apex/flex** — *only when the skid heads to the anti-hook side* (a rightward
  drift, RH): the breakpoint is the apex and must drift past the target by at
  least `minBreakpointDriftBoards` so the hook can leave the target *tangent to
  the skid* without kinking. Closer than that isn't drawable → it clamps. A
  left-heading skid has no rightward apex, so this is skipped.
- **focalPin** — final on/hook-side of the focal line at the pins (pulled to the
  gutter when the focal runs off the pin deck — "all the way left").
- **roll** — final on/hook-side of the breakpoint.

`solveLine` enforces these by yielding the least-recently-adjusted *capable* peg
(cascading, best-effort clamping to the gutter, clamping the held peg last —
"can't flex more → can't drag more"). The **laydown may loft off-lane** (board
>39 / <1); `boardToX(…, raw)` maps it past the edge. The curve is two cubics:
straight skid, then `target→breakpoint` leaving along the skid heading
(`CURVE_LEAD`) and arriving vertical at the apex, then `breakpoint→final`. The
flex constraint guarantees the first cubic stays tangent and monotonic (no
bulge). Dropped ADR-013's derived-aim target.

**Consequences.**
- No Dexie/backup change. The flex constraint couples the solver to `CURVE_LEAD`
  (the curve's lead handle) by design — they share the constant.
- Still an illustration: drawability is geometric (can a valid single hook be
  drawn), not a ball-motion sim.

## ADR-015 — Hook as board-of-distance `b(d)`: invariants by construction

**Status:** accepted (2026-06). Supersedes ADR-014's two-cubic curve and
recency-priority solver; keeps the focal line and the skid→hook→roll framing.

**Context.** ADR-014 drew the path as two free 2-D cubics, then ran an 8-pass
solver that *clamped* violations after the fact. Two structural problems remained:
the cubic could still bow ~1–2 boards to the anti-hook side of the focal line near
the apex (the breakpoint marker was legal but the drawn curve wasn't), and editing
one peg could yank the laydown/target it didn't own, snapping the breakpoint and
final to the gutter. Both are emergent properties a clamp-solver can't guarantee,
and on a cross-heading skid the curve could even reverse back toward the anti-hook
side — not real ball motion.

**Decision.** Model the path as **board as a function of down-lane distance**,
`b(d)` — a real shot is single-valued in distance — so monotonicity is controlled
directly instead of hoped for. `buildLinePath` builds a straight skid on the focal
line over `[0, arrowFeet(target)]`, then a **monotone cubic-Hermite** hook through
the knots `target → breakpoint → final`: it leaves the arrows tangent to the skid,
is flat at the apex (the breakpoint is the furthest point), and arrives ~straight
at the pins. **Fritsch–Carlson** slope limiting keeps every segment monotone, and
`b(d)` is clamped to the hook side of the focal line where the skid is an
out-and-back wall. So for the *drawn curve* (not just the pegs) both invariants
hold by construction:
- it never crosses to the anti-hook side of the focal line, and
- after the apex the board never reverses back toward the anti-hook side.

Curvature is gentle off the arrows, peaks at the breakpoint, and eases to
~straight into the pocket. Rendered as a finely-sampled polyline (the apex is a
sample, so the breakpoint marker sits on the line).

`solveLine` becomes a **single-pass dependent re-clamp**: the laydown and target
are the user's aim and are never moved; the breakpoint and final are dependent and
re-clamp to the nearest drawable spot. The breakpoint stays hook-side of the focal
and, on an out-and-back skid, must carry far enough *past* the aim — at least
`minDrift`, the Fritsch–Carlson monotonicity threshold — that the hook can leave the
arrows tangent to the (steeper-the-wider-the-aim) skid without a corner; the final
stays hook-side of both the breakpoint and the focal at the pins. So a wide/steep
aim **slides the breakpoint gutter-ward** (you can't drag the apex closer to the aim
than a smooth hook allows). No cascade, no recency, no `held`; the laydown may still
loft off-lane.

**Consequences.**
- No Dexie/backup change — `LineSpec` is unchanged. Dropped `CURVE_LEAD`, the old
  `minBreakpointDriftBoards` helper (the drift is now the FC threshold computed
  inline), the recency/`held` machinery, and the 8-pass loop.
- The breakpoint board you set is advisory on steep aims: it slides gutter-ward to
  the furthest apex a smooth, strictly-left hook can reach. A very wide cross-aim
  pins it to the gutter; the transition there is tight (physically a near-gutter
  launch) but no longer a hard corner.
- Invariants are regression-guarded by sampling the drawn curve in
  `laneGeometry.test.ts` / `solveLine.test.ts`. Still an illustration, not a
  ball-motion sim.

---

## ADR-016 — Baby splits + split-excluded spare rate

**Status:** accepted (2026-06).

**Context.** `isSplit` (the USBC geometric definition: head pin down, gap between
standing pins) was used for two distinct purposes: (a) the red circle on the
scorecard, and (b) deciding which leaves are "spare opportunities." These purposes
should be separated because a "baby split" — e.g. 2-7, 3-10, 5-6, 9-10 — is
still a drawable spare shot, while a wide split — e.g. 4-6, 7-9, 7-10, 8-10 —
is genuinely not. Grouping them together inflated the spare denominator with
frames where a spare was never realistic.

**Decision.**

- **`isSplit` is unchanged** — it remains the sole driver of the red circle in
  scoring. No UI or data change there.
- **`isBabySplit(standing)`** — new function in `src/lib/pins.ts`. A split is
  "baby" when all consecutive lateral board gaps (sorted by board position)
  are ≤ one pin-width (~12 boards). This covers the classic adjacent-pair leaves
  (5-6, 9-10, 7-8) and cross-row cases where no wide gap exists (3-10, 2-7).
  Examples classified as baby: 2-7, 3-10, 4-5, 5-6, 7-8, 9-10, 3-9-10.
  Examples classified as real (not baby): 4-6, 5-7, 7-9, 7-10, 8-10, big-four.
- **Spare rate** (`sparePct` in `calculateStats`) excludes real splits (i.e.
  `isSplit && !isBabySplit`) from **both** numerator and denominator. Baby
  splits and all other open leaves remain in. Applies to frames 1–9 and the
  10th frame's ball-2 spare opportunity.
- **Leave display** in `Stats.tsx`: baby splits are grouped in the "Spare rates"
  section (white card); the "Splits" section shows only real splits. The Spares
  bar adds a `subtitle="non-splits"` label beneath its row.

**Consequences.**
- The spare rate now reflects real picking ability, excluding frames where
  a spare was geometrically implausible.
- `isSplit` has no callers that need updating (scoring engine, scorecard UI
  all use it correctly for the red circle).
- The ONE_PIN_GAP constant (12 boards) is a pragmatic threshold; the physical
  pin spacing is ~11.25 boards. A gap just over that means two non-adjacent rows
  with nothing between them — a real split.

---

## ADR-017 — Save-as-you-go frame persistence + context-carry rules

**Status:** accepted (2026-06).

**Context.** The original scoring flow persisted a frame only when it was fully
complete (strike or both balls thrown). Mid-frame progress, the current live shot
draft (ball/line/notes before the pins are recorded), and in-game context (carry
line + ball to the next same-lane frame) were all lost when the user navigated
away or switched games. Additionally, the ball auto-select always defaulted to
the first ball in the list — ignoring recorded context.

**Decision.**

- **Persist every submitted shot immediately** (Phase 4a). `recordShot` now
  persists the current frame even when `submitShot` returns `savedFrame: null`
  (mid-frame, shot 1 of an open frame). It finds the in-progress frame in the
  new state's `frames` array by frame number and calls `onFrameComplete`.
- **Flush the live (unsubmitted) shot on navigate/unmount/page-hide** (Phase 4b).
  A `flushRef` captures the current live context every render. On game-key change
  (game switch) the effect cleanup fires the flush; `pagehide` and
  `visibilitychange` (tab background) fire it directly. The flush is skipped when:
  (a) a recorded shot is selected (edit mode), (b) the game is already complete,
  or (c) the pin deck is a fresh rack with no user interaction
  (`availablePins.length === 10 && liveSymbol === undefined`) — this avoids
  mistaking an un-bowled frame for a strike.
- **Ball/line/notes carry rules** (Phase 6) — in priority order:
  1. Shot 1 of any frame: carry from the most-recent earlier same-lane frame
     **in the current game** (`previousSameLaneFrame`), else from the most-recent
     same-lane frame in **previous games of the session** on the same physical
     lane (`previousGameSameLaneFrame`), else leave blank/unselected.
  2. True spare attempt (availablePins.length < 10): ball = spare ball if one is
     configured, else carry shot-1's ball. Line from session/global spare line.
  3. Fresh-rack bonus ball (10th after strike/spare): carry line + ball from the
     immediately preceding shot in the same frame.
  4. No same-lane match (new game, different lanes) → ball starts unselected.
     The hardcoded "first ball in list" auto-pick is removed.

**Consequences.**
- Data loss on tab-close or game-switch is eliminated for any shot that has had
  pin interaction.
- `buildLiveFrame` (new pure export in `frameController.ts`) applies the current
  live shot to produce a Frame without advancing state — reused by the flush.
- `previousGameSameLaneFrame` (new export in `lanes.ts`) looks backward through
  `previousGames` (oldest→newest) for the latest frame on the same physical lane.
- `ActiveGameScorer` gains a `previousGames` prop (default `[]`);
  `ActiveSessionView` populates it with all earlier games in the session.

