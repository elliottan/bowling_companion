# Architecture decision log

Each entry: context, decision, consequences. New entries are appended at the
bottom. Never edit an accepted ADR — supersede it with a new one and link.

**Index:** ADR-001 standing-pins storage · ADR-002 snake_case wire format ·
ADR-003 backup merge-by-content · ADR-004 mobile-first 390×844 ·
ADR-005 stats definitions · ADR-006 inverted pin input ·
ADR-007 catalog data source · ADR-008 multi-weight + USBC discovery ·
ADR-016 baby splits + split-excluded spare rate · ADR-017 save-as-you-go + carry rules ·
ADR-030 drift model: stance-zone drift + constant release offset

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


---

## ADR-018 — Spare aim model, hook-strength curve, configurable depth, proportioned deck

**Status:** accepted (2026-06).

**Context.** Spare lines reused the strike-line model (laydown/target/breakpoint
+ breakpoint distance) and a final point hardcoded to the pocket at 60 ft. That
was wrong for spares: a spare ball isn't a breakpoint hook, the "best place to
hit" depends on the leave, and back-row pins sit deeper than 60 ft. The pin deck
also rendered as a flat smear — the real deck spans only ~2.6 ft, which the lane's
length compression squeezed into a sliver at the top edge.

**Decision.**

- **Derived aim point per leave** (`src/lib/spareAim.ts`, `spareAimPoint`):
  - Single pin → that pin's centre.
  - Connected cluster → midpoint of the front pin **P1** (min feet) and **P2**,
    the frontmost pin laterally connected to P1 (board gap ≤ 11.5); on a tie the
    neighbour toward the pocket/centre. e.g. 3-6-10 → mid(3,6); 2-4-5 → mid(2,5).
  - Split (front two not connected) → **slide-across**: clip the front pin on the
    side away from the other so it slides into it. Offset board =
    `(R_BALL + R_PIN) · sin θ`, where θ is the clip→other angle off the down-lane
    axis in **real feet**. One formula reproduces the intuitive groupings —
    same-row split (θ=90°) ≈ 6.4 boards; 4-10 ≈ 6.1; 2-10 ≈ 4.9.
  - Sleepers (a pin stacked directly behind, e.g. 2-8, 3-9) → front-pin centre
    for now (future: strike-ball adjustment).
- **Configurable final depth** — new `LineSpec.final_distance` (feet).
  `buildLinePath` draws the final at `feetToY(final_distance ?? 60)`. The spare
  visualizer seeds `final_board`/`final_distance` from `spareAimPoint(leave)`
  only when unset; dragging the Final handle / editing the field overrides.
- **Spare ball path is a fixed smooth curve, not a breakpoint** — for a spare
  (`buildLinePath(..., spareCurve=true)`, driven by the presence of a `leave`) the
  skid stays straight (laydown→target) and the target→final segment is a quadratic
  bézier bowing toward the hook side by a fixed `SPARE_BOW`. The focal line is the
  perfectly-straight reference; the ball path curves off it. Endpoints stay exact
  real points; only the path between is stylized. There is no hook-strength rating
  — the curve shape is constant. The strike line keeps the breakpoint cubic, and
  the no-breakpoint strike path stays straight (`spareCurve=false`).
- **Breakpoint removed from the spare UI** — the spare dialog no longer edits
  breakpoint/breakpoint distance and the spare card no longer shows them. Existing
  breakpoint data on stored spare lines is left **dormant** (never read in spare
  mode); no DB migration.
- **Score-entry hides the breakpoint field** when a configured spare line
  auto-populated the intended line (a 2nd-ball attempt on a leave with a saved
  spare line). Strikes and unconfigured-leave spares keep the field.
- **Proportioned pin deck** — `feetToY`/`yToFeet` gain a knot at the head pin
  (60 ft): the lane below maps linearly, the deck above expands into a tall band,
  so the deck draws as a real, legible 4-3-2-1 triangle. The mapping is monotonic
  and continuous, so the ball path still lands on the pins and the aim math (in
  real feet) is untouched — only the rendering is rescaled. Pins render
  back-to-front (overlap reads as depth); the standing leave reads bright, the
  rest ghost out. Applies to both the strike-line and spare visualizers.

**Consequences.**
- `LineSpec` gains `final_distance` (optional, backward-compatible). Spare lines
  carry no breakpoint or hook rating — the curve is implicit and fixed.
- The deck knot reshapes the vertical projection globally; round-trip and
  endpoint geometry tests are unaffected (the remap is monotonic, endpoints
  preserved). `DRAW_BACK_FEET` is 64 (was 63) for deck headroom.
- `spareAimPoint` is the single source for "best place to make the spare",
  shared by the visualizer's final seeding.

## ADR-019 — Spare ball path: skid → quadratic hook → roll, amount forced by the pin

**Status:** accepted (2026-06). Supersedes the spare-curve portion of ADR-018
(the fixed `SPARE_BOW` quadratic); the aim-point, configurable depth, dormant
breakpoint, and pin-deck decisions of ADR-018 still stand.

**Context.** The ADR-018 spare curve was a fixed-size bézier whose control point
sat at the chord midpoint plus a constant bow. It had three visible failures:
its control could fall outside the endpoints → the path reversed direction (an
S); it read only target/final, so moving the laydown didn't change the curve;
and it always bowed hook-side even when the pin was unreachable. The focal guide
was also drawn as a 2-point `<line>` spanning the 60 ft deck knee, so it rendered
as a chord that diverged from the true straight-in-board line below the knee
(the skid looked offset from its own focal).

**Decision.** The spare ball path is three phases, expressed as one
`board(ft)` function sampled uniformly down-lane (so it renders smoothly through
the `feetToY` knee):
- **Skid** — straight on the focal until `HOOK_START_FT` (*how early it hooks*).
- **Hook** — one quadratic bézier over `HOOK_LENGTH_FT` (*how long it hooks*),
  with the control point placed **on the focal at the span midpoint**. The
  midpoint placement makes feet linear in the bézier parameter and leaves no free
  "sharpness" knob — angularity is *emergent* from how-early + how-long + the pin.
