# Architecture decision log

Each entry: context, decision, consequences. New entries are appended at the
bottom. Never edit an accepted ADR — supersede it with a new one and link.

**Index (the ones worth knowing before you write code):** ADR-001 standing-pins
storage · ADR-002 snake_case wire format · ADR-004 mobile-first 390×844 ·
ADR-005 stats definitions · ADR-006 inverted pin input · ADR-007 catalog data
source · ADR-008 multi-weight + USBC discovery · ADR-016 baby splits +
split-excluded spare rate · ADR-017 save-as-you-go + carry rules · ADR-024 and
ADR-025 the line model · ADR-030 drift model: stance-zone drift + constant
release offset · ADR-034 semantic colour tokens · ADR-038 backup import
replaces the database (supersedes ADR-003) · ADR-039 catalog ingest + image
rights · ADR-040 navigation shapes and `PushScreen`.

New entries are appended, so the last one is the most recent.

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

**Status:** superseded by ADR-038 (2026-08). Import no longer merges at all;
the content-key matching described here has been removed. Kept for the record.
Superseded the prior "trust imported id" implementation.

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

## ADR-034 — Semantic design tokens, UI primitives, and dark mode

**Status:** accepted (2026-07). Covers the four-phase Apple HIG alignment pass.

**Context.** The app's visual layer had no indirection. Every colour was a raw
Tailwind utility (`text-slate-500`, `bg-white`), every button was hand-rolled at
the call site, and the only theme values were four brand colours. Three
consequences followed. Tap targets had drifted across `h-6`–`h-12`, with ~80% of
controls below Apple's 44pt minimum, because nothing enforced a floor. Two brand
classes (`felt-600`, `felt-50`) were referenced but never defined — Tailwind
emits no CSS and no warning for an undefined token, so a panel that should have
been tinted rendered transparent for months. And dark mode was unimplementable
without rewriting ~400 call sites.

**Decision.**

- **Semantic tokens are CSS variables, named by role.** `surface`, `ink`, `edge`,
  `accent`, `danger`, `success`, `warning` resolve to
  `rgb(var(--color-x) / <alpha-value>)`, defined twice in `src/index.css` — once
  per theme. Call sites never name a shade, so a theme flip needs no call-site
  change. The numeric suffixes on `danger`/`success`/`warning` (`50/200/700`) are
  *roles* — subtle-bg / border / strong-fg — which keep their meaning in dark
  even though the lightness inverts.
- **`felt` and `lane` stay static; the brand *fill* does not.** Brand hue is
  identity and shouldn't shift, but `felt-700` as a button fill measures 1.97:1
  against the dark background — the button shape itself disappears, independent
  of its label. Hence `accent-fill` / `accent-fill-hover` / `accent-on-fill` as
  tokens, and `accent` for brand-as-interactive-text.
- **A pre-paint script owns the theme.** It resolves `prefers-color-scheme` plus
  a `localStorage` override into `data-theme` on `<html>` before first paint. The
  preference lives in `localStorage`, not Dexie, specifically because an async
  IndexedDB read cannot run before paint and would flash. The script's
  OS-change listener re-reads storage on every fire rather than being bound
  conditionally at load, so a preference pinned later in the session isn't
  overridden by a stale closure.
- **Primitives own the accessibility floor.** `Button`, `IconButton` and `Chip`
  in `src/components/ui/` make a compliant control the only thing that's
  convenient to build. `IconButton.label` is required, not optional, so an icon
  button with no accessible name fails to type-check.
- **Dense chips reach 44pt by expanding their hit region, not their box.** A
  `::after` overlay (`TAP_TARGET_44`) grows the target vertically only —
  expanding horizontally would overlap neighbours and cause the mis-taps it
  exists to prevent. Callers must leave `gap-2`, and the container must not clip:
  `overflow-x-auto` forces `overflow-y: auto`, which silently kills the overhang.

**Consequences.**
- Two geometric exceptions to the 44pt floor, both measured rather than assumed:
  `Scorecard` cells (ten frames must fit in 390px) and `PinGrid`'s `sm` pins (the
  deck sits in a ~177px column, capping pins at ~35px). Both clear the 28pt
  absolute minimum. Raising the latter needs a scoring-screen layout change.
- An undefined token renders **transparent with no error**. Any new token must be
  added to both blocks in `index.css`; the guard is that every `--color-*`
  consumed by `tailwind.config.js` appears in both.
- Passing colour through `className` to a primitive does **not** override its
  variant — Tailwind resolves competing utilities by stylesheet order, not class
  order. New colour treatments must be variants (this is why `solid` and
  `inverse` exist on `IconButton`).
- `src/lib/` now holds React hooks (`useOverlay`, `useTheme`) alongside the older
  pure modules, so ARCHITECTURE.md's "no React in lib" rule no longer holds.

---

## ADR-035 — Same-ball line auto-fill, and the breakpoint as a ball concept