- **Roll** — straight from the hook's end into the pin.
Both joins are tangent-continuous (no kink). The **amount** of hook is not a
parameter: it is forced by the pin board (the ball must recover exactly the
focal→pin gap). `HOOK_START_FT`/`HOOK_LENGTH_FT` are hardcoded for now and will
become tweakable later; a future breakpoint can be a *derived output* of this
curve, not an input.

**Invariants by construction (not clamped).** The skid and the bézier control
sit on the focal; the pin sits hook-side. Every path point is therefore a convex
blend of on-focal and hook-side points, so the path **can never cross to the
gutter side of the focal** and **never reverts its turn** (at most one apex —
out then back). This is the spare analogue of ADR-015 and is the model the strike
line will adopt next.

**Unreachable leaves.** If the pin is on the gutter side of the focal at the pin
distance (`dir·(finalBoard − focalLanding) ≤ 0`), no leftward hook can reach it:
the ball rides the focal dead-straight off the back of the lane, and the leave
pin renders **red** when the straight ball ends more than a ball+pin radius
(`BALL_PIN_BOARDS`) off it (within that radius it still clips the pin).

**Consequences.**
- `SPARE_BOW` removed; `HOOK_START_FT`, `HOOK_LENGTH_FT`, `BALL_PIN_BOARDS`
  added. `LinePath` gains `miss: boolean`.
- `LinePath.focal` is now a sampled path string (kinked at the 60 ft knee), not
  endpoint points; `LaneSurface` renders it as a `<path>`. Fixes the skid/focal
  offset.
- Drawn-curve invariants are covered by tests in `laneGeometry.test.ts`
  (skid-on-focal, never-right + unimodal + ends-at-pin, unreachable-off-the-back
  + miss, laydown responsiveness).

## ADR-020 — Linear vertical mapping; pin deck is a decorative rack

**Status:** accepted (2026-06). Supersedes the deck-knee portion of ADR-018.

**Context.** ADR-018 gave `feetToY` a knot at the head pin (60 ft): the lane below
mapped linearly, the deck above expanded into a tall band so the pins didn't
smear. But that knot is a *bend in the vertical mapping*, so every line that is
straight in real lane space — the focal especially, and the spare roll — rendered
with a **kink at 60 ft** (worse under the bowler-view perspective). A straight
ball line that visibly bends is wrong; straight-line fidelity wins over a
perfectly-scaled deck.

**Decision.**
- **`feetToY`/`yToFeet` are linear** across the whole extent
  `[DRAW_FRONT_FEET, DRAW_BACK_FEET] → [PLANE_L, 0]`. Every real-straight line now
  draws straight; the focal is a single 2-point segment. This is the load-bearing
  fix — it also benefits the strike line.
- **The pin deck is a decorative rack** (`LaneSurface`), decoupled from `feetToY`.
  Pin **columns** stay at the real (hand-mirrored) board, so the ball path lands
  in the correct pin's column; pin **rows** are spread on their own fixed vertical
  scale (`RACK_ROW_DY`), anchored at the head-pin row, instead of their true
  (now-thin) 2.6 ft depth. "Render for appeal, keep the line math straight."

**Consequences.**
- The `DECK_KNEE_FT`/`DECK_KNEE_Y` knot and its piecewise `feetToY` are gone;
  feet↔y round-trip and endpoint tests are unaffected (still monotonic, endpoints
  preserved) and a new test asserts linearity (midpoint maps to midpoint).
- Trade-off: because the deck is no longer expanded into the line space, a deep
  spare's ball tip can sit a few plane-units short of the spread back-row glyph —
  it stays in the right column, so it still reads as aiming at that pin.
- The pin rack is smaller/tighter than the ADR-018 expanded deck; bowler-view
  scaling restores most of the presence. Rack size (`RACK_ROW_DY`) is a pure
  visual tune.

## ADR-021 — Strike line: skid → hook → roll with a breakpoint apex

**Status:** accepted (2026-06). Supersedes the two-cubic strike construction of
ADR-013/ADR-015 (which predated the linear mapping). The focal-wall and
drawability-solver invariants of ADR-014/ADR-015 are retained.

**Context.** The spare line (ADR-019/ADR-020) was rebuilt as a clean straight
skid → smooth hook → straight roll on a linear vertical mapping, with all the
"never right of the focal / one apex / no kink" guarantees. The strike line still
used the older two-cubic-Hermite construction and an eased (non-straight) tail. We
want the same clean model for the strike, **plus** a user-controlled breakpoint
(board + distance) — the spare has no breakpoint, the strike does.

**Decision (resolved with the human in a grill session).**
- **Focal = laydown→target** (as before); the breakpoint board + distance stay
  independent user inputs.
- **The breakpoint is the apex** — the single furthest-out point, drawn with a
  **flat tangent** (db/dist = 0). It must sit on/left of the focal; `solveLine`
  clamps it onto the focal if dragged right of it (kept — it's a constraint).
- **Four phases**, one `board(ft)` sampled (linear `feetToY`):
  1. **skid** — straight on the focal to the arrows.
  2. **hook-out** — cubic Hermite leaving the arrows tangent to the skid
     (Fritsch–Carlson-limited, monotone) into the breakpoint with a flat tangent.
  3. **hook-in** — quadratic from the breakpoint (flat tangent) to the roll start,
     control on the breakpoint's vertical at the span midpoint (the spare's
     construction, mirrored about the breakpoint instead of the focal).
  4. **roll** — straight into the final/pocket.