**Status:** accepted (2026-07). Extends ADR-017's carry-forward priority and
ADR-029's fresh-rack seeding; amends ADR-031's spare-attempt suppression rule
(that ADR's text is left unedited).

**Context.** Carry-forward seeds a shot's intended line from *one* predecessor
shot, copying line + ball + notes as a matched set (ADR-017, ADR-029). It is
ball-agnostic: the predecessor's line is offered whatever ball you end up
throwing. The common miss is switching balls — the box is then either blank (no
same-lane predecessor) or holds a line belonging to a ball you're not using.
Every bowler already knows the answer in that moment: *where did I stand last
time I threw this ball on this lane?*

Separately, ADR-031 suppressed the derived-breakpoint chip for every spare
attempt, on the reasoning that a breakpoint is a strike-line concept. That
conflates the shot with the ball. Shooting a 2-8 with a hooking ball — moving
two boards right and throwing the same equipment — has a real apex, and the lane
visualizer has always drawn it (ADR-026 gives the spare curve the same derived
breakpoint marker). Only a plastic spare ball, thrown straight at the pin rather
than through a board down the lane, genuinely has none.

**Decision.**

- **A third tier of line seeding: this ball's own history.** It runs only when
  the box would otherwise be empty — after carry-forward, the session spare line,
  and the saved spare line have all declined. `sameBallSeedLine` (`src/lib/lanes.ts`)
  resolves it, at two moments: when a shot starts, and when the user taps a ball.
- **Only fresh-rack shots may seed.** A spare attempt aims at a leave, so its
  line never seeds another shot. Spare attempts still *receive* one: with no
  session or saved spare line, a leave shot inherits the strike line of the same
  ball, which is the line the bowler adjusts *off* rather than replaces.
- **Strict two-tier lane precedence, each scanned without limit.** Same ball on
  the same lane wins over same ball on the pair's other lane, however much older
  it is — a cross-lane pair oils and breaks down differently, so lane identity
  beats recency. Both tiers scan the current frame, then earlier frames this
  game, then earlier games in the session, newest first.
- **Auto-filled lines carry provenance.** A line this rule supplied is replaced
  when the ball changes under it; a line the user typed, or that carry-forward or
  a spare line supplied, is never touched. Without this, a guess made *about a
  different ball* silently survives onto the shot record.
- **The breakpoint chip is suppressed by the ball, not the shot.** It hides only
  when a spare attempt is thrown with a ball flagged `is_spare_ball`. This
  narrows ADR-031's rule; everything else in that ADR stands.
- **The `spare_lines` table is held in component state**, like `balls`, so leave
  lookups are synchronous.

**Consequences.**
- The async spare-line read is gone from score entry. It could previously resolve
  *after* a ball change and overwrite the line that change had just seeded — and
  its "no saved line" branch cleared the box unconditionally. Both are now
  structurally impossible rather than guarded.
- A first ball can pair a ball and notes carried from one frame with a line found
  in another. Accepted deliberately: an empty line helps nobody, and the notes
  mismatch is cosmetic.
- Shots already recorded with a non-spare ball at a leave now display a
  breakpoint chip that was previously hidden. Nothing is rewritten — the apex is
  derived at render time (`derivedApexForDisplay`), never stored, so there is no
  migration and no invisible data on the record. Toggling `is_spare_ball` on a
  ball in the Arsenal likewise changes only how past shots display.
- Auto-fill is silent, with no marker distinguishing it from a carried or typed
  line — consistent with how carry-forward has behaved since ADR-017. Adding
  provenance UI for the newer path alone would make the older, equally inferred
  path read as more authoritative than it is.
- A spare ball used on a *first* ball keeps its breakpoint: that shot is a strike
  shot. The converse edge case — a spare ball thrown at a hookable leave — is
  knowingly left showing no chip.

---

## ADR-036 — Washouts are their own leave class, and spare % counts makeables only

**Status:** accepted (2026-07). Narrows the spare-rate definition established
alongside ADR-001's scoring rules; the split/baby-split classification from
`lib/pins.ts` is unchanged.

**Context.** Leaves were sorted into two buckets: real splits (excluded from
spare %) and everything else (counted). "Everything else" quietly included
washouts — the head pin standing with pins behind a gap, e.g. 1-2-10, 1-3-7.
By the USBC definition those are not splits, because the head pin is up, but
they convert nothing like an ordinary 10-pin. Folding them into the same rate
made spare % read better than the bowler's actual makeable-spare conversion,
which is the number the rate exists to report.

The leave grids had a second problem: an attempts-based "rare leaves" section
that split each grid in two. It answered a sampling question nobody asked while
hiding leaves the bowler wanted to see.

**Decision.**
- **`isWashout(standing)`** — head pin standing, and the remaining pins form a
  split without it. Pure geometry, reusing `isSplit`; no new constants.
- **Spare % counts makeable leaves only.** A real split *or* a washout is not a
  spare opportunity: excluded from numerator and denominator alike, the same
  treatment real splits already had.
- **Leaves render as three fixed sections** — Makeables, Washouts, Splits —
  each sorted by attempts. The rare/common partition is gone.

**Consequences.**
- Spare % changes for existing data. Nothing is stored or migrated: the rate is
  derived from recorded pins on every render, so the number simply becomes the
  makeable-conversion rate it claims to be. A bowler with frequent washouts will
  see their spare % rise, since those attempts leave the denominator.
- Baby splits still count as spare opportunities (unchanged) — they are
  makeable, and they render in the Splits section, which is a display grouping,
  not the rate's definition.
- Washouts get a visible conversion rate of their own for the first time.

---

## ADR-037 — Oil patterns own their name; sessions reference them by id

**Status:** accepted (2026-08).

**Context.** A session stored both `oil_pattern_id` and `oil_pattern` — a copy
of the pattern's name, written at save time. Nothing kept the copy in sync,
which was harmless only because patterns could not be edited: the settings UI
offered no rename, so the string could never go stale.

Adding an oil-pattern settings page (rename, plus a link to the pattern sheet)
removes that guarantee. Renaming "Main St" to "Kegel Main Street" would leave
every past session holding the old string, and stats group by exactly that
string (`lib/stats.ts`) — so one pattern would report as two.

**Decision.** `oil_patterns` is the sole source of truth for the name.

- `Session.oil_pattern` is removed. `oil_pattern_id` is the only link.
- Read paths resolve the pattern and attach it to the returned view model as
  `HydratedSession` (`oil_pattern`, `oil_pattern_url`). Display code keeps
  reading the same field name; it is derived now rather than stored.
- Patterns gain `url` (http/https only — the value is rendered as a link, so
  other schemes are rejected on save *and* on backup import) and `archived`.
- Names are unique case-insensitively, enforced in the repository because both
  the settings page and the session form create patterns.
- Removing a pattern deletes it if no session references it, and archives it
  otherwise. Archived patterns are hidden from the session picker but still
  resolve for history; the picker unions in the currently-selected pattern so
  editing an old session cannot silently clear it.

**Consequences.**
- Renames propagate everywhere by construction — no backfill, no drift.
- A referenced pattern can never be destroyed, so no session loses its pattern.
- Sessions holding a name with no id (pre-v2 rows, and rows landed by importing
  an older backup) are linked to a real pattern row by
  `linkLegacySessionOilPatterns`, run by the v6 upgrade and again after import.
  Matching is case-insensitive by name, creating the row if absent.
- Reading a session costs one extra indexed lookup. Accepted: history already
  issues per-session queries for games and frames.

---

## ADR-038 — Backup import replaces the whole database

**Status:** accepted (2026-08). Supersedes ADR-003.

**Context.** Import merged the file into the existing database, matching rows by
content key so two devices could be combined. In practice the merge was hard to
predict: a matched row was overwritten field-for-field by the incoming row, so
restoring an older file silently reset fields the file knew nothing about, while
rows absent from the file survived. The result was neither "my file is restored"
nor "my devices are combined" — it was a per-table blend the user could not see
before running it.

**Decision.** Import replaces everything. All tables are cleared, then the
file's rows are inserted with their own ids. There is no merge mode.

- The user confirms against real counts and must type REPLACE, since this is the
  most destructive action in the app and there is no server copy behind it.
- A safety export of the current database downloads before anything is cleared.
- With the tables empty, imported ids are replayed verbatim — the content-key
  upsert helpers and id-remapping from ADR-003 are deleted.

**Consequences.**
- The file is unambiguously the source of truth after an import.
- **Multi-device merging is gone.** Importing device B's backup onto device A
  destroys A's own history. This is a real capability loss, accepted knowingly
  in exchange for predictability.
- Data created since the imported file was written is lost unless the user keeps
  the pre-import safety copy.
- If merging is ever wanted again, the coherent version is per-row `updated_at`
  with last-write-wins across every table — not a return to content-key blending.

## ADR-039 — Catalog ingest from a third-party spec database, and the image rights position

**Status:** accepted (2026-08).

**Context.** The catalog seeded from SPI's own PDFs (ADR-007, the `seed-catalog`
skill) covers Storm-family balls and nothing else, and it carries no product
photography — the ad-sheet carves in Phase 6 produced clipped, inconsistently
framed images. Sourcing images from the manufacturers directly turned out to be
closed: `stormbowling.com` is recaptcha-gated to every automated fetch, the SPI
CDN has no per-ball image path that can be derived, and none of Storm, Brunswick
or MOTIV publishes a press kit with reusable product photography.

`bowwwl.com` is a third-party spec database — ~5,250 balls across 43 brands,
served as static Drupal pages where every spec is a labelled field, with one
consistently framed studio photo per ball.

**Decision.** Ingest from it, per-ball and on demand, for balls the owner
actually needs. `catalog/parse-bowwwl.ts` fetches a page, parses off field class
names, and stages to `data/seed/` for human review before merge — the same
staging flow as the PDF parsers, and the same rule that source documents never
enter a model context.

Deliberately **not** a bulk mirror of the whole database. A per-ball pull for
balls in the arsenal is a different act from republishing someone's catalog, and
the narrow version is both the safer position and the smaller diff.

**On rights — recorded so the reasoning isn't re-derived later.** Ball specs are
facts and carry no copyright (*Feist*; no US or Singapore database right). The
photographs do, and the rights holder is the manufacturer, not bowwwl — which
means bowwwl could not license them even if asked. bowwwl's own terms forbid
reproduction, but bowwwl self-hosts manufacturer photography under no stated
licence itself, as does every comparable non-retailer catalog app found. No
enforcement action by any bowling manufacturer against an app or fan site could
be found.

The position taken is therefore: **unlicensed, non-commercial, and reversible.**
Contingent on the app staying free and ad-free — Brunswick's terms permit
copying for "personal and noncommercial use", and adding affiliate income would
forfeit that. `data/images.json` keys every image to its ball id, so honouring a
takedown is a data edit, not a pipeline change.

**Consequences.**
- Any brand can enter the catalog now, not just the SPI family.
- Adding affiliate revenue is no longer a neutral product decision; it weakens
  the image position and should be reconsidered against this ADR.
- If written manufacturer permission is ever obtained, nothing here needs
  rebuilding — only the provenance recorded alongside each image changes.
- Balls whose photo is wrong on the aggregator (Pyramid Path ships in ~30
  colourways behind one entry) still need a manufacturer-direct image.

---

## ADR-040: Three navigation shapes, and `PushScreen` as the only push

**Status:** accepted (2026-08).

**Context.** Screens below the tab bar had each invented their own chrome. The
arsenal was a bottom sheet pinned 72px from the top, with its add-ball form
spliced inline into the list and the catalog picker nested as a short scroll
region inside that form, so the fastest route to a fully specced ball was also
the least discoverable one. Settings sections had a ghost "‹ Settings" button
floating above content that then repeated its own `<h1>`. The catalog was a
hand-rolled fixed overlay with a third variant of back. Nothing was wrong in
isolation; together they meant that "going somewhere" looked different every
time, and none of it read as native.

**Decision.** The app has exactly three navigation shapes, **tab**, **push**,
**dialog/sheet**, and the choice between them is semantic, not visual: a push
is a *place*, a sheet is a *task*. Every push is `PushScreen`, which owns the
nav bar (leading back naming the origin, centred title, at most one trailing
action), the enter animation, the edge-drag-back gesture, and the Escape/focus
trap. It has an `overlay` mode (floats above the tab bar; reachable from several
tabs) and an `inline` mode (fills the current tab's scroll area; the tab bar
stays live). Screens supply content only.

`docs/DESIGN-LANGUAGE.md` carries the full rule set, tokens, controls, empty
states, motion, copy, and is the doc to read before any UI work.

**Consequences.**
- Adding a screen is a `PushScreen` plus content; nav chrome is not a decision
  a new view gets to make, so it cannot drift again.
- Components used in two contexts (e.g. `OilPatternManager`, which the session
  form also embeds) take an optional `onBack`: present means "you were pushed,
  draw the nav bar", absent means "you are embedded".
- Raw palette colours are banned in app code, not merely discouraged: a
  hardcoded `slate-100` behind every ball photo was a white card in dark mode.
- Destructive actions leave list rows and live inside the editor for the thing
  they destroy, behind `ConfirmDialog`.

---

## ADR-041: The URL is a projection of navigation state, and the only back

**Status:** accepted (2026-08).

**Context.** The app kept no route. `history.length` stayed at 1 however deep
you went, which meant Android's hardware back and iOS's left-edge swipe closed
the whole app from anywhere, mid-session, with a full overlay stack open. A
reload always landed on the dashboard, and no screen could be linked to.

The naive fix, pushing a history entry per screen, would have made that worse.
`PushScreen` already implements its own edge-drag-back in a 28px zone, and
`useOverlay` its own Escape. On iOS the platform fires its back gesture for the
same swipe, so an in-app path that popped state directly while the platform
popped history would close two screens on one gesture.

**Decision.** The navigation state (ADR-040's tab / push / dialog shapes, held
in `lib/appNavigation.ts`) is the source of truth. The URL hash is a
*projection* of it: `lib/appRoute.ts` serialises state to `#/home/arsenal/catalog`
and parses it back, and `lib/useHistoryRoute.ts` keeps the two in step.

Two rules make it safe:

1. **Back is the browser's.** Every path back, the nav-bar control, Escape, the
   edge-drag, Android's hardware button, iOS's swipe, calls `history.back()`.
   `popstate` is the only place that dispatches the change. Whichever mechanism
   fires, exactly one pop happens. The fallback is dispatching directly when the
   app has pushed no entry of its own (a deep link straight into an overlay),
   because `history.back()` there would leave the app.
2. **Only navigations you can go "into" get an entry.** Overlays, sessions and
   Settings sections push; tab switches replace. The tab bar is always on
   screen, nobody reaches for back to change tabs, and stacking them would mean
   several presses to leave the app.

A hash, not a path: the app is offline-first, so there is no server rewrite rule
to keep in step, and the hash resolves from the service worker cache.

**Consequences.**
- The state is restored in `useReducer`'s lazy initialiser, not a mount effect.
  An effect runs *after* the first sync, which wrote the pre-restore state to
  the address bar and pushed an entry for it.
- Session memory that is not a place (`previousView`, the one-shot stats flag)
  stays out of the URL.
- An unreadable hash resolves to the dashboard rather than throwing: a stale
  bookmark should open the app, not break it.
- Sheets and dialogs (`useSheetDismiss`) are not in the URL yet, so back does
  not close a modal. Each is one action away from being added.
- Verified on an installed iOS PWA (2026-08-04): a left-edge swipe pops exactly
  one screen. iOS does not fire a competing native back alongside the app's own
  edge-drag, so the drag does not need to suppress it. If a future iOS ever
  does, the symptom is two screens closing on one swipe, and the fix is
  `touch-action`/`preventDefault` inside `PushScreen`'s 28px edge zone.

---

## ADR-042: One sentinel history entry for "a sheet is open"

**Status:** accepted (2026-08).

**Context.** ADR-041 made back the browser's, but only for things the URL
describes. Sheets and dialogs are local component state, so back skipped the
layer in front of the user and closed the screen behind it instead, which is the
inconsistency felt first once back works everywhere else.

Giving each sheet its own history entry was tried and reverted (2026-08-04).
With the push and pop living in a register/unregister effect, StrictMode's
double invoke ran a real `history.back()` from the phantom cleanup: opening one
sheet logged `PUSH sentinel, BACK(), PUSH sentinel`, and a ball editor over the
pushed arsenal then ate the arsenal's entry and walked out of the app. The
single-sheet case passed throughout, which is what made it look finished.

**Decision.** `lib/sheetBackStack.ts` is a registry of open overlays, in mount
order, and nothing more: it never touches history. `useHistoryRoute` reconciles
it against **one** sentinel entry, keyed on "is anything open" rather than on
each registration. The sentinel carries the hash of the entry beneath it, so
opening a sheet is not a route change.

- Nothing runs in a cleanup, so a repeated effect finds the state it wants and
  does nothing. StrictMode cannot fire a navigation.
- A pop of the sentinel closes the topmost registered layer and dispatches no
  route change. Nested sheets share the one sentinel, which is re-armed while
  anything is still open, so each back closes exactly one layer.
- A sheet that closes itself collects its own entry, guarded so the pop that
  arrives later cannot be read as a back press against whatever opened since.
- Registration lives in `useOverlay`, on the same `active` predicate as Escape,
  so back and Escape can never disagree about which layer is in front.

**Consequences.**
- A screen opened from a sheet (the start-session form) **takes over** the
  sentinel with a `replaceState` instead of stacking on it. Without that, the
  sheet's close popped the screen's own entry: caught by e2e, not by unit tests.
- Pushed screens opt out (`backCloses = false` in `PushScreen`): they are routes
  already, and registering them would pop two layers per gesture.
- The invariant the sentinel rests on is that sheets are modal, so no route
  change lands on top of one except the takeover above.

---

## ADR-043: Catalog ingest is a four-stage pipeline, and the model stage is treated as an untrusted reader

**Status:** accepted (2026-08).

**Context.** ADR-007 seeded the catalog from SPI PDFs, ADR-039 opened it to any
brand via a third-party spec database. Both are per-ball manual acts, and the
catalog stalled at 50 balls against a USBC approved list of ~2,000. Scaling the
manual act means letting an agent read spec pages and write `balls.json`, and an
agent reading a page will emit a plausible RG the page never stated. At 50 rows
nobody re-reads the file, so a fabricated number ships and stays.

**Decision.** Four stages, with the model confined to one of them.

1. **Select** (`pipeline/select.ts`) diffs `data/usbc-index.json` against
   `balls.json` and writes `data/queue/<run-id>.json`. Scope is a run input, not
   a policy: a date range, a brand, or a hand-picked list. No network.
2. **Extract** (the agent) reads sources and stages one
   `data/candidates/<slug>.json` per ball. Every field is a list of readings,
   each `{value, sourceUrl, quote}` where the quote is verbatim.
3. **Promote** (`pipeline/promote.ts`) is plain TypeScript, no model. It
   re-checks every receipt and either appends to `balls.json` or writes
   `data/conflicts/<slug>.json`.
4. **Images** (`pipeline/render.ts`, `contact-sheet.ts`) normalise and then show
   the result to a human eye.

**What promote enforces, and why each rule exists.**
- *A value must appear in its own quote.* This is the whole anti-fabrication
  mechanism, and it is mechanical: no model judges it.
- *An official manufacturer document is enough on its own; anything else needs
  readings from two different sites.* The official sheet is the ground truth, so
  corroborating it against a site that transcribed it is theatre.
- *Sources that disagree past tolerance produce a conflict, never an average.*
  Tolerances are RG ±0.01 and differentials ±0.002, the rounding real sheets
  publish at.
- *A name that collides with an existing ball is refused.* Storm re-releases
  names, and "!Q Tour" and "IQ Tour" are the same ball, so the identity key
  reads `!` as the letter it stands for. Update, colorway or genuinely-new is a
  human's call.

**On images.** Every source is framed differently, so all of them now go through
one normaliser: trim to the ball's real bounds, scale to a fixed fraction of the
canvas, centre on a transparent square. Fixed fraction is what stops one ball
rendering larger than its neighbour in the grid. The stage ends in a contact
sheet rather than an assertion, because a bad alpha cut is obvious to an eye and
invisible to any check worth writing. The rights position is unchanged from
ADR-039.

**Consequences.**
- Re-running is cheap: three of the four stages are deterministic and free, and
  only extraction spends tokens, only on balls not already in the catalog.
- A run can stop mid-way and resume, which matters because the browser path hits
  bot challenges that a human has to clear by hand. Nothing bypasses one.
- The `gather-ball-specs` skill's citation discipline is now enforced by code
  rather than by the skill remembering to.
- Conflicts accumulate as files. An unattended conflict is a ball missing from
  the catalog, not a wrong ball in it, which is the failure worth having.

---

## ADR-044: A deterministic parser is a trusted reader, and routing decides who reads

**Status:** accepted (2026-08). Amends ADR-043, which stands as written.

**Context.** ADR-043 put a quote behind every value and a second site behind
every non-official one. Applied literally that also taxes `parse-bowwwl`,
`parse-ball` and the SPI catalog parsers, which already produce whole entries
with no model in the loop. Making them fabricate quotes to satisfy a rule aimed
at models would turn the receipt into decoration.

**Decision.** A reading carries an optional `parser` field naming the code that
produced it. A parser reading needs no quote and no second site; a reading
without one is a model's, and both rules apply in full. The distinction is who
read the document, not which document it was: a parser reads a labelled DOM
field or a fixed PDF layout and fails loudly, whereas a model fails plausibly.

Route selection (`pipeline/sources.ts`, `resolve-sources.ts`) runs before any
reading and tags each queued ball `pdf`, `bowwwl` or `manual`, so a run knows up
front how much of it is free. On the first real queue, 77 balls approved since
January 2026 routed as 6 pdf, 32 bowwwl, 39 manual.

**On reduced names.** USBC lists one row per colorway, so a queue carries names
like "Hustle Vanilla/Popsicle" that no page is filed under. Dropping the
trailing slash-run finds the base ball, and this is opt-in
(`--try-base-names`) and always reported, because the same shape appears on
genuinely different balls: "Attention 78/U" is a urethane model, not a colorway
of "Attention". Filing one ball's specs under another's name is the exact
failure the collision rule exists to prevent, so it is never done silently.

**Consequences.**
- Most balls now cost nothing to add. The model is the exception path, not the
  default one.
- `from-seed.ts` routes existing staged parser output through the same promote
  gate, so there is one entry into `balls.json` rather than two.
- A parser bug now enters the catalog without a quote to catch it. That is the
  accepted trade: parsers have tests, models do not.