- **Hook-start is the arrows, not a distance past them.** A skid that runs past
  the arrows cannot absorb a steep focal into a flat apex without a corner (the
  hook-out gets too short), so the strike hooks from the arrows — the tangent
  leave still looks straight there. (`STRIKE_ROLL_START_FT` ≈ 54 ft is hardcoded
  for the roll, clamped between the breakpoint and the final; tweakable later.)

**Invariants (kept):** never crosses to the anti-hook side of the focal — clamped
**always**, for every aim including inside lines whose focal already heads
hook-side (the earlier "wall only on an out-and-back" exemption was a bug: it let
the hook bulge gutter-side of the focal); one apex at the breakpoint (flat tangent
→ strict furthest point); tangent-smooth joins (max turn < 8°, tested); straight
skid + straight roll; linear mapping.

**Guttering aims.** When the focal runs off the lane (a steep inside aim), the
breakpoint/final the user set may be unreachable (anti-hook of the focal). Rather
than draw an impossible line, the dependent pegs **cap at the lane edge** (the
furthest on-lane point, via `clLane`) and the drawn ball is clamped to the lane
[1, 39] — it rides the edge instead of flying off-screen. Keeping everything on the
lane means the peg handles stay reachable (an off-lane peg's handle renders past
the edge and can't be grabbed back).

**Consequences.**
- `STRIKE_ROLL_START_FT` added; the strike branch of `buildLinePath` rewritten;
  `solveLine` unchanged (breakpoint/final clamps still apply).
- A new test asserts the straight roll tail; the existing no-kink, rightmost-apex,
  passes-through-every-peg and focal-monotonicity tests stay green.

## ADR-022 — Strike line = the spare curve; breakpoint is the derived rightmost point

**Status:** accepted (2026-07). Supersedes ADR-021's construction (breakpoint as a
flat-tangent apex input). Keeps ADR-020 (linear mapping) and the spare curve
(ADR-019).

**Context.** ADR-021 made the breakpoint a user-set flat-tangent apex with a
Fritsch–Carlson hook-out. When the breakpoint sat off the laydown→target line
(e.g. inside-of-target), the hook-out had to leave the skid heading one way and
flatten at the breakpoint heading another — producing an **S** (the curve went
right, then left, on the same target→breakpoint segment). A straight ball cannot
do that. The breakpoint-as-shaping-input was the root cause.

**Decision.** The strike line uses the **exact same curve as the spare**
(skid on the focal → one quadratic hook, control on the focal at the span midpoint
→ straight roll; unreachable finals ride the focal). It is monotone by
construction — never crosses to the anti-hook side of the focal, never reverts, no
S, no kink. The **breakpoint is derived**: the furthest-out (rightmost RH / leftmost
LH) point of that curve, surfaced as a read-only marker + readout (board · distance).
It is no longer a shaping input and has no drag handle. The strike curve is capped
to the lane [1, 39] (rides the edge if it would gutter) so handles stay reachable;
the spare may still run off the back. A strike line is distinguished from a bare
straight line by carrying a (now nominal) `breakpoint` value.

**Consequences.**
- `buildLinePath` shares one curve for spare + strike; the ADR-021 Hermite/flat-apex
  branch and `STRIKE_ROLL_START_FT` are removed.
- `LaneVisualizer` shows the breakpoint as read-only `ReadField`s (no Bkpt drag
  handle); `LaneSurface` labels the breakpoint marker from the derived point.
- `solveLine`'s breakpoint clamps are now moot for the shape (kept harmlessly; the
  stored value only flags strike mode). Hook timing is still the spare's hardcoded
  `HOOK_START_FT` / `HOOK_LENGTH_FT`; a line that crosses too much for that fixed
  hook gutters (rides the edge), which is physically correct.

## ADR-023 — Strike line: one smooth quadratic target→final (control pulled onto the lane)

**Status:** accepted (2026-07). Refines ADR-022 (strike shares the spare curve).
The spare (ADR-019) is unchanged.

**Context.** ADR-022 had the strike reuse the spare's "straight skid to
`HOOK_START_FT` (38 ft) then hook" curve. On a big cross (e.g. laydown 37.5 →
target 19) the focal runs off the lane well before 38 ft, so the skid rode the
ball into the gutter and the lane-cap produced a hard corner at the edge — not a
smooth curve.

**Decision.** The strike is now **one quadratic Bézier from the target to the
final**. Its control point sits on the focal at the midpoint of `[arrows, final]`,
but is **pulled nearer** (in) if the focal there would be off the lane — clamped to
where the focal meets the lane edge. Because the target and control sit on the
focal and the final is hook-side, the curve is a convex blend of on-focal +
hook-side points: it is tangent to the skid at the target, never crosses to the
anti-hook side of the focal, never reverts (no S, no kink), and stays on the lane —
so the breakpoint (its derived furthest-out point) simply **comes nearer** on a big
cross instead of guttering and cornering. Unreachable finals (final gutter-side of
the focal) ride the focal as a **straight** line (smooth; may run off the lane =
guttering), with the pegs kept on the lane so their handles stay reachable.