---

## ADR-045: Reaching back to a previous frame takes its last fresh-rack shot

**Status:** accepted (2026-08). Refines ADR-029 rules 2 and 3; rule 1 and the
fresh-rack definition are unchanged.

**Context.** ADR-029 made a fresh-rack shot seed from "the most recent earlier
fresh-rack shot in the current frame", then kept ADR-017's wording for the two
fallbacks: `previousSameLaneFrame`'s **first** shot, and
`previousGameSameLaneFrame`'s **first** shot.

Those two rules disagree. Inside a frame the latest fresh-rack shot wins;
across frames the first one does. In frames 1 to 9 the disagreement is
invisible, because ball 1 is the only fresh-rack shot there. The 10th frame is
the exception, and it is exactly the frame every reach-back lands on: frame 1 of
a new game seeds from the previous game's 10th on the same lane.

Reported from the lanes: a 10th frame of strike then strike, then the next
game's frame 1 seeded from ball 1 rather than ball 2. Two full-rack shots were
thrown, and the older one was carried forward.

**Decision.** Both fallbacks take the frame's **last** fresh-rack shot. The rule
is now the same wherever it is applied: among shots thrown at a full rack, the
most recent one seeds.

Frames 1 to 9 are unaffected, since a strike ends the frame and ball 1 is
therefore their only fresh-rack shot. The 10th changes: strike, strike now seeds
from ball 2, and strike, spare-attempt still seeds from ball 1, because a spare
attempt is not fresh-rack and never seeds anything (ADR-029).

**Consequences.**
- `freshRackSeedShot` applies `freshRackShotIndices` to the previous frame too,
  rather than reading `shots[0]`.
- ADR-029's worked example is unchanged: within the 10th, leave, spare, bonus
  ball still seeds from ball 1.
- A bowler who changes ball for the 10th-frame bonus shots now carries that ball
  into the next game, which is what the change of ball meant.

---

## ADR-046: Pocket hits are inferred from the leave, and the bowler flips the guess

**Status:** accepted (2026-08).

**Context.** Pocket percentage and carry percentage are the two numbers that
separate "I am not getting it there" from "I am getting it there and it is not
carrying", and neither is derivable from the score. Recording them honestly
means an extra input on every shot, which is exactly the kind of tax that stops
a session being scored at all.

The leave already carries most of the answer. A right-hander who leaves the 3
pin did not hit the pocket; one who leaves the 10 almost always did. The
exceptions are shapes, not single pins: 4-6 together means the ball went
through the nose, 2-10 means it went light.

**Decision.** A fresh-rack first ball gets a pocket verdict, guessed from the
leave and overridable in one tap. The rule is stated for a right-hander, and a
left-hander's leave is mirrored (2-3, 4-6, 7-10, 8-9) before the table runs, so
there is one table rather than two that drift.

```
notPocket(leave) =
     leave contains 1 or 3      the pocket pins are still up
  || leave contains 4 and 6     through the nose: big four, Greek church
  || leave contains 4 and 9     high and flat
  || leave contains 2 and 10    light
  || leave contains 2, 4 and 5  the bucket family
  || leave is exactly {5}       nothing drove through
```

Everything else with the 1 and the 3 down is a pocket hit, including 5-7, 5-10,
7-10, 8-10 and the corner pins on their own.

The verdict is **materialized** on the shot as `pocket_hit`, written at entry
from what the bowler was looking at. The toggle sits in the pin deck's
pocket-side bottom corner, so it is in the reading path between setting the pins
and pressing Next: leaving it alone is a choice, not an omission, which is why
no "inferred or manual" flag is stored alongside it.

`pocket_hit` is optional, and `undefined` means no verdict was ever recorded:
history entered before this existed, and anything restored from an older backup.
Those shots fall back to the rule at read time and follow it as it changes.

**Consequences.**
- Pocket % = pocket hits / fresh-rack balls. Carry % = strikes off a pocket hit
  / pocket hits, so a strike flagged as a crossover leaves both sides and carry
  cannot exceed 100.
- The Strike button records a pocket hit without pausing. A crossover strike is
  corrected by tapping back into the frame, which is three taps on maybe one
  strike in fifty, against one saved tap on all the others.
- Editing a shot's pins clears its verdict, the bowler's own included: it was a
  judgement about a leave that no longer exists.
- Spare attempts carry no verdict and no toggle. There is no pocket to hit.
- Changing the table changes the past only for shots with no recorded verdict.
  Shots entered under the old table keep what was written, which is the price of
  materializing and the reason `undefined` is left meaningful.

## ADR-047: Per-ball rates are shrunk in aggregate and raw per game

**Status:** accepted (2026-08).

**Context.** "How did this ball do in game 3 on this pattern" is three
dimensions over a few hundred shots. A ball thrown for one game leaves 4 to 8
first balls in that cell: a rate quantized to 12-point steps, where one
messenger moves it two whole steps.

**Decision.** Pattern is not an axis, it is the filter already on the History
screen; the table is ball by game number and recomputes under whatever filter is
active. The ball row shows an aggregate strike rate shrunk toward the bowler's
own baseline:

```
adjusted = (strikes + 30 x baseline) / (firstBalls + 30)
```

so a ball with 8 balls behind it sits near the baseline and one with 200 sits at
its own rate, and sorting the list cannot be won by a ball thrown twice.

The per-game cells are **raw**, and deliberately so. At six balls a cell there
is no signal to smooth, and a shrunk cell would render as the baseline for every
ball in every game: a table of identical numbers reads as "no difference" rather
than "not enough data". Raw cells at least show a shape, next to the count that
says how much to trust it.

**Consequences.**
- Fresh-rack balls with no `ball_id` are reported as an unattributed count
  rather than dropped, so a half-tagged history reads as incomplete.
- Leaves are attributed to the ball that threw the first ball of the frame.
- Ball choice is not random: a ball pulled only when the lanes are burnt will
  show worse rates for reasons that have nothing to do with the ball. These
  numbers describe what happened with a ball, never what would have happened
  with a different one, and no copy in the app may imply otherwise.

## ADR-048: One rate per ball, and it is the raw one

**Status:** accepted (2026-08). Amends ADR-047, which stands as written.

**Context.** ADR-047 put a shrunk strike rate in each ball's row and the raw
rate inside the same row's table. On the first real session that read as a
contradiction: a ball thrown once, struck with, showed "46% strike" in the
heading and "100%" in the table below, and the difference was explained only by
a paragraph of grey text nobody should have to read to trust a number.

The shrinkage was also not doing its job. That one-ball ball still sorted above
a ball with 31 balls behind it, because a lone strike pulls the estimate up from
the baseline rather than down.

**Decision.** One rate per ball, raw, over every game in view, sitting next to
the count of balls it came from. The estimator is gone: no prior, no blended
number, nothing on screen that is not a count of what happened.

The list sorts by **balls thrown**, descending. Sample size is the thing that
decides whether a row deserves attention, so it decides the order directly
instead of through an estimator.

The explanatory paragraph is deleted from both stats screens. A rate with its
denominator beside it does not need a paragraph.

**Consequences.**
- `adjustedStrikePct` and `baselineStrikePct` are gone from `BallPerformance`.
- A ball thrown once reads "100% strike, 1 ball". Obviously thin, and it sorts
  last, which is the honest presentation of a single data point.
- `calculateBallUsage` had one remaining caller, the deleted paragraph, and is
  removed with it. Frames and games per ball are readable from the per-game
  table, which carries the same counts.

## ADR-049: A leave is made by any ball thrown at a full rack

**Status:** accepted (2026-08). Amends ADR-036's leave counting; the spare-rate
definition there is untouched.

**Context.** Leave counting read `shots[0]` and stopped. In frames 1 to 9 that
is the only ball thrown at a full rack, so it was right. The 10th frame carries
up to three, and after a strike the next ball faces a fresh rack of its own.

Reported from a 259 game: strike, strike, then a 9 count in the 10th. The 10 pin
left by that third ball appeared in no leave count, on the leaves card or in the
per-ball breakdown, and the ball that threw it was credited with nothing.

**Decision.** Leaves come from **every fresh-rack ball that did not strike**,
paired with whether the next ball in the frame cleared it. `freshRackShotIndices`
already decides what "fresh rack" means for strike and pocket counting, so leave
counting now shares that definition instead of keeping a narrower one.

A leave is attributed to the ball that threw it, not to the ball that threw shot
1 of the frame. In the 10th those differ whenever a ball is changed for the bonus
balls.

A spare attempt is still not a leave: it is thrown at what the previous ball
left, so it has no rack of its own to leave anything from.

**Consequences.**
- Leave counts rise slightly, all of it in the 10th frame, and the same leave now
  reports the same way whichever frame it happened in.
- 10th-frame spares made off a bonus ball now count as conversions on the leaves
  card, where previously neither the leave nor its conversion appeared.
- Per-ball leaves show the number of times a ball left a shape and no conversion
  rate: the question there is what the ball leaves, and how well the spare was
  shot belongs to the leaves card.

---

## ADR-050: A leave with no ball behind it is counted, not scored

**Status:** accepted (2026-08). Amends ADR-049's conversion pairing. The
spare-rate definition of ADR-036 and the leave attribution of ADR-049 are
untouched.

**Context.** ADR-049 pairs every fresh-rack leave with "whether the next ball
cleared it", and reads a missing next ball as a miss. Two leaves have no next
ball and never will:

- the 10th frame's last ball. Strike, strike, then a 9 count leaves the 10 pin
  with the game over. No spare was required and none was missed.
- a frame still being bowled. Ball 1 is in, ball 2 is not thrown yet.

Both landed in the conversion rate as failures, so a 10 pin left on the 12th
shot dragged the 10-pin conversion rate down by a spare that was never offered.

**Decision.** A leave carries two counts. **Attempts** is how many times the
shape was left, all of them, including the two cases above: it happened, and
what a ball leaves is worth knowing whichever ball threw it. **Chances** is the
subset that a ball actually followed, and the conversion rate is
conversions over chances. A leave with no chances shows no rate rather than 0%.

The test is "was a following shot recorded", which covers both cases with one
rule and needs no special-casing of the 10th frame.

**Consequences.**
- Conversion rates rise slightly for leaves that occur on the 12th shot, and
  they now measure only spares that were there to be made.
- The leaves card reads `made/chances` with a muted `+N` for the leaves that had
  no chance, and the group heading taps open the definition, following ADR-040's
  tapped-definition pattern rather than printing standing copy.
- Per-ball leaves are unchanged: they already show times left, which is exactly
  the attempts count.
- A game in progress no longer reports its open frame as a missed spare.

## ADR-051: The leaves card carries only leaves a ball followed

**Status:** accepted (2026-08). Revises ADR-050's presentation. Its two counts,
and the attempts/chances split behind them, are untouched.

**Context.** ADR-050 gave a leave two counts and put both on the leaves card:
`made/chances` with a muted `+N` for the times no ball followed. The `+N` was
doing repair work. The card sorts by attempts, so a leave that only ever came
off the 12th shot could rank onto it, and the `+N` was the only thing that
explained why a cell was sitting there reading `0/0` with no rate.

An annotation that exists to explain why the number beside it looks wrong is a
sign the number is wrong for that card, not that the annotation is missing.

**Decision.** The leaves card answers one question: of the spares that were
there to be made, which do you make. It carries **only leaves with at least one
chance**, ranked by chances, and reads `made/chances` with nothing appended. A
leave off the last ball of the 10th, or off a frame still being bowled, does not
appear on it at all.

Nothing about counting changes. The attempts count is still every leave, and it
is still reported: per-ball leaves show times left, which is the attempts count,
and a leave the 10th's last ball made still counts under the ball that threw it
(ADR-049).

**Consequences.**
- The `+N` is gone, and with it the only cell on the card that could read `0/0`.
- The three groups (makeables, washouts, splits) can be empty where they were
  not before, in which case they do not render. A card of leaves you never had
  a shot at was not telling you anything.
- Frequency and conversion now live in separate places rather than fighting for
  one cell: what a ball leaves is on the ball, whether you make it is on the
  leaves card.
- The tapped definition changes with it, and says where the uncounted leave went
  rather than describing a `+1` that is no longer drawn.

## ADR-052: The box shows the line for the ball that is selected

**Status:** accepted (2026-08). Supersedes ADR-035's "auto-filled lines carry
provenance" bullet. Everything else in ADR-035 stands, including the two-tier
lane precedence that decides *which* line a ball's history offers.

**Context.** ADR-035 replaced the line on a ball change only when the line was
its own guess. A line the user typed, or that carry-forward or a spare line
supplied, was pinned. Carry-forward copies line and ball as a matched set from
one predecessor shot, so the moment you swap the ball, the pinned line is the
*previous* ball's line, which is the exact failure ADR-035 opens by naming: "the
box holds a line belonging to a ball you're not using". It half-solved its own
problem.

Reported from the lane: throw ball A on one line, switch to ball B and shoot a
different line, then next frame switch back to A. The box kept B's line. Common
enough to be the normal case, because different balls want different parts of
the lane.

**Decision.** On a ball change the box shows **that ball's line**, and there are
no exceptions by provenance:

- a line is found for the ball, it replaces what is there;
- no line is found, what is there stays, so an unfamiliar ball inherits a
  starting point to adjust off rather than emptying the box.

"That ball's line" is `sameBallSeedLine` on a full rack, unchanged. At a leave it
is **this ball's own attempt at that leave this session**, then the saved line
for the leave. `spare_lines` rows are keyed by the leave alone and cannot say
which ball they belong to; session history can, so it is asked first.

A typed line is not special. It is replaced like any other when the ball changes
under it, and typing it again is one gesture. The alternative was a per-shot map
of ball to line, which restores a typed line when you switch back and forth
within one shot: rejected as machinery for an edge case.

**Consequences.**
- `ShotSeed.autoFilled` and the `lineAutoFilled` ref are gone. The rule needs no
  provenance, which is why it fits in one sentence and the old one did not.
- Shot-start seeding is untouched. Carry-forward brings ball and line from the
  same predecessor shot, so they already agree; there is nothing to resolve.
- Two balls that have never been thrown at a leave share the saved spare line
  for it. That is a real limit of a per-leave table, and ADR-053 addresses it.

## ADR-053: A leave's strike-ball line is a move, not a set of boards

**Status:** accepted (2026-08). Extends ADR-052's leave resolution. The
`spare_lines` row keeps its absolute `line` unchanged.

**Context.** `spare_lines` stores one line per leave, in real boards, recorded
off a plastic spare ball thrown straight at the pin. Shoot the same leave with a
hooking strike ball and those boards are wrong, and ADR-052 has no better answer
than to offer them anyway.

The bowler's own answer is not a second set of boards. It is a move: *for the 7
pin I stand two right of wherever I am playing and pull the arrows in three.*
Stated that way it survives the lane transitioning under you, it survives you
switching strike balls, and it is one number rather than a line to re-measure.

**Decision.** A `SpareLine` gains `strike_offset: { stance?, target? }`, signed
boards, either field optional because some leaves move the feet only. It is a
**move off that ball's own strike line**, resolved at use:

1. this ball's own attempt at this leave this session (ADR-052, unchanged);
2. with a strike ball selected and an offset stored, `sameBallSeedLine` for that
   ball, moved by the offset;
3. the leave's absolute line;
4. the ball's bare strike line (ADR-035's last resort, unchanged).

Keyed by **ball kind, not by ball**. Every strike ball takes the same move,
because the move is a property of the leave and the base it moves off is already
per-ball. Storing it per ball would multiply the rows the bowler has to fill in
by the size of the bag, for an answer that does not vary that way.

A spare ball never takes the offset: with one selected, step 2 is skipped.

**Consequences.**
- No Dexie version bump. `spare_lines` indexes `++id` only, so a non-indexed
  field needs no migration (see `docs/DATA_MODEL.md`), and backups carry the
  table wholesale.
- An offset naming boards the strike line does not carry is skipped rather than
  guessed: a move needs something to move off.
- Session history is now ball-filtered when looking up a leave, so two balls no
  longer inherit each other's attempts. An attempt that names *no* ball still
  matches any ball, or seeding would go silent for anyone not tagging shots.

## ADR-054: A spare line is captured from the shot, not typed from memory

**Status:** accepted (2026-08). Replaces the made-spare-only capture prompt that
shipped with ADR-036's spare tracking.

**Context.** The `spare_lines` table only helps once it is populated, and it was
populated by going to the Spares tab between sessions and typing boards from
memory. On the lane the app already knows the answer: it has the leave, and it
has the line just thrown at it.

A prompt existed, but only after a spare was **made**, and it opened an empty
form rather than the line that had just been thrown.

**Decision.**

- **Capture after any spare attempt**, made or missed, when the leave has no
  saved line. A miss is not evidence the line was wrong: the bowler was there and
  can judge. Withholding the prompt on a miss withholds it exactly when the
  bowler is most likely to be paying attention to their line.
- **Prefill it with the line actually thrown**, so the common case is one tap.
- **Borrow another leave's line** from a control beside the Intended eye, shown
  only at a leave with nothing saved. Some leaves are one shot: a 6 and a 6-10
  are thrown at the same pin. Only stance and target travel, matching every other
  path a saved spare line takes.
- **Borrowing does not save.** The picker fills the box to shoot with. Whether
  that becomes the leave's saved answer is decided afterwards by the prompt, once
  the bowler has seen it work.

**Consequences.**
- The prompt fires far more often, so it is a dismissable line under both columns
  rather than a modal. It never interrupts the next shot.
- A leave with a saved line is never prompted for, so the prompt stops appearing
  as the table fills. The borrow control disappears on the same condition.

---

## ADR-055: Open frames are measured in pins left standing, not points lost

**Status:** accepted (2026-08).

**Context.** "What are my open frames costing me?" is the question a bowler
actually asks, and the honest answer is a number of pins on the scoresheet.
That number is not available. A spare in the sixth adds to the fifth, so
converting one leave changes at least two frames, and any total for a night is
the score of a game that was never bowled.

Every other number in `lib/stats.ts` describes something that happened. ADR-050
kept a leave with no ball behind it out of a conversion rate rather than
inventing a denominator for it, and ADR-051 took leaves off a card rather than
captioning a number that read wrong. Simulating a game to produce a headline
would undo both.