**Consequences.**
- The strike no longer uses `HOOK_START_FT`/`HOOK_LENGTH_FT` or a straight-roll
  phase (those remain the spare's). The breakpoint stays derived (ADR-022): the
  read-only rightmost point.
- Hook amount/shape is implicit in the geometry (laydown, target, final); no hook
  strength knob yet. A future tweak could expose the control distance as "how far
  out / how early the breakpoint."

## ADR-024 — Breakpoint is a 1-DOF rail; auto-hook; per-line spare hook timing

**Status:** accepted (2026-07). Refines ADR-023 (strike = one quadratic) and
ADR-019 (spare curve). Keeps ADR-020 (linear mapping) and every focal-wall /
no-S / no-kink invariant.

**Context.** ADR-023 left the strike shape fully implicit (laydown/target/final)
with a read-only breakpoint and no way to add or tune hook in the visualizer; the
spare's hook timing was hardcoded. The visualizer's interaction layer also had
real bugs: drags were mapped linearly across the SVG element and so ignored the
`preserveAspectRatio` letterboxing (handles couldn't reach the lane edges and
didn't track the finger); numeric fields clamped on every keystroke (untypeable);
grabbing a handle snapped the camera flat and never restored it; the spare Final
handle wrote only board, never depth. Resolved with the human in a grill session.

**Decision.**
- **The breakpoint is a 1-DOF rail, and it is draggable again.** The one free
  shape parameter of the ADR-023 strike quadratic is its control's down-lane
  distance `cDist` (the control always rides the focal). `breakpoint_distance`
  stores the apex *depth* and drives the rail; the drawn apex board is written
  back by `solveLine` (`strikeApexPoint`) so **the stored breakpoint always equals
  what's drawn**. Dragging the breakpoint **projects** the finger onto the
  achievable apex arc (`projectBreakpoint`) — an impossible 2-D apex can never be
  requested, so no S / no kink can ever appear (same "invariants by construction"
  philosophy as ADR-015/019). A "Breakpoint distance" slider is the numeric twin
  of the drag.
- **Auto-hook.** Every non-spare line curves now; a straight line is just the
  degenerate case where the final sits on the focal. `buildLinePath` no longer
  gates the strike curve on a non-null `breakpoint`.
- **Per-line spare hook timing.** `hook_start_distance` (how early the ball leaves
  the skid) and a new `hook_length` (how long the hook takes) are read off the
  `LineSpec` in the spare branch, defaulting to `HOOK_START_FT`/`HOOK_LENGTH_FT`;
  exposed as two sliders in spare mode. The hook *amount* is still forced by the
  pin (ADR-019) — only the timing is tunable.
- **Interaction fixes.** Drags map through the SVG's `getScreenCTM().inverse()`
  (letterbox-correct). Numeric fields became −/+ steppers that commit typing on
  blur/Enter. Grabbing a handle snaps flat then **restores the prior tilt** on
  release. The spare Final handle writes `final_distance` as well as board.

**Consequences.**
- New `LineSpec.hook_length`. `laneGeometry` gains `strikeApexPoint` +
  `projectBreakpoint` (exported) and internal rail helpers (`strikeCDist`,
  `sampledApex`, `solveCDist`); the ADR-021 breakpoint-clamp block in `solveLine`
  is replaced by the apex write-back (the final clamp stays).
- The visualizer shows the breakpoint as a draggable violet rail node with a
  read-only board·ft readout; a "⋯" options sheet holds the sliders; a replay
  button re-runs the ball animation (also re-runs after an edit settles).
- Visual pass (render-only, math unchanged): a labelled board ruler at the foul
  line, distinct per-peg colours with dodged labels, gutter shadows, and a
  refined wood/oil gradient.
- Tests asserting the old breakpoint-as-clamped-input behaviour were updated to
  the derived-apex contract; drawability/monotonicity/no-corner invariants stay.

## ADR-025 — Late-hook rail (focal ride + peel), deepest-tie breakpoint, sticky top-down

**Status:** accepted (2026-07). Refines ADR-023 (one quadratic) and ADR-024
(1-DOF rail). Keeps every focal-wall / no-S / no-kink invariant. Spare (ADR-019)
unchanged.

**Context.** Three sandbox reports. (1) The rail was capped where the *control*
(riding the focal) exits the lane — but a quadratic never touches its control,
so the drawn apex stranded far inside the cap (laydown 19 → target 14 → final
17: apex board 8.2 with the focal at 4.4; removing the cap alone only reached
6.9 — the single target→final quadratic saturates). (2) With laydown == target
the whole skid ties on one board and the strict apex scan broke the tie to the
foul line — the breakpoint marker sat *below the target*. (3) Releasing a handle
restored the pre-grab tilt, forcing a re-tilt round-trip between every edit.

**Decision.**
- **Peel.** The strike is a straight focal ride target→peel plus ONE quadratic
  peel→final, control on the focal at `cDist` (still the only rail parameter).
  The peel trails the control by the hook half-span: `dS = max(tgtFt, 2·cDist −
  fF)`. Low `cDist` (through the default midpoint) gives `dS = tgtFt` — exactly
  the ADR-023 curve, so existing lines render identically. High `cDist` rides
  the focal deep, then hooks short and sharp: the apex now sweeps out to the
  lane edge. Invariants by construction: peel and control on the focal ⇒ C¹
  junction and a convex on-focal/hook-side blend (no S, no kink, never
  anti-hook of the focal); `dS ≤ cDist ≤ fF` ⇒ depth monotone.
- **Apex-edge cap.** The rail ends where the *drawn apex* reaches the lane edge
  (bisection over `cDist`), not where the control does. The control may sit
  off-lane; it is invisible.
- **Deepest tie-break.** The apex scan prefers the deepest point on a board tie
  (ε = 1e-6), in the curve scan and the unreachable-final focal ride alike. On
  a one-board focal the breakpoint sits at/past the target and the rail slides
  the peel down the board.
- **Sticky top-down.** Releasing a handle no longer restores the pre-grab tilt
  (supersedes that ADR-024 interaction point) — edits rarely land in one try.
  The initial bowler view and the view toggle are unchanged.

**Consequences.**
- `strikeGeom` becomes the single sampler shared by the apex scan and the drawn
  path (stored == drawn preserved); `strikeCDistRange` bisects the apex-edge
  cap; `buildStrike` renders the samples.
- `LaneVisualizer` drops the `preGrabDeg` restore.

## ADR-026 — One hook model: per-line timing for strike + spare, magnetic breakpoint drag

**Status:** accepted (2026-07). Supersedes the ADR-023/024/025 strike rail
(single quadratic + cDist). Keeps ADR-019's curve shape and every focal-wall /
no-S / no-kink invariant. ADR-020 (linear mapping) unchanged.

**Context.** Strike and spare exposed different shape controls — a "Breakpoint
distance" rail for strikes, hook start/length sliders for spares — for what is
physically the same event (skid, hook, roll). The human wanted one mental model:
hook earliness + hook length everywhere, with the strike still surfacing its
breakpoint. Separately, a reachable strike with a lofted (off-lane) laydown drew
its derived breakpoint off the visible plane (the raw furthest-out point is the
laydown), leaving an unreachable handle.

**Decision.**
- **Unified curve.** Both modes draw the ADR-019 construction — straight skid on
  the focal to `hook_start_distance`, one quadratic over `hook_length` (control
  on the focal at the span midpoint), straight roll into the final. The hook
  *amount* stays forced by the final; only the timing is tunable. The strike
  additionally shrinks the hook start (bisection) until the drawn apex stays
  on-lane — the ADR-022→023 gutter failure was the *fixed* 38 ft start, and a
  dynamic clamp removes it; the spare keeps its run-off/miss semantics.
- **Breakpoint derived everywhere, draggable everywhere.** Furthest-out point,
  deepest on ties, board-clamped to [1,39] (fixes the lofted-laydown off-plane
  marker). `breakpoint`/`breakpoint_distance` are write-back outputs only
  (stored == drawn); a non-null `breakpoint` still flags strike mode.
- **Magnetic drag.** Dragging the marker solves BOTH timing params (coarse grid
  + pattern search) so the apex lands nearest the finger within the achievable
  region — 2 params ↔ 2-D finger = well-posed; impossible apexes cannot be
  requested, so no S / no kink, by construction (ADR-015/019 philosophy).
- **Lazy migration.** A strike line with `breakpoint_distance` but no hook
  params renders by solving the hook start (default length) to reproduce the
  stored apex depth; `solveLine` persists the solved timing on first edit and
  always materialises the effective (clamped) params, so sliders show reality.
  Lines with no stored shape get the defaults (38 ft / 14 ft) — the default
  strike look intentionally changes from one long arc to skid→late hook.

**Consequences.**
- `laneGeometry`: `hookGeom`/`hookGeomRaw` replace `strikeGeom`, `sampledApex`,
  `solveCDist`, `strikeCDist`, `strikeCDistRange`, `buildStrike`;
  `projectBreakpoint` returns hook timing; `strikeApexPoint` returns effective
  timing for the write-back.
- `LaneVisualizer`: one slider pair for both modes ("Breakpoint distance" slider
  removed); the breakpoint handle exists in spare mode; drags write
  `hook_start_distance`/`hook_length`.
- Unreachable finals now surface the deep-end breakpoint marker in spare mode
  too (was strike-only).

## ADR-027 — Aim cascade: a walled breakpoint drag rotates the least-recent aim peg

**Status:** accepted (2026-07). Extends ADR-026 (magnetic drag). Narrows
ADR-015's "no cascade onto the laydown/target" rule to the solver: the DRAG
layer may now rotate one aim peg; `solveLine` still never does.

**Context.** The ADR-026 magnetic drag tunes hook timing only, and the focal
wall (ADR-014) confines every achievable apex to a narrow band along the
laydown→target line. Dragging the breakpoint inward — "play a straighter
line" — pinned at that band and felt like resistance. The human's intent for
such a drag is an aim change, not a timing change.

**Decision.**
- **Two-stage drag.** Stage 1: the ADR-026 timing solve (searches the whole
  timing region — at the wall, timing is exhausted by construction, so it is
  never a give-way candidate). Stage 2: past the band (~0.6 board residual),
  rotate ONE aim peg so the focal passes through the finger — but *blended in
  continuously*: the rotation eases from 0 to full over a residual ramp (a
  hard accept/reject gate popped the marker ~0.8 board at the exact frame the
  cascade first engaged). The rotated solve is kept only if it beats the
  un-rotated one (min-cost), and the rotation is clamped at two physical walls
  instead of bailing: it never rotates the line past straight (an inverted aim
  flips the apex to the laydown — marker teleport), and it never rotates the
  final onto the wrong side of the focal (unreachable). Depth-walled fingers
  (past the pins, shallower than the arrows) gain little from rotation, so the
  aim barely moves.
- **Give-way = least-recently-touched of {laydown, target}.** Just aimed at an
  arrow → the feet slide (keep target, move feet); just set the feet → the
  eyes move. Only direct edits (that peg's drag or stepper) update recency; a
  cascade move does not (pegs would alternate per gesture). The choice freezes
  at grab. Fresh line: target gives way (pivot at the feet).
- **Both modes.** Strike and spare share the one code path; the spare's seeded
  aim is a suggestion, not a lock. No extra visual affordance — the moving peg
  and focal line are the feedback.

**Consequences.**
- `projectBreakpoint` gains an optional `giveWay` parameter and may return a
  rotated `target`/`laydown`; the 4-arg form is unchanged (no cascade).
- The engagement continuity, the no-inversion clamp, and the cascade round-trip
  (returned aim + timing reproduce the drawn apex) are pinned by tests.
- `LaneVisualizer` tracks aim-edit recency in refs (UI state only — nothing
  persisted) and freezes the give-way peg per gesture.

## ADR-028 — Honest line geometry: derived laydown, real-only breakpoint, hard peg locks

**Status:** accepted (2026-07). Extends ADR-024/026 (derived breakpoint) and
ADR-027 (give-way cascade); adds the first per-user tuning setting
(`laydown_offset`).

**Context.** Four honesty gaps in the line UI: (1) the drawn line started at
the *stance* board, but a real ball touches down ~half a dozen boards inside
the slide foot — the visualized line was wrong by that much for everyone;
(2) the derived breakpoint could render at the foul line ("Bkpt 20·0ft") —
the apex scan seeded at the laydown and the unreachable-final branch returned
0 ft; (3) a big spare hook drew off the lane and off the screen (only strikes
had the on-lane cap, and even that cap gave up when the earliest hook start
rode an off-lane focal); (4) a spare attempt's intended line opened the
visualizer in strike mode, aiming at a pocket that wasn't the shot.

**Decision.**
- **Laydown = stance − offset.** New `laydown_offset` setting (default 6,
  half-board steps, 0–15; Settings → Preferences next to handedness). Board
  numbers are hand-relative, so one subtraction serves both hands. The
  visualizer materialises a missing `laydown` on open; a typed or dragged
  `laydown` overrides the derivation for that line. `stance` remains the
  entry field; the scorer shows a read-only derived-laydown chip (tap →
  visualizer). No migration — `LineSpec` already carried both fields.
- **Breakpoint is real-only.** Apex candidates start at the target depth, so
  the stored `breakpoint`/`breakpoint_distance` floor there (never 0 ft; a
  non-null `breakpoint` still flags a strike line). The *marker* renders only
  when the ball genuinely swings > ¼ board outside the target board
  (`apexReal`); straight, inward, and unreachable-final lines show no
  breakpoint at all — no fake points.
- **The drawn curve never exits boards 1–39** (the lofted-laydown skid margin
  stays). Spares get the same cap-to-lane as strikes, and the cap learned a
  second stage: when even the earliest hook start rides an off-lane focal, it
  shrinks the hook *length* too; only a truly impossible geometry falls back
  to nearest-achievable (map continuity).
- **Hard peg locks.** Tapping laydown/target/final toggles a lock (max 2 —
  one aim peg stays free; the derived breakpoint is not lockable). Locked
  pegs never move: drags are ignored, steppers disable, snap chips hide, and
  any edit whose solved result would move a locked value is dropped at the
  wall. The ADR-027 give-way skips locked pegs (both aim pegs locked ⇒
  timing-only drag). A peg tap no longer snaps the camera — only a real drag
  does.
- **Limits by construction, not warnings.** The hook sliders' min/max are
  computed live from the solver's own clamps (no dead track), and spare
  attempts open in spare mode with the real leave.

**Consequences.**
- `HookGeom` gains `apexReal`; `strikeApexPoint`'s unreachable branch floors
  at the target depth; `LinePath.points.breakpoint` is null when no real apex.
- Legacy lines with a sub-target stored `breakpoint_distance` re-solve onto
  the floor on first edit (the existing ADR-026 lazy-migration path).
- Locks are visualizer session state (nothing persisted).
- The replay button is gone — tapping the lane replays; the animated ball is
  amber and fades out at the pins (the frozen dark dot read as a marker).

## ADR-029 — Fresh-rack seeding rule

**Status:** accepted (2026-07). Refines ADR-017's carry-rule #3 (fresh-rack
bonus ball) for the 10th frame specifically; carry-rules #1, #2, and #4 are
unchanged.

**Context.** ADR-017's rule #3 seeded a 10th-frame bonus ball's line + ball
from "the immediately preceding shot in the same frame." That's wrong when
the preceding shot was a spare conversion: leave → spare → bonus ball wrongly
inherited the *spare* line and *spare ball*, when the bonus ball is a
strike-attempt thrown at a full rack and should be seeded like one.

**Decision.** A shot is **fresh-rack** if it's ball 1 of a frame, or its
immediately preceding shot cleared the deck (`pins_standing.length === 0` —
a strike or a converted spare). Seeding a fresh-rack shot now searches, in
order:
1. The most recent **earlier fresh-rack shot in the current frame** (only
   relevant in the 10th, where up to three balls can be thrown — e.g.
   strike, strike → ball 3 seeds from ball 2).
2. Else `previousSameLaneFrame`'s first shot (unchanged from ADR-017 #1/#3).
3. Else `previousGameSameLaneFrame`'s first shot (unchanged).
4. Else nothing to seed.

Confirmed edge case: 10th frame, leave → spare → bonus ball 3. Ball 1 counts
as fresh-rack (frame-index 0), and it's the most recent *earlier* fresh-rack
shot relative to ball 3 (ball 2 doesn't qualify — its predecessor, ball 1,
didn't clear the deck). So ball 3 seeds from **ball 1**, not ball 2.
Recency is about which shot is fresh-rack, not which shot has data — a
fresh-rack shot with no recorded `intended` is still the seed; the search
does not skip it looking for an earlier shot that happens to have a line.

Frames 1–9 are unaffected: ball 1 is the only fresh-rack shot there and
there's never an earlier fresh-rack shot in the current frame, so the rule
reduces to exactly `previousSameLaneFrame ?? previousGameSameLaneFrame` for
shot 1 — the same as before.

**Consequences.**
- `freshRackShotIndices(shots)` and `freshRackSeedShot(game, frameNumber,
  currentFrameShots, frames, previousGames)` are new pure exports in
  `lanes.ts`. `SessionLanePanel.tsx`'s scorecard fresh-rack-shots predicate
  (used to render 10th-frame symbols) now delegates to
  `freshRackShotIndices` instead of duplicating the predicate.
- `ActiveGameScorer.tsx`'s per-shot defaults effect calls `freshRackSeedShot`
  for both the shot-1 branch and the fresh-rack bonus-ball branch; the
  spare-attempt branch (ADR-017 #2) is untouched.

## ADR-030 — Drift model: stance-zone drift + constant release offset

**Status:** accepted (2026-07). Supersedes the single-offset portion of
ADR-028 (`laydown_offset` / `laydown = stance − offset`). ADR-028's other
decisions (breakpoint is real-only, hard peg locks, limits by construction)
are unaffected.

**Context.** ADR-028 derived `laydown = stance − laydown_offset` from one
global constant. A real bowler's foot drift between stance and slide/release
varies by *where* they stand on the approach — outside, middle, or inside —
because footwork and slide distance genuinely change with starting position.
One global offset couldn't represent that.

**Decision.**
- **Split into two physically distinct steps:** `slide = stance − drift(stance)`,
  then `laydown = slide − release_offset`. `release_offset` is the old
  constant (renamed); `drift(stance)` is looked up from one of **three hard
  zones** — outside / middle / inside — classified by the stance board, each
  with its own configurable drift value.
- **Storage: one versioned JSON setting**, `drift_model` (`DriftModel { v: 1,
  release_offset, outside_max, inside_min, drift: { outside, middle, inside }
  }`), replacing the bare-number `laydown_offset` setting as the live source
  of truth. Defaults: `release_offset = 6` (matches the old default),
  `outside_max = 14`, `inside_min = 25` (so outside = ≤14, middle = 15–24,
  inside = ≥25), all `drift = 0` — out of the box, `laydown = stance − 6`
  exactly as before (pinned by an explicit parity sweep test).
- **Migration, never destructive.** The old `laydown_offset` setting key is
  **never deleted** — it stays as a frozen fallback key. `getDriftModel()`
  reads `drift_model` first; if missing or invalid, it reads the legacy
  `laydown_offset`, migrates it into `{ ...DEFAULT, release_offset:
  <legacy value> }`, and **writes that back to `drift_model`** so the
  migration is idempotent (materializes once, then reads directly). This is
  safe under `backupRepository.ts`'s settings merge, which is last-write-wins
  **per key** (`db.settings.put` keyed by `key`) — an old app version or an
  old exported backup that still only knows `laydown_offset` can merge in
  without clobbering a newer device's `drift_model`, and vice versa; the two
  keys never collide.
- **Hand-relative boards, no mirroring needed.** As established in ADR-028,
  board numbers in this app are hand-relative everywhere, so the *same*
  numeric zone boundaries (`outside_max`, `inside_min`) and the same
  subtraction direction work unchanged for both left- and right-handed
  bowlers — no hand-mirroring logic is needed in `driftModel.ts`.
- **Sign convention.** Positive `drift` and `release_offset` values subtract
  toward *lower* board numbers, matching ADR-028's pre-existing
  `stance − offset` direction. Drift can be negative (a zone that drifts
  the other way).
- **UI:** Settings → Preferences gains a release-offset stepper (same
  interaction as the old laydown-offset stepper) and a drift-zones card
  (Outside/Middle/Inside rows: editable range boundary + drift stepper per
  zone, Middle's range read-only/derived). The zone-ordering invariant
  (`outside_max + 2 ≤ inside_min`, keeping Middle at least 1 board wide) is
  enforced both by clamping the steppers' effective min/max and by
  `parseDriftModel` rejecting `outside_max >= inside_min` on load.
- **New visual: slide tick.** `LaneVisualizer`/`LaneSurface` gain an optional,
  non-interactive foul-line marker at the derived `slide` board (strike mode
  only — spare mode seeds `laydown` directly with no stance chain), styled
  lighter than the draggable pegs so it reads as informational, not editable.

**Consequences.**
- `src/lib/driftModel.ts` is the single source of truth for all zone/clamp
  math (`zoneForStance`, `driftForStance`, `deriveSlide`, `deriveLaydown`,
  `parseDriftModel`, `migrateLegacyLaydownOffset`, `serializeDriftModel`);
  no consumer duplicates the clamp/snap logic. `deriveLaydown`'s signature
  changes from `(stance, offset: number)` to `(stance, model: DriftModel)` —
  a breaking change to the function, not to stored data.
- `src/lib/laydownOffsetContext.ts` is deleted; `src/lib/driftModelContext.ts`
  replaces it (`DriftModelContext`, `useDriftModel`). No re-export shim.
- `laneGeometry.ts` is untouched — it already consumes `laydown ?? stance`
  wherever it needs a foul-line board; the drift-model change is entirely
  upstream of geometry.
- Existing users who have never touched the new zone config see byte-for-byte
  identical `laydown` output (drift = 0 everywhere, `release_offset` carried
  over from their old `laydown_offset`) — this is the critical bit-identical
  migration guarantee, proven by a stance sweep (1–39 in half-board steps)
  against the old formula.

## ADR-031 — Breakpoint is display-only in score entry

**Status:** accepted (2026-07). Extends ADR-024/026's derived-breakpoint
arc and ADR-028's real-only honesty gate (`apexReal`); does not edit any of
their text.

**Context.** Score entry's Intended-line input rendered three typeable
fields — stance, target, breakpoint — even though ADR-024/026 already made
`breakpoint` a *derived* quantity for strike lines (the drawn curve's apex,
solved from stance/target + hook timing), and the lane visualizer is where
that timing is actually tuned (drag, sliders, aim cascade). Typing a
breakpoint board directly in the scorer bypassed that solve entirely,
writing a value with no geometric relationship to the rest of the line — the
one field in the row that couldn't be trusted to agree with what the
visualizer would draw.

**Decision.**
- Score entry's Intended-line input accepts only stance and target. The
  breakpoint text field, its label, and the `hideBreakpoint`/
  `hideIntendedBreakpoint` plumbing that used to suppress it when a saved
  spare line was applied are all removed — moot once there's no field to
  hide.
- Once both stance and target (or a derived laydown) are set, a **read-only
  breakpoint chip** renders next to the existing derived-laydown chip,
  showing the same apex `strikeApexPoint`/`solveLine` would compute for
  storage — but gated through a new `derivedApexForDisplay` that additionally
  requires `apexReal` (ADR-028's > ¼-board honesty threshold). A straight or
  unreachable line shows no chip, matching the visualizer's own marker
  behaviour.
- Tapping the breakpoint chip opens the lane visualizer — the same handler
  the laydown chip already uses. All breakpoint/hook-timing editing now
  happens exclusively there.
- **Spare attempts never show the chip.** Breakpoint is a strike-line
  concept (the apex past the target on the way to the pocket); a spare aim
  has no equivalent, so the chip is suppressed whenever the shot faces a
  standing leave, independent of whether a saved spare line drove the
  intended line.
- The visualizer-to-scorer round trip needs no new plumbing: an edit in the
  visualizer already calls `solveLine` and emits the full solved line
  through the existing `onChange` → `onIntendedChange` wiring, which updates
  the same `intended` state the new chip reads from.

**Consequences.**
- `src/lib/laneGeometry.ts` gains `derivedApexForDisplay(line, hand)`,
  returning `{ board, feet } | null`. It mirrors `strikeApexPoint`'s
  reachability check but returns `null` (not a floored fallback) on the
  unreachable branch, and `null` when the reachable apex fails `apexReal`.
  `strikeApexPoint` itself is unchanged — `solveLine` still uses it to write
  `breakpoint`/`breakpoint_distance` for storage regardless of display
  honesty.
- Persistence is unaffected: `LineSpec.breakpoint` is still written by
  `solveLine` exactly as before; only the *typed-entry* and *always-shown*
  parts of the old field are gone.
- `spareLineApplied` (`ActiveGameScorer.tsx`) is removed — its only consumer
  was `hideIntendedBreakpoint`, and the new chip already suppresses itself
  for spare attempts regardless of whether a spare line was applied.

## ADR-032 — The Actual line is slide-based

**Status:** accepted (2026-07). Extends ADR-030's drift model; does not edit
its text.

**Context.** Both line inputs in score entry took the same pair of boards —
stance and target — so `LineSpec.stance` served as "the foul-line board" for
a planned line *and* a bowled one. That reads wrong for the Actual line: a
bowler does not observe their own stance after the fact, they observe where
they slid. ADR-030 already models `slide = stance − drift(stance)` and
`laydown = slide − release_offset`, but slide existed only as a derived tick
on the lane surface, with no way to enter it.

**Decision.**
- `LineSpec` gains an optional `slide` board. The **Intended** line keeps
  `stance` (a plan you take up before you walk); the **Actual** line records
  `slide` (what you actually did).
- An observed slide skips the drift step entirely — drift is a stance→slide
  transform, and there is nothing left to predict once the slide is known.
  The Actual line therefore derives `laydown = slide − release_offset`
  (`deriveLaydownFromSlide`), and a dragged laydown inverts back through the
  same offset (`deriveSlideFromLaydown`). Downstream geometry is unchanged:
  `solveLine` and `buildLinePath` still work from `laydown` + `target`.
- **Legacy actual lines are not rewritten.** A stored `actual.stance` with no
  `slide` displays as `deriveSlide(stance)`, so the box is never blank. The
  row keeps its `stance` until the shot is next edited; the first edit writes
  a real `slide` and drops `stance`. There is no migration and no upgrade
  step — the fallback is display-only.
- The Actual line gets its own lane-visualizer entry point. It opens with
  the laydown and target pegs **pre-locked** (ADR-028's hard locks, seeded by
  a new `defaultLocks` prop): a shot that has already been bowled has a known
  foul-line board and arrow, so the useful gesture is dragging the *final*
  board to where the ball actually finished and letting the path re-solve.
- A locked peg's stepper is no longer inert. It renders a lock glyph and a
  dashed border, and tapping the number (or either arrow) releases the peg.
  Locks were previously only reachable by tapping the peg on the lane, which
  was undiscoverable.

**Consequences.**
- `LineInput` is parameterised by a `foulField` (`"stance" | "slide"`) rather
  than hard-coding the pair, and every box carries a persistent heading — a
  filled-in `23` no longer relies on a placeholder to say what it is.
- Both lines show their derived values as chips: Intended adds a **Slide**
  chip beside Laydown; Actual shows Laydown and the estimated breakpoint,
  under the same ADR-031 honesty gate (suppressed for spare attempts).
- `deriveLaydownFromSlide` / `deriveSlideFromLaydown` round-trip exactly above
  the lane's clamp floor (`1 + release_offset`); below it the laydown clamps
  to board 1 and the inverse cannot recover the original slide. That is the
  lane edge, not a modelling error.
- Autofill from Intended ("shot it as planned") converts on the way in:
  the intended `stance` becomes `deriveSlide(stance)` on the Actual line.

## ADR-033 — The final marker is a point of the drawn line

**Status:** accepted (2026-07). Refines ADR-028's "final peg stays on the
lane" clamp; does not edit its text.

**Context.** `buildLinePath` has an *unreachable* branch: when the requested
final board sits gutter-side of the focal at that depth, no hook can get
there, so the ball rides the focal straight and the leave is flagged `miss`.
The final marker, though, was still drawn at `boardToX(final_board)` — the
pin the user asked for. On an unreachable aim that put the green dot several
boards off the orange path, showing a finish the drawn shot cannot produce.
Spare lines hit this constantly: `solveLine` returns early for them (no
`breakpoint` field), so their final is never re-clamped onto the focal, and
the seeded aim board plus any target nudge is enough to make it unreachable.

**Decision.**
- On the unreachable branch the final marker is placed **on the focal at the
  final's depth** — where the ball actually passes that distance. The marker
  is a point of the drawn path in every branch, without exception.
- ADR-028's reachability clamp is kept, expressed against the marker instead
  of the board: when the focal has already run off the boards at that depth,
  the marker walks back up the focal to the lane edge, so its drag handle
  stays on screen.
- `final_board` is **not** rewritten. It stays the pin the user aimed at;
  the `miss` flag and the red pins remain the signal that it wasn't reached.
- `LaneSurface` reads the final label's board off the marker rather than off
  `final_board`, so the number always agrees with the dot. In every reachable
  case the two are identical, so nothing changes there.

**Consequences.**
- The marker no longer mirrors between hands for a line that is reachable for
  one hand and not the other. That asymmetry is real — hook direction is
  hand-dependent in board space — and it was previously hidden by drawing the
  marker from the stored board.
- A spare aimed at an unreachable pin now reads honestly: dot on the path,
  pin red, `Final` label naming the board the ball actually crosses.