**Decision.** `calculateOpenFrames` reports **pins left standing** in frames
that went open, per game and per leave.

- A leave counts once the frame gave up on it: the ball after the leave is the
  attempt, and what that ball leaves is what the frame cost.
- Leaves rank by total pins left, which is frequency times size. A 10 pin
  missed thirty times outranks a 3-6-10 missed twice, and should.
- Ties break on misses, so the leave you keep missing sorts above the one you
  rarely see.
- Only completed games count, matching `calculateStats`. A frame in a game
  still being bowled is unfinished, not open.

**Consequences.**
- The screen cannot say "fix this and you average 192". It says what is left on
  the deck, and the bowler draws their own conclusion.
- A single-pin tap looks cheap next to a big leave, because in pins it is. The
  ranking recovers this through frequency rather than through a carry model.
- If a scoreboard-cost number is ever wanted, it needs its own ADR and its own
  name, and it must not replace this one.

---

## ADR-056: Game number is a filter first, and a comparison screen second

**Status:** accepted (2026-08).

**Context.** "How do I bowl in game 3 against game 1" is the same block of
numbers as the Stats tab, sliced by position in the night instead of by date.
Building a second screen that recomputes average, strike, spare, pocket and
carry would be a second definition of each, and ADR-048 has already been
through what happens when one number has two definitions.

**Decision.** Two pieces, and only one of them is new maths.

- **Game number joins the shared filter** as `FilterOptions.gameNumber`, which
  drops games in the wrong slot before any calculator sees them. Every existing
  number therefore slices by game with no calculator change, and the filter
  travels to History the same way the alley and pattern filters do.
- **`calculateGameNumberTrend` exists for the comparison**, because a filter
  answers one slot at a time and the question is a comparison: the slots have
  to sit next to each other. It returns the same rates by the same definitions,
  one row per slot.
- **Thin slots stay in the list** with their count on the row. Most nights are
  three games, so game 4 is a handful. Hiding it would be a silent judgement;
  greying it is a visible one.

**Consequences.**
- The Game-by-game screen is a table, not a chart per metric, and it swaps
  between a scoring column set and a first-ball one rather than showing five
  numeric columns on a phone (DESIGN-LANGUAGE §4b).
- Tapping a row sets the shared game filter, so the comparison hands off to the
  slice without a second way to express the same thing.

---

## ADR-057: History and Stats are two tabs over one filter

**Status:** accepted (2026-08). Replaces the swipe panes inside the History tab.

**Context.** History held sessions and stats as two panes of a `SwipePanes`
with a segmented control on top. The control was a third navigation shape
competing with the tab bar right beneath it, the swipe fought the horizontal
gestures inside the panes, and neither pane could be linked to or restored on
its own. Stats had also grown past what a pane can hold: it now has
drill-downs of its own.

The tab bar had five slots and no free one. Spare lines held one.

**Decision.**

- **Stats becomes a tab. Spare lines stops being one** and is pushed from the
  dashboard, where the arsenal, the catalog and the lane notes already live.
  All four are reference you keep rather than places you sit, and its add
  action moves from a Fab to the push's trailing control (DESIGN-LANGUAGE
  §7b).
- **One filter, shared.** `useSessionFilters` owns alley, pattern, game and
  lanes for both tabs. Narrow the list on History and cross over, and the
  numbers are for the sessions you were looking at.
- **The crossing control is an icon, no word.** The destination is named in the
  tab bar directly below it, so a label would only say it twice.
- **The drill-downs read the shared filter themselves** rather than taking it
  through props, so `App` stays an orchestrator and a screen cannot be handed a
  filter that disagrees with the tab under it.

**Consequences.**
- `#/stats` is a route, so a stats screen can be linked and restored. `#/spares`
  is not: it is `#/home/spares` now, and the old hash resolves to the dashboard
  like any other stale route.
- `useRememberedState` had to become a real shared store. It was a `useState`
  seeded from the module map on mount, which is indistinguishable from shared
  while only one component reads a key. The Stats tab now stays mounted under
  its own drill-downs, so a filter set on a drill-down has to reach the tab
  underneath, and a seeded copy would only have seen it on the next remount.
- `SwipePanes` keeps its other caller and is no longer used by History.

---

## ADR-058: Open frames are counted, and only the makeable ones

**Status:** accepted (2026-08). Replaces the pins-left-standing measure ADR-055
shipped hours earlier.

**Context.** ADR-055 reached for pins left standing because points lost needs a
game that was never bowled, and pins on the deck is a fact. The reasoning holds
and the number still failed, for a reason the ADR did not consider: nobody can
say what one of them is worth. "1.5 pins left standing per game" describes no
event a bowler recognises, and a leave's total of 12 grows with the length of
the history, so two filters could not be compared and the figure meant
something different every time the filter moved.

Frequency has neither problem. Open frames a game is a number bowlers already
keep, it is bounded by ten, and it means the same thing in a 4-game filter and
a 400-game one.

**Decision.**

- **Count frames, not pins.** `openFramesPerGame` is the headline; each leave
  carries the number of times it went open, and the list ranks on that.
- **Makeable leaves only**, the same test spare % uses (ADR-036). A real split
  or a washout is a first ball you did not get rather than a spare you missed.
  Counting them would move this number when the first ball got worse, which is
  a different problem with a different fix, and it would put leaves at the top
  of the list that no amount of spare shooting will remove.
- **A leave never missed is not listed.** The list is what goes open; a leave
  you always convert belongs on the leaves card, which already has it.
- **The definition sits behind the number** rather than in a paragraph under
  it: the headline is a button that opens what it counts (ADR-040). The screen
  had two blocks of prose explaining a number that should not have needed
  explaining.

**Consequences.**
- Open frames a game and spare % now answer with the same population, so they
  can be read against each other.
- Splits are absent from the screen entirely. Leaving fewer of them is a
  first-ball question, and the leaves card on Stats still reports them.
- The per-night trend becomes worth drawing, since the value is comparable
  between nights. It is bars rather than a line: down is better here, and a
  falling line reads as a loss.

---

## ADR-059: The open-frame headline counts every open, and a leave is read per game

**Status:** accepted (2026-08). Amends ADR-058, which shipped the same day.

**Context.** ADR-058 narrowed open frames to makeable leaves, on the grounds
that a split is a first ball you did not get rather than a spare you missed.
That reasoning is right about the *list* and wrong about the *headline*. An
open frame is an open frame on the scoresheet, and a bowler counting their own
night counts all of them. Reporting 2.4 when the night had 3.8 makes the number
disagree with anyone who counted, and quietly hides the nights that went wrong
on the first ball.

Two other things were wrong on that screen.

A leave was reported as a raw count of misses. The 10 pin came top with 33,
which mostly says the bowler is right-handed: they leave more 10 pins than
anything else, so the leave that appears most often will also be missed most
often. The count answers "what do I leave" when the screen is asking "what is
going open".

And the screen would not say what an open costs, having rejected pins left
standing in ADR-058 and put nothing in its place.

**Decision.**

- **The headline is every open frame**, whatever left it open, with the three
  kinds broken out beneath it: makeable, washouts, splits. They sum to the
  headline, so the split is a decomposition rather than a filter, and a night
  of splits reads as a first-ball night instead of a smaller number.
- **The leave list stays makeable-only**, and says so in its heading ("Most
  opens (makeables)"). It is a list of spares to go and work on.
- **A leave is reported as opens a game.** Same ordering as the raw count, but
  a number that means something on its own: "the 10 pin costs me 1.8 open
  frames a game" is a sentence, "33" is not.
- **Pins lost is opens a game times eleven.** A converted spare is worth ten
  plus the next ball and an open is worth what was on the deck, so the true
  figure moves with the leave and the ball after it. Eleven is the bowler's
  rule of thumb and it is presented as one: the screen says "about", and the
  note behind the headline says where the number comes from.

**Consequences.**
- Open frames a game no longer shares a population with spare %, which is
  makeables only. The breakdown under it is what reconciles them: the makeable
  row is the part spare % is about.
- The rule of thumb is an estimate, and the only estimate on the screen. If it
  is ever wanted exactly, that is a different number with a different name, and
  it needs a game that was never bowled (ADR-055's original problem).

---

## ADR-060: The filter collapses to a button, and only what is applied stays on screen

**Status:** accepted (2026-08). Amends the filter bar ADR-057 introduced.

**Context.** The shared filter shipped as four rows of controls above the
content: two selects, a chip per game, and a chip per lane. At a twelve-lane
house that wrapped to three rows. Something like 130px of a 390-wide screen was
filter, before a single number, and most of those controls are not being used
most of the time.

The obvious fix is to put the whole thing behind a button with a count. That is
right for a list, and only half right for a screen of statistics: a filtered
average is a different number from an unfiltered one, and `DESIGN-LANGUAGE §4b`
says a number carries its own definition or it does not go on screen. "201 avg"
means one thing across a season and another across game 1 on two lanes, and the
reader cannot tell which without opening a sheet to find out.

**Decision.**

- **The options live in a `FormSheet`**, opened from a round button in the tab's
  header. The sheet applies as you go, so it has no commit and the close is the
  only way out.
- **The button carries a badge** counting the kinds of filter applied. Lanes
  count once however many are picked: three lanes is one answer to one
  question, and a badge reading 5 would suggest five things to go and undo.
- **What is applied stays on screen**, as one horizontally scrolling row of
  chips, each of which removes its own filter. The row scrolls rather than
  wraps, because wrapping is what made the old bar tall.
- **Nothing applied renders nothing.** The common case costs no height at all,
  which is where most of the saving comes from.

**Consequences.**
- The header now carries two round controls on these two tabs, the filter and
  the crossing control. §1's one-trailing-action rule is about pushed screens,
  which have a nav bar; a tab has its own header and can hold both.
- The applied row is `overflow-x-auto`, so it needs vertical padding: that
  forces `overflow-y: auto`, which clips at the padding box, and the chips
  overhang their own box to reach 44pt. The same note sits on the game row in
  `ActiveSessionView`.

## ADR-061: MOTIV's own site is a parsed route, and the parser does not repair it

**Status:** accepted (2026-08). Extends the routing in ADR-043.

**Context.** MOTIV replied in August 2026 granting use of the data on their
website, on the terms that it is not resold and is kept accurate to what the
site states. Until now every MOTIV ball routed to `bowwwl`, a third-party
database: free to parse, but not official, and a step removed from the
manufacturer. SPI's CDN carries no MOTIV balls, so the `pdf` route never
applied to them and there was no official path at all.

The site itself parses cleanly. Every spec is a labelled table row
(`<th>Cover Stock</th>`) and every per-weight number a headed span, so the page
yields to the same deterministic treatment as the `bowwwl` pages, with no model
in the loop.

**Decision.**

- **A fourth route, `motiv`**, tried after `pdf` and before `bowwwl`, and only
  for that brand. `parse-motiv` reads the page; `from-seed` marks its readings
  official, since it is the manufacturer's own page.
- **The URL comes from their sitemap, not from the ball's name.** MOTIV files
  each ball under its oil category (`/products/balls/heavy-oil/`), which no
  name implies. The sitemap is read once per run and indexed by slug, so the
  route is a lookup rather than a guess. The memo caches the *promise*: the
  router routes several balls concurrently, and caching the map instead lets
  the second caller find an index that exists but is still empty.
- **Requests name the tool.** MOTIV's edge rejects the bare "Mozilla/5.0" the
  other parsers send, it being a stock bot signature. Naming the project is the
  better answer regardless: permission was given to this project, so the
  requests should be attributable to it.
- **What MOTIV states is what is recorded, including where it reads oddly.** A
  solid cover is filed as plain "Reactive" with no "Solid", and that stands.
  The agreement is to stay accurate to the site, and other databases' inferences
  are not the site.
- **A cover type stated only in the page copy still counts as stated.** Their
  older pages leave the type out of the spec cell and put it in the prose: the
  Trident page expands its own acronym as "Coercion HVH (High Volume Hybrid)",
  and the Jackal page opens "The Jackal is a power pearl". Only those two
  shapes are read, and only when the cell carries no type of its own. Leaving
  them out is not the neutral choice it looks like: an unclassified cover is
  one the catalog cannot filter, so the ball goes missing from the search that
  should find it.

**The parser does not repair its source.** MOTIV's Covert VIP EXJ prints its
15 lb differential as "056" where every sibling row reads ".050". The parser
returns 56 and lets promote's range check refuse the ball, rather than inferring
the decimal point back in. This looks pedantic for one obvious typo and is the
only defensible rule: a parser that quietly corrects its source cannot be
trusted on the values it did not correct, and the refusal puts the ball in front
of a person, which is where a source that contradicts itself belongs.

**Consequences.**
- MOTIV balls added from here carry `official: true`, so one reading per field
  is enough and the two-site rule stops applying to them.
- The balls already in the catalog were read from `bowwwl` and are not
  retro-fitted by this. Where the two disagree, MOTIV's own wording is the one
  to keep, but changing an existing row is a decision per ball, not a sweep.
- `bowwwl` remains the route for every other brand, and for any MOTIV ball the
  sitemap does not list.

## ADR-062: Colourways fold before promote, and only on proof

**Status:** accepted (2026-08). Extends the MOTIV route in ADR-061.

**Context.** MOTIV file every colourway of a ball as its own product page. The
Aspire is four pages, identical in every spec, differing only in the colour
printed on the ball and the picture of it. Parsed a page at a time, which is
the only way a parser can work, that stages four balls. Promoted, the catalog
gains four Aspires, and a bowler searching for one finds a wall of near
duplicates. `colorways` already exists on `CatalogBall` for exactly this, and
the detail view already carries a carousel for it.

**Where it happens.** Not in the parser, which sees one page and cannot know
another exists. Not in promote, which has no way to merge separate candidates
into one row. So between them, in `pipeline/fold-colorways.ts`, operating on
the staged seed a human is meant to review anyway.

**What it will not do.** MOTIV's naming does not mark colourways reliably.
Some append the colour behind a separator ("Aspire - Navy/Red/Blue"), some
without one ("Ascent Pearl Pink/Purple"), and the same separator also carries
edition labels that are part of the ball's name ("T10 - Limited Edition").
Reading all of those shapes means guessing, and a wrong guess files two
different balls as one ball's colourways, which nothing downstream would catch.

So a group folds only on all three of: a base name shared before " - ", the one
shape that is unambiguous; two or more pages carrying it, since one page is a
name rather than a set; and identical specs, which is the actual evidence that
one ball is being described twice.

Release dates are excluded from that comparison. MOTIV shipped the Thrill's
three colours on three dates and it is still one ball, so the folded ball takes
the earliest, being when the ball itself arrived.

**Consequences.**
- Everything the rule does not cover is reported and left alone, which is the
  point: the Thrill and Top Thrill are one ball each, but their pages disagree
  on the core's name ("Flux" against "Flux Symmetic", "Halogen V2" against
  "HalogenV2"). Those are MOTIV's typos, and per ADR-061 the parser does not
  repair its source, so the fold refuses and a person decides.
- **A colourway carries its own picture.** `add-ball-image` addressed by SKU
  now writes `<id>--<sku>`, and the build attaches it to that colourway. Without
  this the carousel shows the ball's one image four times over, which is worse
  than not folding at all. A colourway with no picture of its own still falls
  back to the ball's.
- Folding changes the id, since the name loses its colour and the date becomes
  the earliest. This is only safe before a ball is promoted; folding one already
  in the catalog would strand any arsenal ball holding its `catalog_ref_id`.


## ADR-063: MOTIV's cover acronyms are read from their own expansions, not their letters

**Status:** accepted (2026-08). Extends ADR-061.

**Context.** MOTIV's spec cell often names a coverstock without saying what
type it is: "Coercion HFS Reactive", "Hexion LFP Cover Stock". The build cannot
classify those, and an unclassified cover is one the catalog cannot filter, so
the ball goes missing from the search that should find it. Sixty-seven MOTIV
balls sat outside the catalog for this reason alone.

The acronyms plainly encode it. First letter the friction or volume, last the
type: S solid, P pearl, H hybrid. Reading them that way would classify all
sixty-seven in an afternoon.

**Decision.** Do not read them that way. An acronym is used only where a MOTIV
page spells it out in full, and the quote that does it is recorded beside the
entry in `catalog/motiv-cover-acronyms.ts`. Six qualify: HFS, MFS, LFP, MFP,
HVH and MCP. They were found by searching their own product pages for the
pattern, not supplied from memory.

**Why the pattern is not enough.** It is an inference about a naming scheme,
and every ball it touches would carry the result as though it were fact. A
coverstock category is not visibly wrong later: nothing downstream re-derives
it, no test can catch it, and a bowler filtering for pearl would simply get the
wrong list and never know. The same reasoning as ADR-061's refusal to repair a
malformed number, applied to a gap rather than a typo. Where MOTIV have said
it, it is theirs; where they have not, the letters are only a good guess, and a
good guess recorded as a spec is indistinguishable from a bad one.

**Consequences.**
- Fourteen balls classify on this evidence and are now in the catalog. HFP,
  HV2, HVS, XFS, SFP and the rest stay out until MOTIV expand them somewhere,
  however strongly their letters suggest an answer.
- MCP is recorded although it classifies nothing: "Microcell Polymer" is a
  material of MOTIV's own rather than one of the four types. It is in the table
  so the next reader finds the evidence instead of re-deriving the question.
- The type is written where MOTIV's own current pages write it, before
  "Reactive" when the cell ends that way and on the end when it does not. A
  trailing "Cover Stock" is dropped as the cell's own label repeated.
- This improved balls already parsed: the Jackal Ghost V2's "Leverage HFS
  Reactive" is now correctly a solid.

## ADR-064: A ball links to the manufacturer's page, separately from where its specs were read

**Status:** accepted (2026-08).

**Context.** MOTIV's licence, clause 4, asks that for any ball with an active
product page, the listing carry a reasonably accessible link to it, so a reader
can verify the specs and find out more from MOTIV directly. Nothing in the app
linked out at all: `sourceUrl` was carried on every ball and rendered nowhere.

The obvious move is to render `sourceUrl`. It is wrong for nineteen MOTIV balls
read before the `motiv` route existed, whose specs genuinely came from bowwwl
or a review site. Pointing those at MOTIV means overwriting the citation, which
buys the link by making the provenance a lie.

**Decision.** A second field, `productUrl`, for the manufacturer's own page,
independent of `sourceUrls`, which keep saying where the numbers were read. A
row can honestly cite one origin and link to another. `parse-motiv` sets it to
the page it parsed. `pipeline/link-motiv-pages.ts` backfills the rest by
looking the ball up in MOTIV's sitemap, never by constructing a URL, and
reports anything their sitemap does not list.

The link renders under the specs on the ball's screen as "View on MOTIV", with
`target="_blank"` and `rel="noopener noreferrer"`. It is absent, rather than
broken, for a ball with no page.

**Consequences.**
- 184 of 185 MOTIV balls carry it. The Frenzy does not: it is a 2026 ball that
  MOTIV's sitemap has no page for, and is a different ball from the Thrash
  Frenzy, which does. Nothing is invented to fill the gap.
- A folded ball has no page under its own name, since MOTIV file colourways
  separately, so it links to the first colourway it was folded from.
- The field is generic rather than MOTIV-specific. No other brand populates it
  yet, and their balls simply show no link.
- An e2e test asserts the link, its host and its rel. The link is a term of an
  agreement, so it should fail loudly if it is ever dropped, not quietly go
  missing.

---

## ADR-065: The back-swipe belongs to the platform, not to us

**Status:** accepted (2026-08). Supersedes ADR-041's note that `PushScreen`'s
edge-drag does not need to suppress a native gesture.

**Context.** ADR-040 gave every push an edge-drag-back of its own, and ADR-041
recorded why it was safe: verified on an installed iOS PWA (2026-08-04), a
left-edge swipe popped exactly one screen, because iOS fired no back of its own
alongside it. That was the only reason the drag existed. An installed iOS user
had the chevron and nothing else, and a push you cannot swipe off does not read
as a push.

iOS now has its own edge-swipe for same-document history, standalone included,
and ADR-041 predicted the symptom exactly: two screens closing on one swipe.
The visual failure came first. On one drag the OS slides a snapshot of the
previous history entry in from the left while `PushScreen` slides the live
screen right, so the user sees the screen underneath twice, at two offsets.

ADR-041 named `touch-action`/`preventDefault` in the 28px edge zone as the fix.
That is the wrong way round: it spends code suppressing the real gesture in
order to keep an imitation of it. The platform's has interruptible physics, a
rubber-band and a commit threshold tuned by the OS; ours is a `translateX` past
90px.

**Decision.** `PushScreen` implements no back gesture. Back out of a push with
the nav-bar chevron, with Escape, or with whatever back the platform provides.
The enter and exit animations stay: those are ours to draw, and nothing else
draws them.

**Consequences.**

- Android Chrome and desktop touch lose a back-swipe they never had natively.
  The chevron is always present, and Android's back button is unaffected.
- Nothing to suppress, so no `preventDefault` in the edge zone, which would
  have sat under the back chevron and eaten its taps.
- Nested pushes (a catalog ball's detail inside the catalog) no longer share an
  edge, which is what made one drag pop two screens (see CHANGELOG, 2026-08).
- If a platform ever ships a *worse* back gesture than the chevron, the answer
  is still not to draw our own on top of it.

---

## ADR-061: A stat tile picks what the chart plots, and the chart carries the definition

**Status:** accepted (2026-08).

**Context.** The Stats tab shows eight numbers and graphs one of them. Average
had a trend line; strike, spare, pocket, carry and first ball had none, though
every one of them is a per-session quantity and worth watching move. Carry in
particular only means anything as a trend: a single figure cannot tell you
whether the extra strikes came from getting to the pocket more or from carrying
better once you did.

The obvious build is a calculator per metric. That is how a second definition
of every rate gets created, and ADR-048 is the record of what that costs.

Tapping a tile already did something: it revealed that stat's definition. A tap
cannot mean both "explain this" and "graph this".

**Decision.**

- **One pass, all metrics.** `calculateSessionMetrics` runs `calculateStats`
  over each night and returns the whole block per session. The chart reads the
  field the selected tile names, so the point on the line and the number on the
  tile are the same call and cannot drift.
- **The tiles are the picker.** Six of them select: average, strike, spare,
  pocket, carry, first ball. Games and the high/low tile do not, because
  neither is a rate over time. Selection uses `aria-pressed`, matching every
  other selectable control here rather than introducing a tab role.
- **The definition moves onto the chart**, behind an info control in its
  header, next to the name of the thing it defines. §4b still holds: the number
  carries its definition, it just carries it where the number is plotted rather
  than where it is totalled.
- **Average keeps its own chart.** `SessionTrendChart` draws a faint dot per
  game behind each night, and that spread is meaningful for a score and
  meaningless for a rate: a rate over two games is not the mean of two rates,
  so there is nothing to scatter behind it.

**Consequences.**
- Two chart components sharing one header slot, picked by the selected metric.
- Only the first high and first low are labelled on the metric chart. Rates tie
  constantly, and two 100% nights each printing their value put one label on
  top of the other.
- A night with no opportunity for a metric (no pocket hits, so no carry) breaks
  the line rather than plotting zero, the same rule the score chart uses for an
  unscored game.

---

## ADR-062: The chart has two axes, and the header switches them

**Status:** accepted (2026-08). Extends ADR-061.

**Context.** ADR-061 made the tiles pick *what* the chart plots. The other half
of the question is what it plots *against*. "Carry by session" answers whether
you are improving over months; "carry by game" answers whether you fall apart
after game two. They are different questions about the same number, and only
one of them had a chart.

The Game-by-game screen already answered the second question, as a table of
every rate at once. A table is the right shape for comparing five metrics
across four slots; it is the wrong shape for watching one metric fall.

**Decision.**

- **The chart's x axis is selectable on the Stats tab**: by session, or by
  position in the night. The tiles keep picking the metric, so the two controls
  compose into twelve views without twelve screens.
- **The switch lives in the chart header.** The header already read "Carry by
  session", so the "by ..." half of it becomes the control: the metric name on
  the left, a `Session | Game` segmented control and the info button on the
  right. It is a property of the chart, so it belongs on the chart, not in the
  Filters sheet, which narrows *what* is counted rather than how it is drawn.
- **Four slots visible, then it scrolls.** Most nights are three or four games,
  so the common case never scrolls; a six-game night widens the plot and the
  card scrolls sideways rather than squeezing six points into a phone's width.
  The viewBox widens in step with the rendered width, which is what keeps the
  labels the same size: stretching the SVG with CSS alone would scale the type
  along with the plot.
- **`calculateGameNumberMetrics` replaces `calculateGameNumberTrend`**, and is
  built the way the other two series are: narrow the games to the slot, then
  run `calculateStats`. Game-by-game now reads from it too, so there is one
  calculator behind every rate on the screen whichever axis it is drawn on.
- **The game axis ignores the game filter.** It *is* the game picker, so
  narrowing it to the slot already chosen would take the picker away. Location,
  pattern and lanes still apply. `useSessionFilters` grew
  `filteredExceptGame` for exactly this.

**Consequences.**
- The average has no score line on the game axis, because a slot has no games
  to scatter behind it. It plots as a point like every other metric there.
- Tapping a slot narrows the whole tab to it, which is the affordance the
  Game-by-game table already had.
- That screen is now largely redundant. It is left in place: it still shows
  three metrics at once, which the chart cannot.

---

## ADR-063: The game axis lives on its own screen, reached from a menu

**Status:** accepted (2026-08). Amends ADR-062, which put the game axis on the
Stats tab, and moves the entry points ADR-057 and ADR-058 left at the foot of
the page.

**Context.** ADR-062 put a `Session | Game` switch in the Stats chart header,
which worked and made the Game-by-game screen look redundant. It is not. The
chart shows one metric falling across the night, which is what you want when
you already suspect one is; the table shows three at once, which is what you
want when you do not yet know which. Neither is the other's replacement, and
keeping the game axis in two places meant maintaining it twice.

Separately, both breakdown screens were reached from rows under the ball
table. That is the bottom of a long scroll, which is where a feature goes to be
forgotten.

**Decision.**

- **The Stats chart plots nights only.** The axis switch is gone; the game axis
  moved to the Game-by-game screen, which now carries the metric picker and the
  chart above its table. One screen owns the question.
- **`Stats` exports its metric specs** (`METRIC_KEYS`, `metricSpec`,
  `metricNote`) so that picker is the same set, drawn the same way, rather than
  a second list that can drift from the tiles.
- **One `More` control in the Stats header**, opening a menu of the screens the
  tab can reach: Game by game, Open frames, Spare lines. A menu rather than an
  icon each, because four round buttons beside a title is more chrome than a
  tab should carry and this scales if a fourth screen arrives.
- **Spare lines joins them** and leaves the dashboard. It sits next to Open
  frames on purpose: that screen names the leaves you keep missing, and this
  one is where the line for shooting them lives.
- **The menu is not gated on having history.** Spare lines are set up before
  you bowl, not after, and the two breakdowns have empty states of their own.

**Consequences.**
- `#/home/spares` becomes `#/stats/spares`. Both are just routes; a stale one
  resolves to the dashboard like any other.
- The dashboard is back to five shortcuts, so the split-row grid that fills two
  rows of three and two comes back with it.
- `MetricTrendChart` keeps its `windowSize`, now used only by Game-by-game.
