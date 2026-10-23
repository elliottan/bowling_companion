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

**A note on ADR-061b to ADR-065b.** Two runs of work numbered their decisions
in parallel and both reached 061 to 065, so ten entries shared five numbers.
The five written second carry a `b` suffix. Renumbering them properly would
have rewritten references in accepted ADRs, which this file does not allow, and
the suffix keeps every reference written before the clash pointing where it
always did.

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

## ADR-061b: A stat tile picks what the chart plots, and the chart carries the definition

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

## ADR-062b: The chart has two axes, and the header switches them

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

## ADR-063b: The game axis lives on its own screen, reached from a menu

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

---

## ADR-064b: A briefing is a comparison against the rest of your history, gated three ways

**Status:** accepted (2026-08).

**Context.** Everything the app knows is behind you. The one moment it could be
worth something in advance is the half hour before a session, when the ball
bag is still in the boot and the questions are which ball, what to expect, and
what went wrong last time here.

The easy version computes a dozen things about the chosen alley and prints
them. That produces a screen of numbers with no claim attached to any of them,
which is the "data slop" `docs/DESIGN-LANGUAGE.md` warns about at greater
length.

**Decision.**

- **One shape for every finding: the slice against the rest.** The slice is
  whatever alley and pattern were picked; the baseline is every session outside
  it. A number on its own says nothing; the same number against your own
  history is the whole point.
- **Three gates, in order.** Enough behind it, a difference big enough to
  matter, and something you can act on tonight. The thresholds are in bowling
  terms rather than statistical ones: five pins is a ball change, five points
  of spare rate is a frame a night, and a lane beating its pair by less than
  eight points is which end you started on.
- **Fixed priority, not a computed score.** Ranking across rules needs one
  currency, and getting pins and rate points into the same units means
  inventing a conversion between them, which every number on the screen would
  then inherit. So the order is by usefulness before the first ball: the ball
  is chosen in the car park, the average sets expectations, the game slot says
  when to pay attention, and the rest is detail. Three at a time.
- **Findings, not sentences.** `lib/briefing` returns numbers and identifiers
  and the screen writes the copy, so the thresholds can be tested without
  asserting on wording and the sentences stay under the design language.
- **Nothing is recommended.** Every line states what happened. Ball choice is
  not random, so "the Phaze II carries better here" may be describing the ball
  you only reach for when the lanes are good, and the screen must not turn that
  into advice.
- **Last time here sits outside the ranking.** It is a memory, not a
  comparison: the line you actually played, read from the fresh-rack balls that
  carry one, by the ball most of them were thrown with, at the median stance
  and target so one stray shot is not the line you remember.

**Consequences.**
- A gap has to count the qualifying *things*, not the floor they clear. Most of
  these rules need two of something: two balls with enough first balls, two
  slots with enough games. The first version reported "needs 20 first balls,
  best so far is 150", which reads as already satisfied because the shortfall
  was never the first balls.
- With nothing picked, the slice is everything and the baseline is empty, so
  the comparisons go quiet by construction. That is correct: there is nothing
  to compare your whole history to.
- The thresholds are judgement, not derivation. They are constants in one place
  with the reasoning attached, so moving them is a decision rather than a tweak.

---

## ADR-065b: A callout hands its slice to the Stats tab, in one dispatch

**Status:** accepted (2026-08). Extends ADR-064.

**Context.** A briefing callout states a number and stops there. The obvious
next move is to go and look at it, and the Stats tab already does exactly that
job with the same filter store behind it.

**Decision.**

- **Tapping a callout sets the Stats filters to the plan's slice** (location and
  pattern) and the chart to the number the callout was about, then crosses to
  the tab. `setRemembered` is the imperative half of `useRememberedState`, so
  one screen can hand another its starting state without mounting a hook for a
  key it does not otherwise read.
- **Only location, pattern and the chart.** A callout that names two things
  ("game 1 is your best here, game 3 your worst") cannot become one filter
  without the tap silently picking a side. The game and lane chips are one tap
  away in the filter sheet, and guessing which half the reader meant is worse
  than not guessing.
- **`crossToTab` is its own action.** `goTo` deliberately keeps the overlay
  stack, which is right for the tab bar because that bar is not reachable from
  a pushed screen anyway. Leaving a push for a tab has to do both at once.
- **`openSession` now clears the overlay stack.** A session is a place, and no
  pushed screen belongs in front of it.

**Consequences.**
- Popping and then switching cannot work here, and this is worth writing down
  because it looks like it should. `goBack` goes through `history.back()`
  (ADR-041), so the pop lands asynchronously through `popstate` and restores
  the URL over whatever the synchronous switch had just set. The first version
  of this crossed to Stats and arrived on Home.
- The plan's own pickers stay separate from the Stats filters, so browsing a
  plan does not disturb what the Stats tab was showing until you tap.

---

## ADR-066: History is read in bulk, and a list does not pay for frames

**Status:** accepted (2026-08).

**Context.** `getSessionHistory` walked the session list and, for each one,
fetched the session again, then its games, then each game's frames. Measured on
a five-year history (667 sessions, 2,001 games, 20,010 frames) that was **3,336
IndexedDB requests and 332ms**, materialising 5.3MB. Tab switches took 497ms to
Stats and 381ms to History on a desktop, so several times that on a phone.

Two separate problems sat inside one function.

The first was the shape of the reads: a query per row where three would do. It
also re-fetched each session by id from a list it had just read, and resolved
each session's oil pattern with its own lookup.

The second was that every caller paid for frames whether it read them or not.
The dashboard loaded every frame of every night ever bowled to render ten rows;
History's list loaded them to show numbers that are already on the game row.

**Decision.**

- **Three reads, then group in memory.** Sessions, games and frames each come
  back in one `toArray`, and the joining happens in JavaScript. 332ms becomes
  161ms, and the request count becomes 3.
- **`getSessionList` is the loader for screens that list nights.** Same shape,
  but frames are fetched only for games with **no `final_score`**. That is not
  an approximation: the list reads frames for exactly one reason, to show a
  running total for a game still being bowled, and a scored game's frames are
  never touched. 332ms becomes 12ms.
- **`useSessionFilters` takes which loader to use**, defaulting to the full
  one. History asks for the cheap one; Stats and the drill-downs do not.

**Consequences.**
- Measured after: History 381ms to **17ms**, Home to **6ms**, Stats 497ms to
  **264ms**. Stats keeps a real cost because it genuinely reads every shot.
- `getSessionList` is sharp, and the sharpness is not visible in its type: it
  returns `SessionSummary[]` like the full loader, with `frames: []` on scored
  games. Feeding it to a calculator would report a history of nothing having
  happened. The name and the doc comment carry the warning, and tests pin both
  halves of the rule.
- The calculators were never the problem. At 2,000 games the entire Stats-tab
  calculation is 72ms and it scales linearly; the whole cost was in the reads.

---

## ADR-067: The second copy leaves the device, and the app stops being quiet about it

**Status:** accepted (2026-08). Extends ADR-038, which owns what an import does.

**Context.** Everything lives in one IndexedDB on one device. `App` already
asks for `navigator.storage.persist()`, which on Chrome and Firefox largely
settles it. On iOS Safari it does not: Apple caps script-writable storage for a
site the user has not opened in seven days, and a home-screen app is treated
differently from a tab. So the single most protective thing an iPhone user can
do is install the app.

The app knew that and said it in the wrong place. The install line rendered
*inside* the backup nudge, which only appears after three un-backed-up sessions
and can be snoozed a week at a time for ever. The message that actually
protects the data was therefore invisible to anyone who backed up regularly and
gone entirely for anyone who kept snoozing: the two groups least and most at
risk, both unreached.

Backups themselves were a download to the device the data was already on, named
by date alone, so two exports in one day collided in a folder as "(1)" and
"(2)".

**Decision.**

- **The install prompt stands on its own.** Its own banner, on its own
  condition, next to the backup nudge rather than inside it.
- **The nudge escalates and eventually stops taking no for an answer.** `due`
  after three sessions and snoozeable as before; `overdue` after eight, or
  after sixty days with anything unsaved, and `overdue` ignores the snooze and
  drops the Later button. A reminder that can be dismissed for ever does not
  reach the person who has been dismissing it since March.
- **The nudge says the age, not just the count.** "Last backup: 6 months ago"
  is the fact that makes the count mean something.
- **Export goes through the share sheet where there is one.** That is the only
  route to iCloud Drive on iOS, and a copy that stays on the device is not a
  second copy. It falls back to a download, and a cancelled share is not
  recorded as a backup, because nothing left.
- **Backups are named to be read in a folder**:
  `bowling-companion-2026-08-28-1930-212s.json`. Minutes make them sort, the
  session count says which is the fuller history.
- **A restore that goes backwards says so.** `PreparedImport` carries
  `losingSessions`, and the confirmation leads with "you would lose 32
  sessions" rather than leaving the reader to subtract two counts.

**Consequences.**
- Still no merge, and deliberately so (ADR-038). A folder of backups invites
  one, and a backup that sometimes merges is worse than one that always
  replaces, because the result cannot be predicted. This is a backup, not sync:
  one device is the source of truth.
- The remaining exposure is a user who installs nothing, backs up nothing, and
  bowls fortnightly on an iPhone. The app now warns them twice, in the right
  place, and cannot be quietly silenced. It does not save them.

## ADR-068: How hard the app asks depends on where it is running

**Status:** accepted (2026-08). Extends ADR-067, which owns the nudge itself.

**Context.** ADR-067 ended by naming its own remaining exposure: "a user who
installs nothing, backs up nothing, and bowls fortnightly on an iPhone." That
user is not an edge case. They are the default first-time visitor, and with the
app about to be handed to people who have never seen it, the default is what
matters.

The thresholds were the problem. `due` at three sessions, `overdue` at eight or
at sixty days, snooze a week. Those numbers were chosen for storage that
persists, which is what `navigator.storage.persist()` buys on Chrome and
Firefox. In an iOS Safari tab it buys nothing: Apple clears script-writable
storage for a site the user has not opened in seven days. So the app waited
sixty days to raise its voice about data that was gone on day seven. It was
warning about a loss that had already happened, roughly eight times over.

The dashboard is also the wrong place to catch this person. It speaks when they
come back, and the whole failure mode is that they do not come back.

**Decision.**

- **Every threshold is a function of `isStandalone()`.** `nudgePolicy(installed)`
  returns the numbers; nothing else in the app hardcodes one. Installed keeps
  ADR-067's 3 / 8 / 60 days / 7-day snooze. A browser tab gets 1 / 2 / 5 days /
  2-day snooze.
- **Five days, not seven.** Seven is the deadline. A reminder that fires on the
  deadline fires too late to act on.
- **The ask also happens in the session, not only on Home.** When a game in the
  current session has a `final_score` and the app is in a tab, `SaveCopyPrompt`
  appears under the session header. It calls `shareBackup()` directly rather
  than routing to the backup screen: taking someone out of a live game to go and
  find an export button is how a prompt gets dismissed instead of acted on.
- **It is gated on a finished game in this session, not on the session count.**
  A night that has just been created is already one session "behind", and asking
  someone to back up before they have thrown a ball is how a prompt teaches
  itself to be ignored.
- **`installed` is a parameter, not stored state.** `backupUrgency(state,
  installed)` takes it from the caller, so `lib/` keeps its no-DOM rule and the
  policy stays a pure function of two inputs. Views read `isStandalone()` per
  render, which also means installing mid-session takes effect immediately.

**Consequences.**
- A tab user who bowls one game and stops is asked once, that night. This is
  deliberately more aggressive than the installed experience, and it is
  proportionate: their data really can be gone in a week.
- Dismissing in-session buys two days, not seven. Long enough to finish the
  night, short enough to land again before the eviction window closes.
- The install prompt is still the actual fix and the nudge is damage control.
  Nothing here saves a user who bowls, closes the tab, and returns in three
  weeks. Only installing does.
- The counts are now two policies rather than one, so any future change to the
  numbers has to be made twice, on purpose. That is the point: they encode two
  different storage guarantees and should not drift into each other.

---

## ADR-069: Onboarding is what the data is missing, not a tour

**Status:** accepted (2026-08).

**Context.** The app is about to be handed to people who have never seen it, and
ADR-068 already made the case that the first-time visitor is the default user,
not an edge case. Two gaps were left.

The first is the pin deck. ADR-006 inverted it: a shot starts with nothing
marked and you tap the pins **left standing**, because most balls knock most
pins down. Every other scorer in existence works the other way round. A new
bowler taps the pins they knocked over and records the exact opposite of what
happened, gets a 3 for a good first ball, and concludes the app is broken. No
empty state can catch this, because the scorer is never empty.

The second is Home on a device that has never scored a game: an app title, six
icon tiles naming six places the user has not been, and a list with nothing in
it. It reads like a settings screen. Meanwhile Arsenal, spare lines, oil
patterns and lane notes are the features that make the rest of the app pay off,
and nothing points at any of them until the user goes looking.

The obvious answer, a first-run carousel, was rejected. It is a thing to get
through rather than a thing to act on, everything in it is forgotten by the time
it is needed, and it is dead weight for anyone restoring a backup.

**Decision.**

- **A coach line above the pin deck, until the deck is proven understood.** One
  sentence saying what a tap means, sitting directly above the deck it
  describes, in the accent surface rather than a warning one: this is how the
  app works, not a problem. It retires on "Got it", and also on the first
  finished game, which is proof the deck was read correctly ten frames running.
  The flag is one settings key (`pin_input_coached_at`), so it rides along in a
  backup and does not come back on a restore.
- **Home leads with an empty state on a device with no sessions.** An
  `EmptyState` says what the app does and offers the single action worth taking,
  above everything else, and the recent list is hidden because it would only
  repeat the same emptiness a second time (DESIGN-LANGUAGE §5). The shortcut
  grid stays, below. Hiding it until the first session was tried and reverted:
  it is the only route to the catalog and the line visualiser, and a bowler with
  no balls yet is precisely who needs those.
- **A Next steps card, driven by gaps in the user's own data.** `lib/onboarding`
  is a pure function from counts to at most two steps. A step is offered only
  once it would pay off (spare lines and oil patterns wait for a first session;
  lane notes wait for an alley bowled twice), retires the instant the gap is
  filled, and can be waved off individually with "Not now", persisted per step.
- **Install and backup stay out of it.** They have their own banners on Home
  (ADR-067, ADR-068). A second copy inside the card would compete with the one
  message that actually protects the user's data, which is the mistake ADR-067
  was written to undo.

**Consequences.**
- Onboarding has no completion state and no progress bar, because it is not a
  sequence. Most users see the card empty, which is why it renders nothing at
  all rather than a "you are all set" row.
- A user restoring a backup onto a new device sees none of this: their counts
  are already non-zero and their dismissals came with the file.
- `getOnboardingFacts` reads all sessions to find repeat alleys. Session rows
  are cheap; ADR-066's rule is about frames, and no frame is touched here.
- Deleting every session puts Home back into the cold start. That is correct:
  the device really does have nothing on it again.
- The e2e suite reaches Arsenal, Catalog and Lane notes through the shortcut
  grid on a fresh database, and caught the hidden-grid version immediately. The
  tests were right and the design was wrong.
- `SessionHistory` lost its `emptyAction` prop. Home was its only caller, and
  Home's empty list is now unreachable behind the cold start.

---

## ADR-070: Spare lines are answerable before the first night

**Status:** accepted (2026-08). Amends one clause of ADR-069, which otherwise
stands.

**Context.** ADR-069 held spare lines and oil patterns behind a first session,
on the reasoning that neither is worth asking about before the user has bowled.
That is true of oil patterns and wrong about spare lines. Which pattern the
house lays is something you find out at the house. How you shoot a 10-pin is
not: it is a thing the bowler already knows, has probably known for years, and
would rather have written down *before* arriving than be prompted for mid-frame.

Holding it back also cost the moment the answer is cheapest. Sitting at home
with the app open and nothing else to do is a better time to fill in six leaves
than the lane approach.

**Decision.** The `spare-lines` rule drops its `sessionCount >= 1` gate and
opens purely on `answeredSpareLines === 0`. `oil-pattern` keeps its gate for the
reason ADR-069 gave. A cold-start device now offers two steps, balls and spare
lines, which is the cap, so the card is unchanged in size.

**Consequences.**
- A brand new user sees two steps on Home instead of one. Both are answerable
  without leaving the sofa, which is the test this rule now applies.
- ADR-069's list of gated steps should be read through this entry.

---

## ADR-071: Spare lines is a place you keep, the game plan is a thing you read

**Status:** accepted (2026-08). Amends the Home grid from ADR-063 and the
placement clause of the game-plan ADR.

**Context.** Spare lines was reachable from exactly one control in the app: the
`More` menu in the Stats header (ADR-063). That was defensible when it was read
next to Open frames, which names the leaves you keep missing. It stopped being
defensible once ADR-069 started asking users to fill spare lines in, because the
card asking for them was the only route to them, and the route vanished the
moment one line was saved. A feature the app nags you about should not be a
feature you have to remember where to find.

Meanwhile Game plan held a slot in the Home grid on the reasoning that it is
read before a session and Home is where you are then. That reasoning is right
about *when* and wrong about *what*. The other five tiles are places you keep
things: your balls, your patterns, your notes. Game plan is not a place, it is a
reading of the history you already have, and sitting it in a grid of stores made
it look like one more drawer to fill.

**Decision.**

- **Spare lines takes the grid slot.** It keeps its place in the Stats menu, and
  it is added to the Settings list beside Arsenal, Lane notes and Oil patterns,
  which is where the things you keep are listed. Three entry points for one
  screen is not duplication here: they answer three different questions, "shoot
  this leave", "what do I keep", and "the app just asked me for this".
- **Game plan becomes a card above the grid**, full width, one line saying what
  it is, opening the screen. A single tap target that opens the thing, per
  DESIGN-LANGUAGE §4.
- **The card is gated on there being a briefing worth reading.** It shows when
  no session is active and at least `MIN_BRIEFING_GAMES` games are scored, which
  is the briefing's own slice floor plus its baseline floor. Under that every
  finding is still gathering, so the card would be sending the reader to a
  screen that has nothing to tell them.
- **The card does not compute the briefing.** That needs `getSessionHistory`,
  which is 161ms and 5.3MB on a long history, and ADR-066 exists precisely
  because Home was paying that to render ten rows. The gate is a count off the
  games table with no frames touched.
- **One icon for spare lines.** `Crosshair`, in all three menus. It had been
  `Spline`, which is the line visualiser's icon, and sharing it across two more
  menus would have read as the same destination.

**Consequences.**
- The grid is still six tiles in two rows of three.
- A user with under twelve scored games never sees the Game plan card and can
  still reach the screen from nowhere else on Home. That is deliberate: there is
  nothing there for them yet. It returns on its own.
- The card is not a briefing preview. Showing the top finding inline would be
  better and costs a full history read per Home render, which is a trade this
  ADR declines rather than one it overlooked.

## ADR-072: The restore is offered before the hand is asked

**Status:** accepted (2026-09). Complements ADR-069, which owns the in-app
next steps; this one owns everything before the app is reachable at all.

**Context.** The first thing a new user saw was a modal asking which hand they
bowl with, floating over a fully rendered app they had never laid eyes on. It
asked about the direction of board-adjust arrows before anything had said what
the app was, and there was no way to answer "neither, I am restoring a backup".

Underneath the awkwardness sat a real defect. Handedness is a row in
`settings`, and `settings` are carried inside every backup (ADR-038). So a
returning user on a new phone was asked the question, answered it, and then
imported a file that silently overwrote the answer. Two sources of truth for
one fact, resolved by whichever happened last.

**Decision.**

- **The first run owns the viewport.** `FirstRun` is a full screen, not a
  dialog over the app. Until handedness exists, it is the app.
- **The first question is "new, or restoring".** Not handedness. This is the
  only ordering that cannot contradict itself: a restore supplies the answer,
  so asking first would either be wasted or wrong.
- **A restore ends the first run.** The file carried the handedness, so the
  question is never put. If the file has no handedness (an old backup, or one
  exported before the setting existed), the reload lands back on the first run
  and it is asked then. The condition is the *absence of the setting*, never a
  counter of how many times the app has been opened.
- **A completed restore reloads the page.** The database has been replaced
  wholesale and the shell holds state read once at boot. Re-deriving that by
  hand is a list nobody keeps complete; a reload is one line and cannot drift.
- **Install and backup prompts stay out of it.** They have their own banners on
  Home (ADR-067, ADR-068). Repeating them in a setup flow would rebuild the
  competing-nudge problem those decisions exist to solve.

**Consequences.**
- Two screens stand between a brand new user and the app, where there was one
  modal. That is the cost of the restore path existing at all, and it is paid
  once.
- `HandednessPrompt` is gone; `HandednessPicker` is still shared with Settings.
- The e2e helper that dismissed the old modal now walks the flow, so every
  suite exercises the first run on its way to a clean database.

## ADR-073: The backup nudge moves to the toast slot, and can be got out of the way

**Status:** accepted (2026-09). Amends ADR-067, which owns the nudge's
escalation, and leaves that escalation intact.

**Context.** ADR-067 made the nudge harder to silence as it aged: `overdue`
ignores the snooze and drops the Later button, because "a reminder that can be
dismissed for ever does not reach the person who has been dismissing it since
March." That reasoning still holds.

What it did not anticipate is where the thing sits. The nudge rendered as a
block in the page flow, between the game bar and the scorecard. On a night of
three games it is a red slab across the top of the scorer, pushing the card
down the screen on every return to the session, with no way to move it. It was
the loudest object on a screen whose job is entering shots, and it stayed that
way for the rest of the night.

An immovable warning in the middle of the work is not a stronger warning. It is
read once and then read past, and it takes the scorecard's place while doing it.

**Decision.**

- **The nudge is a bottom toast**, in the same slot and the same shape as the
  update toast, above the tab bar. It stops displacing the scorecard.
- **It carries a close control at both urgencies.** What closing means is what
  changes with urgency, not whether it is offered:
  - `due` closes as Later did, snoozing for the usual week.
  - `overdue` closes for this run only. Nothing is recorded, so it is back on
    the next launch, and no amount of closing it buys a quiet week.
- **The update toast wins the slot** when both are up. Neither is frequent and
  both can be closed.

**Consequences.**
- ADR-067's guarantee is unchanged in substance: an overdue nudge still cannot
  be snoozed, and still returns until a backup actually happens. What it loses
  is the ability to hold the top of the scorer hostage between now and then.
- A user who closes the overdue toast and never relaunches keeps an unsaved
  history, exactly as they would have by scrolling past the old block.
- Two toasts share one anchor. If a third ever wants it, they need stacking
  rather than another `z-index` guess.

## ADR-074: The app asks for feedback once, and the answer rides in the backup

**Status.** Accepted.

**Context.**

Headpin has no analytics and no backend, which is the whole pitch. The cost of
that is total blindness: there is no funnel to read, no drop-off to measure,
and no way to learn why someone stopped opening the app. At the scale this
project is at, that cost is worth paying, because a conversation with one
bowler beats a percentage from a thousand. But it only pays if the conversation
actually happens.

The Settings row that opens the feedback form catches people who already have a
complaint big enough to go looking. It cannot catch the quiet majority, and the
quiet majority is exactly the population whose reasons are unknown.

**Decision.**

- **Ask once, on Home, after three finished sessions.** Sessions, not games:
  three nights out means the habit stuck and the rough edges have been met.
  Before that there is nothing to say worth interrupting for.
- **Asked once, ever.** Opening the form and waving it off are both answers,
  and both retire the card. A prompt that returns is a prompt people learn to
  dismiss without reading, which spends the one interruption budget the app has.
- **The answer is a row in `settings`**, keyed `feedback_prompt_done`. That
  table is exported in a backup and written back on restore (ADR-038), so
  moving to a new phone does not re-ask somebody who already answered. A fresh
  install with no restore is a genuinely new start, and asking there is right.
- **It is not a `NextStep`.** Those name a gap in the user's own data and
  retire when the gap is filled (`onboarding.ts`). There is no gap here, so it
  sits beside the install and backup banners as its own object, borrowing their
  shape.
- **Diagnostics stay a clipboard button, never a beacon.** Settings offers
  "Copy diagnostics", which puts the build, install mode, storage persistence
  and per-table row counts on the clipboard for the user to paste in. It
  carries no scores and no alley names, and it sends nothing by itself.

**Consequences.**
- The app still has no measure of retention, and this ADR does not give it one.
  Anything better needs a network request, which is a different decision with a
  different price, and it is not being made here.
- One ask is one shot. If a second touchpoint is ever wanted, it needs its own
  key at a much higher threshold, not a shorter fuse on this one.
- A user who restores an old backup onto a fresh phone inherits the dismissal,
  which is intended, and also inherits it if they restore a backup taken before
  they ever saw the card, which simply means they get asked at three sessions
  as normal.

## ADR-075: Feedback is an email with the diagnostics already in it

**Status.** Accepted. Supersedes the delivery mechanism in ADR-074; the once-ever
rule and the `settings` key it describes are unchanged.

**Context.**

ADR-074 shipped feedback as a link to a Google Form, and diagnostics as a
separate "Copy diagnostics" row the user was asked to paste into it. Two
problems, one of each kind.

The practical one: nobody pastes. A form reached from a phone, with a second
control that has to be found first and used in the right order, ends with
reports that say "it broke" and no build number. The instrument only works if
attaching the context costs nothing.

The positioning one: a Google Form is a third party standing in the middle of
the only conversation the app has, on a page whose whole claim is that no third
party is in the middle of anything. It also cannot be replied to, so a report
that needs one follow-up question is a dead end.

**Decision.**

- **Feedback opens a draft email to hello@headpin.app**, in the user's own mail
  app. It can be replied to, and it involves nobody but the two people in it.
- **The diagnostics go in the draft body**, and on the clipboard at the same
  time. Both, because neither is reliable alone: mail clients disagree about
  honouring a prefilled `body`, and the clipboard is denied outright in some
  embedded webviews.
- **The standalone "Copy diagnostics" row is gone.** Two controls that put the
  same text in the same place is one control too many, and DESIGN-LANGUAGE §4
  does not spend a row on a thing another row already does.
- **Still nothing automatic.** The draft sits in the user's mail app, with the
  diagnostics visible in it, until they choose to send. What the app knows is
  never posted anywhere by the app itself, which is the line ADR-074 drew and
  this does not cross.

**Consequences.**
- Sending feedback now reveals the sender's email address to me, which the form
  did not. The legal page says so plainly rather than leaving it implied.
- A device with no mail client configured gets nothing from the row. The
  clipboard copy still happens first, and the address is on the legal page, so
  there is a way through, but it is not a good one.
- The address is now a published contact point and has to keep working. It is
  the same address the legal page gives for trademark requests.

## ADR-076: A restore reloads the app, and backup coverage is asserted against the schema

**Status.** Accepted. Extends ADR-038; the replace-everything rule itself is
unchanged.

**Context.**

Two faults, one visible and one waiting.

The visible one: restoring from Settings left the app running on top of the
database it had just replaced. The shell reads handedness and the drift model
once at boot (`App.tsx`) and holds them in state, so after a Settings restore
the file's drift model was on disk while the old one was still on screen, and
every board derived from it was wrong until the next cold start. The first-run
restore already reloaded for exactly this reason. Only one of the two paths did.

The waiting one: nothing tied the backup to the schema. `createBackup` listed
its tables by hand, and a table added to Dexie without a matching line there
would export, import and validate without a single error. That is the worst
shape a bug can take here, because the file looks fine, the restore reports
success, and the loss is only discovered on the far side, after the device that
held the original has been wiped.

**Decision.**

- **Every restore reloads the app**, from Settings as well as from first run.
  Re-deriving the boot-time state by hand is a list nobody can keep complete,
  which is the same argument ADR-038 makes about merging.
- **Backup coverage is asserted against `db.tables`**, not against a list in a
  test. A table in the schema must appear in the backup or be named in an
  explicit exclusion map with the reason it is safe to lose. `ball_catalog` is
  the only entry: it is read-only reference data, re-synced from the shipped
  catalog.
- **A round-trip test writes one fully populated row into every backed-up
  table** and asserts the tables come back deep-equal. Rows are stored and
  replayed whole, so this makes a field added to any type in future carried by
  construction, and a field the export drops a failing diff.

**Consequences.**
- The Settings restore no longer shows a "Restored N sessions" message. The
  counts were already confirmed against the real numbers in the dialog before
  the user committed, so the message repeated what they had just read.
- The coverage test fails the moment a table is added to `bowlingDb.ts` without
  a decision about backing it up. That is the intent: the decision becomes a
  line in the exclusion map or a line in `createBackup`, and never an omission.

## ADR-077: The header is a switch, and a bowler with history is never asked if they are new

**Status.** Accepted. Amends the header behaviour introduced alongside ADR-040
and the first-run order in ADR-072; neither is otherwise changed.

**Context.**

Two screens were answering the wrong question.

The header followed the scroll pixel for pixel. That was the intent, and it was
wrong: a header tied to the finger spends most of its life half-there, which is
the one height it is no use at. Too short to read, too tall to be out of the
way, and it changes on every frame, so the eye keeps going back to it.

The first run showed its welcome whenever handedness was missing. Handedness is
a row in `settings`, and `settings` only entered the backup file at version 3.
Restore a file taken before that and the device has a full history and no
handedness, so a returning bowler was met with "Start fresh" over the top of
their own seasons, and "Restore from a backup" for a restore they had just
done.

**Decision.**

- **The header flips, it does not slide.** The scroll decides *when*: it takes
  the header away after `COLLAPSE_THRESHOLD` px of committed travel downward,
  and puts it back after the same distance upward. It is only ever fully there
  or fully away. Travel resets when the reader turns around, so a flick that
  changes its mind banks nothing, and a flip resets it too, so coming back needs
  a threshold of its own rather than the tail of the move that just flipped it.
- **The header owns its own motion.** The scroll no longer animates it, so the
  height and transform are transitioned together and are off under
  `prefers-reduced-motion`, which DESIGN-LANGUAGE §7 requires of anything that
  would otherwise change on one frame.
- **The top of a list always shows its header**, with no threshold to clear.
- **First run asks "are you new" of the database, not of the handedness row.**
  A device holding any session goes straight to the handedness question, with no
  welcome, no restore offer, and no way back to either.

**Consequences.**
- The threshold is a number that has to be felt rather than derived. 24px is
  small enough to answer a deliberate flick and large enough to ignore the
  wobble in a thumb held still.
- A bowler with data and no handedness still has to answer one question before
  reaching Home. That is right: the arrows point the wrong way without it, and
  it is one tap rather than a screen about what the app is.
- Restoring a backup remains the way to bring history to a new device. It moved
  out of the first run only for devices that already have history, where it was
  offering to do a thing that had already happened.

## ADR-078: The file never decides whether a frame was a strike

**Status.** Accepted. Amends the import rules of ADR-038; nothing else in it
changes.

**Context.**

`is_strike` and `is_spare` on a frame are a cache. The shots are the record, and
`lib/scoring.ts` derives both marks from the first two shots of a frame. That is
what `docs/DATA_MODEL.md` has always said.

The import did not enforce it. `backupValidation` type-checked the two booleans
and passed them through, so a backup could carry a frame whose shots knock down
ten pins and whose `is_strike` says false. The scorer reads the shots and the
scorecard reads the marks, so a frame like that scores one way and reads another
on the same screen. A hand-edited file, a half-written export, or a bug in some
future writer would all land the same way.

**Decision.**

`normalizeBackup` re-derives `is_strike` and `is_spare` from `shots` for every
frame in the file, on every version, before anything is written. Whatever the
file says about the marks is dropped.

**Consequences.**
- A backup can no longer install a frame that disagrees with itself.
- Nothing is rejected over it. The marks are derivable, so there is nothing for
  the bowler to fix and no reason to make them read an error.
- v1 files, whose flat shot fields are widened into `shots` first, are re-derived
  after that transform, so the two paths agree.
- The claim in `docs/DATA_MODEL.md` is now true of the code. It named backup
  validation as the place that did this; the work belongs to normalization,
  which is the step that already rewrites frames.

## ADR-079: A shot can be taken back

**Status.** Accepted. Amends the scoring flow of ADR-001 and the completed-game
edit gate; the pin input rules of ADR-006 are unchanged.

**Context.**

The scorer had no undo. A ball recorded wrong could only be corrected by tapping
its frame open and editing the pins, which is a different gesture, in a
different place, with a different mental model: you are no longer scoring, you
are auditing. On a lane, mid-frame, with a ball on the return, that is the wrong
shape of action for the most common mistake there is.

The absence of an undo is also what the completed-game confirm was built on. It
gated every edit on a finished game behind a typed-out warning, on the grounds
that a stray tap could rewrite a shot and there was no way back. That reasoning
covered the game you have moved on from and the game you are standing at
equally, and the second one is where a bowler is most likely to want a change
and least likely to want a dialog.

**Decision.**

`undoLastShot(frames)` in `lib/frameController.ts` pops the last shot of the
last frame that has one, and the scorer re-derives its position by running
`hydrateFrameController` over the result. A frame left with no shots is deleted
rather than stored empty.

The control is an icon button beside Strike and the commit button, and it stays
after the tenth frame, because the last ball of a game is exactly the one a
bowler wants back.

The completed-game confirm now applies only to a game other than the one being
bowled.

`saveFrame` clears `final_score` when the game is no longer complete, and
`deleteFrame` does the same, so undoing off the tenth frame un-finishes the game
rather than leaving a stale total behind.

**Consequences.**
- Undo cannot disagree with resume: the position after an undo is computed by
  the same function that computes the position after a reload. Any bug in one is
  a bug in both, and both are covered by the same tests.
- It is one shot deep per press, not a history. Pressing it repeatedly walks
  back through the game, which is the behaviour a stack gives for free; there is
  no redo.
- A shot's ball, line and notes go with it. They were part of the shot.
- The scorer's commit button now names what it will record ("Gutter", "Count
  7"), and says "Next" only when the deck reads as the strike or spare the
  button beside it already offers. Two adjacent buttons with the same word on
  them would be worse than the thing this fixes.

## ADR-080: A session can be started with nothing filled in

**Status.** Accepted. Amends the session shape of ADR-038's backup contract and
the create flow; the stored schema is unchanged.

**Context.**

Starting a session meant filling in a form, and the alley was required: the
sheet's commit stayed disabled until a name was typed. Everything else on that
form was already optional, so the alley alone stood between a bowler and the
pin deck.

That is the wrong toll to charge, and it is charged at the worst moment. Someone
opening the app for the first time is deciding whether the scorer is any good,
and the scorer is the only screen that can answer them. Someone standing at the
lane with a ball on the return is not naming a building, they are about to
throw. In both cases the app asks for a piece of filing before it will do the
job it exists to do.

Every field on that form can be filled in afterwards from the same form: the
session header carries a pencil, and history rows edit in place.

**Decision.**

`alley_name` stays a required string on `Session`, and may now be empty. No
schema version, no migration: an empty string is a legal value of the column
that is already there.

The create form marks the alley `(optional)` and its commit is live from the
moment the sheet opens. Both empty states, Home on a device that has never
scored and the Active tab with nothing running, carry a second action, "Score
now, add details later", which starts a session dated today with nothing else
set and lands on the pin deck.

Everywhere a session is named on screen goes through `alleyLabel()` in
`lib/sessionLabels.ts`, which prints "Unnamed session" for an empty name. The
Game plan's alley filter offers only sessions that name one, since an unnamed
session cannot be filtered by a name.

`backupValidation` no longer rejects an empty `alley_name`. A file carrying one
is a file written by this app.

**Consequences.**
- A backup written by this version imports into an older build only if that
  build's validator predates this change; the older one rejects the whole file
  on an empty alley. This is a one-way relaxation, and the reason it is written
  down here rather than treated as a bug fix.
- Autocomplete and the alley filter are unaffected: `getDistinctAlleys` already
  skips blank values.
- Lane notes are keyed by alley name, so unnamed sessions share one bucket. That
  is the honest answer for a session whose alley is not known, and naming the
  session later moves its notes to the right place.

## ADR-081: The commit button says Next, and a change to a recorded shot asks first

**Status.** Accepted. Supersedes the last consequence of ADR-079 (the commit
button naming its count) and narrows ADR-006 not at all.

**Context.**

ADR-079 made the scorer's commit button name what it was about to record, so it
read "Gutter" or "Count 7" and fell back to "Next" only where the deck was the
strike or spare the button beside it already offered. The reasoning was sound
and the result was not: the word under the thumb changed on every pin tap, and
the number it showed was a count of a deck the bowler was already looking at.

Separately, undo (ADR-079) and inline editing (ADR-001) both rewrite something
already on the card, and neither said so. A stray tap on a selected frame
rewrote a recorded shot silently, and the completed-game confirm covered only a
game the bowler had moved on from.

**Decision.**

The commit button is the word "Next" in every state. What it would record is
named beneath it in subtext: "Strike" or "Hit 7" on a fresh rack, "Spare" or
"Hit 0" at a leave. The accessible name carries the same thing as "Next: Hit 7".
Nothing is shown while a recorded shot is selected, where Next changes nothing.

A change to something already recorded raises a confirm naming what changes:
rewriting a recorded shot, by a pin tap or by the Strike/Spare button, and undo.
The recorded-shot question is asked once per visit to that shot rather than once
per tap, and moving the cursor re-arms it. Live entry never asks, because
choosing the pins left standing is entering the shot, not changing one.

**Consequences.**
- The label stops moving, and the outcome is still on screen before the ball is
  committed, which was the whole point of ADR-079's change.
- Correcting a recorded shot costs one extra tap per visit. Correcting a live
  one costs nothing, and that is the common case by an order of magnitude.
- Undo asks every time. It is one press from destroying a ball, and unlike a pin
  tap there is no cursor to say which one.

## ADR-082: The game plan reads the line back game by game

**Status:** accepted (2026-09).

**Context.** ADR-064b built the game plan out of comparisons: the slice against
the rest of your history, gated three ways. Every one of those findings
collapses a session into a single number, and "Last time" collapsed it further
still, taking the busiest ball across the whole session and the median stance
and target across every fresh-rack shot in it.

That read is wrong in a specific way. Lanes transition, and a bowler moves with
them. A session that opened on the IQ at 23 to 17 and finished on the Wolverine
at 26 to 19 is reported as a middle that was never played. The two questions a
bowler actually carries to the approach, what to open with and how far the line
will have moved by the last game, were the two the screen could not answer,
while it answered questions about carry percentages that no one asks at the
foul line.

**Decision.**

- **Two reads, not one.** "Last time" keeps its sentence and gains a row per
  game of that session: the ball most of that game's fresh-rack balls were
  thrown with, the median stance and target with that ball, and the score. A
  new "How the session moves here" reads the same thing per game *slot* across
  every session in the slice, so game 1 here sits against game 3 here.
- **The median is taken within the busiest ball, never across balls.**
  Averaging a line thrown with two different balls describes a shot nobody
  threw.
- **The movement read is not gated like a comparison.** It compares nothing, so
  the six-game slice floor does not apply to it and its own floor is two games
  per slot rather than three. That floor guards a median stance and target,
  which is a description of what happened, where `MIN_SLOT_GAMES` guards an
  average score, which is noisy. Two slots are needed: one slot is a line, not
  a move.
- **It still recommends nothing.** The summary under the rows states the shift
  in boards and stops. Whether to make that move tonight is the bowler's call,
  on lanes this screen has never seen. Board direction follows handedness, the
  way `LineInput` does: a higher board is left for a right-hander and right for
  a left-hander, and it is not a direction on its own.

**Consequences.**
- The screen says something useful after two sessions at an alley, where before
  it said "still gathering" until six games and a qualifying second slot.
- A game that carried no line is left out rather than shown blank, and dropping
  a slot can take the movement read back below two slots, which is the honest
  outcome.
- "Last time" is now a tall card. It is still one tap target, and what it opens
  is the session those rows came from.

## ADR-083: The game plan pushes Stats rather than crossing to the tab

**Status:** accepted (2026-09).

**Context.** Every callout on the game plan is a claim about a number, and
tapping one hands the Stats screen the slice it was talking about (ADR-065b):
the alley, the pattern, and the chart the callout was about. That hand-off was
a tab switch. It dropped the overlay stack and left the user on the Stats tab
with no way back, so reading a callout cost you the screen that made the point,
and the only route back was the dashboard and another push into the game plan.

The tab switch also could not survive a reload as what it was. `#/stats` says
"the Stats tab", so a refresh landed somewhere the user had not navigated to,
with filters set by a screen no longer on the stack.

**Decision.**

- **The hand-off is a push.** Stats goes on the overlay stack above the game
  plan as `stats-push`, so the platform back, the nav-bar chevron and a reload
  all agree: back returns to the game plan, filters and all.
- **Same component, same filters.** The pushed screen is `StatsView` in `push`
  mode, reading the same remembered `history:*` filters as the tab. The numbers
  a callout sends you to are the numbers the tab would show.
- **Pushed, it does not head itself.** The nav bar carries the title, so the
  screen's own `<h1>Stats</h1>` is suppressed in `push` mode. The filter and
  share controls stay in the content, above the chips they belong to: only one
  of them could have moved into the nav bar's single trailing slot, and
  splitting the pair would have been worse than leaving both.
- **`crossToTab` goes.** It existed for this one hand-off, which was the only
  screen that left a push for a tab. A navigation action with no callers is a
  shape the next screen copies by accident.

**Consequences.**
- `#/home/game-plan/stats-push` is a linkable, reloadable place.
- The Stats screen now has two chromes, and a change to its header has to be
  read in both. The alternative was a second component that would drift.
- Stats reached from the game plan sets the filters the tab will show next time
  it is opened, exactly as the tab switch did. The filters are one shared
  memory, which is the point of them: they are the slice you are looking at,
  not a property of a screen.

## ADR-084: A session you are reading is not the session you are bowling

**Status:** accepted (2026-09).

**Context.** One piece of state meant two things. `view: "active"` plus
`activeSessionId` was both "the session I am bowling" and "a session I happened
to open", because every route into a session went through the same action: the
history list, a stats drill-down, and the game plan's "last time" all switched
to the Active tab and loaded the session there.

That conflation was visible as a bug. The dashboard hides its Game plan card
while `activeSessionId` is set, because a game plan is read between sessions.
Open a past session from the game plan, go home, and the card was gone: the app
believed a session was underway on the strength of a session the user had only
looked at. Opening a past session mid-session was worse, silently evicting the
session actually being bowled from the tab meant to hold it.

**Decision.**

- **Two pieces of state.** `activeSessionId` is the session being bowled, and
  only that. `viewedSessionId`, beside a `session` overlay, is a session being
  read, pushed over the list it was opened from. The id sits beside the overlay
  rather than inside it for the same reason `catalogBallId` does: the Overlay
  union cannot carry one.
- **The session decides which, not the caller.** Opening a session reads
  `getResumableForSession`. A session with a game still to finish loads into the
  Active tab, because that is the one place scoring happens. Every other session
  pushes. Every caller is a list of sessions and none of them knows which kind
  it is holding, so the choice belongs in one place rather than at each of them.
- **The pushed screen is the same component.** `ActiveSessionView` in `push`
  mode wraps itself in a `PushScreen`, so it carries a back control and the tab
  bar stays live underneath. A finished session already hides the live-entry
  controls, so nothing had to be disabled to make it a reading screen.
- **`#/history/session/12` is the URL**, the id riding behind its own overlay
  segment. `#/session/12` still means the Active tab's session: a view is
  always the first segment and an overlay never is, so the two cannot collide.

**Consequences.**
- The Game plan card survives reading a past session, which is the bug that
  started this.
- Opening a session while bowling one no longer evicts the one being bowled.
- Back out of a session returns to the list it was opened from rather than to
  whatever `previousView` happened to hold.
- Deleting a session has two places to close it from, and does.
- The Active tab can still be empty while history is full, which is correct:
  it is where you bowl, not where you browse.

## ADR-085: A tab switch does not animate

**Status:** accepted (2026-09).

**Context.** Tab content entered from the side of the tab that was tapped, on a
220ms slide, so the travel matched the reach. It read well in isolation and
badly in use: the tab bar is the one piece of chrome always on screen, switching
tabs is the most frequent navigation in the app, and every switch put a fifth of
a second of movement between the tap and the screen that was already chosen.

A push earns its slide because it is going somewhere new and back has to undo
it. A tab switch is not going anywhere: the destination was visible and one tap
away the whole time.

**Decision.**

Tab content swaps. No enter animation, no exit, no keyframes. The `<main>` stays
keyed on the view, because several screens rely on the remount for their
one-shot landing state, but the key now costs nothing visible.

Push screens, sheets, dialogs and the collapsing header keep their motion
unchanged: each is a place arriving or leaving, and each has a back that has to
undo it.

**Consequences.**
- The `slide-in-from-right` and `slide-in-from-left` keyframes and their two
  classes are gone, along with the direction state that picked between them.
- `docs/DESIGN-LANGUAGE.md` §7 records the absence rather than leaving the rule
  to be rediscovered from the code, since a missing animation is exactly the
  kind of thing a later change adds back as an improvement.
- Nothing was reduced-motion-only here: the switch is now instant for everyone,
  which is what `prefers-reduced-motion` already gave a minority.

## ADR-086: The collapsing header and the list under it are one block

**Status:** accepted (2026-09). Amends the motion introduced by ADR-077; the
flip itself, its threshold and its rule about the top of a list are unchanged.

**Context.** The header went away well and came back badly. Going, the reader is
already moving with it and rarely watching it. Coming back, they are watching,
and it read as the list being shoved down past where the header had got to.

Two things were animating. The row transitioned its `height`, and the row's
contents transitioned a `transform`, on the same curve and the same duration.
Same curve is not the same motion: a height is laid out on the main thread and a
transform is composited, so one drops a frame the other does not, and the gap
between them is exactly the header height at its worst. Everything below the
header followed the height, which is the half that stutters.

The row also fought the reader at the end of a short list. Taking the header
away hands its height to the scroller, so there is a header less to scroll, and
the browser pulls the position back to the new end. Read as a scroll, that is a
movement upward of a whole header height, which brings the header back, which
takes the height away again.

**Decision.**

- **The header and its scroll area are one block, and the block slides.** Only
  `transform` is animated, on one element, so there is nothing left to drift
  against. `CollapsingHeader` now wraps the scroller rather than sitting above
  it, and both views hand it their list.
- **The space is still given back, not slid over.** While the header is up, the
  block is a header taller than the screen, so the scroller keeps the height the
  header let go of. That extra height is only ever added or taken away while it
  is below the bottom edge, which is why it needs no transition and why the
  block stays tall until the slide has finished.
- **A position the browser clamped is not a scroll.** `useHeaderCollapse`
  measures travel from a baseline capped to the scroller's current range, so the
  pull back to a new end reads as no movement at all.

**Consequences.**
- The header's own height is no longer animated anywhere, and the transition
  duration in `index.css` now has a counterpart constant in the component, which
  has to know when the slide is over. They are commented as a pair.
- The block is a `transform`ed ancestor, so a `position: fixed` descendant of a
  list would be positioned against it. Every overlay already portals to `body`,
  which is a rule ADR-040 set for its own reasons and this one now relies on.
- `e2e/header-collapse.spec.ts` measures the two halves mid-slide, on one frame,
  because a drift between them is invisible to an assertion taken at rest and
  was invisible to the suite for as long as it existed.

## ADR-087: The header only goes if the list can spare it

**Status:** accepted (2026-09). Amends the flip conditions of ADR-077; ADR-086's
one-block motion is unchanged.

**Context.** ADR-086 made the header and the list move as one block, which fixed
the drift between them. It did not fix the case that is worst to read, which is
History with a filter on.

A filter works both ends of the rule against the reader. The chips row makes the
header nearly twice as tall, around 108px rather than 56px, and the filter is
there to leave fewer sessions under it. On a 390x844 phone that is a list barely
longer than the screen with a header a quarter of it tall.

Flipping such a header away hands the list a height it has no content for. There
is then a header less to scroll, so the browser pulls the position back to the
new end, and the reader gets a lurch of up to a full header on top of the travel
they asked for, in exchange for a few pixels of extra list. The guard added with
ADR-086 stopped that lurch being read back as a scroll, so the row no longer
oscillated, but the lurch itself was still there and still the wrong answer.

**Decision.**

The header goes away only when the list can spare it: what is left to scroll
once the header's height is handed over must be at least the header's own
height, and must still be at least where the reader is now. Otherwise the header
stays, and the banked travel stays with it, so the flip lands the moment the
list grows enough to afford it.

**Consequences.**
- On a filtered History the header simply stays. That costs the reader nothing
  they can see: the list under it is short, which is what the filter was for.
- A list only a little longer than the screen keeps its header too. The
  collapse exists to buy a long list more room, and there is no long list here.
- `nextCollapse` now takes the scroller's range and the header's height. Both
  are already known at the call site, and neither is an argument the caller has
  to compute.
- The flip is no longer reachable by a fast flick that lands past the shortened
  end, which was the one way the clamp could still be provoked.

## ADR-088: A fresh rack is a cleared deck, not ten pins available

**Status:** accepted (2026-09). Amends ADR-006 and ADR-045; supersedes nothing.

**Context.** "Fresh rack" decides a lot: whether the primary button says Strike
or Spare, whether the pin deck opens all-down or pins-up (ADR-006's inverted
input), whether a shot has a pocket to hit (ADR-046), whether it is a strike
opportunity in the stats, and which shot a line carries from (ADR-029, ADR-045).

Two definitions of it were in the codebase. `lanes.freshRackShotIndices`, which
the stats and the seeding rules read, says a ball is at a fresh rack when it is
ball 1 or the ball before it cleared the deck. The scorer and the frame
controller instead counted the pins available to the shot: ten means fresh.

Those agree on every frame except the one that matters here. A gutter ball, and
now a foul (ADR-089), leaves all ten pins available to the next ball, and the
count says fresh rack. It is not one. That ball is a spare attempt at a full
rack, and it can only ever be a spare, never a strike.

So after a gutter the scorer offered Strike, opened the deck all-down when the
ten pins were plainly still up, read the shot for a pocket hit it had no claim
to, and counted a strike opportunity in one place while the stats counted none.

**Decision.**

There is one definition, `lanes.isFreshRackShot(shots, shotIndex)`: the shot at
index 0, or a shot whose predecessor left nothing standing. Every caller reads
it, including the ones that used to count available pins. It answers for a shot
that has not been recorded yet, which is how the scorer asks about the ball it
is about to take.

**Consequences.**
- After a gutter or a foul the primary button reads Spare, the deck opens
  pins-up, Next previews "(Spare)", and clearing the rack scores and renders as
  the spare it is.
- The same holds in the 10th, live and on resume: the 11th ball after a gutter
  opens pins-up, while the 11th after a strike still opens all-down.
- No pocket verdict is written for a ball at a leave, whatever the leave's size,
  which is what the stats already assumed.
- `freshRackStart` takes the previous ball's deck rather than inferring it from
  a count, so the frame controller can no longer disagree with the stats.

## ADR-089: A foul is its own mark, and it hides behind More

**Status:** accepted (2026-09). Extends the shot model of ADR-001.

**Context.** The app could record a ball worth nothing, by leaving every
available pin standing, and it drew that as the dash it is. It could not say
*why* it was worth nothing. A gutter ball and a foul score the same and read
very differently a month later, and the sheet a bowler keeps by hand has always
separated them: a foul is an F.

Both are also awkward to enter. Marking a gutter means tapping ten pins back up,
or tapping none and trusting the inverted input, and there was no way at all to
say the ball crossed the line.

They are rare, though. Neither deserves a permanent place beside Strike and
Next, which are the two buttons every ball uses and which would each lose a
third of their width to make room.

**Decision.**

`Shot.foul` is a boolean. A foul records the deck exactly as it found it, which
is what makes its pinfall zero, plus the flag; the scorecard draws F where the
pinfall would otherwise draw a dash.

Both marks sit behind a **More** button under the Strike/Next row, one tap away
and folded back afterwards.

**Consequences.**
- Scoring is untouched. A foul is zero pinfall because the pins it carries are
  the pins that were available, and every existing rule reads it that way. A
  first-ball foul therefore models the respot correctly, and the frame can still
  be spared with the second ball.
- Nothing migrates. `foul` is absent on every shot recorded before this, which
  reads as "not a foul", and a backup from either side of the change imports.
- Re-entering a recorded shot's pins clears its foul, the same argument ADR-046
  makes for the pocket verdict: the mark was about a ball that is being told
  differently now.
- The 10th frame needs no special case. A foul on the 11th or 12th ball marks
  that ball, and the frame's own rules about what earns a third ball are about
  pinfall, which a foul has none of.

## ADR-090: The 10th frame is a spare-line source like any other

**Status:** accepted (2026-09). Amends ADR-052.

**Context.** `sessionSpareIntended` is how a leave you have already shot at this
session seeds the box the next time you face it. It paired `shots[0]` with
`shots[1]` and skipped the 10th frame outright, because in the 10th that pair is
not a leave and the ball at it: after a strike, `shots[1]` is a fresh rack.

The skip was correct about the pairing and wrong about the frame. It left the
11th and the 12th balls as the only spare attempts in a session whose line was
never written down anywhere. Shoot the 10-pin in the 10th, and the next game
opened that same leave with an empty box, which is exactly the carry the rule
exists to provide.

**Decision.**

A spare attempt is the ball after a fresh-rack ball that left pins standing
(ADR-088), read with `freshRackShotIndices`. That is the same pairing in frames
1 to 9 and the right one in the 10th, so the frame needs no exception.

**Consequences.**
- A leave shot in the 10th seeds the same leave later in the session, in this
  game or the next, exactly as one shot in the 4th does.
- The offer to save a new Spare Line follows the same rule, so a 10th that opens
  with a strike and shoots a leave with its 12th ball is offered too. It used to
  be skipped for having struck.
- Nothing else moves: the precedence in `lineForBall` is unchanged, and a
  fresh-rack bonus ball is still not an attempt at anything.

## ADR-091: An adjuster row does not depend on the keyboard staying up

**Status:** accepted (2026-09).

**Context.** The board fields reveal their adjusters on focus: the stance/target
nudge, and the three move presets. Each is one full-width button whose left and
right halves move the boards in opposite directions, and each acts on
`pointerdown` with `preventDefault()`, so the field keeps focus and the row stays
open under the finger.

That rests on `preventDefault()` on a pointer event suppressing the focus change.
Chrome honours it. WebKit does not reliably: iOS moved focus out of the field
anyway, the keyboard went down, `focused` went null, and the row the press landed
on unmounted mid-press. On a phone that reads as a button that does nothing
except dismiss the keyboard, which is what it was reported as.

The row was gated on the field holding focus, and focus is the thing the
platform would not guarantee.

**Decision.**

Three things, none of which trust a single mechanism:

1. `mousedown`'s default is cancelable everywhere, so the adjusters cancel that
   too. That alone keeps focus in every engine that synthesises mouse events
   from a tap.
2. A press hands focus back to the field it belongs to, so the state and the
   platform agree again even where step 1 was too late.
3. A blur raised by an adjuster press does not close the row. The press is not
   the bowler leaving the field, and the adjusters read the entered text rather
   than the focus, so the row goes on working either way.

**Consequences.**
- Both halves of every adjuster move the boards on iOS, and the row stays open
  for the next one.
- Leaving the field for anything else still closes the row, which is the only
  way it was ever meant to close.
- A press is still one `pointerdown`. Nothing moved to `click`, which on touch
  arrives late and, after a `preventDefault`ed `pointerdown`, sometimes not at
  all.

## ADR-092: A spare opportunity is any leave a ball followed

**Status:** accepted (2026-09). Amends ADR-036.

**Context.** Spare % read ball 1 and ball 2 of a frame and nothing else. In
frames 1 to 9 those are the only two balls, so it was right. In the 10th it was
blind: a 10th of strike, 9, spare converted a leave with the 12th ball, and no
rate counted it, while the leaves card counted it correctly because
`leaveEvents` already reads every fresh-rack ball in the frame.

One frame's worth of spares is not nothing when a bowler shoots three games a
night, and a number that disagrees with the card underneath it is worse than a
number that is merely small.

**Decision.**

`tallyFrame` counts spare opportunities from `leaveEvents`: every makeable leave
(ADR-036's test is unchanged) that a ball actually followed, wherever in the
frame it was left, with a conversion when that ball cleared it.

**Consequences.**
- Frames 1 to 9 are arithmetically identical to before: one fresh-rack ball, one
  leave, one chance.
- The 10th now contributes up to two spare opportunities, which is how many it
  can really hold.
- A leave off the 10th's last ball still counts nowhere, because no ball can
  follow it. That is ADR-051's rule, and `leaveEvents` was already applying it.

## ADR-093: The header floats over the list, and the scroll is never moved by it

**Status:** accepted (2026-09). Supersedes the reclaim in ADR-086 and the
condition it forced in ADR-087; the flip itself, its threshold, and the rule
that the top of a list always shows its header are unchanged.

**Context.**

Three goes at this fixed three real faults and never fixed what was reported.

ADR-077 made the header a switch. ADR-086 found that the row's height and its
contents' transform were animated on two different pipelines and made the header
and the list one block. ADR-087 found that on a short list the flip handed the
list a height it could not use, and refused the flip there. Each was a genuine
defect, and after all three the complaint was word for word what it had been at
the start: scrolling down brings the screen up with the header, scrolling up
brings the screen down with it.

The three fixes have one assumption between them, which is the one thing never
questioned: that the header gives the list its height and takes it back. Every
one of those is the list moving by a header, on top of the travel the finger
asked for. It cannot be smoothed, because it is not a rendering fault. A reclaim
*is* a move.

**Decision.**

The list is the full height of the screen whether the header is there or not.
The header floats above it, and the flip changes only how much of the list the
header is covering. Nothing reflows, the scroller's height never changes, so
nothing is clamped, and a finger on the list moves it by exactly as much as the
finger moved.

The header keeps its own motion: it slides, on a transform, on its own curve,
and it is still only ever fully there or fully away.

**Consequences.**
- The list runs under the header rather than starting below it, so the header
  needs a ground of its own. `bg-surface-sunken`, the app's own background, as
  `CatalogView`'s sticky header already uses.
- The top of the list keeps a header's height of space, so the first card is
  never behind the header, and the top of a list always shows its header, so
  that space is never empty.
- ADR-087's condition goes with the reclaim that forced it. Flipping now costs
  the reader nothing on any list, so weighing whether the list can afford it
  weighs nothing. The guard against reading a clamp as a scroll stays: the list
  can still get shorter under the reader, from a deleted session or an applied
  filter.
- `CollapsingHeader` owns the scroll area rather than sitting above it, so that
  the space at the top of the list and the height of the header cannot drift
  apart. Views hand it their list and an `onScroll`.
- What is lost is that the header covers list while it is there. That is what a
  header does, and it is what the collapse is for.

---

## ADR-094: A finished game has an edit mode, not an undo

**Status:** accepted (2026-09). Amends the undo placement and the lock rule of
ADR-079; the undo mechanism itself, and the per-shot confirm of ADR-081, are
unchanged.

**Context.**

Once the tenth frame landed, the scorer dropped Strike, Spare and the More row
that holds Gutter and Foul, and left Undo standing alone. That is exactly
backwards for the thing a bowler actually wants from a finished game.

A finished game is read, not bowled. When a correction is wanted it is almost
always a specific ball several frames back: the foul in frame 3 that was
recorded as a gutter, the count that went in one pin light. Undo cannot reach
it. Undo pops the last recorded ball, so reaching frame 3 means taking apart
frames 10 through 3 and bowling them again, and every press of it on a finished
game destroys a frame the bowler did not ask about.

Meanwhile the marks that *would* fix it in one tap, Strike, Spare, Gutter and
Foul, were the things that had been taken away. The card was still tappable, so
a shot could be selected, and then there was nothing to do to it but move pins
one at a time on the deck.

ADR-079 also left the completed-game lock applying to every game except the one
being bowled, and its reason was that undo was right there. On a finished game
it no longer is.

**Decision.**

Every finished game is locked, the one just bowled included. Locked, the scorer
shows no control that records a ball: no Strike or Spare, no Next, no More, and
no Undo. It shows one quiet ghost button, **Edit shots**.

Edit shots raises the existing completed-game `ConfirmDialog`, and confirming it
turns edit mode on. So does a tap on a locked pin or a locked field, which
raises the same prompt: the door is wherever the bowler reached for it.

In edit mode the marks come back, aimed at the recorded shot in the cursor.
Strike/Spare applies to it, Gutter and Foul apply to it from behind More, and
each still asks once per visit to that shot (ADR-081). Next does not come back,
because there is no ball to enter. **Done** puts them away and locks the game
again.

Undo is now shown only while a game is unfinished.

**Consequences.**
- Two deliberate acts stand between a reading bowler and a rewritten shot: open
  edit mode, then confirm the change to the shot. Neither is a dialog in the way
  of ordinary scoring, because neither exists until the game is finished.
- The cursor does not move after a mark is applied on a finished game. There is
  no live shot to jump back to, and the card and the detail panel both go on
  describing what was just changed.
- Leaving edit mode is what re-arms the prompt. Crossing to another game in the
  session and back does not, so a correction that spans two games is not two
  dialogs.
- The last ball of a game that finished wrong now costs one more tap than it
  did: Edit shots, confirm, then the mark. It is aimed at that ball rather than
  at whatever happens to be last, which is the trade.
- `isCurrentGame` is gone from `ActiveGameScorer`. The lock no longer asks which
  game is being bowled, only whether the game in front of it is finished.

---

## ADR-095: A washout washes out to one side, so the 2 and the 3 cannot both stand

**Status:** accepted (2026-09). Narrows `isWashout` from ADR-036; the split and
baby-split classification is unchanged, and nothing is stored or migrated.

**Context.** ADR-036 defined a washout as the head pin standing with the rest of
the leave forming a split without it. That is the right shape for 1-2-10 and
1-3-7, and it is wrong for a leave the ball never really entered. A full rack
after a gutter or a foul has the 1 up and, with the 1 removed, a 2-through-10
spread that reads as a split, so it was filed as a washout. So was 1-2-3-5.
Those came out of spare % as unmakeable, which is the opposite of true: the rack
is standing whole in front of the bowler and the second ball has the whole front
of it to work with.

What the original rule missed is what a washout physically is. The ball comes in
on one side of the head pin and carries that side away, leaving the head pin and
whatever survives on the far side behind a gap. It washes out to one side. If
both the 2 and the 3 are still standing the ball did not do that, whatever the
geometry of the pins behind them looks like.

**Decision.** A washout is the head pin standing, the 2 and the 3 not both
standing, and the remaining pins forming a split without the head pin. The
2-and-3 test is one line in `isWashout`; no new geometry and no new constants.

**Consequences.**
- A full rack after a gutter or foul, 1-2-3-5, and anything else holding both
  front pins are makeables now. They re-enter spare %, in the numerator and the
  denominator alike, and they move to the Makeables section of the leave grids.
- Spare % changes again for existing data, downward for anyone who has gutters
  or fouls on record, because a full rack is a leave they were expected to
  convert some of. As with ADR-036 the rate is derived on every render, so there
  is nothing to migrate.
- The washout conversion rate now reports only true washouts, which is what made
  it worth its own section.

## ADR-096: A filter only offers what leads somewhere, most common first

**Context.** The filter sheet built each picker from the whole history. Pick the
house you visit once a year and the pattern list still named every pattern you
have ever seen, nearly all of them somewhere else, and every one of those was a
tap that emptied the screen. The lists were alphabetical, so the house you bowl
every week sat wherever its name fell.

Worse, the filters already applied were left alone when a new one arrived.
Picking a house kept last month's pattern on, the two never co-occurred, and the
screen went empty with two chips and no hint as to which one was the problem.

**Decision.** Each picker offers only the values present in the sessions that
match the *other* filters, and every write drops whatever it has just made
impossible (`src/lib/filterFacets.ts`). A facet never narrows itself: the alley
list is not cut down to the alley already chosen, and the game chips do not
vanish when one of them is picked.

Text lists come back most common first, ties alphabetical. Game and lane numbers
stay in number order, because they are read as a sequence.

Lanes keep their existing rule of being offered only inside a chosen house, and
they are left out of the question of which houses to offer: lane 7 is a
different lane at every house, so letting it narrow that list would hide houses
behind a number that was never about them.

**Consequences.**
- A filter combination can no longer be assembled that matches nothing, so the
  empty-state copy is about a slice with no data rather than a contradiction.
- Clearing everything is one write (`clearAll`). Four setters in a row would
  each write the whole selection and put back what the one before had cleared.
- Game plan takes a location rather than offering "any alley", defaulting to the
  house with the most sessions. It reads one place back to you, and an average
  across three houses is a number about none of them.

## ADR-097: A leave count is read against how much was thrown, and Game plan reads one ball table through a scope

**Context.** Two numbers on the stats side rewarded volume rather than
describing a ball.

The per-ball leave cards counted leaves and stopped. The ball with forty five
fresh-rack balls behind it showed four 10 pins and the ball with fifteen showed
two, and the second ball is the one leaving them more often. Nothing on the card
said so.

Game plan had nothing to say about which ball works when. The ball table on
Stats breaks out by game number, which is the right grain for a table and the
wrong one for a plan, and getting the read a bowler actually wants meant
setting three filters on another screen and reading a column at a time.

**Decision.** Every `LeaveStats` carries `sharePct` beside its count: attempts
over the fresh-rack balls in whatever produced it, which for a ball's own leaves
is that ball's fresh-rack balls and for the leaves card is every fresh-rack ball
in view.

Game plan carries one ball table and a chip row that re-reads it: every game
here, then each game number bowled, then the windows of a session, fresh (games
1 to 2), mid (2 to 4) and late (4 on). One table rather than a card per window,
because a card per scope is a screen the reader scrolls past to reach the one
scope they wanted, and because the per-game read and the window read are the
same question at two grains.

The windows overlap, and that is the decision rather than an accident of the
boundaries. A pattern breaks down by shots thrown on it, so game 2 behind a
squad of eight is a long way from fresh and game 2 bowling alone is not, and the
app records neither the squad size nor the pair's traffic. A hard cut would put
a boundary where the data cannot support one; overlapping windows let a ball
appear in two of them and let the reader see where it stops working. A window
covering only one game number that was actually bowled is not offered: its chip
would lead to that game's table under a second name.

Game plan also takes a lane, and a lane does not replace the house read: each
ball carries both, the lane above and every lane at that alley and pattern
below. Falling back per screen would be wrong in both directions, because the
fallback is never uniform. The ball thrown every game has a real read on lane 7
while the one pulled out twice a season does not, and they sit in the same
table. A lane read under eight fresh-rack balls is marked thin and does not set
the order, rather than being hidden: a thin read next to a fuller one is
information, and it is the column the lane picker was chosen for.

Balls are ordered by strike rate within a scope, on the lane read where that
read is not thin and on the house read otherwise. Strike rate is the one rate
that counts everything the ball did with a full rack in front of it.

Scope rates are the per-game cells of `calculateBallPerformance` added up, not a
second pass over the frames, so ADR-048 still holds: there is one definition of
pocket, carry and strike, and a figure here reconciles with the row it came
from.

**Consequences.**
- A ball needs twelve fresh-rack balls inside a scope before it is listed
  there, lower than the ball callout's floor of twenty, because a scope can be
  one game of each session rather than all of them. A single game of a thin
  history therefore offers no chip of its own, and the wider scopes still do.
- A ball that is only pulled out when the lanes have gone will read badly late
  and be absent from fresh. The section says what happened; it does not
  recommend, for the same reason ADR-064b does not.
- The lane picker is offered only inside a chosen house, like every other lane
  filter (ADR-096): lane 7 is a different lane at every house.
- Lane filtering is per frame, so a lane read is the frames bowled on that lane
  rather than the games, and a pair played alternately gives roughly half the
  balls of the house read. That is why the thin floor is lower than the scope
  floor rather than equal to it.

## ADR-098: A grip style is a bowler's setting, stored and shared before it is modelled

**Context.** The app knows two things about the bowler that every layout is read
against: which hand they throw with, and where their axis comes out. It did not
know how they hold the ball.

Two-handed bowling is not a variation on a one-handed release. There is no thumb
in the ball, the axis tilt and rotation a two-hander generates are outside the
range a one-handed model is fitted to, and a PAP measured off a two-handed track
sits somewhere a one-handed chart has no advice about. The dual angle system
itself was written for a thumb-in game, and the motion reading in
`lib/ballLayout.ts` is calibrated against that chart.

So there were two ways to add it: model it, or record it. Modelling it now would
mean inventing coefficients for a release nothing in this codebase has ever
measured, and the layout lab's whole value is that a bowler can trust what it
says about a layout before drilling it.

**Decision.** `GripStyle` is `"1h" | "2h"`, stored under the `grip_style`
settings key alongside handedness and the PAP, edited in Settings, Preferences
and in the layout lab, and carried in a shared layout link as `grip`.

Nothing downstream reads it yet. `layoutGeometry`, `readMotion` and the ball
drawing are unchanged by it, and the Preferences copy says so out loud rather
than leaving a bowler to assume the numbers moved.

Absent means one-handed, everywhere: unset in the database, missing from a link,
or unreadable in one. A toggle sitting on neither answer is a question nobody
asked, and one-handed is still overwhelmingly the common grip.

**Consequences.**
- Every layout link shared before this reads back as one-handed, which is what
  it was, so no link breaks and none has to be versioned.
- The setting accretes now and is available the day the geometry is taught two
  handed layouts, so nobody has to re-answer it then.
- A two-handed bowler gets a layout reading calibrated for a thumb-in game and
  is told nothing about that in the lab itself, only in Preferences. That is the
  cost of recording before modelling, and it is the smaller cost: a number
  quietly computed for the wrong release would be worse than a number the app
  has not adjusted and says it has not adjusted.
- No schema version. `settings` is a key-value table, so a new key is a new row
  (ADR-038's backup shape carries it without changes).

## ADR-099: A ball's layout is numbers, and which notation it is read in is a preference

**Context.** The arsenal took a layout as free text. The field accepted
`45 x 4 1/2 x 35`, `45/4.5/35`, `4 1/2 pin, 45 deg` and everything else a bowler
might write on a drill sheet, and stored it exactly as typed. That made the
bowler the formatter, and it made the stored layout unreadable to the app: the
arsenal could print the string back and nothing else could do anything with it.

Meanwhile the layout lab had the whole of `lib/ballLayout.ts` behind it: the
dual angle three, Storm's VLS distances, an exact conversion between them, the
ball drawn with its landmarks on it, and a motion reading. None of it could be
pointed at a ball the bowler owns, because a ball owned no numbers.

Two notations are in real use, and which one a bowler thinks in is a fact about
the bowler, not about the ball: a pro shop that writes VLS on the drill sheet
writes it on every sheet. But a single ball can arrive written the other way,
and re-deriving it in your head to enter it is exactly the error this change
exists to remove.

**Decision.** A ball carries `layout_spec`, a `BallLayoutSpec`: the dual angle
three (`drillingAngle`, `pinToPap`, `valAngle`), the ball's own core geometry
(`symmetric`, `pinToCore`), and an optional `system`.

The stored numbers are always dual angle. VLS is a pure function of them plus
`pinToCore` (`toVls`), so storing both would be storing one fact twice, and two
copies of one fact are two chances to disagree. `symmetric` and `pinToCore` are
part of the layout rather than read off the catalog entry, because the
conversion needs them and a hand-entered ball has no catalog entry to ask.

Which notation a layout is *shown* in is a preference, `layout_system` in
`settings`, edited in Settings, Appearance, and unset means dual angle. A ball
may pin itself to one notation with `spec.system`, which the ball form writes
when a notation is chosen on that ball; a ball that never asked keeps following
the preference, which is what makes the preference worth having.

The free text `layout` field stays on the type and is never written again. It is
not parsed into numbers: `45 x 4.5 x 35` does not say whether the core is
symmetric or where its PSA sits, and a guessed layout is worse than a remembered
string. A ball that has one shows it until a layout is entered, and entering one
drops it.

The fields inside `layout_spec` are camelCase, against ADR-002's snake_case rule
for DB fields, for the same reason `catalog_snapshot` is: the object is a stored
copy of a `lib/` type, and renaming every field on the way in and out would add a
mapping layer whose only job is to be got wrong once.

**Consequences.**
- No schema version. `layout_spec` is not indexed, so Dexie stores it as-is
  (see "When a Dexie version bump is needed" in DATA_MODEL.md).
- A backup carries it, and `backupValidation.ts` checks it: these numbers go
  into spherical geometry and come back out as a drawing, so a string where a
  degree count belongs would propagate as NaN through every coordinate of a
  ball the app had just called valid.
- An older build reading a newer backup ignores `layout_spec` and shows the ball
  with no layout, rather than breaking. It will also drop the field on the next
  save of that ball, which is the ordinary cost of an older build editing newer
  rows and is why the free text is never deleted on the way in.
- The arsenal can hand a ball's layout to the lab, so "what does this ball
  actually do" is now a question with an answer on screen. The lab still saves
  nothing: what it opens on is a copy, and it says so.
- A bowler who switches the preference re-reads their whole arsenal in the other
  notation, including balls drilled before the switch, because the numbers
  convert exactly.

## ADR-100: A two-handed grip changes what is drilled, not what the chart says

**Status:** accepted (2026-09). Takes up the modelling question ADR-098 parked.

**Context.** ADR-098 stored `GripStyle` and had nothing read it, on the grounds
that inventing coefficients for a release nothing here has measured would be
worse than saying nothing. That is still true of the motion reading. It was
never true of the drawing.

Two things were wrong once the grip was known and unused.

The first is not about two-handers at all. The drawing marks the centre of grip
with a cross, and that cross is the origin of the whole layout: a PAP is so many
inches over and up from it, the VAL is perpendicular to the line from the PAP to
it, and every arc on the ball is measured in that frame. The holes around it were
placed at 1.7" below and 2.4" above, numbers chosen to look right, so the
midpoint of the span sat 0.35" above the point labelled as its centre. The
picture disagreed with the arithmetic about the one point the arithmetic starts
from.

The second is that a two-hander's ball has no thumb hole, and the drawing drew
one. That is not a calibration question. It is a fact about what is drilled.

**Decision.** Where the holes go is geometry, so it moved from
`BallLayoutDiagram` into `lib/ballLayout` as `gripHoles(gripCenter, hand, grip)`,
with the drawing keeping only how big they look.

The centre of grip is defined by the holes rather than the other way round, and
the two grips define it differently:

- One-handed it is the midpoint of the span, so the thumb hole and the middle of
  the finger row sit half a `GRIP_SPAN` either side of it, and the centre lands
  in the web of the hand where no hole is.
- Two-handed there is no thumb to take a midpoint against, so the finger row is
  the whole grip and the centre is the point between the two finger holes.

`GRIP_SPAN` is a constant, 4 1/4". Span is a hand fitting, it is the one number
on this screen no layout chart asks for, and a slider for it would suggest that
moving it changes the layout. It does not: `layoutGeometry` measures from the
centre of grip, so where the holes sit relative to that centre changes no pin,
no PAP, no core and no arc between them. A bowler with a longer or shorter hand
reads a picture whose holes are an eighth or two out, and the point the layout
hangs off is exact either way.

Two further things follow from there being no thumb hole, and both are reported
rather than modelled:

- The chart's 2 3/8" to 3 3/8" do-not-use band is a thumb-hole rule. What it
  warns about, in its own words, is the track running over the hole. Remove the
  hole and the band has nothing left to be about, so `inDoNotUseBand` takes the
  grip and is false for a two-hander: the slider loses its shaded band and the
  motion reading loses its warning, both through that one function.
- The symmetric-ball PSA marker names the thumb hole because the thumb hole is
  the mass the drilling removes. A two-hander has none, so no marker is drawn.
  Putting one at the fingers would be inventing a landmark rather than reporting
  one.

Nothing else moves. `readMotion` takes the grip only to route the band warning:
flare, length, angularity and strength are identical for the two grips, and a
test asserts that rather than leaving it to be noticed.

**Consequences.**
- A two-handed bowler gets a drawing of their own ball and a slider with no
  false band on it, which is the range the band was routing them out of for a
  reason that does not apply to them.
- The motion reading is still the thumb-in chart's for both grips. Preferences
  says so, in the same place it used to say nothing downstream read the setting
  at all.
- No schema change and no link change. The grip was already stored (ADR-098) and
  already carried in a shared layout, so every existing link draws correctly the
  moment this ships.
- `GRIP_SPAN` is the app's first stated opinion about a hand rather than a ball.
  If span is ever asked for, it replaces the constant and nothing else: the one
  reason it exists is to place two holes around a centre that was already exact.
## ADR-101 — An oil pattern is its load table, and the lane draws it

**Status.** Accepted, 2026-09-15.

**Context.** An oil pattern in the app was a name and a link to its sheet. The
sheet is where the numbers were, which means the numbers were somewhere the app
could not reach: a bowler looking at their line on the lane and at a 42 ft
pattern on a PDF had to hold the second one in their head and imagine where the
ball ran out of oil. That imagined point is the one that decides the shot. The
lane already drew a generic sheen over the front 45 ft, which is decoration, and
decoration in the shape of data is worse than nothing, because it invites the
reading it cannot support.

The obvious small version is to store a pattern distance and draw a line across
the lane at it. That draws the *end* of the pattern, and the end of the pattern
is only the exit point for a ball that stays inside the oiled width the whole
way down. A ball played out to the dry leaves the pattern early, out at the
edge, with oil still ahead of it. A single distance cannot express that, and a
distance plus a ratio still cannot: ratio is a summary of a shape, not the
shape.

**Decision.** `OilPattern.passes` stores the sheet's load table, one `OilPass`
per machine pass, named after the sheet's own columns: START and STOP boards,
LOADS, MICS, and the START and END feet the pass runs over. That list is the
pattern, and everything quoted about a pattern is derived from it in
`lib/oilPattern.ts`, never stored beside it. Storing a distance or a ratio as
its own field would let the two disagree, and a pattern whose stated ratio
contradicts its own table is a pattern nobody can act on.

The model is checked against a real sheet rather than against itself. Kegel's
Element Challenge Chromium 6742 is transcribed row for row in
`lib/oilPattern.fixture.ts`, and the derivations reproduce every total it
prints: CROSSED, T.OIL, 15.41 mL forward, 10.15 mL reverse, 25.56 mL total,
42 ft, and the six track zone ratios. Three of the rules below are only right
*because* that sheet said so, and the first draft of this ADR had all three
wrong.

- **Boards** are absolute, counted from the left edge, 1 to 39. A sheet writes
  them counted in from each gutter, so "2L to 2R" is boards 2 to 38, and
  `parseSheetBoard` converts. That reading is checkable rather than assumed:
  the sheet prints CROSSED 111 for that pass at 3 loads, and 3 × 37 is 111.
- **A reverse pass ends before it starts.** The sheet prints its reverse rows
  as 42.0 to 39.0, running back toward the foul line, so `end_distance` may be
  less than `start_distance` and the covered span is read either way round.
  Requiring end past start, as the first draft did, made half of every real
  sheet untranscribable.
- **A buffer-only pass carries zero loads**, lays no oil, and still counts. On
  Chromium 6742 the last oil goes down at 30.6 ft and the quoted pattern
  distance is 42: the buffer carries it the rest of the way. So the distance is
  the furthest any pass *travels*, not the furthest any pass oils. 42 is the
  number on the wall at the alley, and a model that said 30.6 would be arguing
  with the sheet.
- **Volume** is `loads × mics × boards`, which is the sheet's own T.OIL column.
- **Ratio** is the sheet's track zone ratio: the middle of the lane (18L to 18R)
  against each five-board band out to the gutter, which gives Chromium's printed
  6.71 / 1.76 / 1.00 on both sides. The outside one is the number a pattern is
  known by. A heaviest-board-against-lightest-board figure was the first draft's
  answer and is not what a sheet prints.

`speed`, `buffer` and `tank` are carried so a sheet transcribes whole, and read
by nothing: they change how the oil sits, which this app does not model.

The app's own board space is handed (`boardToX` puts board 1 on the bowler's
side), so the mirror happens once, at the drawing edge, exactly as the pin
deck's mirror does. The half board that widens a band to its outer edge is added
in sheet space *before* the mirror: mirror first and the half lands on the wrong
side and shifts every band by a board.

`LaneSurface` paints the table as rectangles, one per run of equally loaded
boards over one down-lane slice, and nothing is smoothed. A pattern has edges,
and the edges are the thing the drawing is for. Where a pattern is drawn, the
decorative sheen is not: two oils on one lane read as one.

The exit point is the payload. `oilExitPoint` walks the drawn line and returns
the last point of it still sitting on a loaded board, so it answers "where do I
leave the oil" rather than "where does the oil end", and it moves with every
drag of a peg. The walk steps half a foot and then bisects the last half foot,
so the exit reads as the number on the sheet rather than as an artefact of the
step size.

**Consequences.**
- No schema version. `passes` is not indexed, so Dexie stores it as-is (see
  "When a Dexie version bump is needed" in DATA_MODEL.md).
- `passes` is optional, and absent on every pattern saved before this. A pattern
  that is only a name stays a useful label on a session, and the lane keeps its
  sheen.
- A backup carries the table and `backupValidation.ts` checks every pass. One
  undrawable row would put a pattern on the lane that was never laid, and a
  bowler would read an exit point off it in good faith. "Undrawable" is now a
  pass that goes nowhere or off the boards, not one that runs backward or
  carries no oil.
- `normalizeOilPasses` rejects a bad pass by name rather than dropping it, for
  the same reason: a pattern quietly missing a pass draws a shape nobody entered.
- The lane reads the pattern from `OilPatternContext`, provided by the session,
  rather than from a prop threaded through the scorer. The visualizer is four
  components below the session and none of the three between them has any
  business carrying oil.
- `buildLinePath` now returns `samples`, the drawn path as real lane
  coordinates. The exit question is asked of the path, and asking it of an SVG
  `d` string would mean parsing back out what the geometry already knew.
- The pass editor takes boards in the sheet's notation, because the alternative
  is a bowler doing 39-minus-n in their head fifteen times per pattern.

## ADR-102 — A pattern sheet is parsed, not read by a model, and it checks itself

**Status.** Accepted, 2026-09-16.

**Context.** ADR-101 made a pattern its load table, which is the right model and
a miserable thing to type. Chromium 6742 is fifteen rows of seven numbers, and a
bowler has the sheet as a PDF already. So the entry problem is real and the
obvious answer, out loud, is "let an AI read the sheet".

Two things say otherwise. The app has no backend (`CLAUDE.md`), so there is no
model to call at the moment a bowler picks a file, and adding one to read a
public PDF would be the first server this app ever needed. And ADR-044 already
settled who reads a fixed layout: a parser reads it and fails loudly, a model
reads it and fails plausibly. A sheet is a rigid numeric table, which is the
parser's case exactly.

What makes it more than a preference is that **a pattern sheet carries its own
checksums.** Every row prints CROSSED, which is loads × boards, and T.OIL, which
is CROSSED × mics. The header prints the pattern distance and the forward,
reverse and total volumes. So a parse can be checked against the document it came
from, by arithmetic, with nothing taken on trust.

**Decision.** Reading a sheet is two modules, split where the risk changes.

- `lib/oilPatternSheet.ts` is pure: positioned text runs in, passes and checks
  out. It groups runs into lines by their baselines, matches the load table's
  thirteen columns, and converts the sheet's board notation through ADR-101's
  `parseSheetBoard`. It is tested against Chromium 6742's real rows.
- `lib/oilPatternPdf.ts` is the pdf.js half, and does nothing but fetch glyphs.

Direction comes from the row, not from which table it was in: the machine only
runs away from the foul line going forward and back toward it in reverse, so
`end > start` decides it. That is one less thing a layout change can break.

**Every parsed sheet is verified against itself**, two checks per row plus the
header totals, and the import reports the count. A sheet that does not add up
still fills the rows in, because the usual cause is one odd row and the rows are
right there to correct, but it is never called verified and it says which sum
disagrees and by how much. The failure mode this exists to prevent is a misread
column that produces a *plausible* pattern, saved quietly, and then trusted on
the lane for a season.

The printed track zone ratios are deliberately not checked. They sit in a footer
table whose labels and values are on separate lines, so pairing them by position
is guesswork, and a check that misreads is worse than no check: it would fail a
sheet that parsed perfectly.

**A sheet arrives as a file or as a link**, and the link is best effort by
nature. A browser will only hand a cross-origin response to a page the host
invited, and most bowling sites send no CORS headers, so a perfectly good link
often cannot be read by a page with no backend to proxy through. Both ways
around that cost more than they are worth. A public CORS proxy would send every
link a bowler imports to a stranger's server, which breaks the one promise this
feature makes, that the sheet is read on your own phone. A server of our own
would be the first this app has ever needed, to download a public PDF the
browser can already be pointed at. So a blocked link reports what happened and
the fix the bowler can apply, open it and import the file, and the failure is
never dressed up as a parse error. A link that does work fills in the pattern's
sheet link as well, since a link that produced a sheet is that sheet's link.

**No pattern library ships with the app.** A built-in catalog, the ball
catalog's shape, would mean redistributing Kegel's pattern data, which is
published but not licensed for that. Import sidesteps it completely: the bowler
brings their own sheet, and nothing of Kegel's lives in the repo but a
transcription used as a test fixture.

**What the real sheet then said.** Kegel's own generator writes the header into
the text layer and draws the two load tables as **pictures**. On Chromium 6742
the whole page carries 59 text runs, the header and the title, and seven images.
So the parser reads the distance and the volumes off that sheet and finds no
rows at all, and this is not an edge case: it is what a current, genuine Kegel
sheet looks like.

That does not undo the reasoning above, it narrows its reach. The checks, the
board notation and the arithmetic are all still right, and are still what any
reader has to answer to. What is now false is the assumption that a sheet's
table is text. A sheet whose tables are text imports and verifies; a sheet whose
tables are pictures cannot be read at all, and says so in those words rather
than asking a bowler holding a pattern sheet whether it is one. The two are told
apart by whether the page paints any image before either is reported.

Reading those pictures needs OCR, which is a different reader with a different
failure mode, and is left to its own decision rather than smuggled in here. The
checks are what would make it tenable: OCR is exactly the reader that fails
plausibly, and this is exactly the document that can catch it.

**Consequences.**
- pdf.js is imported dynamically and only from `oilPatternPdf`, so its 1.7 MB
  lands in its own chunk. It is kept out of the service worker precache
  (`globIgnores`) and runtime cached on first use, because most bowlers keep
  score and never import a sheet, and none of them should download a PDF parser
  to do it.
- Parsing is local. Nothing is uploaded, and the import works on a phone in an
  alley with no signal, which is the whole point of the app.
- The fixture transcription was checked against the real PDF, row for row, and
  is exact. What the real PDF also showed is that its tables are images, which
  is why the transcription is still the fixture: it is the arithmetic that the
  fixture proves, and no text-layer parse of that particular sheet exists to
  prove the reading against.
- A sheet that is not a load table imports nothing and says so, rather than
  saving an empty pattern.

## ADR-103 — Kegel draws its tables, so they are read by OCR and repaired by the sheet

**Status.** Accepted, 2026-09-16.

**Context.** ADR-102 chose a parser over a model for reading a pattern sheet,
on ADR-044's rule that a parser reads a fixed layout and fails loudly. The real
Chromium 6742 then showed the assumption underneath it to be false. Kegel's
generator writes the header into the text layer and draws both load tables as
**pictures**: 59 text runs on the whole page, and seven images. There is no
fixed text layout to parse, because there is no text.

So the choice is not parser against model any more. It is OCR against typing
fifteen rows of seven numbers by hand, which is the job this feature exists to
abolish.

**Decision.** A sheet whose text layer yields no rows has its table images read
with OCR, in the browser, with every asset served from our own origin.

OCR is precisely the reader ADR-044 warns about: it fails plausibly. On the real
sheet it gets **every digit right** and then loses things one or two pixels
wide. Two failures repeat, and the sheet repairs both, because a load table says
everything more than once:

- **A dropped decimal point.** "15.3" comes back "153". Distances carry exactly
  one decimal, so a distance with no point is missing one, and there is only one
  reading in range. The FEET column proves it: END minus START must equal FEET.
- **A board that gained a digit.** "7L" comes back "71L", which is not a board.
  CROSSED over LOADS is how many boards the pass covered, and a pass from nL to
  nR covers 41 - 2n of them, so the crossings name the board OCR lost.

Nothing is guessed. Every repair is derived from another column of the same row,
and a row that cannot be repaired is left as read, to fail the checks and be
corrected by hand.

**What verifies the scan is the header, because the header is text.** The
distance and the forward, reverse and total volumes come from the text layer and
are trustworthy; the rows do not and are not. Checking the rows against the
header is checking a suspect reader against a reliable one, which is the whole
reason this is tenable at all. ADR-102's row checksums still apply on top.

The proof is kept: `oilPatternOcr.test.ts` holds the **verbatim tesseract output**
for both of Chromium 6742's tables, dropped decimals, spurious digits and all,
and asserts that repairing it reproduces the sheet's printed 15.41 / 10.15 /
25.56 mL, 42 ft and 6.71:1. The same test asserts that the *unrepaired* output
loses rows and fails its checks, rather than importing a wrong pattern quietly.

**Consequences.**
- The reading is split in two. `oilPatternOcr.ts` is pure repair logic and is
  where the reasoning lives; `oilPatternOcrReader.ts` drives the wasm worker.
  The part that can be tested against a real sheet is not tangled in the part
  that cannot.
- OCR runs only when the text layer found nothing, so a sheet with real text
  never pays for it.
- Roughly 6.8 MB of core and language data, lazy, kept out of the service worker
  precache and runtime cached on first use, exactly as pdf.js is. A bowler who
  never imports a picture of a table never downloads it.
- The assets are bundled rather than fetched from tesseract's default CDN. An
  app that works in an alley with no signal cannot depend on jsdelivr, and a
  scan is not worth leaking which patterns a bowler looks up.
- Only images shaped like a table are scanned, so the logo and the pattern graph
  are never handed to OCR.
- The language pack is the 3 MB integer build, which read this sheet exactly as
  well as the 11 MB one.

## ADR-104 — Pattern sheets are ingested by a pipeline, not read on a phone

**Status.** Accepted, 2026-09-16. Supersedes ADR-102 and ADR-103, which stand as
written and as the record of how this was learned.

**Context.** ADR-102 read pattern sheets in the app, ADR-103 added OCR when the
real sheet turned out to draw its tables as pictures. Both worked in the sense
that their tests passed. Neither was a good place for the job.

The reading is the hard part, and putting it in the app put it in the worst
possible place for it: on a phone, at the moment a bowler wants an answer, with
8.5 MB of PDF parser and wasm behind it, where a failure is the bowler's problem
and where it could not be verified in CI, because a browser could not be run to
try it. Worse, the work is the same every time. Chromium 6742 does not change.
Reading it once, carefully, and shipping the result is strictly better than
every bowler's phone reading it again and hoping.

The ball catalog settled this shape already (ADR-043, ADR-044): read at
authoring time, treat the reader as untrusted, promote deterministically.

**Decision.** Oil patterns get the same pipeline, in `scripts/sync-patterns`.

1. **Ingest** (`ingest.ts`) reads a sheet and stages a candidate. Routing decides
   who reads it, per ADR-044: a sheet with a real text layer is parsed and costs
   nothing; only a sheet that draws its tables as pictures pays for OCR. Neither
   reader decides whether it succeeded.
2. **Promote** (`promote.ts`) is deterministic, with no reader in the loop. It
   re-derives the sheet's own printed numbers from the staged rows, and a
   pattern reaches the catalog only when they agree. Anything else goes to
   `data/conflicts/` for a person.

**The check is the whole point, and it is not a formality.** On the first real
run, OCR lost two forward rows of Chromium 6742, and promote caught it on the
header totals: 13.94 mL against a printed 15.41. The catalog stayed empty rather
than gaining a pattern that was wrong in a way nobody would have noticed on the
lane. A reading by eye then passed the same checks and shipped. Both routes ran,
the arithmetic decided, and that is the design working.

**Every reader is equal before the checks.** `text-layer`, `ocr` and `manual` are
recorded on a candidate for a human reading a conflict, and mean nothing to
promote. A load table is the rare document that can prove it was read correctly,
so who read it does not have to be argued about.

**Consequences.**
- The app carries no sheet reader. pdf.js, tesseract, the browser glue and about
  8.5 MB of assets are gone, along with the only code in this feature that could
  not be tested here.
- `oilPatternSheet.ts` and `oilPatternOcr.ts` moved to `scripts/sync-patterns/read/`
  unchanged, tests included, because the reading and the repair were right; only
  where they ran was wrong. The verbatim tesseract fixture moves with them.
- A pattern is added from the catalog by copying it, never by referencing it. A
  pattern in your list is yours, and editing it must not edit the catalog.
- The catalog is fetched and runtime cached like the ball catalog, not bundled,
  so it can grow without every boot paying for it.
- A bowler with a sheet the catalog lacks types it in, or sends it to be
  ingested. That is worse for them than a working in-app import would have been,
  and better than an in-app import that cannot read Kegel's sheets.
- Competition patterns ship with the app. They are published freely and printed
  in tournament rules, but published is not licensed, and this is a deliberate
  risk taken with the repository owner's agreement rather than an oversight.
- **A layout is a regex, not a reader.** Kegel prints at least three: the
  thirteen-column sheet with CROSSED, the current pattern-library sheet with the
  distance as an arrow span and the tank as a name, and its older software
  captured as a picture of its own grid, which prints no mics column at all
  (T.OIL over CROSSED is what it was). Each is checked against the totals its own
  header prints, so a new layout costs a pattern to match and nothing else.
- **Names are normalised on the way in.** Sheets carry the vendor, the series and
  whatever the file was called: "R - Stonehenge", "Kegel Element Challenge
  Chromium 6742", "EP-CHALLENGE_MERCURY_4940.pdf". A list where every row begins
  "Kegel Element Challenge" is a list nobody can scan. The pattern code is kept,
  because it is how a sheet is identified and patterns do share names across
  years.
- **A pattern already in use is enriched, never replaced.** A pattern typed in
  before the catalog existed is on sessions already, so borrowing a catalog load
  table writes the table onto that same row: its id does not change, every
  session keeps resolving it, and the bowler's own name for it survives, because
  that is the name their history is written in.

## ADR-105 — The catalog is the pattern list, not a place you copy from

**Status.** Accepted, 2026-09-16. Amends ADR-104, which stands as written.

**Context.** ADR-104 shipped a catalog and had a bowler *add* from it: the
catalog was one list and the patterns you could pick for a session were another,
and a pattern had to be copied across before it could be used. That is a
distinction the app invented. Nobody starting a session wants to know whether a
pattern has been imported yet; they want the pattern.

**Decision.** The catalog seeds itself into the bowler's own pattern list at
boot (`syncPatternCatalog`), so a catalog pattern is a row like any other and
nothing downstream, the session form, the visualizer, the settings list, has to
know where a pattern came from. One list, searched one way.

Rows are matched by `catalog_id`, never by name. A bowler who renames one keeps
their name and still gets its load table kept current when the catalog improves,
which is the split that matters: **the catalog owns the numbers, the bowler owns
the name.** A name they already used for a pattern of their own is left alone,
and the link is offered in the editor instead.

**Linking is one way.** A pattern that predates the catalog is already on
sessions, so linking writes `catalog_id` onto that same row rather than
replacing it: the id does not change, the sessions keep resolving it, and from
then on it *is* that catalog pattern. There is no unlink, because there is
nothing sensible to unlink back to: the load table it had before was either
absent or a copy of this one.

**Consequences.**
- Seeding runs at boot, unawaited and never fatal. Boot does not wait on a
  fetch, and a bowler with no signal still has every pattern they had yesterday.
- A linked or seeded pattern cannot be deleted, because it would return on the
  next boot. A pattern of the bowler's own still can.
- A linked pattern's sheet link and load table are the catalog's and are not
  editable. Its name is, which is the whole of what was promised.
- Backups carry `catalog_id`, so a restore on another device lands on the same
  rows rather than duplicating them.
- Asymmetric passes are real. Mercury 4940 runs 6L to 8R, and the board repair
  that assumed nL to nR would have corrupted it. CROSSED over LOADS gives the
  board *count*, which fixes a misread board without assuming symmetry, and the
  correction is taken only when T.OIL agrees. That is what got Mercury from
  29 checks of 32 to all of them, off a single misread digit.

## ADR-106 — The pattern sheet lives in the app

**Status.** Accepted, 2026-09-16. Extends ADR-101 and ADR-105.

**Context.** A pattern's numbers were reachable two ways, neither of them good:
the lane overlay, which shows the film and the exit point but no digits, and a
link out to whoever published the sheet. The link leaves the app, needs a
network, and for a catalog pattern is redundant, since we already hold the load
table the sheet prints.

**Decision.** A pattern opens its own sheet view in the app, built from the same
derivations as everything else (`components/PatternSheet.tsx`): distance, total
volume, ratio with its classification, forward and reverse pass counts, a per
board volume graph, the track zone ratios, and the load table itself with boards
written back in sheet notation (`formatSheetBoard`), the way the printed sheet
writes them.

Nothing here is stored. The sheet is a second reading of `passes`, so it cannot
disagree with the overlay or with the list. A pattern with no load table gets an
honest empty state rather than a page of zeroes, and keeps its link if it has
one. The link is what a pattern without numbers has instead of a sheet, not a
thing every pattern needs.

**A one time link reset.** Linking is irreversible by ADR-105, which is right
for the rule and unhelpful when a bowler links the wrong pattern. Rather than
add an unlink, and with it a second way to think about what a pattern is, this
release clears `catalog_id` from every row once, guarded by a settings flag so it
runs on each device exactly once. Bowlers relink, and the irreversible rule
stands for the links made after it.

**Adoption over duplication.** Seeding has to be able to recognise a row as a
catalog pattern it has lost the id for, or the reset would leave a bowler with
two of everything. A row with no `catalog_id` is adopted when its load table is
identical to a catalog pattern's, or when its name is exactly that pattern's.
ADR-105 said a same named pattern of the bowler's own was left alone; that was
the separation the bowler asked us to collapse, and adoption keeps the row, its
id and every session on it, which is the same guarantee linking gives.

**Consequences.**
- The reset is a single pass at boot, unawaited like the sync it runs inside.
- The link button is offered to any unlinked pattern, not only to one with no
  load table: after the reset a row keeps the table it was given, and refusing to
  relink it would strand it.
- The linking logic is still here on purpose. It comes out once the relinking is
  done and every row has collapsed onto its catalog pattern.

## ADR-107 — A pattern cannot be in the list twice

**Status.** Accepted, 2026-09-16. Fixes a gap in ADR-105 and ADR-106.

**Context.** ADR-105 made linking write `catalog_id` onto the row the bowler
already had, rather than replacing it, so its id survives and every session on
it keeps resolving. What it never said is what happens to the row the catalog
had already seeded beside it. Nothing did: the link produced two rows carrying
the same `catalog_id`, the same load table and the same numbers, under two
names. "Chromium 42ft" and "Chromium 6742" are one pattern, and the list showed
both.

**Decision.** A `catalog_id` identifies exactly one row. When a row takes one,
any other row already holding it is collapsed into it: its sessions are
repointed at the survivor first, then it is deleted. Nothing is archived,
because an archived row is a name kept alive for history, and here the history
has somewhere better to point.

The survivor is the row being linked, which is the bowler's own: it carries the
name they chose and the sessions they have already played on it. At boot the
same collapse heals a pair made before this shipped, and there the survivor is
the older of the two, for the same reason, it is the one their history was
written against.

**Consequences.**
- The collapse runs before the duplicate name check, so a row may take the name
  the row it replaced was using. That is the common case: linking "Chromium
  42ft" and then calling it "Chromium 6742" is now allowed, because by then
  there is only one of them.
- A session never loses its pattern. It is moved, not orphaned, and the move is
  in the same transaction as the delete.
- The heal is idempotent and costs one table read on a list with nothing wrong
  with it.

## ADR-108 — The line sandbox draws either hand, and the bowler stays who they are

**Status.** Accepted, 2026-09-17.

**Context.** Every lane the app draws is mirrored for the bowler's hand: the
boards run their way, the pocket is theirs, the steppers' arrows point where
the ball goes on screen. That is right everywhere a shot is involved, because a
shot was thrown by a hand and there is nothing to choose.

The line sandbox is the exception. It has no shot behind it and no session, and
it is where someone works a line out: a lefty reading a righty's line off a
video, a coach showing a student the mirror of their own play, anyone asking
what the same pattern gives from the other side. Today the only way to see that
is to change handedness in settings, which rewrites the rest of the app (pin
grids, adjusters, every saved line's reading) to answer a question about one
drawing.

That is the same shape as the pattern question ADR-101 settled: a session names
its pattern and the sandbox picks one, because the sandbox has nobody to
inherit from.

**Decision.** The lane visualizer takes a `handSwitchable` flag, and only the
line sandbox passes it. With it, the lane options sheet offers L / R above the
pattern picker, and the chosen hand is provided through `HandednessContext` for
the whole overlay, so the surface, the pegs and the steppers' directions all
mirror together rather than the geometry mirroring while the arrows do not.

**Nothing is written back.** The override lives in component state and dies with
the overlay, exactly as the layout lab seeds from the bowler's settings and
saves none of it. A sandbox that silently re-handed the bowler would be a
control that edits the app from the one screen built for poking at.

**Consequences.**
- A shot's line (intended, actual, spare) offers no switch. Those belong to a
  throw, and the hand is a fact about it.
- The switch resets to the bowler's own hand every time the sandbox opens, so
  the default is never something left behind by an earlier session.

## ADR-109 — Quick moves are a menu over the lane, in the vocabulary score entry already uses

**Status.** Accepted, 2026-09-17.

**Context.** The visualizer could only be moved a peg at a time: drag the
laydown, drag the target, and a 2-1 move (two boards with the feet, one with the
eyes) took two gestures and some arithmetic. Score entry has had the move as one
tap since it shipped, as `MOVE_PRESETS` in `LineInput`: 1-1, 1.5-1, 2-1, one
full-width button each, with the tapped half deciding which way.

The presets are the same three here on purpose. A bowler who says "I moved 2-1
left" is naming a move, and two sets of presets in one app, or one set with an
extra option, would be two vocabularies for one adjustment.

**Decision.** A quick-move menu, opened by its own control beside the lane
options, holding the same three presets. It moves the laydown and the target and
**leaves the final board alone**, so the redraw answers the question the move was
asking: what this angle does to where the ball finishes. Carrying the final along
would translate the whole line and say nothing.

It is a transient layer, not a row parked under the lane. These are buttons a
bowler taps in bursts while watching the lane, and a permanent row would spend
the rest of the time taking height from the drawing. So it closes on a tap
anywhere else, on Escape, and on the control that opened it, and the backdrop
that catches the dismissing tap is what stops it swallowing a drag.

**Direction reads twice, on purpose.** Each preset's arrows carry IN and OUT for
the current hand. Board numbers rise from the bowler's own edge toward the
middle, so *in* is always up-board, which is screen-left for a right-hander and
screen-right for a left-hander. The arrow says which way the line moves on
screen, the word says which way it moves on the lane, and neither one alone is
unambiguous for both hands.

**Consequences.**
- A locked peg (ADR-028) stops a move the way it stops a drag: the whole edit is
  dropped rather than half-applied, so a pinned laydown cannot be slid by a
  preset.
- The presets work on a line that has only one of the two boards, moving what is
  there. A line with neither is not a line to move, and the menu does nothing.

## ADR-110 — A line is a link, and the pattern in it travels by catalog id

**Status.** Accepted, 2026-09-17.

**Context.** A layout has been shareable as a link since the lab shipped
(`lib/layoutShare.ts`): the numbers ride in the query string, the hash names the
screen, and what arrives is a layout you can move rather than a picture of one. A
line is the same kind of object and had no way out of the app at all. Reading a
line to somebody meant reading four numbers out loud, and the numbers do not
carry the hand, the pattern or the shape of the hook.

**Decision.** `lib/lineShare.ts`, built on `layoutShare.ts`'s rules: parameters
in the **search** string (a line is what the screen is showing, not a screen, so
it has no business in the nav projection `appRoute.ts` owns), the sandbox's own
existing route `#/home/line` in the hash, everything optional on the way in, and
the origin taken from the running page so a link shared out of a preview build
opens that preview.

The link carries the boards, the hook timing, the hand, and, for a spare line,
the leave: the same boards at a different rack are a different shot. It opens the
sandbox, editable, because a line is a thing to open. The share card is the
preview on the way out, for the same reason the layout's is: a link pasted into a
chat is a line of text nobody can see.

**The card does not draw the lane.** It is the one picture on any of these cards
that would be read as data (where the oil ends, where the ball leaves it) while
carrying none of the conditions that make those numbers mean anything. The link
is one tap away and draws the real thing.

**The pattern travels as its `catalog_id` and nothing else.** A name is the
bowler's to change (ADR-105), so the row one person calls "Thursday 40ft" and
another calls "Stonehenge" are the same pattern and match on neither name. A
pattern with no catalog id is somebody's own row whose load table exists on one
device, so it is left out of the link rather than sent as a name that would draw
nothing. On the way in the id is matched against the receiver's own rows first,
then the shipped catalog, and a pattern found in the catalog is drawn without
being written to their list: reading someone's line is not adopting their
pattern.

**Consequences.**
- Every mode shares, read-only ones included: an Intended line, an Actual one and
  a spare line are all worth sending, and all of them open in the sandbox, which
  is the screen that belongs to nobody's shot.
- A link opens on the sender's hand through the same override the hand switch
  uses (ADR-108), so it is one tap back to your own.
- A link a chat app has trimmed still opens: missing fields fall back, and a
  leave with its spare flag gone is still read as a spare line.

## ADR-111 — A line's boards are the bowler's own, so the hook never flips for the hand

**Status.** Accepted, 2026-09-17.

**Context.** A left-hander's line drew wrong, and had done since the auto-hook
shipped. Switching the sandbox to the left hand (ADR-108) put the two pictures
side by side for the first time and made it obvious: the same numbers that draw a
right-hander's hook into the pocket drew a left-hander's ball riding dead straight
across the lane and off the edge, with the final board silently rewritten to 1.

The cause is two mirrors where there is one mirror to apply.

`boardToX` maps board 1 to the bowler's own gutter, right edge for a
right-hander, left for a left-hander, so **the board space is already handed**.
`docs/DATA_MODEL.md` says so about pattern boards, and `spareAim.ts` names the
convention outright: "the bowler's **line-board** convention, board 1 = the
bowler's gutter side, so for a right-hander the 10-pin lands near board 3."

`lib/laneGeometry.ts` then carried `dir = hand === "right" ? 1 : -1` through the
whole hook construction: which side is "out", which way the apex counts, which
edge the on-lane cap uses, which side of the focal the final is clamped to. Every
one of those is a statement about board numbers, and board numbers are already
the bowler's own. Applying the hand a second time inverted all of it for a
left-hander, and it looked deliberate: several tests asserted it, with comments
explaining that the hook "runs toward higher boards for a right-hander and lower
boards for a left-hander", which is exactly the double mirror, written down.

**Decision.** A line has no handedness. In the handed board space, for either
bowler:

- **Out** is the low-board side, toward the bowler's own gutter.
- **The hook side** is the higher boards. A ball goes out and comes back.
- **The pocket** is board 17.5.

So `laneGeometry` computes in board space with no hand at all, and `hand` stays
only where a board becomes a pixel: `boardToX` / `xToBoard`, and
`projectBreakpoint`, which maps a finger on the screen back to a board.
`solveLine`, `strikeApexPoint` and `derivedApexForDisplay` no longer take a
`Handedness`, because a parameter that must not be used is an invitation to use
it. The mirror belongs at the drawing edge and nowhere else.

**Consequences.**
- A left-hander's line now draws as the exact mirror of the right-handed one,
  which is the only reading of "the same line" that survives two bowlers.
- The left-handed tests that asserted the flip are rewritten around the
  right-handed fixtures, since there is no separate left-handed geometry to
  assert. One new test draws one line for both hands and compares every sample.
- A left-hander who used the app before this has stored lines whose
  `final_board` and `breakpoint` were written by the old solver, which was
  clamping toward the wrong edge. Nothing is migrated: the stored numbers were
  never wrong as *numbers*, they were solved against a mirrored rule, and a
  migration would have to guess which of them the bowler meant. They re-solve to
  the correct side on the next edit.
- ADR-024, ADR-026, ADR-027 and ADR-028 are unchanged in substance. Their rules
  were always stated in board space; this only stops the code from re-mirroring
  that space underneath them.
---

## ADR-112: A lane machine's own program file is a third way into the catalog

**Status.** Accepted, 2026-09-17. Extends ADR-104's ingest and ADR-044's routing.

**Context.** ADR-102 read a pattern sheet's text layer, ADR-103 fell back to OCR
when Kegel drew its tables as pictures, and both start from the PDF a bowler is
handed. High Street V2 arrived as neither: a KOSI program file, which is what
the lane machine is actually loaded with. It is the same pattern with the
pictures taken off, and it was already in hand when no sheet PDF could be
reached at all.

Read as a document it looks worse than a sheet, because it has no labels: a
program number, a name, eleven bare integers, then columns of numbers padded out
with blank lines. Nothing says which column is loads and which is speed.

**Decision.** A KOSI file is read by `read/kosi.ts`, an ADR-044 parser reading
at fixed positions that throws rather than guessing, and `ingest.ts` routes to it
for anything that is not a `.pdf`.

What makes the unlabelled columns tenable is that **the file states its boards
twice**, once as absolute numbers and once in the sheet's own L/R notation. On
High Street V2 that is twenty-four values checking twelve, through ADR-101's
`parseSheetBoard`, and a column read out of order fails there rather than on the
lane. Two more readings pin the header positions to the tables rather than to a
guess: the header's distance must equal the last forward pass's end, and its
reverse brush drop must be where the reverse table starts laying oil.

**A program file states no volume**, which is the one number that would check the
loads and the oil per board. So `--volume` carries the total the printed sheet
states, and without it the promote gate can only check the pattern's length. On
High Street V2 the tables come to 25.00 mL against the 25 mL its published sheet
states, which is what makes the single global oil-per-board in the header a read
value rather than an assumption.

**Consequences.**
- Passes chain: a column holds where each pass ENDS, and each starts where the
  one before it stopped, forward from the foul line and reverse from the far end
  of the pattern. That is how a sheet prints the pair of tables, and it puts the
  buffer-only passes at both ends, which is what sets the pattern distance.
- The program file itself is kept in `data/programs/`, so a promoted pattern can
  be re-derived from what it came from rather than trusted for being there
  already. The tests read that file, not a copy of it.
- A file whose columns are arranged differently does not read partially. It
  throws, names the file, and stages nothing.

---

## ADR-113: The ball follows the last throw, the line follows the ball, and a strike ball keeps off the spare line

**Status.** Accepted, 2026-10-04. Supersedes the ball half of ADR-017's and
ADR-029's fresh-rack carry, and ADR-053's steps 3 and 4 for a strike ball.
ADR-054's capture is narrowed to spare balls.

**Context.** The 2026-10-03 quality pass replayed `seedForShot` over every shot
in the owner's backup (27 sessions, 1538 shots) and measured three problems.

1. **The ball came back after a change.** The fresh-rack carry took ball and
   line as a matched pair from the previous frame *on the same lane*. On a pair
   that frame is two frames back, so it predates any change made in the frame
   between: the frame after a change opened with the old ball 70 times out of
   85. In game 1, frames 1 and 2 have no same-lane predecessor at all, so frame
   2 opened empty in 27 sessions of 27.
2. **A strike ball at a leave was handed the spare ball's boards.** ADR-053's
   step 3 falls back to the leave's absolute line, which was recorded off a
   plastic ball thrown straight. With no `strike_offset` saved (the owner has
   none), every strike ball got those boards, and a ball change that found
   nothing kept them in the box.
3. **The capture prompt saved a strike ball's line as the spare line.** Accepted
   after a strike-ball attempt, that line became the leave's absolute line, and
   every later spare-ball attempt at the leave was seeded from it.

**Decision.**

- **Ball:** a fresh-rack shot opens with the ball of the most recent fresh-rack
  shot this session that names one, on any lane, in any game
  (`lastFreshRackBallId`). Spare attempts never set it.
- **Line:** that ball's own line, `sameBallSeedLine`, which already prefers this
  lane and falls back to the pair's other lane (ADR-035). With no ball on record
  the same-lane frame's line carries as before, so seeding stays alive for a
  bowler who never picks one.
- **Notes** still come from the same-lane frame: they are about the lane.
- **At a leave, a strike ball** gets its own attempt at this leave this session
  (untagged attempts no longer count for it, as they were most likely thrown
  with the spare ball), then its strike line moved by the `strike_offset`, then
  its strike line as is. Never the leave's saved line. A spare ball, or no ball,
  is unchanged.
- **A ball change that finds no line** keeps the box only between two balls of
  the same kind. Spare to strike or back, it empties the box.
- **The capture prompt** is offered after a spare-ball or untagged attempt only.
- **A seed is a copy.** It used to be the very object stored on the previous
  shot, which React cannot tell apart from "unchanged".

**Measured on the same backup:** frames 1 and 2 of games 2+ go from 63% to 81%
right on the ball, game 1 frame 2 is seeded from frame 1, the rest of the game is
unchanged (88% to 89%), and line accuracy is flat (63% to 61%, within noise).

**Consequences.**
- Moving to a different pair carries the ball, and its line from the old pair
  as a starting point. The old rule opened that frame empty.
- Seeding game 1 frame 1 from the previous session was measured and rejected:
  it matched 4 times in 18.
- The same pass found the shot's metadata could be lost outright on record (the
  draft was mirrored into the controller by an effect that did not re-run when
  the seed matched). That is a bug, not a rule: the scorer now reads the draft at
  the moment of recording. Shots already stored without their ball cannot be
  recovered.

## ADR-114: The board adjusters float above the fields, and a focus never writes data

**Status.** Accepted, 2026-10-04. Replaces the half-tap buttons of ADR-091 and
the Actual line's autofill on focus. ADR-091's rule that a press must not close
the row it landed on stands.

**Context.** The adjusters (a half-board nudge and the 1-1, 1.5-1, 2-1 moves)
open while a board field is focused, and that is right: they are used in bursts
while typing, and the owner wants them a tap away at that moment. Where they
opened was wrong. They rendered *below* the field, so on a phone the 2-1 row sat
against the keyboard's toolbar and its tick. Directly under it were the Actual
boxes and the Actual eye, whose hit region grows upward (`IconButton compact`)
into the right end of the 2-1 row, so a tap there opened the lane view. A near
miss on an Actual box focused it, and focus copied the Intended line into Actual.
Each row was one 32px button whose tapped half chose the direction, so the label
in the middle, where people tap, was the ambiguous point. They fired on
`pointerdown`, so a finger landing to scroll moved the line. And revealing them
pushed everything below down by about 190px on every focus.

**Decision.**

- The adjusters float in a panel **above** the focused field, spanning both
  scorer columns (`data-adjuster-bounds`) so they fit two to a row and stay
  short. Nothing in the layout moves when they appear, and nothing sits between
  them and the keyboard but the field itself.
- Each row is the lane view's quick-move row (ADR-109): an In button and an Out
  button, 44px tall, with the label between them and not a target.
- They act on `click`. A press that becomes a scroll, or slides off, does
  nothing. `mousedown` is still cancelled to keep the keyboard up, a press in
  flight still holds the panel open through a blur, and the click hands focus
  back (ADR-091).
- Actual is filled from Intended only by **As intended** in the Actual heading
  row. Focusing a field never writes anything.

**Consequences.**
- The panel covers the ball row and the bottom of the scorecard while a field is
  focused. Neither is used while typing a board, and both come back on blur.
- A half-tap no longer exists anywhere in the app.

## ADR-115: Home leads with tonight, Settings holds settings, and the game plan moves to where the decision is

**Status.** Accepted, 2026-10-04. Supersedes ADR-071's Game plan card on Home and
the shortcut grid, and the Home presentation of ADR-067 and ADR-068's nudges.
ADR-064b's briefing rules are unchanged.

**Context.** The 2026-10-03 quality pass, written ahead of paid traffic, read Home
and Settings the way a new bowler would.

- **Home** opened on up to two banners, a Game plan card and a grid of seven
  equal tiles mixing three kinds of thing: your own things (arsenal, spare
  lines, lane notes, patterns), reference (catalog, guides) and tools (line,
  layout lab). Ten recent sessions repeated History. Starting or resuming, the
  reason the app is opened, was a small button at the bottom.
- **Settings** repeated six Home places with Preferences hidden among them, and
  Preferences opened on ten lines of grip explanation above PAP and drift.
- **The game plan** was a separate place to remember to open, defaulting to the
  most-bowled alley rather than the one you were going to, and it reported
  without helping with the next thing.
- **Protection:** in a browser tab a new user's second visit showed an amber
  install line and a red backup banner with no Later, together.

**Decision.**

- Home opens on **tonight**: a Resume card for a game in progress; otherwise a
  card with the recent alleys as one-tap starts (alley, description and pattern
  prefilled), Start session, and "Score now, add details later", with a line
  naming the last session. The floating resume pill goes; the Fab stays.
- **One protection card, never two** (`protectionCard`). While the app is not
  installed and can be, it leads with Add to Home Screen, which is what removes
  the browser's seven-day risk, and offers a copy as its second action. Once
  installed, it is the backup card, and red with no Later is kept for an
  installed app that has fallen behind. A tab that cannot install gets the
  amber card, with Later.
- One setup card at a time: a next step if one is owed, else the feedback ask.
- Three recent sessions, then "All in History".
- Two lists replace the grid: **My bowling** (Arsenal, Spare lines, Lane notes,
  Oil patterns, each with its count) and **Tools and reference** (Layout lab,
  Line visualizer, Ball catalog, Guides). "Line" is "Line visualizer".
- The **Active** tab is **Score**: the name of what you do there.
- **Settings** holds settings only: Bowler (handedness and grip answered in
  place, one line each, with "Why it matters" opening a guide; Appearance),
  Advanced (PAP, release and drift, captioned as not needed to keep score),
  Your data, Support, and the version.
- **The game plan** leaves Home. Its actionable parts go where the decision is
  made: the Start session sheet shows "Last time here" once a known alley is
  typed, and the scorer, as game 2 or later opens with no ball thrown, says the
  move this bowler usually makes into that game here. The full read stays, as
  **Alley report** under Stats, opening on the alley bowled last, with the
  alley on a row of its own and the ball table's columns spelled out.
- A finished session opened from a list lands on its scorecard tab.

**Consequences.**
- Every place Home showed is still one tap from Home. Settings' Lane notes and
  Oil patterns sections stay routable for old links, with no row leading there.
- The Layout lab's "where these are kept" goes to the Settings list, where hand
  and grip now are.
- The hint reads every frame at that alley, so it is only read while a game has
  no ball in it.


## ADR-116: A session started and left with nothing in it is deleted

**Status.** Accepted, 2026-10-04. Amends ADR-080 ("Score now") and ADR-115's Home.

**Context.** Starting a session writes it at once, so the pin deck is there to
tap. A bowler who opens it by mistake, or starts one and changes their mind,
left an empty row in History with no alley, no description and no score, and
it stayed there, counted toward the backup nudge and offered as a game to
resume.

**Decision.** A session is empty when it has no alley, description, pattern or
notes, and none of its games has lanes, a note or a single recorded shot. The
date does not count, because the form fills it in. An empty session is deleted:

- when the bowler leaves the Score tab with it open, after a short grace so the
  scorer's unmount flush of a tapped-in but uncommitted shot lands first (that
  shot is input, and keeps the session);
- at launch, for every empty session except the one the URL reopens, because
  closing the app is the other way to walk away from one, and a reload is not.

Nothing is asked. There is nothing in the session to lose, and a confirm about
nothing teaches people to tap through confirms.

**Consequences.**
- `deleteSessionIfEmpty` and `pruneEmptySessions` in `bowlingRepository`; the
  boot gate prunes before it reads the resumable game and the saved-data flag.
- Going to Home to check something before entering anything costs the empty
  session. Starting again is one tap, and that is the trade this makes.

Also in this change, ADR-115's Home is cut back: the "Tonight" card (recent
alley chips, Start session, the "Last time" line) is gone, the floating button
starts a session, and the recent sessions sit below the two menus so the menus
are what Home opens on. The "Last time here" card in the Start session sheet is
gone too. Hand and grip move off the Settings list onto their own page behind a
"Hand and grip" row, because flipping the hand mirrors every board in the app.

## ADR-117: Foul and Undo share a More menu, Gutter goes, and the board adjusters stack over the deck

**Status.** Accepted, 2026-10-06. Supersedes ADR-089's Gutter button and its
More row, and ADR-114's two-column panel. ADR-089's foul mark and ADR-114's
rules (never below the fields, act on click, hand focus back) stand.

**Context.** Three things on the scorer read badly on a phone. The More button
was a centred word floating under Strike and Next, and opening it dropped two
full-size buttons, as heavy as the two every ball uses, into the column for the
two rarest marks in the game. Undo was a round button squeezed into the Strike
and Next row, taking their width for something used a few times a night. And
the board adjusters were four bordered tiles in a two-by-two grid spread across
both columns, over the scorecard, with nothing to say a tap had landed: iOS
barely paints `:active` on a quick tap, so a press on In read as nothing
happening until the number in the field was checked.

The Gutter button was also redundant. A gutter is every pin left standing, and
the deck already enters that.

**Decision.**

- **Gutter has no button.** It is entered on the deck like any other count, and
  the card draws it as the dash it always did. Nothing about the shot model
  changes: a gutter was never flagged.
- **Foul and Undo sit in one menu.** A quiet outlined More button, the width of
  the column so it lines up with Strike and Next, opens an `AnchoredMenu`
  upward over the deck (the tab bar is directly underneath). Both stay two
  taps, on purpose: they are rare, and Undo asks again after that.
- **The undo question names the ball.** "This removes frame 2, ball 1 (9 pins)
  from the card. To get it back, you will have to enter it again." The old
  wording said what the app does in the abstract and not which ball was going.
- **The adjusters are one row each, over the pin deck.** The scorer marks its
  two-column grid `data-adjuster-host` and the deck's column
  `data-adjuster-bounds`; the panel spans that column with its foot level with
  the focused fields. Nobody taps the deck while typing a board, and the
  scorecard stays in view. The Actual line gets the same panel with its one
  nudge row.
- **A press answers.** The pressed side tints in the accent and fades, and its
  chevron kicks the way the line moved. Reduced motion drops both and leaves
  the changed number as the answer.

**Consequences.**
- Recording a gutter costs a tap on each pin left down on a fresh rack, where
  it used to be two taps through More. Gutters are rare enough that this is the
  trade.
- The adjuster panel covers the top of the deck and, for the Actual line, the
  Strike and Next row, while a field is focused. Both come back on blur.

## ADR-118: The board adjusters centre on the fields they move

**Status.** Accepted, 2026-10-06. Amends ADR-117's placement only.

**Context.** ADR-117 put the adjuster panel over the pin deck with its foot
level with the focused fields. On the Intended line, four rows tall, that left
the panel almost entirely above the fields, so the eye had to climb to find the
move it wanted and the panel read as belonging to whatever sat above.

**Decision.** The panel is centred vertically on the row of fields it adjusts.
It still sits in the deck's column, never in the fields' own column, so nothing
lands between the field and the keyboard, and nothing in the layout moves.

**Consequences.** The panel now reaches below the fields' row in the deck
column: the four-row Intended panel covers part of the deck and can reach the
Strike and Next row, and the Actual line's single row can cover the top of
Strike and Next. Neither is used while a board is being typed, and both come
back on blur.

---

## ADR-119: A catalog ball links to a retailer through an affiliate program, and the image position stops being non-commercial

**Status.** Accepted, 2026-10-06. Supersedes the "non-commercial" contingency in
ADR-039's image position; the rest of ADR-039 stands.

**Context.** The app needs an income that does not put anything between a bowler
and their scores. A ball's catalog page is the one screen where a bowler is
already looking at a ball they might buy, and US bowling retailers run affiliate
programs that pay a few percent of a sale (Bowling.com 4%, BowlersMart 2 to 5%,
bowlingball.com 3%, as of October 2026).

ADR-039 recorded that the photos of non-MOTIV balls are held unlicensed, and
that the position rested on the app staying free and ad-free: "adding affiliate
income would forfeit that". That was 30 balls when this was written (14 Storm, 8
900 Global, 7 Roto Grip, 1 Pyramid). MOTIV's permission (ADR-061) is on the
terms that the data is not resold and is kept accurate; a link to a retailer
does neither.

**Decision.**

- **The owner accepts the image risk.** ADR-039's other half still holds: every
  image is keyed to its ball id, so a takedown is a data edit, and the legal
  page says any owner who asks will have an image changed or removed.
- **One retailer, BowlersMart,** through Rakuten. The owner chose it over
  Bowling.com's flat 4%: its rate starts at 2% and rises to 5% with volume, and
  it ships internationally, so a click from outside the US can still convert.
- **The link searches the retailer by brand and name** rather than pointing at a
  product page. A search does not go stale when the retailer renames a page, and
  it needs no table of product URLs kept in step with the catalog.
- **The network's deep link is a template** (`AFFILIATE_DEEP_LINK` in
  `src/lib/links.ts`, `{url}` where the retailer URL goes), pasted from the
  network's link builder. It ships `null`, and null hides the link: an
  uncredited link earns nothing, and a disclosure over it would not be true.
- **The disclosure sits under the link,** in the app's own words, as well as on
  the legal page. US advertising rules want it next to the link, not only in
  the terms. The link carries `rel="sponsored"` for the same reason, for search
  engines.
- **It sits under Add to arsenal, outlined.** Buying never competes with the
  screen's primary action, and it shows whether or not the ball is already in
  the arsenal, since bowlers do buy a second of a ball they like.

**Consequences.**
- Turning it on is a one-line change to `AFFILIATE_DEEP_LINK`, plus a minor
  version bump, since that is when a bowler first sees it.
- Nothing about it leaves the device beyond the click itself: the URL carries
  the brand and name, never anything the bowler has entered.
- The search URL (`retailerSearchUrl`) could not be fetched from the build
  environment, so it was written from the retailer's public URL shape and
  should be checked by hand once before the link goes live.
- A second retailer for another region is a second template and a choice of
  which to show, and is not built until a region's clicks justify it.

---

## ADR-120: Three anonymous usage counts, sent to Umami Cloud

**Status.** Accepted, 2026-10-06.

**Context.** Before any money goes on ads, the launch plan needs one number:
of the bowlers who try Headpin, how many come back. Vercel's page counts see a
visit to the landing page and a visit to `/score`, and nothing after that. The
app has had no telemetry at all, and the privacy page said it collected nothing.

Three tools were weighed. Vercel's custom events are on its paid plan only.
Plausible's cheapest plan carries events but not the properties a count needs.
Umami Cloud's free plan carries both, up to 100,000 events a month, sets no
cookies and stores nothing on the device.

**Decision.**

- **Three events, nothing else.** `session-started` (which number, and the days
  since the first session), `game-finished` (which number), `shop-link` (the
  catalog ball's brand). Pure shapes in `src/lib/usage.ts`, the sender in
  `src/services/usageReporter.ts`.
- **Return is measured without an identifier.** The phone already knows how
  many sessions it holds and when the first was, so a session-started event
  says "the 2nd, 8 to 14 days after the 1st". The return rate is a ratio of
  those counts, and no event needs to say whose it is.
- **Buckets, not values.** Counts and days are reported in bands, and no event
  carries a score, an alley, an owned ball, a note or any typed text. The URL
  sent is always `/score`, since a real one carries a session id.
- **Only the real site counts.** Nothing is sent from any host but
  `headpin.app`, so development servers and preview deploys stay out.
- **Offline is the normal case at an alley.** Events made with no signal wait
  in localStorage, capped at 50, and go out with the next event sent online.
  It is a per-device convenience: losing it loses a count, never data.
- **A finished game is counted once,** on the ball that finishes it. Saving the
  tenth frame of a game already finished, as an edit does, is not counted.
- **It ships switched off.** `UMAMI_WEBSITE_ID` is null until the Umami account
  exists, and null sends nothing.

**Consequences.**
- The privacy page names Umami, lists exactly what the three events carry, and
  no longer says Headpin collects nothing; it says it collects nothing that
  identifies anyone.
- Umami still sees each request's IP address and browser, as any server does,
  and uses them in its own rotating hash to tell visits apart. That is
  disclosed rather than avoided.
- A new event is a privacy change: it goes on the legal page in the same PR.

---

## ADR-121: The landing page loads Umami's script; the app does not

**Status.** Accepted, 2026-10-07. Extends ADR-120.

**Context.** The ad plan tags every ad link with `utm_` parameters so each ad's
visits can be told apart. Vercel's page counts carry referrers but are not
where the rest of the funnel lives, and ADR-120's three events start only once
a bowler is in the app.

**Decision.**

- **headpin.app's landing page loads Umami's own script**, with the same
  website id as the app's counts. It records page views, referrers and `utm_`
  tags, sets no cookies, and stores nothing on the device.
- **`data-domains="headpin.app"`** keeps dev servers and Vercel preview
  deploys out, as ADR-120's host check does for the app's events.
- **The app (`/score`) still loads no script.** It sends ADR-120's three events
  itself: the script's automatic page views would add nothing the session
  events do not, and the app's own URLs carry session ids.
- **The website id is set** in `src/services/usageReporter.ts`, which turns
  ADR-120's counts on.

**Consequences.**
- The privacy page names the landing page's Umami counts beside Vercel's.
- One more request to a third party on the landing page, deferred so it never
  holds up the first paint.

## ADR-122: The Alley report reads lines, in counts, and two Stats rows are hidden

**Status.** Accepted, 2026-10-08. Supersedes the Alley report screen of ADR-064b
and ADR-082 (callouts, "Last time", "How the session moves", "Which ball,
when"). `lib/briefing` is unchanged and still feeds the Start session sheet and
the scorer's game hint (ADR-115).

**Context.** The bowler who asked for the Alley report, Game by game and Open
frames opened all three and could not say what any of them was for. The
question they were answering by hand instead, frame by frame in old sessions,
was: with this ball, at this alley, on this pattern, which line carried? The
report read a ball as one rate per alley, which hides the thing a bowler
changes most. In the session that prompted this, one ball went from 3 strikes
in 9 on one line to 7 in 10 a board over at the target, and no screen said so.

**Decision.**

- **The report groups fresh-rack balls by ball and exact line** (stance and
  target), within the alley, pattern and lane picked (`lib/lineReport`). Lines
  are never merged or rounded: a half board is a line the bowler wrote down.
- **Counts, never rates.** "7 of 10", because most lines are a handful of balls
  and a percentage hides how few. A line under 5 balls is marked thin and still
  shown.
- **Line changes lead.** Two lines with one ball in one session, each with 4 or
  more balls, in the order first thrown and counted inside that session only.
- **A line opens as a push** to its counts, its leaves and every shot with its
  note, and a shot opens its game. The open line is a layer on the `game-plan`
  overlay (`reportLineId`), like a catalog ball on the catalog (ADR-041).
- **It still describes and never recommends.** A line that struck more may have
  been thrown later, on a lane that had moved, or after the ball was sanded.
  The notes sit beside the shots so the bowler can see that.
- **"Game by game" and "Open frames" lose their rows on Stats.** Their screens
  and routes stay, so bringing one back is putting a row back.

**Consequences.**
- The old report's sections are gone from the screen. Their thresholds in
  `lib/briefing` are still tested and still used elsewhere.
- Surface changes are not a field. They stay in shot notes until there is a
  case for more.
- The report draws no lane. A line is two numbers here, and the visualizer is a
  tap away from the game a shot opens.


---

## ADR-123: A leave with the 1 and 5 standing is a pocket shot, with no spare line

**Status.** Accepted, 2026-10-08. Amends ADR-052, ADR-054 and ADR-113 for these
leaves only.

**Context.** A first ball that barely touched the rack (a gutter, a whiffed 7
or 10, a 1-2-3-5, a 1-3-5) leaves a shot the bowler throws exactly like the one
before: the strike ball, on the strike line, into the pocket. The app treated it
as any other leave. The scorer picked the spare ball and the leave's saved line,
offered to save the throw as a spare line, and the spare lines screen listed the
leave and asked for a line for it whenever it was left often.

**Decision.**

- **A pocket leave is any leave with both the 1 and the 5 standing**
  (`isPocketLeave` in `lib/pins`). One rule for both hands, chosen by the bowler
  over a handed one (1-3-5 right, 1-2-5 left): with the head pin and the pin
  behind it up, the shot is the strike shot. Leaves on the pocket side without
  the 5 (1-3-6-10, 1-2-4-7) stay spare leaves.
- **The scorer seeds it like a fresh rack.** The ball and line are the ones the
  fresh-rack rule gives (ADR-113), which in practice is the ball just thrown and
  its line. A ball change there shows that ball's strike line. A saved spare
  line for the leave is never read.
- **No spare line is asked for or offered.** No save prompt after the attempt
  (ADR-054), no borrow control beside the Intended box, and the spare lines
  screen neither lists the leave, suggests a copy for it or from it, nor asks
  for it as the leave left most. The Home count of answered lines skips it.
  The leave's details sheet, opened from Stats, says it is a pocket shot instead
  of showing the line fields.
- **Rows already saved are hidden, not deleted.** Changing the rule brings them
  back with nothing lost.

**Consequences.**
- Stats are unchanged: a pocket leave is still a spare attempt, converted or
  not, and still counts in the leave tables.
- The pocket-hit verdict on a first ball (`isPocketHit`, ADR-046) is a different
  question and is untouched.

---

## ADR-124: Strike on strike and the best streak

**Status.** Accepted, 2026-10-08. Extends ADR-036 and ADR-048 (one calculator
for every stat).

**Context.** The Stats tiles said how often a bowler struck, not whether strikes
came in runs, which is what separates a bowler who carries a good ball from one
who is hot. Two numbers answer it and neither needs new data: how often a
strike is followed by another, and the longest run.

**Decision.**

- **Strike on strike** is strikes that the next ball struck too, over strikes
  that had a ball after them. The balls are read as one sequence of fresh-rack
  throws per game, in frame order, so a 9th-frame strike is followed by the
  10th's first ball, and the 10th's strike, strike, strike is two follow-ups.
- **The last ball of a game is not an opportunity,** and neither is the last
  recorded ball of a game still being bowled. Same shape as a leave off the
  10th's last ball (ADR-092): it happened, and nothing could follow it.
- **A pair belongs to the frame of its first strike.** A lane filter keeps the
  strikes thrown on the selected lanes, whichever lane the next ball landed on.
- **Best streak** is the most strikes in a row inside one game, never carried
  from one game to the next, so twelve is the ceiling. On the session and game
  charts it is that session's or game's best.
- **Both come out of `calculateStats`,** so a tile and the point on its chart
  are one call (ADR-061b), and both are tiles that plot like any other.

**Consequences.**
- Stats gains two tiles and the grid is regrouped: scores, then strikes, then
  spares and the first ball.
- A bowler with no strike followed by a ball sees "-" for the rate, not 0%.


## ADR-125: A spare ball with no line starts from the strike ball's move

**Status.** Accepted, 2026-10-09. Extends ADR-053 and ADR-113 at a leave, for a
spare ball or no ball. A strike ball is unchanged.

**Context.** At a leave a spare ball opened with, in order, its own attempt at
the leave this session, the leave's saved spare line, and then its own strike
line. A spare ball is almost never thrown at a full rack, so that last step was
empty, and a leave with no spare line opened with a blank box. The leave's
strike ball move (ADR-053) was only ever used when a strike ball was selected,
so a bowler who had set the move and not the spare line still got nothing on
the spare ball.

**Decision.**

- **At a leave, with a spare ball or no ball selected:** this ball's own attempt
  at the leave this session, then the leave's saved spare line, then the
  strike ball that was thrown at the rack, on the line it threw, moved by the
  leave's strike move. With no move saved, that line as it is. Only then the
  ball's own strike line.
- **The rack ball** is the ball of the latest fresh-rack throw (`lastFreshRackBallId`:
  this frame, then earlier frames and games). It is used only when it is a
  strike ball with a line on record. A spare ball thrown at the rack is not
  moved by a strike move, so that case falls through as it did before.
- **A strike ball selected at a leave** is unchanged: its own attempt, then its
  strike line moved by the strike move, then its strike line. Never the spare
  line (ADR-113).
- **Swapping between the two** therefore runs the same lookup both ways. Spare
  to strike shows the strike move, strike to spare shows the spare line, and
  back again shows the same line it showed before, because each answer is read
  from the record and not from what was last in the box.

**Consequences.**
- A leave that has only a strike move saved opens on the spare ball with the
  move applied, instead of blank.
- A typed line is still replaced when the ball changes under it (ADR-052). A
  per-shot memory of what was typed for each ball was not added.
- Swapping between two strike balls at a full rack is unchanged: each ball
  shows its own last line (`sameBallSeedLine`, ADR-052).
- On the Spare lines screen a leave with both a spare ball line and a strike
  ball move is a tile on a row of each (`lineRows`), since those are the two
  answers the scorer swaps between. Nothing is stored for it: the rows are read
  from the leave's one record.


## ADR-126: Stats leads with the average, and chips pick the chart

**Status.** Accepted, 2026-10-09. Amends ADR-061b (the tiles were the chart
picker) and ADR-062b (the chart header named the axis). The metric definitions
of ADR-005 and ADR-124 are unchanged.

**Context.** The Stats tab opened on eleven tiles in rows of four, three and
four, all the same weight, so nothing on it read as the headline. The tiles were
also the chart picker, which nothing on screen said: the selected tile looked
like a highlight. The tile read 195 while the chart's dashed line read 192,
because the tile was the mean of the games and the line the mean of the
nights. Every number was over the whole history, so none of them said whether
the bowler was getting better. Pocket, carry and strike sat in three tiles
though they are one chain, and the ball table needed its column letters decoded
before it said which ball struck.

**Decision.**

- **The average leads**, large, with High, Low and Games under it.
- **Recent form sits under it as a sentence**: the game average over the last
  five scored sessions, and how far above or under the scope's average it is
  (`calculateRecentForm`). Both sides come from `calculateStats`. It is shown
  only with ten or more scored sessions in scope, and it is never red.
- **The chart picker is a row of chips** in the chart card, one per metric,
  exactly one pressed. Eight options do not fit a segmented track, so the row
  scrolls. The info control for the picked metric stays at the row's end.
- **The dashed line on the session chart is the game average**, the number in
  the headline, not the mean of the nights drawn.
- **A First ball card** reads pocket, carry and strike as a chain, with first
  ball pins, strike on strike and best streak around it.
- **A Spares card** gives spare % and the three makeable leaves missed most.
  Every leave, in its three groups, is behind All leaves.
- **Balls are ranked by strike %**, one number and a bar per ball. A ball under
  `RATE_LEADER_MIN_BALLS` is greyed and listed after the rest. Pocket and carry
  stay in the ball's own table, one tap down.
- **A range control, Last 10 / Season / All**, sits at the top of the Stats tab.
  Last 10 is the ten latest scored sessions; Season is everything since
  1 August, when league seasons start, and before August it means last year's.
  It is a window on top of the shared filters (ADR-057), read by Stats only:
  History is already a list in date order. The share card names the window.

**Consequences.**
- Inside a session, Stats shows the same cards with no range and no recent form,
  since there is nothing earlier to compare against.
- `findRateLeaders` no longer drives anything on screen; it stays tested in
  `lib/stats` for whoever needs a column leader next.
- Season is a fixed date, not a setting. A bowler whose league starts in
  January sees the wrong window until there is a case for making it one.


## ADR-127: Three months, not a season, and the chart always says what it counts

**Status.** Accepted, 2026-10-10. Supersedes the Season range and the chart's
info control from ADR-126, and the info control of ADR-061b.

**Context.** ADR-126 shipped a Season range that started on 1 August, the start
of a US league season. Nothing on screen said so, the app cannot know when any
given league starts, and the bowler who asked for the range bowls where that
calendar does not apply. They read it as unintuitive, which it was. The chart's
definition sat behind an info button, so the one line that says what "Carry" or
"Streak" counts was a tap nobody made.

**Decision.**

- **The middle range is 3 months**: the last 90 days, counted back from today
  and including the first of them (`windowStart`). The label says exactly what
  it keeps, and a rolling window never empties on the first day of a year.
- **The picked metric's definition is always on**, one line under the chips.
  Every metric has one now, average included, each short enough to fit one row
  on a 390px screen. The Game by game screen does the same.
- **Best streak is called Max consecutive strikes**, on the chart and on the
  First ball card, and is the last chip on the picker: it is the stat a bowler
  reads least. The line under the chart says it is per game.

**Consequences.**
- The share card names the window as "Last 3 months".
- The range is kept for the app run only (`viewMemory`), so no stored "season"
  value needed migrating.


## ADR-128: Stats sheets carry the scope, balls show three rates, and leaves share the Spare lines filters

**Status.** Accepted, 2026-10-10. Amends ADR-126 (the Balls and Spares cards).

**Context.** The Balls card of ADR-126 gave each ball one number, strike %, and
a bar. The bowler wanted pocket and carry on the row too, without the bar, and
the card had no limit on how many balls it listed. The Spares card named three
leaves only. All leaves listed every leave with no way to narrow it, while the
Spare lines screen, a tap away, had shape, status and pin filters. And a sheet
opened from Stats did not say which sessions it counted, though the tab could be
narrowed by alley, pattern, game, lanes and range.

**Decision.**

- **A ball's row shows pocket, carry and strike**, under spelled-out column
  headings, with the ball count under the name. A ball under
  `RATE_LEADER_MIN_BALLS` is greyed. The card lists the top five by strike %.
- **All balls is a sheet with every ball open**: its row, its rates by game and
  its leaves. Tapping a ball on the card opens the sheet scrolled to that ball.
  Picking a game from it closes the sheet on the way.
- **The Spares card lists every makeable leave missed at least once**, two rows
  on show and the rest a scroll inside the card.
- **All leaves takes the Spare lines filters**: All, Pins, the shapes and
  whether a line is saved. One set, `useSpareFilters`, kept for the app run and
  read by both screens, so a filter set on one is set on the other.
  `matchesLeaveFilters` reads a leave with no saved line as "No line yet".
- **Both sheets carry the Stats scope** in a line at the top: the same words the
  share card uses (`describeFilter`), range included.

**Consequences.**
- A ball is no longer expanded in place on the card, so the per-ball expand
  memory is gone.
- `SpareFilterBar` is the one filter row, worn by Spare lines and All leaves.


## ADR-129: The Spares card lists the leaves left most, and Stats sheets pin their header

**Status.** Accepted, 2026-10-10. Amends ADR-128 (the Spares card and the All
balls and All leaves sheets).

**Context.** ADR-128 had the Spares card list the makeable leaves missed most,
under "Missed most". The bowler wanted the leaves they face most, made or not,
and without the label. On the All balls sheet the pinned column headings sat
below the sheet's own 1rem of scroll padding, so rows scrolling past showed
through the gap above them, cut off at the bar.

**Decision.**

- **The Spares card lists every leave left 3 times or more, most left first**,
  of any shape, splits and washouts included. Ties fall to the one with more
  chances. Fewer than 3 is a rate over a handful; every leave is still under
  All leaves. The line reads "made" alone.
- **Both sheets pin their header**: the scope line and the column names on All
  balls, the scope line and the filters on All leaves. `SheetHeader` starts and
  sticks 1rem up and fills that strip with its own background, so nothing shows
  above it.

**Consequences.**
- A leave that is always made can lead the card. That is the point: it is the
  one faced most.


## ADR-130: A sheet can carry a subtitle in its bar, and All balls labels each row

**Status.** Accepted, 2026-10-10. Amends ADR-129 (the pinned sheet headers).

**Context.** ADR-129 pinned a header inside the All balls and All leaves sheets:
the scope line, then the column names or the filters. On a phone the scope
line alone ran to two lines with a long event name, and on All balls the pinned
column names read as a bar cutting the ball under it in half. The sheet's own
bar, meanwhile, had a centred title with an empty slot balancing the close.

**Decision.**

- **`FormSheet` takes a `subtitle`.** With one, the title sits leading beside
  the close, the subtitle under it in small secondary text (two lines at most),
  and the empty trailing slot is dropped, so the line has the bar's width. The
  bar never scrolls, so neither does the subtitle. Without one, the bar is
  unchanged.
- **All balls and All leaves put the Stats scope in that subtitle.**
- **All balls pins nothing.** Each ball names its own rates, Pocket, Carry and
  Strike in small capitals over each number. The Balls card on Stats keeps its
  one heading row: five rows never scroll it away.
- **All leaves still pins its filter chips**, now alone under the bar.

**Consequences.**
- A sheet with a subtitle has a leading title and a centred-title sheet does
  not: the two read differently on purpose, since one is a list with a scope
  and the other a task.


## ADR-131: Ball photos are cache-first, and the arsenal's are warmed at boot

**Status.** Accepted, 2026-10-11. Supersedes the image line of ADR-010 ("Images
stay StaleWhileRevalidate").

**Context.** A bowler saw their own balls' photos arrive a second or two late,
on every screen. The photos were runtime-cached only, so each one was stored
the first time a screen showed it and not before: a fresh install, a ball not
yet shown, or iOS clearing an idle web app's storage all sent the photo to the
network. There Vercel's default `Cache-Control` for static files (`max-age=0,
must-revalidate`) made even the HTTP cache ask the server first. On top of
that, StaleWhileRevalidate went back to the network for every photo each time
it was shown, and `loading="lazy"` on every tile held even a cached photo until
layout (and, on iOS, until a sliding sheet settled).

**Decision.**

- **The arsenal's thumbnails are written into the image cache at boot**
  (`warmArsenalImages`), a few seconds after first paint, only the ones it does
  not hold. Straight into Cache Storage, so it works before the service worker
  controls the page.
- **Catalog photos are `CacheFirst`**, expiring after 30 days and 600 entries.
  The files are named after the ball rather than their content, so expiry is
  what lets a replaced photo through.
- **`vercel.json` gives `/catalog/img/*` a 30 day `max-age`**, so a browser
  without the worker keeps them too.
- **Only the catalog lists load photos lazily**, the catalog screen and the
  catalog search in the ball form. Everywhere else is a handful of small photos.

**Consequences.**
- A replaced photo under the same filename can take up to 30 days to reach a
  device that already holds the old one. Giving the photo a new filename ships
  it at once.
- The cache name lives in `src/lib/ballImageCacheConfig.ts`, shared by the workbox config
  and the warm-up, so the two cannot drift apart.


## ADR-132: A leave answered only by a strike ball move opens on the strike ball

**Status.** Accepted, 2026-10-11. Amends ADR-125 for the ball a spare attempt
opens with. The line rules of ADR-113 and ADR-125 are unchanged.

**Context.** A spare attempt always opened on the spare ball. ADR-125 made a
leave with only a strike ball move saved open on the spare ball with the move
applied, so the box was no longer blank. But a strike ball move is the answer
"throw your strike ball, moved this far": the boards are a hooking ball's, and
on the spare ball they miss. The bowler had to change the ball by hand on every
such leave, and forgetting recorded the shot against the wrong ball.

**Decision.**

- **A spare attempt at a leave whose saved answer is a strike ball move and no
  spare line opens on the strike ball thrown at the rack** (`lastFreshRackBallId`),
  and so on that ball's line moved by the move (ADR-113's strike-ball lookup).
- **Only when that rack ball is a strike ball.** With the rack thrown on the
  spare ball, or no ball on record, the spare ball opens as before.
- **A leave with a spare line keeps the spare ball**, move or not: the spare
  line is the leave's first answer, and the move is what a swap to the strike
  ball shows (ADR-125).
- **A leave with nothing saved keeps the spare ball.**

- **The spare ball picked by hand at such a leave gets only its own attempt**
  at the leave this session, else an empty box. It no longer shows the strike
  ball's line moved by the move (ADR-125): those boards are a hooking ball's,
  and the spare ball has nothing saved for this leave.

**Consequences.**
- At a move-only leave, the strike ball shows the moved line and the spare ball
  shows its own attempt or nothing, whichever way the swap goes.
- A leave with nothing saved still starts the spare ball from the line the
  strike ball threw at the rack (ADR-125, unchanged).
- The capture prompt is offered after spare-ball attempts only (ADR-113), so
  it is not offered after these shots, which is right: the leave already has
  its answer.


## ADR-133: A ball can be retired, and keeps its name in history

**Status.** Accepted, 2026-10-11.

**Context.** The only way to take a ball out of the arsenal was Delete, which
removes its row. Shots name their ball by id, so every shot ever thrown with it
lost the name: History showed nothing and Stats listed it as "Ball #12" with no
picture. A bowler who stops throwing a ball still wants its record, and the
only way to keep that was to leave it in every ball picker. Oil patterns
already solve the same problem by archiving (`archived`).

**Decision.**

- **`Ball.retired`**, an optional flag. Unset or false is in the bag.
- **Retire and Bring back live in the ball's editor**, above Delete, and
  retiring needs no confirmation because it is undone in one tap. The arsenal
  lists retired balls under a "Show retired" toggle below the ordered list, each
  with a Bring back button, as archived patterns are.
- **Retired balls leave every list a ball is chosen from**: the ball picker, the
  spare ball choice and the home strip. The picker still shows a retired ball
  when it is the one already on the shot, so an old shot reads true.
- **History, Stats and the game plan keep every ball**, retired or not.
- **A retired ball is never the spare ball.** Retiring clears the flag, and
  bringing it back does not set it again.
- **Delete is unchanged** and its warning now points at Retire.
- Backups carry the flag. A backup made before it reads every ball as in the
  bag.

**Consequences.**
- No Dexie version bump: the field is not indexed (`docs/DATA_MODEL.md`).
- A ball retired mid-session can still be the ball a fresh rack opens with in
  that session (ADR-113 reads the last ball thrown). It was the ball in the
  bowler's hand, and the next session starts clean.


## ADR-134: A catalog release date is as precise as its source, and the catalog shows the month

**Status.** Accepted, 2026-10-11.

**Context.** The catalog showed a ball's release year and nothing finer, though
most dated rows knew the day. Showing the month needed one thing first: 29 rows
read `yyyy-01-01` because their source (a Storm/SPI year catalog, or an early
hand entry) only gave the year, and the three year-catalog parsers padded it to
1 January. Printed as a month, every one of those would claim January.

**Decision.**

- **`releaseDate` is a partial ISO date**: `yyyy`, `yyyy-mm` or `yyyy-mm-dd`,
  whichever the source states. A year-only source is `"2025"`. The 29 padded
  rows are rewritten to their bare year, and the parsers emit the bare year.
- **`validateRaw` flags any other shape, and flags `yyyy-01-01`** as a padded
  year. No ball is released on New Year's Day, and every such row so far was
  padding. A real one would be written to the month, `yyyy-01`.
- **The catalog prints month and year** ("Mar 2024") when it has the month, and
  the year alone when it does not. It never prints the day: the month is what a
  bowler compares, and some sources pin a month to its 1st.
- **Newest first sorts by the date string**, so balls within a year are in
  month order, a year-only ball sits after its year's dated ones, and undated
  balls go last.

**Consequences.**
- `releaseYear` and the ball id are unchanged: both read the first four
  characters, so no `catalog_ref_id` moves and no Dexie version bump is needed.
- A client holding the old catalog shows January for those 29 until it syncs
  the new manifest version, which it does on the next open with a connection.

## ADR-135: The Brunswick family joins the catalog, and a web search can be a reader

**Status.** Accepted, 2026-10-11.

**Context.** The catalog covered Storm, Roto Grip, 900 Global and MOTIV (with
one Pyramid ball): roughly half of what a league bowler throws. Brunswick and
the brands it owns (Hammer, Ebonite, Track, Radical, DV8, Columbia 300) were
missing entirely. The session that set out to add them could not open any
spec site: its network policy denied every bowling host, and page fetches
failed too. Only a web search worked, and it returns a model's summary of the
matching pages rather than the pages.

**Decision.**

- **Seven brands join `Manufacturer`**: Brunswick, Hammer, Ebonite, Track,
  Radical, DV8, Columbia 300. Each gets a placeholder colour. The catalog's
  brand filter lists only brands the loaded catalog has a ball for, so twelve
  brands do not mean twelve chips with nothing behind some of them.
- **The USBC brand list carries them too**, with spellings unchecked against
  the PDF, which could not be downloaded. The next index rebuild confirms them.
- **A search summary can be a reading, never an official one.** A search pinned
  to one site (`allowed_domains`) attributes its text to that site, so a
  substring of the tool's output can stand as the quote. Such a reading carries
  `via: "web-search"`, and a ball promoted from any such reading carries
  `readVia: "web-search"` in `balls.json`, which build ignores and a later
  session with page access uses to find the rows to re-read. ADR-043's rules
  are otherwise unchanged: two different sites must agree, and the value must
  be in its quote.
- **Every ball read this way is checked blind.** A second agent, on a different
  model and told only the ball's name, finds RG, differential, mass bias and
  core symmetry on its own. A contradiction holds the ball back, and so does a
  reviewer's doubt about which page a reading came from.
- **An asymmetric ball waits for its mass bias.** `deriveCoreType` reads a
  missing mass bias as a symmetric core, so a ball with no two-site mass bias
  is promoted only when a source says its core is symmetric. A core name that
  any other ball in the run shows as asymmetric counts as asymmetric.
- **A release date's receipt is read as a date.** Promote matched a value only
  as a substring of its quote, so `2023-10` could never be backed by "October
  2023". `quoteContainsDate` accepts the ISO value, a month name or its
  abbreviation, or US month-first numbers, to the value's own precision: a
  month is backed by a quote of that month with or without a day, and a day
  only by that day. Day-first numbers are not read, being ambiguous.
- **Promote resolves `productUrl`.** It read `fields.productUrl` without ever
  resolving it, so a manufacturer link could not reach `balls.json`.

**Consequences.**
- 62 balls were added this way. The 75 researched and held back are in
  `scripts/sync-catalog/data/backlog/`, one candidate file each, and
  `scripts/sync-catalog/data/HANDOUT.md` says why each waits, how the run was
  done, and what to read first once the sites are reachable.
- Images for the new balls are not in this change. The handout says where
  clean ones can come from; until then the brand placeholder shows.

## ADR-136: We keep each pattern's original sheet and show it in the app

**Status.** Accepted, 2026-10-12. Extends ADR-104, ADR-105 and ADR-106.

**Context.** A catalog pattern linked to the sheet it was read from, and those
links point at a regional federation's upload folder or a school league's
season directory: `wp-content/uploads/2021/05/`, `sj_18_19/`. Such links die
when a site is rebuilt or a season is archived. When one does, the bowler
loses the original, and the pipeline loses the one document that can re-check
a reading. ADR-106 put the numbers in the app, but a bowler still wants the
sheet itself sometimes: to show a lane mechanic, or to trust what they read.

ADR-104 took the risk of shipping competition patterns' numbers with the
owner's agreement. Hosting the sheets themselves, the publisher's own document
with its layout and branding, is a larger step than that. The owner asked for
it, and it is taken deliberately here.

**Decision.**

- **Every sheet PDF is kept**, byte for byte, in `public/catalog/sheets/`. Ingest
  keeps the PDF it reads. `npm run attach-pattern-sheet -- <id> <file>` keeps
  one for a pattern already staged, and `npm run fetch-pattern-sheets` downloads
  one from a candidate's `sourceUrl`. A file that does not start with `%PDF-` is
  refused, because an expired link often answers 200 with an HTML page.
- **The file is named for its content**, `<id>.<12 hex of sha256>.pdf`, and the
  candidate records the full hash. Promote holds back a pattern whose recorded
  sheet is missing or hashes differently, and a test fails the build if the
  shipped catalog names a sheet or page that is not there.
- **The sheet is shown in the app, as pictures of its pages.** Each page is
  drawn once, when the sheet is kept, as a webp beside the PDF. The app shows
  those, with tap to zoom, and offers the PDF itself as the screen's one
  trailing action. This brings back no PDF reader (ADR-104 took one out at
  8.5 MB) and works on Android, whose browser will not show a PDF inline.
- **The app never links to the publisher.** "Original pattern sheet" opens our
  copy. `sourceUrl` stays in the catalog as provenance for the pipeline, and
  seeding no longer copies it onto a bowler's row; a row that still carries
  exactly that link has it taken off at boot. A link the bowler typed is
  theirs, kept, and still opens. A catalog pattern with no kept sheet yet shows
  no sheet row at all.
- **On demand, never ahead.** Sheets and their pages are not precached and not
  warmed. The first open downloads them, and the service worker keeps them
  (CacheFirst, `pattern-sheets`), so a sheet a bowler has opened once also
  opens offline. Because names change with content, the host serves them as
  `immutable` for a year, and the cache never has to revalidate.
- **`/catalog/` is off the navigation fallback.** A PDF opened in its own tab
  arrives as a navigation, and the fallback would have answered it with the app
  shell.

**Consequences.**
- The repository grows by each sheet and its pages, typically 0.3 MB to 1 MB
  a pattern. The app's boot does not, because nothing is fetched until opened.
- Chromium 6742 and High Street V2 have a `sourceUrl` but no kept sheet: their
  hosts could not be reached when this shipped. `fetch-pattern-sheets` adds
  them once they can be.
- A publisher who objects is answered by deleting the pattern's files and
  rerunning promote. The pattern keeps its numbers.


## ADR-137: A row keeps its id when it gains a release date, and a page can fill a row's gaps

**Status.** Accepted, 2026-10-12.

**Context.** ADR-135 added 62 balls from web search summaries, each marked
`readVia: "web-search"` until a page could be read. This session could open the
spec sites, and a read of every one of those pages agreed with the rows on RG,
differential and mass bias, so the marker came off all 62. The same read could
also fill what a search summary had left empty (30 release dates, 17 core
names, 48 finishes, per-weight tables), and the 100 MOTIV balls that had no
release date could be dated from bowwwl, since MOTIV's own pages for its
retired balls carry none.

Both ran into the same wall. A ball's id is `brand-name-year`, so adding a
release date to a row that had none changes its id, and ADR-062 records why ids
do not move: an arsenal ball holds `catalog_ref_id`, and a moved id leaves it
pointing at nothing (the Owned badge goes, and so does the link from the ball's
editor to its catalog row). And `promote` only adds balls, refusing one that
collides with a row already there, so there was no way to fill a row at all.

**Decision.**

- **`RawBall.id` is an optional pin.** Absent, the id is derived as before.
  Present, the build uses it as written. It is set only to hold an id still
  while another field changes.
- **`npm run fill-from-seed -- <seed> [--write] [--confirms-search]`** fills the
  gaps in rows already in `balls.json` from a deterministic parser's staged
  output (ADR-044), and overwrites nothing:
  - a number the row has and the page disagrees with is reported and the whole
    row is left alone, since a page that disagrees may be another variant of the
    ball (five MOTIV rows did);
  - a text field is replaced only by a fuller form of itself, or by one the
    build can classify where the row's could not;
  - a release date filled into a row that had none pins the row's current id
    first, and a page's `yyyy-01-01` is read as the year (ADR-134);
  - `--confirms-search` removes `readVia` from a row whose RG, differential and
    mass bias the page agreed with.
- **USBC brands are confirmed against the PDF.** Every ADR-135 spelling matched
  except Track: the list prints no "Track" brand, and a split on it only found
  Roto Grip's "M-Track", so Track is left off and its balls come through
  bowwwl.
- **`parse-bowwwl` spells brands and names the catalog's way.** The brand came
  from the URL slug, which made DV8 "Dv8", a brand the catalog does not have.
  "(various colors)" is still dropped, "(pearl, various colors)" now puts the
  cover in front ("Rhino Pearl"), and any other trailing bracket is a colour
  note and is dropped.

**Consequences.**
- 117 rows now carry a pinned `id` in `balls.json`. A pinned id with a date in
  the row looks odd on first reading; it is the point.
- No id in the catalog moved: the build's ids before and after were compared and
  none was lost.
- A row whose page disagrees stays as it was, so a conflict is a to-do rather
  than a silent change. The handout lists them.
- Photos are a separate question and are not changed here. ADR-039 limits photo
  pulls from bowwwl to balls the owner needs, one at a time, and this session
  added 206 balls without adding a photo for any of them.

## ADR-138: Photos for the balls added since ADR-137 come from the source database, by the owner's decision

**Status.** Accepted, 2026-10-12.

**Context.** ADR-039 took ball photos from bowwwl "per-ball and on demand, for
balls the owner actually needs", and said deliberately not a bulk mirror, on the
reasoning that a per-ball pull is a different act from republishing a catalog.
ADR-119 then recorded that the owner accepts the image risk. Two sessions later
the catalog went from 250 to 518 balls, and 265 of the new ones had a source
page and no photo, so the question was whether the narrow reading still held.
It was put to the owner, who said yes to photos for the new balls.

**Decision.**

- **The new balls take their photos from the source pages.** Every image is the
  one `parse-bowwwl` recorded as the page's `_imageUrl`, rendered through the
  same normaliser as every other photo (ADR-043), one request a second.
  `npm run fetch-seed-images -- --skip-ids <file>` does it for the balls not in
  a given list, and never touches a ball that already has a photo.
- **It is the owner's decision, not the pipeline's default.** The command needs
  `--brand`, `--all` or `--skip-ids`, so a run cannot fetch photos by accident.
- **The rights position is unchanged, and wider.** The photographs belong to the
  manufacturers; bowwwl self-hosts them under no stated licence and its terms
  forbid copying them. Taking 265 more is a larger version of the same
  unlicensed, reversible position, and the same remedy applies: every image is
  keyed to its ball id in `data/images.json`, so a takedown is a data edit.
- **MOTIV's balls are not part of this.** MOTIV's photos come from its own site
  and its media kit, under its permission (ADR-061). The kit's Front renders
  were compared with the current photos for all 86 balls they match, and they
  are the same studio shots, so none was replaced.
- **A replaced photo gets a new name and keeps the old one** (`npm run
  set-ball-image`), because the app caches a photo by its URL for 30 days and an
  arsenal ball keeps a snapshot of the path it was added with.

**Consequences.**
- Photos for balls the owner has not asked about are still not fetched: the
  older rows with no photo and no recorded image URL stay on the placeholder.
- The image position now covers about 300 non-MOTIV photos instead of 30
  (ADR-119). If a manufacturer objects, or written permission is ever obtained
  (the handout suggests asking Brunswick and Storm), nothing here needs undoing
  beyond a data edit.


## ADR-139: Stats charts by game as well as by session, and each ball gets a first ball average and strike on strike

**Status.** Accepted, 2026-10-12. Extends ADR-056 (by position in the night),
ADR-124 (strike on strike) and ADR-126 (the Stats tab's chart and Balls card).
Amends ADR-129 (the Spares card's floor of three) and ADR-126 (where the range
control sits, and the headline's layout).

**Context.** The Stats tab's chart plotted one point per session, so it said
whether a bowler was improving over months, never what happens between the
first game of a night and the last. That question already had an answer
(`calculateGameNumberMetrics`, behind the hidden Game by game screen), but
nothing on the tab reached it. The bowler also asked for a ball's first ball
average and strike on strike, which existed only over everything, not per
ball, and the Balls card had no room for two more columns on a phone.

**Decision.**

- **A By session / By game switch sits over the chart** on the Stats tab, a
  `SegmentedControl` since it is one answer of two. By game plots one point per
  game slot (every game 1 against every game 2), for every metric on the
  picker, the average included, with the scope's own figure as the dashed line.
  Tapping a slot narrows the whole tab to that game number, as the Game by game
  screen does. A session sheet has no switch: it already plots its own games.
- **Each ball gets a first ball average and strike on strike,** overall and per
  game slot, both from `calculateBallPerformance`. The first ball average is
  the pins its fresh-rack balls knocked down, over those balls.
- **A ball's strike on strike is credited to the ball that threw the
  follow-up.** The pairs are exactly ADR-124's (`strikeFollowUps`, which
  `calculateStats` now reads too), and the lane filter still goes by the first
  strike's frame. The result being read is the follow-up throw, so it belongs
  to the ball that threw it, the way a strike belongs to the ball that struck.
  When every ball is tagged, the balls' pairs add up to the overall rate.
- **Ball columns scroll sideways.** The Balls card's rows share one horizontal
  scroller, so the columns stay aligned, with the ball's picture and name
  pinned at the left. On the All balls sheet each ball's labelled line, and its
  by-game table, scroll the same way with the row names pinned.
- **The Balls card lists every ball,** about five on show and the rest a
  scroll down inside the card, the way the Spares card scrolls its leaves. The
  headings stay pinned at the top of that scroll. A cap of five hid the rest
  behind All balls for no reason a scroll could not answer.
- **The Spares card lists the fifteen leaves left most, however few times
  each was left.** This replaces ADR-129's floor of three: inside one session
  almost no leave is left three times, so the card sat empty when it was most
  wanted, and sorting by times left already puts a leave left once at the
  bottom. Every leave is still under All leaves.
- **The range control moves into the header row,** at the far right after the
  filter and share buttons, instead of a row of its own under them. "3 months"
  reads "3 mo" there so the row fits a 360px phone; a screen reader still
  hears the whole name.
- **The headline is one row:** the average at `text-4xl` with High, Low and
  Games beside it rather than under it, and the recent-form line in small type
  below. It still leads the screen (ADR-126), at about half the height.

**Consequences.**
- On a phone the last columns of the Balls card are a swipe away; the order
  (pocket, carry, strike, first ball, strike on strike) keeps the chain of
  ADR-126 on screen first.
- A follow-up thrown with no ball recorded counts in the overall strike on
  strike and in no ball's, the same way an unattributed fresh-rack ball does.


## ADR-140: A spare line is shared by its row, carried across the house's sessions, and edited a row at a time

**Status.** Accepted, 2026-10-12. Extends ADR-052 (the line follows the ball),
ADR-054 (capturing a line) and ADR-113; the strike ball rules of ADR-053 and
ADR-125 are unchanged.

**Context.** The Spare lines screen groups leaves by the line they are shot
with, and a bowler who moves for the lane moves for all of them. The scorer
did not know that. A move made at the 6 opened the 6-10 on the old line, because
a spare attempt was remembered by its exact leave only. A new session also
opened every leave on the saved line, even at the house and on the pattern
where the bowler had moved off it last time. Moving a whole row on the Spare
lines screen meant opening and saving every leave in it.

**Decision.**

- **A leave's spare ball line is looked up across its row.** At a leave, a
  spare ball (or no ball) opens on the newest attempt this session at this leave
  or at any leave saved with the same stance and target (`sameLineLeaves`). Rows
  are read from the saved lines as they are now, so nothing new is stored.
- **Then the house's earlier sessions.** With no attempt on the row this session,
  the newest one from an earlier session at the same alley (named the same,
  ignoring case and spaces at the ends) on the same oil pattern opens it
  (`earlierSessionFrames`). A session with no pattern matches only others with
  none. Only after that does the saved line open it, then ADR-125's fallbacks.
- **A strike ball reads only its own attempts at the exact leave,** this session
  then the house's earlier ones. Rows are spare ball lines, and a hooking ball
  has its own boards (ADR-113).
- **Tapping a row's heading on Spare lines edits its line, or its strike ball
  move, for every leave on it** (`SpareLineBulkSheet`, `updateSpareLines`). The
  leaves are shown and not editable. Each leave keeps everything else it has:
  notes, its other answer, and the laydown, which follows the stance as on a
  single leave. The row of leaves with no line has no bulk edit.

**Consequences.**
- An attempt from an earlier session outranks the saved line at that house on
  that pattern. A saved line still answers a new house, a new pattern, and a
  leave never faced there.
- Two leaves that only happen to share boards are treated as one shot. That is
  what putting them on one row already says.

## ADR-141: A drop laid where the machine stands is a pass with no length

**Status.** Accepted, 2026-10-13. Narrows ADR-101's rule that a pass must
travel and ADR-102's rule that direction comes from the row. Both stand as
written for every pass that travels.

**Context.** Kegel's Boardwalk V2 and Arsenic open their forward table with a
row whose distance is `0 to 0`: 2L to 2R, one load, 50 microlitres, T.OIL 1,850.
It is oil laid at the foul line before the machine starts down the lane. Every
rule in the load table said such a row was a typo: the reader skipped it, promote
refused it and the app's editor, the backup validator and `isDrawable` all
rejected a pass that goes nowhere. The rest of the sheet then came to 13.05 mL
forward against a printed 14.9, and promote rejected both patterns on the
arithmetic, which is the check working. Nothing was wrong with the reading. The
model could not hold a row that exists.

**Decision.** A pass whose start and end are the same foot is a **point drop**,
valid when it lays oil (loads and microlitres both above zero), and a typo when
it does not.

- **It counts.** Its oil is boards times loads times microlitres like any other
  pass, in the forward or reverse total by its direction, in the board totals,
  and so in the track zone ratios and the headline ratio. The sheets prove it:
  Boardwalk V2 prints a ratio of 2.16, which is reproduced with the drop and is
  2.31 without it, and Arsenic prints 1.36 against 1.37 without.
- **It is never drawn.** It covers no distance, so it makes no zone and no band,
  and it cannot set the pattern's length.
- **Its direction comes from the heading over its table.** A drop has no travel
  to say which way it went, so the reader takes it from the `FORWARD LOADS DATA`
  or `REVERSE LOADS DATA` line above it, and skips a drop it cannot place. Every
  pass that travels still takes its direction from its travel, as ADR-102 says.
- **Promote catches a wrong direction.** The forward and reverse totals are
  checked against the sheet separately, so a drop filed under the wrong table
  fails loudly rather than shipping.

**Consequences.**
- A heading seen in a sheet's text layer stays in force for rows read from a
  picture of its tables after it. That can file a drop in the wrong table and
  promote will reject it; no sheet in the catalog is read that way.
- A pattern holding a drop cannot be restored by a build older than this one,
  because that build's backup validation rejects a pass that goes nowhere, and a
  file with one bad pass is rejected whole (ADR-101).
- The tests hold Boardwalk V2 as a fixture with its printed totals and ratio.


## ADR-142: The older rows take their photos from the source pages too, by the owner's decision

**Status.** Accepted, 2026-10-13.

**Context.** ADR-138 took photos from the source database for the balls added
since ADR-137, and left the older rows with no recorded image URL on the
placeholder, because the owner's yes covered only the new balls. That left 38
balls with no photo, Road Warrior among them, and the owner asked for them.
The same run added 278 balls approved from 2022 to 2024 and wanted theirs.
Six of the 38 (Equinox, Ion Pro, Road Warrior, Typhoon, Absolute Power, Summit
Peak) were on `image-denylist.json` with no reason recorded, most likely an
automatic fetch that once matched the wrong photo.

**Decision.**

- **Every ball with a source page takes that page's photo.** Each is the
  image `parse-bowwwl` records as `_imageUrl`, rendered through the normaliser
  (ADR-043) at one request a second, by `fetch-seed-images -- --all`. The
  owner said yes for the older rows as well as the new ones.
- **Every photo is checked by eye before it ships**, on a labelled sheet over
  mid-grey: the logo on the ball must name the ball. A photo whose square
  survived the normaliser is cut to its circle with `clear-background --circle`.
- **The six denied balls come off the denylist** once their own page's photo
  is on the sheet and plainly theirs. The list only stops the fetchers, so an
  entry for a ball that now has the right photo would only block a repair.
- **The rights position is as ADR-138 left it, wider again.** The photographs
  are the manufacturers'; the database self-hosts them under no stated licence.
  Checked for this decision: the originals carry no visible watermark and no
  rights metadata, and the rendered files carry no metadata at all, but the
  pictures are the same renders and a reverse image search finds them. Every
  photo stays keyed to its ball id in `data/images.json`, and its page stays
  recorded in the seed, so a takedown remains a data edit.

**Consequences.**

- 798 of 799 balls have a photo. PhysiX Burst has no page to take one from.
- Asking Storm and Brunswick for their dealer media, as MOTIV was asked
  (ADR-061), is still the way to settle the rights question for good.


## ADR-143: An arsenal ball's photo follows its catalog entry

**Status.** Accepted, 2026-10-13.

**Context.** Linking a ball to the catalog copies a snapshot of the entry onto
the ball (ADR-007), so the arsenal, the picker, the scorer and Stats draw it
without the catalog loaded. Nothing ever wrote that snapshot again. When the
catalog's photo of Pyramid Path was re-cut and given a new file name, so the
30-day photo cache would let it through, the owner's own Path kept the old path
and the old picture, white rim and all, while the catalog card beside it in the
same sheet showed the new one. Re-saving the ball fixed it, which nobody would
think to do. The catalog also synced only when its screen or the picker
opened, so a device could go weeks on an old table.

**Decision.**

- **The photo in a linked ball's snapshot follows its catalog entry.** After
  every catalog sync, `refreshArsenalPhotos` writes the entry's current
  `imageThumb` into each linked ball's snapshot where it differs, including to
  `null` when the photo was taken down (ADR-138, ADR-142: a takedown is a data
  edit, and it has to reach the arsenal to mean anything).
- **Nothing else in the snapshot moves.** The specs in it were read for the
  ball's own weight when it was linked, and the name, weight and layout are
  the bowler's. An entry that has left the catalog leaves the ball untouched.
- **The catalog syncs a few seconds after launch when the arsenal has a linked
  ball**, before the arsenal photo warm-up, and the photo step runs even when
  the fetch fails, against the table already on the device. With no linked
  ball there is nothing for it to do, and a first sync is heavy: it parses the
  whole catalog and writes every row, which unasked at launch took enough
  frames to stutter a sheet's slide on WebKit.

**Consequences.**

- A photo fix in the catalog reaches every arsenal on its next launch.
- A launch makes one small manifest request; the catalog itself is fetched
  only when the manifest says it changed, as before.


## ADR-144: The Balls card's five columns fit a phone

**Status.** Accepted, 2026-10-15. Amends ADR-139 (ball columns scroll
sideways).

**Context.** ADR-139 added a first ball average and strike on strike to every
ball and let the Balls card scroll sideways to hold them. On a phone only three
of the five columns showed, the fourth heading sat cut at the edge, and the
ball's name, on a fixed 144px cell, was cut off ("Transform ..."). The bowler
found the swipe clunky and wanted every column, and the whole name, on screen.
The row needed 456px; a 360px phone gives the card 310.

**Decision.**

- **The columns shrink to their numbers.** 13px figures in 36px columns (40px
  for strike on strike), a 4px gap, and 9px headings without letter spacing that
  wrap onto as many lines as they need. "Strike on strike" stays spelled out
  (ADR-130's reason still holds), over three short lines.
- **The name takes what the columns leave,** no longer a fixed width, and wraps
  to two lines before it is cut. The picture is 28px, the ball count 10px.
- **The scroller stays as a floor.** Below about 96px for the name, on a phone
  narrower than any in use, the rows still scroll sideways together with the
  name pinned, as ADR-139 had them.
- **The All balls sheet's labelled lines** share the same sizes, so they fit
  too.

**Consequences.**
- At 360px and wider, all five columns are on screen with no swipe.
- A name longer than two lines at that width is still cut, at the end of the
  second line.


## ADR-145: The by-game chart fits the card instead of scrolling

**Status.** Accepted, 2026-10-15. Amends ADR-062b (four slots visible, then it
scrolls) and ADR-063b (`MetricTrendChart` keeps its `windowSize`).

**Context.** The Stats tab's By game chart showed four game slots and scrolled
sideways for the rest, a bowler with a long day of league and practice having
nine or more. On a phone the scroll hid more than it showed: the later slots,
the high or low printed over whichever slot held it, and the average's value
at the right end of the dashed baseline. Only "G1" was labelled on screen, since
past six points only the ends get a label and the last end was a swipe away.
The By session chart, up to twenty points in the same width, never scrolled,
and the bowler wanted By game to read the same way.

**Decision.**

- **The by-game chart draws every slot in the card's width,** like the session
  chart. `MetricTrendChart` loses `windowSize`, and the Game by game screen
  fits the same way.
- **Every slot is labelled up to twelve.** "G12" is short enough to sit under
  each point at that spacing, so the chart takes a `labelAllUpTo`; a dated
  axis keeps the default of six, past which only the ends are named.

**Consequences.**
- Nine slots on a 360px phone are about 33px apart, still a comfortable tap
  each.
- Past twelve slots only the ends are labelled, as with a long run of sessions.


## ADR-146: The Alley report is a Home tile, and the oil patterns join the tools

**Status.** Accepted, 2026-10-15. Amends ADR-115 (what Home's tiles hold).

**Context.** Home splits the bowler's own things (the arsenal, three tiles, the
recent sessions) from the tools and reference that are the same for everyone.
The owner judged two of them to be on the wrong side. Oil patterns are looked
up and added from a catalog shared by every bowler, a reference like the ball
catalog, and are reached at least as often from the session form. The Alley
report, listed with the tools, reads nothing but this bowler's games at their
alleys, so it is the most personal screen on the list.

**Decision.**

- **The Alley report takes the third tile,** beside spare lines and lane notes,
  its detail the number of alleys it can pick from: every named alley, as
  typed, the same list its alley picker shows.
- **Oil patterns becomes a row under Tools and reference,** after the line
  visualizer it feeds.

**Consequences.**
- The tiles stay three equal ones in a row; nothing on Home grows.
- The onboarding step that suggests adding an oil pattern is unchanged, and
  still opens the same screen.
- The Alley report screen itself is unchanged here. Its shape is to be
  reworked separately.


## ADR-147: A ball's estimated average is modelled from its strikes, its strings and its leaves

**Status.** Accepted, 2026-10-15. Amends ADR-122 (the Alley report reads
counts, never rates) for the one section it adds.

**Context.** A ball's average cannot be read off games: most games are thrown
with more than one ball, and a ball with fifty balls behind it has no games of
its own. The bowler asked for a per-ball estimate built from what a score is
made of, and noted that a ball's first ball average can hide that it leaves
more splits, which cost more than the pins say.

**Decision.**

- **The game is played out exactly,** frame by frame, carrying the chance of
  each state (did the last fresh-rack ball strike, which bonus is still owed)
  and the score expected so far. No simulation, so the same games always give
  the same number.
- **Strike on strike is an input.** A fresh-rack ball strikes at one rate
  straight after a strike and at another after anything else. At the same
  strike rate, 0% strike on strike and 70% are about 24 pins apart.
- **Every leave is scored at the bowler's own make rate on that exact leave,**
  across every ball, since the spare is mostly the spare ball's. Never the
  overall spare %, which leaves splits out by definition (ADR-036) and so
  overstates a game by several pins.
- **Make rates come from the whole history, whatever the scope.** A pattern,
  an alley or a lane narrows which strikes and leaves are read, never the
  rates: a 3-6-10 is shot the same at every house, and one session has too few
  chances at any leave to rate it.
- **A leave with fewer than five chances is thin.** It is flagged, and its
  make rate leans on its kind's (single pin, other makeable, split or washout)
  in proportion. A ball's estimate carries the share of its leaves that are
  thin.
- **A ball's rates and leave mix lean on the bowler's** in the same scope by
  twenty imagined balls, so a ball with a handful of throws reads close to the
  bowler rather than to its last few frames.
- **What is shown is a difference.** A ball is its pins a game above or below
  the bowler's own model, added to their real average. The model's absolute
  number is never shown.

**Consequences.**
- Checked against the owner's 113 games: the model gives 193.7 against a
  real 194.2. Built from one session's strikes and leaves at a time, it tracks
  each session's real average with a correlation of 0.94 and a typical miss
  of under 5 pins, and as well when that session's own spares are left out of
  the make rates. The gap is mostly the night's spare shooting against the
  bowler's usual.
- **The Alley report leads with it.** A Balls section above the lines: one row
  per ball, its estimate and its difference from the bowler's real average in
  the scope picked (shown once, beside the heading), with its strike rate and
  split share under the name. A ball with under 30 first balls in scope is
  greyed, listed last and not ranked. A signed "strikes +9, leaves -1" was
  tried on the row first and read as a code: the split of the difference is
  said in words, inside.
- **A ball opens on a small table,** this ball against every ball: strike
  rate, strike after a strike, and the share of its leaves that split, then
  the three leaves it is expected to miss most, each as how often this
  ball left it and how often the bowler makes it. These are rates as counted;
  the leaned-on rates stay inside the model. A first version said each of
  these as a sentence and was too many words to read at the lanes. A line
  splitting the difference into pins from strikes and pins from leaves
  ("Strikes add 9 pins a game, leaves cost 1") was cut too: it named no
  baseline, so it read as a riddle. The split stays in `lib/scoreModel`.
- **The report gains a Game picker,** beside Lane, which narrows the estimates
  and the lines alike. Game 1 on fresh oil and game 4 on a broken-down pair are
  different lanes to read.
- Lines are not modelled yet. A line is read in counts below, as ADR-122 has
  it, until there is a way to group neighbouring lines that does not merge a
  move the bowler made on purpose.


## ADR-148: The Alley report names where each line was thrown, and drops the lines by ball

**Status.** Accepted, 2026-10-16. Amends ADR-147 (the Estimated average
section) and ADR-122 (the report's lists).

**Context.** The best lines are read across every session in scope, so a line
on the list could have been thrown on any pattern the alley ran, and nothing on
the row said which. The last session had the same gap. The lines by ball list,
every line of every ball behind a row each, was the one list the owner found
unusable. Two labels on the estimates read badly: "Yours here" beside the
heading, and a bare number that could be taken for a score.

**Decision.**

- **Each best line names its alley and pattern** under its boards, and the last
  session names its own under its heading. A line thrown on two patterns names
  both; on more, it says how many.
- **Lines by ball is removed.** The lines that matter stay a tap away from the
  best lines, the last session and the line changes.
- **The heading reads "Actual overall average: 196",** and every estimate
  carries a tilde ("~204"), so an estimate is never read as a score.
- **An opened ball adds Leaves made:** of the leaves it left that a ball
  followed, splits included, how many were picked up, beside every ball's. It
  is not the Stats tab's spare %, which leaves splits out (ADR-036): here the
  splits are the point.

**Consequences.**
- `LineShot` carries the session's alley and pattern, and `LastSession` both.
- `StrikeProfile` counts the pickups behind its leaves.


## ADR-149: A ball's row carries every rate, against an All balls row

**Status.** Accepted, 2026-10-16. Amends ADR-147 and ADR-148 (the Estimated
average section).

**Context.** A ball's row showed its strike rate and split share; the rest
(strike after a strike, leaves made) and every ball's numbers were behind a tap,
in a table that repeated the row. The owner wanted every rate visible at once,
as the Stats tab's Balls card has them, with the balls behind each row. The
"too few" line sat at 30 first balls, which hid most balls on a narrow scope.

**Decision.**

- **Every rate is a column on the row:** strike, after a strike, splits and
  leaves made, then the estimate, sized like the Stats Balls card (ADR-144) so
  all of it fits a 360px phone. Each row names its balls under the ball.
- **An All balls row sits first,** every ball together with the real average
  in the estimate's column, so each ball is read against the row above it. It
  replaces the this-against-all table an opened ball showed; an opened ball
  now shows its costliest leaves.
- **A ball is "too few" under 10 first balls in scope,** not 30. The leaning
  on every ball (twenty imagined balls) keeps one just past the line close to
  the bowler, so its estimate still says little until it has more behind it.

## ADR-150: A first-time bowler gets one way in and one prompt at a time

**Status.** Accepted, 2026-10-16. Amends ADR-080 (both empty states carry
"Score now") and ADR-115 (Home's start controls and setup card).

**Context.** A walk through the app as a new bowler, on a 390px phone, found
the first minute cluttered with choices that were the same choice:

- Empty Home offered three ways to start a session: Start session, "Score now,
  add details later", and the floating plus. The first two differ only in
  whether a form comes first, which is a question a new bowler cannot answer.
- The balls were asked for twice, by the arsenal's empty slot and by a Next
  step with the same title, one under the other.
- "Score now, add details later" still opened the lanes sheet over the deck.
  ADR-080 promised the deck, and the e2e test passed only because the deck is
  visible under the sheet.
- After the first game, a backup card and a setup step stood together on Home,
  and the scorer offered "Save this as your line" after every spare whether or
  not a line had been entered.
- Once a session existed, the empty state went away and the only start control
  left was a plus sign with nothing printed on it.
- The tiles read "None yet" and the tools carried no second line, so Alley
  report, Layouts and Line visualizer were names a new bowler had to tap to
  understand.

**Decision.**

- **Empty Home has one action, "Start scoring",** and it goes straight to the
  deck. The floating button is not shown until there is a session, and from
  then on it prints its label, "Start session", and opens the form. The Score
  tab keeps both of its actions: a bowler who goes there has chosen to score,
  and the form is the only way to name the alley first.
- **A Score-now game does not open the lanes sheet by itself.** Its one
  automatic opening is waived when the game is made (`lib/lanePrompt`). Set
  lanes stays one tap away on the deck, and later games in the session prompt
  as before.
- **One prompt on Home at a time:** the protection card (ADR-115), else one
  setup step, else the feedback ask. None of them before the first session,
  where the empty state is the only ask. Home skips the arsenal step, which the
  arsenal's empty slot already makes.
- **The spare line offer needs a line:** a stance or target on the attempt
  (ADR-054). Keeping score alone never raises it.
- **An empty tile says what it is for** ("Where you shoot each spare"), and each
  tool row carries one line saying what it does. Counts replace the tile's line
  once there is something to count.
- **A "Start here" guide** leads the guides, under Getting started: scoring a
  shot, games and sessions, the boards, spare lines, and keeping the scores
  safe.

**Consequences.**

- A bowler who wants to name the alley before the first shot does it from the
  pencil, or from the Score tab's form. Nothing about the session form changed.
- The e2e helper that starts a session opens the form from the Score tab when
  Home is empty, and the Score-now test asserts no lanes sheet is open.
- Smaller fixes from the same pass, with no decision behind them: History and
  Stats hide their filter and share until there is a session; Spare lines
  explains itself until one leave has an answer; the Alley report's empty state
  says what feeds it and starts a session; oil pattern rows lose their pencil
  (the editor opens from the pattern's sheet); the ball form drops its
  asterisk; the pattern search placeholder fits the field.
- Routing the e2e helper through the Score tab's form found a bug there: the
  form commits while its sheet is up, the new session's route was written onto
  the sheet's history entry, and collecting that entry left "#/session" with no
  id, so a reload lost the session. Collecting the sentinel now puts the
  current route back (`useHistoryRoute`).

## ADR-151: A strike ball carries from the previous frame on its own lane

**Status.** Accepted, 2026-10-17, by the owner's decision. Supersedes the ball
half of ADR-113 for the first ball of a frame. ADR-113's other rules (a strike
ball at a leave, the box on a ball change, the capture prompt, a seed is a
copy) stand.

**Context.** ADR-113 made the first ball of a frame open with the last ball
thrown at a full rack on either lane, and the line follow that ball. On a pair
that is the ball just thrown on the other lane. The owner keeps a ball per lane
of a pair, so frame 3 on lane 11 opened with lane 12's ball. When that ball had
a line it was lane 12's; when it had none, the box was empty, and only the
same-lane frame's notes came across. The line set on this lane was lost either
way.

**Decision.**

- **Ball, line and notes** come from the previous frame on this lane, then the
  last frame on this lane in an earlier game (`freshRackSeedShot`, as ADR-029
  had it). A different ball thrown on the other lane stays on that lane.
- **An empty line on that shot** is filled from that ball's own history,
  `sameBallSeedLine`: this lane first, then the pair's other lane, but always
  the same ball's line.
- **With no same-lane frame at all** (game 1 frame 2 on a pair, or a lane not
  bowled yet this session), ADR-113's rule still applies: the last ball thrown
  anywhere, on its own line. So frame 2 is never empty.
- Bonus balls in the 10th and pocket leaves are unchanged: they take the ball
  just thrown in the same frame, which is on the same lane.

**Consequences.**

- A ball change on one lane reaches that lane's next frame, two frames later on
  a pair. ADR-113 measured that this put back the old ball after a change for a
  bowler who changes on both lanes at once; the owner's practice is a ball per
  lane, and that is what this rule serves.
- A ball change the bowler wants on both lanes is made once on each.

## ADR-152: A session leads with its average, and the series sits with the game count

**Status.** Accepted, 2026-10-17, by the owner's decision. Applies to the
session share card and the History row.

**Context.** Both led with the series total, with the average in small type.
A series mostly says how many games were bowled: a seven game night of 183
reads 1283 and a three game night of 210 reads 630, so the bigger number was
the worse night. The average is what bowlers compare. The share card also
drew at most six game boxes, so a seventh game was missing from the picture.

**Decision.**

- **The average is the headline** on the share card and the History row,
  over finished games only, as before.
- **The series moves beside the game count:** "7 game series" on the card,
  "7 games · 1283 series" on the row.
- **One game** leads with its score and shows no series. **No finished game
  yet** leads with the running series, since there is no average to show.
- **Every game gets a box on the card.** Up to six share one row; more wrap
  onto a second, shorter row, and the stats below move down to make room.

**Consequences.**

- The session screen's own header still leads with the series. It was not
  part of this ask.

## ADR-153: A line's share card draws the lane

**Status.** Accepted, 2026-10-17, by the owner's decision. Supersedes ADR-110's
"the card does not draw the lane". The rest of ADR-110 (a line is a link, the
pattern travels by catalog id) stands.

**Context.** The line card was three board numbers as a title, a sentence
telling the reader to open the link, and a large empty panel where the other
cards have their picture. The owner found it ugly and hard to read. ADR-110
left the lane off for fear it would be read as data without its pattern and
hand. But the card carries both: the hand is on it, and the pattern is drawn
when the line has one.

**Decision.**

- **The lane is the card's picture,** top-down down the left side: the boards,
  the arrows, the pins, the ball's path with its laydown, target, breakpoint
  and finish, and the pattern's oil with its length and where the ball leaves
  it. The path is `buildLinePath`, the visualizer's own, so the two never
  disagree.
- **The numbers stack beside it,** each named: laydown board, target at the
  arrows, breakpoint (board and distance), the finish ("Into the pocket" on a
  strike line that ends on 17.5), and, with a pattern, its length and where
  the ball leaves the oil. A dot keys the two marks the labels name.
- **The title is the pattern** when there is one, else the kind of line. A
  spare names its leave ("10 pin spare") and stands only those pins.
- A spare line that misses runs straight past the pins; the card clips it to
  the lane.

**Consequences.**

- The card is still the link's preview in the share dialog, and the link still
  opens the sandbox on the same line, hand, leave and pattern.
- A chat app still previews the link as the app, not as this card: the app has
  no server to render one per line. Guides have their own pages for this
  (`lib/guidePage`); lines and layouts do not.

---

## ADR-154: Headpin earns from one Pro unlock, sold only in the store apps

**Status.** Accepted, 2026-10-17, by the owner's decision. Supersedes ADR-119:
the retailer link is never turned on, and its code goes. Retires the donation
link (CHANGELOG, "Settings: feedback + donation links", 2026-07-19). ADR-039's
image position, as ADR-119 left it, stands, with one consequence for the store
apps below. The feature-by-feature split lives in `docs/PRO-LAUNCH.md` until it
is built, and becomes code then.

**Context.** The owner wants side income, a few hundred dollars a month as the
first target, and never to lose money. Research in October 2026 found:

- **Bowlers accept a one-time price and resent subscriptions.** PinPal sells a
  one-time $8.99 unlock and holds about 4.9 stars from about 5,000 ratings, with
  reviews that praise the single payment. Tenpin Toolkit's $9.99 unlock is the
  most rated app after LaneTalk. LaneTalk's subscription draws "money grab"
  reviews, and a $49.99 lifetime drew "If this app was a one-time 5-10 bucks, it
  would be fine".
- **The market is small.** The top app, LaneTalk, adds an estimated 3K to 5K
  installs a month across both stores; most bowling apps likely add under 500. A
  public tracker puts every bowling app it checked under $10K a month.
- **Paid acquisition cannot pay back.** At $9.99 net of a 15% store fee and 2%
  of free users buying (RevenueCat's freemium median), an install is worth about
  $0.17. Apple's search ads cost a median $26.70 an install in Sports and $2.25
  in Utilities (US, 2025).
- **Ads earn little here.** A league bowler opens the app about once a week, an
  alley often has no signal, and ads would need a tracking prompt on iOS and a
  consent banner in the EU. Several hundred free users would earn tens of
  dollars a month.
- **Affiliate links do not fit either.** BowlersMart never answered. Amazon's
  operating agreement bars its links in "any client-side software application"
  unless Amazon approves the app, and bowling balls are thin on Amazon.
- **Apple forbids a licence key that unlocks an iOS app** (guideline 3.1.1). A
  web purchase can be honoured in the app only if the same unlock is also sold
  in the app (3.1.3(b)). One purchase that works everywhere therefore needs
  accounts and a server.

**Decision.**

- **The app is free to download, and one non-consumable purchase inside it,
  Headpin Pro,** unlocks the rest, at a US$9.99 base price. Pro is the name of
  that purchase, not an account, a tier or a second app. A paid download was
  weighed and rejected: store search is the app's main way to be found, and a
  price before install cuts installs and ratings the most (Bowling Roster, $9.99
  to download, has 2 ratings; Tenpin Toolkit, free with a $9.99 unlock, has
  860). Each store sets the other countries' prices from the base price, and
  nobody hand-tunes them.
  The iOS app ships first; Google Play follows once its closed test is done.
- **No accounts, no server, no licence keys, no web checkout.** The store
  remembers the purchase, and Restore purchases brings it back on a new device.
- **The web app stays free and never sells Pro.** It shows Pro as quiet previews
  that point at the App Store. It lives at `/app`, where the landing page,
  guides and shared links send a bowler. The original address, `/score`, stays
  the owner's copy with every feature open, by the owner's decision: they bowl
  with it today and move to the iOS app later. It is the same shell, told apart
  by its path, and it is not a secret: anyone who types it gets it. Apple's rules do not govern the website; inside
  the iOS app nothing mentions the web or another way to pay.
- **Recording is free; reading deeper is Pro.** Everything a bowler enters (every
  shot, line, ball, lane and pattern) can be entered without Pro. Pro unlocks
  analysis of that data. A bowler's data is never hidden behind Pro, and backup
  and export are always free.
- **The ball catalog and the pattern library are free everywhere,** photos and
  sheets included. Nobody pays for the data, which keeps MOTIV's terms (ADR-061:
  not resold, kept accurate).
- **No in-app ads and no paid acquisition.** Growth is organic: store search,
  share cards, offer codes for creators, and bowling communities. ADR-121's `utm_`
  tags stay, for those links.
- **No affiliate links and no donation link.**
- **The catalog and patterns never need a connection.** The store apps ship a
  snapshot of `catalog.json` and `patterns.json` and refresh it from headpin.app
  whenever they are online, the same version check the web app does today
  (`ballCatalogRepository`, ADR-104). Downloading data rather than code is
  allowed in the stores.
- **The store apps do not bundle ball photos or pattern sheets.** They load them
  from headpin.app and keep them on the device, as the web app's service worker
  does. A takedown therefore stays a server-side data edit (ADR-039) and needs no
  app release, and the app stays tens of megabytes instead of over a hundred.
- **Games move from the web to the app by backup and import** (ADR-038). The
  app's first run says how to do it.

**Consequences.**

- Android users have no way to buy Pro until the Play listing is live. A new
  personal Play account needs at least 12 testers opted in for 14 days in a row
  before it can publish.
- Apple rejects a repackaged website (guideline 4.2), so the iOS app needs
  native work: the share sheet, file import and export, haptics, and the
  purchase itself.
- The store apps carry the version they were built with and lag the web app.
  How the "every merge bumps the version" rule maps onto store builds is settled
  when the first one ships.
- The income is set by downloads: at 2% buying, about 2,000 installs a month
  earn about $340 a month. Fixed costs are Apple's $99 a year and Google's $25
  once, which about 15 sales a year cover.
- ADR-120's third count, a tap on the retailer link, goes with the link. Two
  counts remain: a session started and a game finished.
- Every Pro card stays open until `APP_STORE_URL` (`src/lib/pro.ts`) is set,
  since locking what nobody can buy would only take it away. It is set in the
  release the iOS app goes live in.
- The owner keeps the unlicensed photos in the paid app and accepts the risk. A
  complaint to Apple can pull the whole app, not one image. MOTIV is told the app
  now sells Pro.

## ADR-155: The store apps are the web build inside Capacitor, told apart at runtime

**Status.** Accepted, 2026-10-18, by the owner's decision: Capacitor now, and
screens that feel like a web page rewritten natively one at a time later. Builds
phase 1 of `docs/PRO-LAUNCH.md` for ADR-154, and the Android shell from phase 5
with it. The web half is built and tested; the iOS project is generated but not
yet built in Xcode, and the Android project builds a debug APK but has not yet
run on an emulator or a phone.

**Context.** ADR-154 sells Pro only in the store apps, and the iOS app ships
first. The app is a static Vite build with no server, which is the shape
Capacitor wraps: the same files, served from inside the app by the platform's
web view, at `capacitor://localhost` on iOS and `https://localhost` on Android.
A pure Swift app, React Native and Flutter were weighed and rejected: each
rewrites the screens, and Swift rewrites the scoring engine too, which would
then exist twice and have to score every game the same way in both. Three things differ from the web, and
everything here follows from them. That origin has only what the app carries,
so anything the build reaches by a root-relative path that the app leaves out
is missing. The iOS web view runs no service worker for the app's own scheme,
so nothing the web app keeps through Workbox is kept. And the page's own
origin opens nothing on anyone else's phone, so a link built from it is dead.

**Decision.**

- **One build, told apart at runtime.** `src/lib/platform.ts` asks the global
  that Capacitor's native side injects before the page loads
  (`window.Capacitor.isNativePlatform()`), not `@capacitor/core` and not a
  build flag. The web bundle carries nothing to answer "no", and the store app
  runs exactly the code the unit and end-to-end suites ran.
- **What the app carries is a list, not a second build.** `npm run build:ios`
  runs the web build, then `scripts/native/assemble.ts` copies `dist/` to
  `dist-native/` with the app shell as the root page, and leaves out the ball
  photos and pattern sheets (ADR-154, about 110 MB), the service worker and
  manifests, the guide link pages, the landing page and its screenshots, and the
  crawler files. Vercel's page analytics tag is taken out of the shell. The app
  carries about 2 MB, `catalog.json` and `patterns.json` included.
- **The catalogs come from headpin.app first and the built-in snapshot second**
  (`catalogOrigins`). The ball catalog's version check already means an older
  snapshot never replaces a newer catalog fetched before. The pattern catalog had
  no such check, and an offline launch would have put an older snapshot's load
  table back over a corrected one, so the sync now records the `generated_at` of
  the file it last applied (`pattern_catalog_generated_at` in `settings`) and
  never applies an older one. On the web this changes nothing, since the site's
  file is never older than the last one it served.
- **Photos and sheets load from headpin.app.** `siteUrl` puts the site in front
  of a root-relative path in the store app and leaves it alone on the web, so a
  preview deploy still reads its own files. Every ball photo is drawn by
  `CatalogBallImage` and every kept sheet is found by `catalogSheet`, so those
  are the two places it is applied. `vercel.json` allows any origin to read
  `/catalog/`, which the app's `fetch` of the catalogs needs; the files are
  public already.
- **A shared link carries headpin.app** (`shareOrigin`) from the store app, and
  the page's own origin on the web, as before.
- **No service worker, no install prompt.** `main.tsx` registers neither in the
  store app, the arsenal's photos are not warmed into a cache nothing reads, and
  `isStandalone` is true there, so nothing offers to add the app to a Home
  Screen or links out to the landing page.
- **iPhone is portrait only**, as the web manifest already is, and the left-edge
  swipe is turned on in the web view (`HeadpinViewController`), so it steps back
  through history like the system back does (ADR-041).
- **Android is portrait only too, and its back button steps back through the
  web view's history** (`MainActivity`), leaving the app only from the first
  entry. Capacitor's core does not handle the button at all, and Android would
  otherwise close the app from any screen. The app is drawn edge to edge, which
  Android 15 requires, and the page pads itself from `env(safe-area-inset-*)`
  as it does on iOS (`SystemBars.insetsHandling: "native"`).
- **Native rewrites come screen by screen, later.** A screen that still feels
  like a web page in the store app (scrolling, a sheet, the keyboard) can be
  replaced by a native one, and the rest stays shared. The scoring engine and
  the repositories are not rewritten: they are the part a second copy would
  get wrong.

**Consequences.**

- Usage counts (ADR-120) are off in the app until its privacy label is written:
  they only send from `headpin.app`, and the app's page is `localhost`.
- Pro in the app still reads the web's answer (`webProAccess`), which is open
  while `APP_STORE_URL` is null. The purchase plugin replaces it in the app
  before that URL is set, or the app would point at its own App Store page.
- **To check on a device**, since none of this is visible from Linux or
  Chromium: that photos stay available offline from the web view's HTTP cache
  (headpin.app sends 30 days of `Cache-Control`), and an on-device photo store if
  they do not; safe areas, the keyboard and the scroll clamp
  (`docs/VIEWPORT-BUG.md`); that the edge swipe and the page's back handling
  agree; and that a sheet, a `mailto:` link and the App Store link open outside
  the app.
- Universal links (App Links on Android), the share sheet, Files import and
  export, and haptics are still to do (PRO-LAUNCH phases 1 and 3). The iPad
  target is left as Capacitor's template has it until the owner decides whether
  the app ships for iPad. Both apps carry Capacitor's placeholder icon and
  splash screen.
- Android's own backup (`allowBackup`, the template's default) is left on, so a
  bowler's games can come back with the rest of their phone. Whether the web
  view's database is included is to be checked on a device; the JSON backup
  (ADR-038) stays the way that is promised.

## ADR-156: The store apps hand files and links to the platform's share sheet

**Status.** Accepted, 2026-10-18. Follows ADR-155.

**Context.** The web app saves a file by clicking a download link, and shares
a file or a link through `navigator.share`, falling back to a download or the
clipboard. Inside the store apps those are not there to rely on: Android's web
view has no Web Share at all, and a download from it goes nowhere unless the
app catches it, so "Save a backup" in the Android app would have reported a
backup that never left the phone. iOS's web view shares, but a download
fallback there depends on the app too. A backup that silently does not exist
is the worst failure this app can have (ADR-038, ADR-067).

**Decision.** In the store apps every file and every link leaves through the
platform's own share sheet, through Capacitor's Share and Filesystem plugins
(`src/lib/nativeShare.ts`). A file is written to the app's cache and the sheet
opened on it, which is where a bowler saves to Files, Drive or iCloud, sends it
to themselves, or AirDrops it to a new phone. That covers Save a backup, the
error screen's export, the safety copy before an import, a share card's share
and save, and the line, layout and guide links. A closed sheet is a
cancellation, not a failure, and a cancelled backup is not counted as one, so
the reminder keeps asking. The web app is unchanged. The plugins are imported
on first use, so the web bundle never loads them.

**Consequences.**

- The safety copy before an import opens the sheet in the apps, where the web
  downloads it silently. It is one more tap, before the one step that cannot
  be undone.
- iOS needs `NSPhotoLibraryAddUsageDescription`, since the sheet offers Save
  Image for a card, and an app that does not say why it adds to the photo
  library is killed when it tries.
- This is the share sheet and Files export PRO-LAUNCH lists against App Store
  guideline 4.2.

## ADR-157: The iOS app's edge swipe asks the page to go back

**Status.** Accepted, 2026-10-18. Follows ADR-041 and ADR-155.

**Context.** Back in Headpin is the page's history (ADR-041): every screen and
sheet is a history entry, and `popstate` is the one place a step back is
applied. ADR-155 turned on WebKit's own swipe (`allowsBackForwardNavigationGestures`)
for that. On the iOS simulator it closed nothing: with six entries on the
stack, a swipe from the left edge left the page where it was, in every form of
the gesture the device check tried. WebKit's swipe walks its own back-forward
list, which passes over entries a page adds with `pushState` outside a tap's
event, and Headpin adds every entry from a React effect, after the tap.
Others report the same swipe jumping to the first page of a single-page app.

**Decision.** WebKit's swipe is off, and `HeadpinViewController` carries a
left-edge pan of its own that calls `history.back()` in the page once the
pull is far or quick enough to mean it. That is the path Android's back button
already takes (`MainActivity`), so both apps reach the page's back the same
way, and the page decides what one step back closes.

**Consequences.**

- The swipe no longer slides a snapshot of the previous page in under the
  finger; the screen's own exit plays when the step lands, as it does for the
  header's back control.
- On the first screen a swipe does nothing, rather than leaving the app, which
  is what an iOS app's edge swipe does there anyway.

## ADR-158: The iOS app sells Pro through its own StoreKit 2 plugin

**Status.** Accepted, 2026-10-18. Follows ADR-154 and ADR-155. The split of
free and Pro is the table in `docs/PRO-LAUNCH.md`, confirmed by the owner when
asking for Pro to be built.

**Context.** ADR-154 sells Pro as one non-consumable purchase inside the store
apps, with no accounts and no server. The gating was already built and stayed
open everywhere until something could sell Pro. The iOS app needs the purchase
itself, a way to restore it on a new phone (App Review requires one), and an
answer to "is Pro owned" that works at an alley with no signal. A purchase
service such as RevenueCat would do the bookkeeping, but it reports every
purchase to its servers, and the app keeps nothing about a bowler off the phone.

**Decision.**

- **The app carries a small Capacitor plugin of its own,
  `ios/App/App/HeadpinStorePlugin.swift`, on StoreKit 2.** It answers four
  things: the product's price in the bowler's currency, buy it, which products
  this Apple ID owns, and restore. `Transaction.currentEntitlements` answers
  ownership from the phone's own copy of the receipts, offline too, and
  `Transaction.updates` reports a purchase that finishes away from the tap (Ask
  to Buy, a refund). `HeadpinViewController` registers it.
- **The receipt is the truth; the page keeps a copy of the last answer**
  (`src/lib/proStore.ts`), so an owner never sees a locked card flash while
  StoreKit is asked again, and asks again on every launch. A purchase or a
  restore that lands first is never overwritten by the launch's older answer.
- **The product is `app.headpin.pro`.** App Store Connect must name the same id.
  `ios/App/App/Headpin.storekit`, selected in the shared `App` scheme, lets a
  purchase be tried in the simulator from Xcode with no App Store Connect at all.
- **A locked card in the iOS app offers the purchase itself** ("Get Headpin Pro"
  with the App Store's own price), where the web offers "Get the app". Settings
  carries the purchase, its state once bought, and Restore purchase.
- **Only the iOS app sells Pro.** The Android app keeps everything open until
  Play Billing is in (PRO-LAUNCH, phase 5), because locking what nobody can buy
  would only take it away. The web is unchanged: open until `APP_STORE_URL` is
  set.

**Consequences.**

- The device check (`scripts/native/device-check/flow.ts`) proves the iOS app
  locks and offers the purchase and Restore purchase, and that Android does
  not. The purchase itself needs Apple's sheet, so it is tried by hand.
- Nothing about a purchase leaves the phone, so there is no purchase data to
  declare in the App Store privacy label.
- Moving Android onto Play Billing is a second implementation of the same four
  calls, behind the same `ProStore`.

## ADR-159: A headpin.app link opens in the app when the app is installed

**Status.** Accepted, 2026-10-18. Follows ADR-155.

**Context.** Shared lines, layouts and guides are how new bowlers find Headpin
(ADR-154), and every one is a headpin.app link, so that it opens for anyone. A
bowler with the app should land in the app, on the same screen, and one
without it should land in the web app with a way to the store.

**Decision.**

- **The site vouches for the apps.** iOS universal links
  (`ios/App/App/App.entitlements`, `applinks:headpin.app`) and Android App Links
  (the `autoVerify` filter in `AndroidManifest.xml`) claim `/app`, `/app/...` and
  `/guides/...`. Not `/score`, the owner's copy (ADR-154). headpin.app serves
  `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
  as JSON (`vercel.json`); those two files name the Apple Team ID and the
  Android signing key, and are added once those exist (PRO-LAUNCH, phase 0).
- **The app opens the link's own screen** (`src/lib/deepLink.ts`): the free
  app's query and hash carry over as they are, since the app reads a shared
  line or layout from its address on load, and a guide's page goes straight to
  the guide. A link that cold-starts the app is opened once, so the reload it
  causes cannot loop.
- **The web offers the app.** Once `APP_STORE_URL` is set, every page the build
  writes carries Safari's Smart App Banner (`vite.config.ts`), which offers to
  open the app, or get it.
- **The entitlement is signed into Release builds only.** A personal (free)
  Apple team cannot sign Associated Domains, and a Debug build for the
  simulator should keep building for anyone without the paid program.

**Consequences.**

- Until the two `.well-known` files are served, a link still opens the web app,
  as it does today.
- A link opened in the app reloads its page, which is how the app reads a
  shared line, the same as the web app opening one.

## ADR-160: The store apps drop what makes them feel like a web page

**Status.** Accepted, 2026-10-18. Follows ADR-155.

**Context.** App Review rejects "a repackaged website" (guideline 4.2), and the
owner wants the parts that feel like a web page made native over time. Text
selection, the long-press callout and the tap flash were already off
everywhere (`index.css`). What was left: the web view's rubber band, pinch zoom,
and no haptics.

**Decision.**

- **The iOS web view does not bounce** (`HeadpinViewController`): the page never
  scrolls as a whole, its screens scroll inside it, so the rubber band only ever
  dragged the whole app about.
- **Pinch zoom is off in the apps only** (`src/lib/nativeChrome.ts`). The web
  app keeps it for low-vision readers, as the axe check requires; the phones
  offer their own system zoom to any app.
- **Haptics** (`src/lib/haptics.ts`, `@capacitor/haptics`): a light tap for a
  pin on the deck, a firmer one for a recorded ball, and a success for a ball
  that clears the deck. Nothing on the web.
- **iPhone only for 1.0.** The project shipped to iPad too, in every
  orientation, which is where the rotation bug in `docs/VIEWPORT-BUG.md` lives.
  iPad comes back as its own decision.

**Consequences.**

- The keyboard's accessory bar stays: its Done button is the only way to put
  away a number pad. Hiding it is a choice for later, with the keyboard plugin.
- Rewriting screens natively stays the owner's longer plan (ADR-155); none of
  this needs it.

## ADR-161: The iPhone app's tab bar is UIKit's

**Status.** Accepted, 2026-10-20. Follows ADR-155, ADR-157 and ADR-160.

**Context.** A tab bar drawn in CSS can only imitate the phone's. The 0.47.0
capsule looked close and would have been out of date with the next iOS, which is
where Liquid Glass came from: apps that rebuilt against the iOS 26 SDK got it
from their system bars and nothing else. Bars the page draws never do.

**Decision.**

- In the iPhone app the tab bar is a `UITabBar` added over the web view by
  `HeadpinTabBarPlugin` (`ios/App/App/HeadpinTabBarPlugin.swift`, registered in
  `HeadpinViewController`). The system draws it, in whatever look that iOS has.
- The page keeps what the tabs are, which one is chosen, and when the bar steps
  aside (`src/lib/nativeTabBar.ts`). The bar goes while anything covers it: a
  pushed screen, the line visualizer, a sheet or dialog, the keyboard.
- The bar reports its own height (from its top to the bottom of the screen) and
  the shell leaves that much room under the page. The web view runs edge to edge
  beneath the bar, so a bar that bends what is behind it has the page behind it.
- The app's theme is the page's, which can differ from the phone's, so the page
  tells the bar dark or light and the accent colour (`configure`, again on each
  theme change).
- It is the iPhone app only (`isIOSApp`). The web app and the Android app keep
  the page's own bar, and so does an iPhone app built without the plugin: if
  `configure` fails the hook reports `failed` and the page draws its own.

**Consequences.**

- Content does not yet scroll *under* the bar: the page stops at its top edge.
  That needs each screen's scroller to pad itself by the bar's height, and is a
  step for later.
- The bar is not unit-testable here. The hook is (`nativeTabBar.test.tsx`); the
  Swift needs a build and a look on a phone.
- The same trade will apply to other system controls: a native control updates
  with iOS and costs a bridge, a page control costs nothing and stays as drawn.
  On/off settings use HTML's own `switch` for the same reason, and cost nothing.

## ADR-162: The iPhone app keeps the ball photos it has shown

**Status.** Accepted, 2026-10-20. Follows ADR-154 and ADR-155. Written and unit
tested against a fake disk; the real disk and the offline behaviour have not
been seen on a phone.

**Context.** The store app leaves the ball photos out of the bundle (about
53 MB, ADR-154) and fetches each from headpin.app through `siteUrl`. The only
thing behind that was the web view's HTTP cache, which the OS can drop at any
time and which a first-ever offline launch has never filled. A bowler who looked
at a ball at home could find a grey silhouette in its place at an alley with no
signal, which is where this app is meant to work.

**Decision.**

- **A copy is saved the first time a photo loads, and served from disk after
  that.** `src/lib/photoStore.ts` holds the rules against an injected
  `PhotoFiles`; `src/lib/nativePhotoStore.ts` is the Capacitor
  Filesystem implementation, in the app's `Data` directory under `photos/`,
  with `Capacitor.convertFileSrc` for the address the web view shows.
- **`CatalogBallImage` is the only caller**, as it is the one place every ball
  photo is drawn. It always starts from the network address, so the first paint
  is exactly what it was, and looks for a kept copy after mount. If the copy is
  found before the network photo has loaded, it is swapped in; if the network
  fails, the copy is the fallback; if a kept file will not load (the OS removed
  it), the network is the fallback. Nothing waits on the disk.
- **The directory is listed once and kept in memory**, so a lookup behind each
  tile of a grid hundreds deep costs no disk read. Writes go one at a time, so a
  screen of tiles filling at once does not compete with the scroll.
- **The store is capped at 25 MB**, about 800 photos, against 53 MB for all of
  them. Over the cap, the oldest written files are evicted first. That is
  first in, first out, not least recently used: the filesystem has no access
  time. An evicted photo is saved again the next time it loads. A photo over
  1 MB, an empty one or one that is not an image is not kept.
- **It is a convenience, never a dependency.** Every failure (no disk, a failed
  fetch, a full disk) reads as "not stored" and the screen behaves as it did
  before this.
- **Native only.** `nativePhotoStore()` answers null on the web, which never
  loads `@capacitor/filesystem` for it; the web's service worker already keeps
  its photos (ADR-155).
- **Pattern sheets are not in this.** They do not go through `CatalogBallImage`
  (`catalogSheet` and `PatternSheet` fetch them), and a sheet is a PDF opened on
  demand rather than a tile on every screen, so they stay on the network and
  the web view's cache.

**Consequences.**

- A photo whose file at the same address changes on the server stays as it was
  saved until it is evicted. Photo files carry their ball's name, and a corrected
  image would need a new name or a version in the address to reach the app.
- `Data` is the app's Documents directory on iOS, which the phone's own backup
  includes: up to 25 MB of public photos a restore could fetch again. `Cache`
  would not be backed up but the OS clears it first when space runs short, which
  is when offline matters most.
- Needs a look on a phone: that a photo seen online appears with Airplane Mode
  on after a relaunch, and that eviction holds the folder near the cap.

## ADR-163: Pro previews are teasers under one banner, the layout lab leads with the ball, and the alley report drops its lines

**Status.** Accepted, 2026-10-21. Amends ADR-154 and ADR-158 on how a locked card
looks, and amends ADR-122, ADR-147 and ADR-148 on what the Alley report shows.
Decided by the owner from a phone in hand.

**Context.** A locked Stats screen carried four centered "Get Headpin Pro"
buttons over blurred cards, which said the same thing four times and showed
nothing worth wanting. The sandbox's Pro note was a bar at the foot of the lane
view that crowded the lane's last board numbers, and the layout lab's was a
full-width card above the controls. The layout lab put its sliders first and the
ball, the thing it is for, near the foot. The Alley report's three line lists
(best lines, the last session's lines, line changes) were not clear enough to
keep on a screen the owner called ugly.

**Decision.**

- **A locked card is a teaser.** Its first lines show as they are, up to a
  height the screen chooses, and fade out. A bowler sees a real number and the
  start of a real chart rather than a gray block, and knows there is more. The
  whole teaser is one tap, named for what the card shows and what the tap does,
  with one small "Pro" mark at its foot. It is inert underneath, as before. This
  replaces the blur of ADR-154, so its numbers can be read where they show; they
  are the bowler's own, and a longer read is what Pro sells.
- **A screen says what Pro adds once.** Stats opens with a banner naming the
  reads below it and carrying the one button ("Get Headpin Pro, $x" in the iOS
  app, "Get the app" on the web). The cards carry only their mark.
- **A read-only screen has one quiet line, or a chip.** The layout lab has a
  single row of small text with an Unlock action, no card. The line sandbox
  has a chip in the row of floating controls at the top, so the lane keeps its
  whole height and its own drag hint underneath.
- **The layout lab leads with the ball**, then what it will do, then the
  controls (who is bowling, the core, the numbers). It used to keep the diagram
  under the sliders so it stayed on screen while they moved; the owner's call is
  that the ball is the screen, so it is seen first.
- **The Alley report shows the balls and nothing else for now.** The best lines
  at an alley, the last session's lines and the line changes are off the screen,
  and the open-line view with them. `lib/lineReport` and its tests stay, and so
  does the navigation state that opened a line, so they can return. The free
  taste of the report that the last session's lines were (PRO-LAUNCH) goes with
  them: the whole report is now Pro.

**Consequences.**

- `ProAction` is gone from the module's exports; `ProLock`, `ProBanner`,
  `ProNote` and `ProChip` each use one hook for the purchase, the steps to move
  games, and the "waiting for approval" and "did not answer" notes.
- The device check still finds a "Get Headpin Pro" button on Stats, now the
  banner's.
- A teaser shows real numbers, so a free copy of the app reads a few of the
  paid reads. That is the point of a teaser; if it proves too generous, the
  height is one number per card.

## ADR-164: A Pro page before the purchase, a Pro mark, accent colors, and a Home banner

**Status.** Accepted, 2026-10-21. Amends ADR-158 (a tap on a locked card no longer
starts the purchase) and ADR-163. Decided by the owner.

**Context.** A locked card in the iOS app went straight to Apple's purchase
sheet, so a bowler was asked to pay before being shown what for. Nothing marked
a bowler who had paid, and Pro added no appearance choice.

**Decision.**

- **A Pro page, `pro`, is an overlay** (`views/ProOfferView`). A locked card, the
  Stats banner, the line sandbox's chip, the Settings row and a locked color all
  open it through `ProOfferContext`; none of them charges. It has a picture and a
  sentence for each thing Pro adds, what stays free, and a button pinned at the
  foot: the purchase at the App Store's price in the iOS app, with Restore
  purchase, and "Get the app" (with the steps for moving games) on the web. The
  pictures (`ProOfferSamples`) are drawn from the app's colors with made-up
  numbers, not screenshots, so they follow the theme and cannot go stale. Where
  nothing provides the context (a unit test), the caller offers the purchase
  directly as before.
- **Pro is one payment, not a subscription** (ADR-154), and the page says so.
- **`ProAccess` says whether Pro is owned.** `{ locked: false, owned: true }` is
  a purchase; plain `{ locked: false }` is Pro merely open (the owner's copy, a
  web with nothing to sell). A "Pro" mark (`ProBadge`) is shown on the app's mark
  on Home and beside the bowler in Settings only when owned.
- **Accent colors** (`lib/palette.ts`, `data-palette` on `<html>`): Felt for
  everyone, Ocean, Sunset, Grape and Rose with Pro. A palette changes only the
  five accent tokens, separately for light and dark, so nothing else knows which
  is on. It is stored beside the theme and applied by the shell's pre-paint
  script. While Pro is not open a stored Pro color is held back and Felt shows,
  and the choice is kept for when Pro returns. The native tab bar is restyled when
  the palette changes.
- **A banner on Home** for a bowler without Pro opens the Pro page. It locks
  nothing, shows only while Pro is locked, and is the free app's one standing
  mention of Pro, which the owner asked for.

**Consequences.**

- The device check's "Get Headpin Pro" is the Stats banner's button as before. It
  opens the Pro page instead of buying, so the purchase sheet is only reached from
  that page.
- A different home screen icon for owners is not built: it needs an alternate
  icon drawn and a native call, and is left for when the asset exists.
- The line sandbox is taken off screen while the Pro page is on top of it, since
  the lane's own layer would cover the page. It returns on back.

## ADR-165: Moving a shot's line from score entry is Pro, like the sandbox

**Status.** Accepted, 2026-10-21. Amends the free and Pro table in
`docs/PRO-LAUNCH.md`, which had left this open. Decided by the owner.

**Context.** The line visualizer was read-only without Pro (ADR-154), but the
same lane opened from a shot in the scorer (`ShotDetailBar`) could still be
dragged, so the lock was one tap from being bypassed.

**Decision.** From the scorer, without Pro, the intended and actual lines are
drawn and cannot be moved. The lane carries the same "Unlock editing" chip as the
sandbox. Typing stance, target and the rest into the shot's fields is recording
and stays free. The chip closes the lane before it opens the Pro page, because the
lane is its own layer and would cover the page.

**Consequences.**

- The actual line records where the ball finished, and its breakpoint and final
  board have no field to type into: they could only be set by dragging. Without
  Pro they cannot be set from score entry at all. That is the owner's call as
  asked; if it proves too harsh, leave the actual line's drag free and lock only the
  intended line's.
- The spare line form (`SpareLineFormDialog`) has its own lane editor and is not
  changed here; it is part of writing down a leave's line, which the table keeps
  free. Say so if it should be locked too.

## ADR-166: The free web app at /app shows Pro locked before the app is listed

**Status.** Accepted, 2026-10-21. Amends ADR-154, which kept the web open until
the app was listed. Decided by the owner.

**Context.** The web at `/app` is the free app, and `/score` is the owner's copy
with everything on. Until the App Store link is set, `/app` was also fully open,
so the locked experience (teasers, the Pro page, the Home banner, the lane chip,
the colors) could only be seen by rebuilding the iPhone app.

**Decision.** `webProAccess` locks `/app` (and `/app/...`) when `LOCK_FREE_WEB`
(`lib/appStore.ts`) is on, which it is. With no App Store link the access is
`{ locked: true, appStoreUrl: null }`: everything looks as it does in the app, and
the Pro page's button reads "Coming to the App Store" and is disabled, with a line
saying the app is not in the store yet. Cards, the banner and the chip still open
the Pro page to read. `/score`, the Android app and any other address stay open,
and a real `APP_STORE_URL` still locks as before.

**Consequences.**

- Until the app is listed, a bowler who reaches `/app` (the landing page's buttons
  and shared links open it) has the free features and cannot buy the rest, which
  ADR-154 chose to avoid. This is the owner's call, made to preview the free app on
  the web. `LOCK_FREE_WEB = false` puts `/app` back to fully open in one edit, and
  should be weighed again before the landing page is promoted.
- Settings has no Pro row on the web, since it is for the app's purchase.


## ADR-167: Pro shows a taste and blurs the rest, has its own mark, and /score is Pro

**Status.** Accepted, 2026-10-21. Amends ADR-163 (how a locked list and locked
controls look), ADR-164 (what marks a copy with Pro, and the Settings row on
the web), ADR-165 (the lane's chip) and ADR-166 (what `/score` is). Decided by
the owner.

**Context.** After 0.50.0 the locked app still read as a set of locks rather
than a taste. Every leave and every ball sat behind a fade, so a free bowler saw
none of their own leave rates and none of their balls in full. The Spare lines
page and a leave's sheet still showed every leave's count and conversion, which
Stats locked, so the lock was one screen from being read anyway. The layout lab
kept every control drawn and disabled under a line of text, and the lane had a
chip at the top: both said "locked" without showing what Pro would let a bowler
do. A copy with Pro looked the same as one without, apart from a small label,
and `/score`, the owner's copy, showed Pro open but not owned, so the owned side
(the mark, the colors, the thanks) could only be seen on a phone that bought it.

**Decision.**

- **A locked list shows a taste** (`lib/proPreview`, `ProBlur`). Its first rows
  are drawn in full with the bowler's own numbers; the next row is drawn blurred,
  out of reach, under one small Pro mark that is the tap; nothing after it is
  drawn. Stats shows the two leaves left most with their rates and blurs the
  third, and shows the best ball and blurs the second. The Alley report shows the
  best ball's estimate. A list is always split one short of its whole, so a list
  of one is the blurred row and there is never a locked list with nothing locked.
  The All leaves and All balls links are not offered: they are the whole list.
- **A leave's record follows Stats.** On the Spare lines page and in a leave's
  sheet, the record (count, made over chances, rate) of a leave Stats shows in
  full is shown; every other leave's is a blurred stand-in with the Pro mark, so
  no tile reads as never left and no real number sits in the page under a blur.
  The hint that names the leave left most without a line drops its count for a
  leave whose record is locked.
- **Locked controls are blurred in place** (`ProVeil`). The layout lab's fields
  and the lane's peg fields are drawn where they would be, blurred and out of
  reach, under one mark that says what Pro opens ("Edit with Pro", "Move it with
  Pro"); the whole block is the tap. Reading stays free (ADR-154), so the values
  those fields hold are read out beside them: the layout's dual angle, its VLS,
  the PAP and hand above the lab's fields. The lane needs nothing added, since
  its pegs are labeled with their boards on the lane itself. `ProNote` and `ProChip` are gone, and the lane's `notice` prop is
  `editLocked`.
- **The Stats banner sits at the foot.** It said what Pro adds above the
  bowler's own numbers; it now says it under them.
- **Pro has its own mark** (`ProMark`): the app's pin on graphite with gold bands
  and "PRO" under it, the same drawing as the felt icon in two other colors. It
  heads the Pro page, sits on the Home banner, the Stats banner and the Settings
  row that open it, and replaces the app's mark on Home once Pro is owned. It
  keeps its colors in every palette and theme. The "Pro" label beside the bowler
  in Settings takes the same graphite and gold.
- **Settings has a Headpin Pro row on the web** wherever Pro is locked or owned,
  opening the Pro page. Where Pro is merely open (the Android app) it has none.
- **`/score` is Pro as a buyer has it** (`PRO_OWNED`): `{ locked: false, owned:
  true }`. The owner's copy shows the Pro mark on Home, the extra colors and the
  owned Pro page, so the web shows both sides: the locked app at `/app` and the
  unlocked one at `/score`.

**Consequences.**

- A free copy reads two leave rates and one ball's row of its own data. That is
  the taste, chosen over showing nothing; the counts are one number each in
  `lib/proPreview`.
- `owned` no longer means only "an Apple ID bought it": it also marks the owner's
  copy. Nothing reads it to decide what is open, only what is shown.
- The home screen icon on a phone is still the felt one. An alternate icon needs
  the Pro mark drawn at the store's sizes (`scripts/native/icons.mjs` can take it)
  and a native call, which shows the system's own alert; it is left for a build
  that can be tried on a device.

## ADR-168: Bars float over what scrolls under them, chrome controls are glass, and the iPhone app takes the page's theme

**Status.** Accepted, 2026-10-21. Amends DESIGN-LANGUAGE §1b ("Chrome is
opaque") and follows ADR-160 and ADR-161. Asked for by the owner: the app's
bars stopped content at their edge, the round controls read as grey dots, and an
edit was a pencil glyph rather than a button. Built and seen in Chromium; the
iPhone parts (the window's theme, the quick actions, the status bar's edge)
need a look on a phone.

**Context.** On iOS 26 a navigation bar has no ground of its own. The screen
runs under it, and where content passes beneath, a soft blur fades it out (the
scroll edge effect); the bar's buttons are glass capsules over that, the glyph
in the label color and a commit tinted. Headpin's bars were opaque slabs with a
hairline, which is what iOS drew before iOS 7, and the frosted bar tried before
(§1b) was a flat haze across the whole bar rather than an edge. The page cannot
draw Liquid Glass, but it can draw the shape of it: content under the bar, an
edge that only shows when something is under it, and raised buttons.

**Decision.**

- **Bars float.** `PushScreen`'s nav bar and `FormSheet`'s bar sit over their
  scroll area, which starts a bar's height down and scrolls up under it. The
  tabs scroll up under the status bar the same way: the safe-area top is
  padding inside `<main>` rather than on the shell.
- **The scroll edge** (`.scroll-edge`, `index.css`) is the only ground behind a
  bar: a wash of the page's color with a blur, both fading out downward and a
  little past the bar. Over the empty top of a page it is the page's color on
  the page's color, so it shows nothing until something scrolls beneath, and
  needs no scroll position.
- **A sticky row inside stops beneath the bar,** and where the row is opaque
  (the catalog's search, a Stats sheet's header) it reaches up behind the bar,
  so the list passes under the two as one band. A sticky row stops at the
  scroll area's padding edge, so the bar's height is published for it
  (`--push-bar-h`, `--sheet-bar-h`) and it starts and sticks that far up.
- **Chrome controls are glass.** `IconButton`'s `round` is a translucent raised
  circle with a top highlight (`.glass`), its glyph in ink; `confirm` is the
  accent under the same highlight (`.glass-tinted`).
- **Edit is a word.** The control that turns a read screen into a form (a ball,
  a spare line, the bowling profile) is "Edit" in a glass capsule
  (`BarButton`), as iOS writes it, and inside content a small tinted capsule
  (`TintedButton`, a lane's notes). Glyphs stay for what a glyph says at once:
  back, close, the tick, share.
- **The segmented control is UIKit's shape:** a grey track with the chosen
  segment raised in the surface color, and in the store apps the selection tick
  as the choice moves (`haptic("select")`).
- **The iPhone app's window takes the page's theme** (`HeadpinViewController`,
  from the background color the page already reports), so the status bar, the
  keyboard, the share sheet, the purchase sheet and any alert match the app
  rather than the phone. **The Android app's system bar icons do the same**
  (`followThemeInSystemBars`, Capacitor's `SystemBars`).
- **The iPhone app has Home Screen quick actions**: Stats, History, Arsenal and
  Ball catalog. Each is a headpin.app address in `Info.plist`, handed to the
  page as an opened link (ADR-159), so the page decides what it opens and a
  test holds each one to its screen.

**Consequences.**

- Everything here but the window, the quick actions and the Android bars is the
  page's, so the web app and the Android app get the same bars and controls.
  That is the owner's ask for the web, and on Android the glass reads as a
  raised button, which suits Material too.
- Text faintly shows through the edge right under a bar's title, as it does on
  iOS. If it reads as haze on a phone, the wash's two stops are the knobs.
- A screen whose body is its own scroller (rather than the push's) starts below
  the bar and never passes under it. Nothing breaks; it simply has no edge.
- A quick action opens its screen by reloading the page, as a shared link does.
  One that resumes a game in progress is not offered, since a route that names
  a screen skips the jump into today's game.
## ADR-169: Every ball photo gets one house treatment

**Status.** Accepted, 2026-10-21. Amends ADR-138 on what a replaced photo keeps
under its old name. ADR-142's rights position stands as written.

**Context.** The owner asked for every ball photo to look uniform and clean.
Measured over all 839 photos, the balls were the same size and centred, but
their edges were not alike: a light fringe or a dark ring left by the cut,
a soft floor shadow under most Brunswick-family renders (their silhouettes
were about 1% taller than wide), a white outer ring on glossy renders, and
bites taken out of bright rims by the flood-fill repairs of ADR-142. Each is
small, and together they made the grid read as photos gathered one by one.
The normaliser also did not do what it said: `BALL_FILL` was meant to leave an
even 6% margin, and the second resize scaled the ball back up to fill the
canvas. The app had come to rely on that (`CatalogBallImage` crops a `bare`
photo to `rounded-full`, and the placeholder is drawn at the same size).

**Decision.**

- **One treatment in `render.ts` for every source**, so a new photo from any
  ingest route gets it: find the ball against a transparent or border-coloured
  ground; fit its circle to the sides and top of its outline, never the bottom
  where a shadow hangs, and refit without the points that miss, so a bite or a
  speck cannot pull it; cut 1.5% inside that circle, which takes a fringe, a
  ring or a shadow with it; fill any pixel past the cut, or a hole inside it,
  from the ball just inside the rim; and draw the edge at each output size as
  an exact anti-aliased circle touching the canvas, with the same gentle edge
  shade (up to 18% darker over the outer 7% of the radius) on every ball.
- **The ball fills its canvas.** That is the contract the screens were built
  on, so `BALL_FILL` is gone rather than fixed.
- **Nothing inside the ball changes.** No recolouring, mirroring or
  retouching: the logo and the colourway are how a bowler recognises their
  ball, and a ball that looks altered looks fake. This is a presentation
  standard, not a disguise. The photos are still the manufacturers' renders,
  a reverse image search still finds them, and the rights position is exactly
  ADR-142's.
- **The full pass re-renders the photos in the repo**, not fresh downloads:
  `npm run rerender-images -- --all`. The originals are not kept, and fetching
  ~800 photos again to get them would be a second bulk pull for a small gain
  in sharpness. Each entry in `data/images.json` records the `normaliser` it
  was rendered with, and the command takes only entries below the current
  one, because a second pass over its own output would cut the rim again and
  shade it twice.
- **Each re-rendered photo gets a new file name** (`nextStem`), since the
  service worker keeps a photo by its URL for 30 days (ADR-131) and the iPhone
  app until it evicts it (ADR-162). The old thumb name is overwritten with the
  new thumb, because an arsenal ball's snapshot holds that path until its next
  catalog sync (ADR-143). **The old full is removed** rather than kept, which
  amends ADR-138: no snapshot or saved record names a full, only the catalog
  does, and it names the new one. Keeping them would have doubled the 52 MB of
  photos for nothing.
- **`clear-background` is retired.** Its two repairs, clearing a white ground
  and cutting to the circle, are now steps every photo goes through.

**Consequences.**

- Every catalog ball and every arsenal ball shows the new photo on its next
  catalog sync, with no 30-day wait.
- A photo the fit gets wrong is still only visible to an eye, so the contact
  sheet stays the last step of any photo change.
- A future change to the treatment must allow for the current one already
  being in the full photo, or fetch the originals again.
- The one decision that would let the photos be both uniform and owned is
  still the one ADR-142 names: dealer media from Storm and Brunswick, under
  permission, as MOTIV's are.

---

## ADR-170: The web points at the iPhone app, the layout lab locks only its numbers, and the Pro page shows real screens

**Status.** Accepted, 2026-10-21, by the owner's decision. Amends ADR-167 on
what the layout lab locks and how a veil looks, ADR-164 on the Pro page's
pictures, and ADR-115 and ADR-150 on Home's install card.

**Context.** The owner wants the free web app to send bowlers to the iPhone
app rather than to the home screen. The landing page still carried install
steps, and Home a "Keep your scores safe" card asking to add the page to the
home screen. On the layout lab the whole block of controls was veiled, so a
bowler without Pro could not even set their own hand or PAP to read the drawn
layout against, and its "Edit with Pro" mark was sticky, so it slid over the
blurred fields as the page scrolled and read as loose. The veil's blur hid what
was under it, which is what the veil exists to show. The Pro page's pictures
were hand-drawn sketches that read as fake.

**Decision.**

- **The landing page has no install steps**, and its closing line is "Try it
  now." The oil pattern step gave its place to Stats (0.54.1).
- **Home offers the iPhone app, not the home screen.** The install card goes;
  the backup card stays. On the free web app Home opens on a row drawn like a
  store's own banner, a close, the app's icon and name, and Get, which runs the
  same "Get the app" action as a locked card (the steps for moving games, then
  the App Store). Before the app is listed it says it is coming, with no
  button. It is not on the owner's copy, inside the app, on Android until the
  app is on Google Play, or in iOS Safari once listed, where Safari draws its
  own (ADR-159). Waved away, it comes back after 14 days.
- **The layout lab locks only the three numbers**: the sliders, and the
  presets that move them. The PAP, hand, grip, core and the notation toggle
  are free, so a bowler can read any layout against their own hand. The mark
  reads "Try your layouts with Pro" and sits still at the top centre of the
  veiled sliders. The notation boxes print the numbers in the accent, so they
  stand out from the x's between them, and they carry the reading that a
  separate read-out used to.
- **The layout lab has one trailing action**, the share. More held only a way
  to Settings, which the tab bar already is.
- **A veil is a light blur** (1px at 80%), on the lane and in the lab alike.
- **The Pro page draws each thing Pro adds with the screen's own component**
  and sample numbers: the stat chart, the First ball card, the leave cells,
  ball rows with real catalog photos, the lane with a line over oil, and the
  drilled ball. It follows the screens as they change, as the sketches never
  did.

**Consequences.** `ProVeil`'s sticky `tall` mode is gone for a `top` one.
`LayoutEditor` veils its own sliders when asked (`proNumbers`), so the ball
form, where writing a ball's layout down is recording it, stays open.
`FirstBallCard` takes only the fields it reads, so the Pro page can feed it.

---

## ADR-171: The page scrolls under the tab bar, the phone's and its own

**Status.** Accepted, 2026-10-21, asked for by the owner from a phone in hand.
Settles the consequence ADR-161 left for later, and amends ADR-168 on what sits
under the page's own capsule. The Swift needs a build and a look on a phone.

**Context.** In the iPhone app and on the web, History, Stats and Settings
stopped at a hard edge above the tab bar, with a solid band of the page's color
behind it. `<main>` runs the full height and pads its end by the bar's height,
which is right for a tab that `<main>` scrolls (Home, Score). But those three
scroll themselves, in a full-height box inside `<main>`, and that padding made
the box a bar's height short: the list ended above the bar, and nothing was
under it to show. On top of that, the page's own capsule sat on a gradient that
went solid at the bottom, and a `UITabBar` outside a `UITabBarController` has
no scroll view to watch, so iOS 26 may give it a solid ground of its own.

**Decision.**

- **Whatever scrolls pads its own end.** `<main>` publishes `--tab-clear`, the
  bar's height on a phone and nothing on a wide screen, and pads by it only for
  the tabs it scrolls. A tab that scrolls itself pads its scroller instead
  (`CollapsingHeader`, the Settings menu, an inline `PushScreen`), so the box
  runs to the foot of the screen and the list passes under the bar. A pushed
  screen sits outside `<main>` and reads nothing.
- **The system bar has no ground on iOS 26 and later**
  (`configureWithTransparentBackground`, for both its standard and scroll-edge
  appearance), so its capsule floats over the page. Before iOS 26 it keeps the
  translucent blur that iOS drew then.
- **The page draws the bottom edge itself**, for both bars: `.scroll-edge-bottom`,
  the top scroll edge turned over and lighter, `--tab-bar-h` tall, so content
  under the bar is softened a little and never covered. Gone while the keyboard
  is up.

- **The status bar's edge is the status bar's height**, not half as tall again.
  The extra half lay over the top of each tab's header and of a Settings
  section's nav bar, and blurred their round buttons into a haze on a phone.

**Consequences.** Every tab's last rows can now sit behind the bar until
scrolled up, which is how a system screen behaves; `<main>` still pads its end
by `--tab-bar-h`, so the last row can always be scrolled clear of it.

---

## ADR-172: Setting a ball's layout is Pro

**Status.** Accepted, 2026-10-21, by the owner's decision. Amends the
PRO-LAUNCH split, where writing a layout on a ball was free as recording, and
follows ADR-170.

**Context.** ADR-170 locked the layout lab's three numbers. But a layout set on
a ball in the arsenal opens in the lab, drawn and read out, so a bowler without
Pro could set any layout there and see it on the ball: the lab's sliders by
another door.

**Decision.**

- **The ball form's layout is Pro.** Adding or changing it, and removing it,
  sit under one "Set and visualize your ball layout with Pro" mark
  (`ProVeil`). The ball's name, weight and catalog link stay free.
- **A layout already on a ball still reads,** on the read sheet, the arsenal
  row and in the lab, since reading is free; a bowler who drilled a ball under
  Pro, or brought one in from a backup, keeps seeing it.
- **The tap closes the sheet first.** The Pro page is a pushed screen, which
  sits under a sheet, so the sheet goes before it opens (as the lane view does).
  An unsaved new ball is lost with it; the layout is the last field, so the
  rest is quick to enter again.

---

## ADR-173: A lock is the lock alone, on a card that looks locked

**Status.** Accepted, 2026-10-21, by the owner from a phone in hand. Amends
ADR-163 and ADR-167 on how a locked card and its mark look.

**Context.** On Stats without Pro, the First ball card showed its numbers sharp
and whole, with a "Pro" mark in room of its own beneath the fade: it read as
an open card with a stray button under it, and the owner could not tell what it
locked. Every locked card and row carried the same "Pro" pill, so a screen of
them said one word again and again.

**Decision.**

- **A locked card is lightly blurred** (2px) as well as faded, with the lock
  in the middle of it rather than below. Its numbers are still there to see as
  shapes, which says there is real work behind it, and the blur says it is not
  open.
- **The mark on a card or a row is a round lock icon with no word.** The tap's
  spoken name still says what the card shows and what it does. A veil over
  controls keeps its words where they say what Pro opens there ("Try your
  layouts with Pro", "Move it with Pro"); where there is no room for words it
  is the lock alone too.

---

## ADR-174: Every chart and the First ball card are free; View all opens without Pro

**Status.** Accepted, 2026-10-21, by the owner's decision. Amends ADR-154's
feature split, ADR-163 on the locked chart, and ADR-167 on the All leaves and
All balls sheets.

**Context.** Stats without Pro carried a lock on the chart (for most metrics and
the by-game slice), a lock on the First ball card, and the two lists, and the
links to the full lists were gone. The owner found the screen over-locked, the
chart's lock ugly, and the overall first-ball read worth giving away.

**Decision.**

- **Every chart is free,** every metric, by session and by game slot, and so
  is the First ball card. Neither carries a lock.
- **The links say how many there are:** "View all 12 leaves", "View all 4
  balls". A bowler learns the size of their own list either way.
- **View all opens without Pro.** The sheet shows what the card does, the two
  leaves left most or the best ball, open with their details, then the next one
  blurred under the lock and nothing after it. The leaves sheet drops its
  filters while locked, which would be a way to read every other leave one at a
  time. The best ball's row on the card opens the sheet on it.
- **A lock inside a sheet closes the sheet first,** as the ball form does
  (ADR-172), since the Pro page opens under it.
- The Pro page drops its chart and first-ball items and names both under what
  stays free; the Stats banner says Pro adds every leave and every ball.

---

## ADR-175: The Pro page opens above every sheet

**Status.** Accepted, 2026-10-21, after the owner saw it on a phone. Amends
ADR-172 and ADR-174 on what a lock inside a sheet does first.

**Context.** A lock inside a sheet (the session sheet's stats, the View all
sheets, the ball form) opened the Pro page under the sheet: pushed screens live
in the app shell, sheets are portalled to the body above it, and no z-index in
the shell can rise past them. ADR-172 and ADR-174 worked round it by closing the
sheet first, which lost a ball being added and could not reach the session
sheet's own stats.

**Decision.**

- **The Pro page is its own layer at the top** (`PushScreen layer="top"`),
  portalled to the body above the sheets and the lane view and under the
  dialogs. A lock opens it over whatever is up, and its back returns there. The
  close-the-sheet-first workarounds are gone.
- **The sheet keeps its back entry.** Opened from a sheet, the page takes over
  the sheet's history sentinel like any screen opened from one; when it closes
  onto the sheet, the sentinel is put back (`coversSheets`, `useHistoryRoute`),
  so the next back closes the sheet and not the screen under it.
- **Only the overlay in front answers Escape and traps Tab** (`useOverlay`).
  With the sheet still active under the page, both used to close at once.

---

## ADR-176: The Pro page says only what Pro adds

**Status.** Accepted, 2026-10-21, by the owner's decision. Amends ADR-164 on
what the Pro page carries.

**Context.** The Pro page closed on a "What stays free" card. A bowler reading
it is already using the free app, so the card told them what they had, on the
one page whose job is to sell the rest.

**Decision.** The card goes. The page is the Pro mark, a picture and a sentence
for each thing Pro adds, and the button. What is free is still settled in
`docs/PRO-LAUNCH.md`, and the App Store listing can say it where a stranger
reads it.

---

## ADR-177: A pushed screen's title shows only at the top

**Status.** Accepted, 2026-10-21, by the owner from a phone in hand. Amends
ADR-168 on what floats over a screen's scroll.

**Context.** ADR-168 floats a pushed screen's bar over its scroll, with the
scroll edge, a light wash and blur, as its only ground. The owner liked the
floating round buttons, but the title read as floating oddly: once the page
scrolled under it, its words sat on top of the page's own text, which the edge
softens but cannot hide.

**Decision.** The title shows while the screen is at its top and fades out once
the scroll passes 4px; it comes back at the top. The round controls stay, since
they are raised glass that reads over anything and are the way out. The title
stays in the accessibility tree either way (only its opacity changes), so a
screen is always named. Sheet bars are unchanged: a sheet is short, and its
title is what it is about.

---

## ADR-178: The lane view's controls are the app's glass, and the quick moves sit with the fields

**Status.** Accepted, 2026-10-21, by the owner from a phone in hand. Amends
ADR-109 on where the quick moves open from.

**Context.** The lane view drew its own controls: small outlined circles and a
text "Done", where every other screen has round glass (ADR-168) and a tick on a
sheet that applies as it goes (DESIGN-LANGUAGE §1a). The quick-move button sat
under the view toggle in the top-left corner, away from the laydown, target and
final fields it moves.

**Decision.**

- The lane's round controls are `IconButton variant="lane"`, the same 44pt
  glass circle in a dark glass (`.glass-lane`), since the lane's frame is dark
  in every theme. The view toggle is a glass capsule as tall. All four sit in
  the top row.
- Lane options closes with a tick (`confirm`), not the word.
- The quick moves are a button at the end of the peg fields, and open away from
  the edge they sit on: up from the row in bowler view, inward from the side
  column top-down.
- The sentence under the hook-shape sliders goes; the slider names say it.

---

## ADR-179: Edit is a pencil

**Status.** Accepted, 2026-10-21, by the owner's decision. Amends ADR-168 and
DESIGN-LANGUAGE §1b, which kept the word "Edit" on chrome as a glass capsule.

**Context.** Every other control on a bar is a round glyph: back, close, share,
add, the tick that saves. The word "Edit" beside them, on the ball, spare line
and bowling profile sheets, read as the odd one out, and so did the tinted
"Edit" on a lane's notes card.

**Decision.** Edit is a pencil: `IconButton variant="round"` with the pencil on
a bar, turning into the tick that saves, and a compact pencil in a card's
heading row. `BarButton` and `TintedButton` are gone. The label still says what
the pencil edits ("Edit ball", "Edit lane 3 notes"), so a screen reader hears
the verb. A pass over every other control found the rest already right: glyphs
on chrome, and words where a glyph would be a guess (a dialog's answers, a
toggle between two named views, quiet in-screen actions such as "Edit shots").

---

## ADR-180: The app gives away no web-page gestures

**Status.** Accepted, 2026-10-21, after the owner saw it on a phone. Follows
ADR-160 (no rubber band, no pinch zoom, haptics), which took the first of
these away.

**Context.** A double tap and hold on the Stats chart brought up the iOS text
magnifier: selection was off on `html`, and WebKit still let the text inside an
SVG (a chart's values and dates) be picked up. The same pass found three more
ways the app answered like a web page: a double tap on anything but a control
could zoom, a held picture could be dragged out as a file, and a long press on a
link opened WebKit's preview of the page behind it.

**Decision.**

- Selection and the long-press callout are off on every element, not only the
  root; text fields keep both, with their own paste and caret menu.
- `touch-action: manipulation` on the page, so no double tap zooms anywhere.
  Pinch is left as ADR-160 and VIEWPORT-BUG settle it.
- Pictures and drawings cannot be dragged (`-webkit-user-drag: none`).
- The iPhone app's web view shows no link previews (`allowsLinkPreview`).
- Kept on purpose: the keyboard's own toolbar above a text field. Hiding it
  needs the Keyboard plugin and takes away the only way to put away the number
  pad, which has no return key.

## ADR-181: Privacy and terms is a screen in the app, read from the site's page

**Status.** Accepted, 2026-10-21, at the owner's request.

**Context.** Settings' "Privacy and terms" row opened `headpin.app/legal`: a
new tab on the web, the in-app browser in the iPhone app. Either way the bowler
left the app for a page with the site's own "Headpin" back link, which leads to
the landing page, not back to Settings. The page still has to exist: App Store
Connect and a crawler need a public URL.

**Decision.**

- The row pushes a Settings section, `legal` (`#/settings/section/legal`), a
  PushScreen titled "Privacy and terms" with the app's back arrow.
- Its text is `legal/index.html` itself, imported raw at build time and cut to
  its `<main>` without the back link, the heading (the bar carries it), the
  footer and comments (`src/lib/legalPage.ts`). One copy of the words, so the
  store's URL and the screen never disagree. The screen styles the page's few
  elements with the app's type and colours.
- The screen is lazy, so the text is in its own chunk; the service worker and
  the store apps carry it like every other chunk, so it opens offline.
- Inside it, a contents link scrolls the screen and writes no hash into the
  app's history (ADR-041), the email address opens Mail, and the two outside
  policies leave as every outbound link does: a new tab on the web, the in-app
  browser in the store apps.

## ADR-182: A segmented control's answer is filled in the accent

**Status.** Accepted, 2026-10-22, at the owner's request. Amends
DESIGN-LANGUAGE §2 on how `SegmentedControl` draws its selected segment.

**Context.** The segmented control was drawn as UIKit draws its own: a grey
track with the chosen segment raised in the surface color. In dark mode that
segment is `surface-muted` on a faint ink track, two greys a few shades apart.
In the Layout Lab's "Your PAP and hand" sheet, L/R and 1H/2H sat side by side
and the owner could not tell which hand or which grip was set. The note that an
accent fill "read as a pressed button" weighed less than a choice nobody can
read.

**Decision.**

- The selected segment is filled with `accent-fill` and labelled in
  `accent-on-fill`, the same pair a primary `Button` uses, so the answer reads
  in both themes at a glance.
- The track, sizes, the 44pt hit region and the store apps' selection tick are
  unchanged. Unselected segments stay ink on the grey track.
- It is the primitive that changes, so every pick-one track in the app (theme,
  handedness, core, the Stats toggles) draws its answer the same way.

**Consequence.** A track now carries the accent where it used to be neutral,
so a screen with several stacked tracks shows more of it. That is the point:
each one is an answer the bowler set.

## ADR-183: A session's bar carries it, and a tap on what it is edits it

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand. Amends
ADR-177 on a pushed screen's bar, and replaces the two-tap stats-then-pencil
edit on a session.

**Context.** A session opened from History drew its alley and a meta line in
the nav bar, then a row under it with the lanes, the oil pattern, the stats and
share buttons and the series score. To edit the session took two taps on one
button: the stats glyph brought the sheet up, and the same button, now a
pencil, opened the details. The row cost a band of the screen, the pencil was
a glyph for something the bowler already expected the header to do, and the
meta line spent its room on a long date and a game count the chips already
say.

**Decision.**

- **The bar carries the session.** Back, then the alley over the event, a short
  date and the oil pattern, then the stats button, share and the series score
  with its average. `PushScreen` takes a `bar` in place of its centred title
  for this; its words fade under a scroll as a title does (ADR-177), and its
  controls stay. The Score tab has no nav bar, so the same bar heads its page.
- **The identity is the edit.** A tap on the alley and its line opens the
  session's details, with no pencil. While the session sheet is up, the same
  tap closes the sheet and opens nothing: the sheet is what the bowler is
  looking at, and the bar is the way out of it.
- **The meta line is short.** "Oct 19", with the year only when it is not this
  one, and no game count.
- **The lanes stay under the bar,** on their own line, and a tap there still
  opens the session sheet on its scorecard.

**Consequence.** A long alley name truncates sooner in a pushed bar, beside
two round buttons and the score. The full name is in the edit sheet a tap away.

## ADR-184: No long press; a session's deletes are in its editor

**Status.** Accepted, 2026-10-22, at the owner's request.

**Context.** Two things in the app waited on a hold. A History row held for a
menu of Edit session and Delete session, and a game chip held for Delete game.
The owner found both clunky and easy to set off by accident. On the iPhone a
hold is the system's context menu, which lifts the item, blurs the rest and
gives a haptic, and a page cannot draw that. What it can draw is a timer and a
small floating menu, with nothing to say the gesture is there, and the thumb
that finds it is mostly one resting on a row mid-scroll.

**Decision.**

- **No long press anywhere.** `useLongPress` is gone. A History row and a game
  chip do one thing on a tap, open or pick, and nothing on a hold.
- **Edit session** is a tap on the session's header (ADR-183), so it leaves the
  History menu with nothing to replace.
- **Delete session** is a red button at the foot of Edit session, behind a
  confirm that says every game goes with it and that it cannot be undone. It
  sits with what it deletes, as Delete ball does in the ball editor.
- **Delete game** is in the same sheet: a Games list, each game with its score
  and a red delete, behind a confirm. The editor is the one place reachable
  for every game, finished or not; the scorer's More menu is only there while
  a game is being scored. Deleting the last game deletes the session, as it
  did from the chip.
- The game chips scroll sideways with no scroll bar drawn; a row cut off at
  the edge already says there is more.

**Consequence.** Deleting a session from History is now three taps (open it,
its header, Delete session) rather than a hold and a tap. That is the point: a
delete should be found by looking for it, not by resting a thumb.

## ADR-185: Native presses and menus, and tab headers that stay put

**Status.** Accepted, 2026-10-22, at the owner's request. Supersedes ADR-077 and
ADR-093 on the tab header, and amends DESIGN-LANGUAGE §1 on where frost goes.

**Context.** Three things read as a web page rather than an iPhone app. A finger
pressed on More, slid off it to change its mind and lifted, and the menu opened
anyway: a browser fires `click` for any touch that did not scroll, wherever it
lifted. The menu itself was a small flat card with an icon before each label
that faded in where it stood. And History's and Stats' headers slid away on a
scroll down and back on a scroll up, where the owner wanted them to stay, with
the list passing under them as it does under an iOS bar.

**Decision.**

- **A press dragged off a control is cancelled.** `installPressCancel`
  (`src/lib/pressCancel.ts`), installed once at start, watches a touch from
  the control it landed on; if it ends more than 32px past that control's
  edge, the click that follows is swallowed. Coming back inside first counts
  as a press, as UIKit's does. A mouse is left alone, since a desktop browser
  already drops a click released elsewhere. Pins and the lane act on pointer
  events, not clicks, and are untouched.
- **The menu is drawn as an iOS menu.** `AnchoredMenu` is 240px wide, frosted
  (`.anchored-menu`), with 22px corners, 44px rows, the label leading and its
  glyph trailing, and it grows out of the corner of the button that opened it
  with a little overshoot (`.animate-menu-in`).
- **Tab headers stay put.** `FloatingHeader` replaces `CollapsingHeader`, and
  `useHeaderCollapse` is gone. The title, actions and filter chips float over
  the list, which scrolls under them and under the status bar, behind a
  frosted wash that fades out just past the header's foot
  (`.floating-header-ground`).

**Consequence.** The headers cover the top of the list for good rather than
handing their room back on a scroll down; on a phone that is the title row and,
with filters on, a row of chips. The frost costs a backdrop blur where the list
moves, which ADR-171 avoided under the tab bar for WebKit's frame budget; the
headers' is one layer, not stacked over an animation.

## ADR-186: Sheets float as iOS 26's do, with filled fields

**Status.** Accepted, 2026-10-22, at the owner's request, against the Claude
app's own sheet as the reference for native.

**Context.** Every sheet was a full-width slab sitting on the screen's bottom
edge, rounded only at the top with a small radius, its round controls tight to
the edge, and its fields outlined boxes under bold labels. An iOS 26 sheet
floats: inset from the sides and the bottom, rounded at every corner to follow
the phone's own, its controls set in from the curve, and the fields inside it
filled rows under small grey captions. Beside a native app the difference read
at a glance.

**Decision.**

- **`FormSheet` floats on a phone.** 8px in from each side and from the foot,
  38px corners all round (the screen's corner less the inset), the bar's
  controls 14px in, and the body's padding allowing for the home indicator's
  inset less the 8px the sheet already stands off. On a wider screen it is the
  centred card it was. `SessionLanePanel` and the lane view's Lane options
  float the same way.
- **Fields are filled.** `FIELD` is a rounded box in a 6% wash of the ink, no
  border until focus, 15px text. `FIELD_LABEL` is a 13px caption in the
  secondary ink, set in a little.
- **The dense score-panel fields are unchanged.** They sit two to a row beside
  the pin deck, where an outline is what tells one box from the next.

**Consequence.** A sheet is 16px narrower on a phone. Every form in the app
picks up the filled fields through `field.ts`, including the few outside a
sheet, which read as the same control on the page.

## ADR-187: Controls are capsules

**Status.** Accepted, 2026-10-22, at the owner's request.

**Context.** iOS 26 draws its controls as capsules: buttons, the segmented
control's track and thumb, a menu's pressed row. Headpin's were rounded
rectangles of 6 to 10px, which read as a web form beside the floating sheets
and glass buttons around them (ADR-168, ADR-186).

**Decision.** `Button`, `Chip`, `SegmentedControl` and the session's new-game
button are `rounded-full`; a menu row lights as an inset capsule. Cards,
fields, menus and sheets keep their corner radii: they are containers, and a
capsule is the shape of a thing that is pressed.

**Consequence.** A wide button (a full-width Delete session) is a long pill,
as iOS draws one.

## ADR-188: Every screen bounces, the app never does

**Status.** Accepted, 2026-10-22, at the owner's request, against the iPhone's
own Settings screens as the reference. Keeps ADR-160's decision for the web
view as a whole.

**Context.** An iOS screen rubber-bands under a pull even when everything on it
fits: a Bluetooth settings page with three rows still comes down under the
thumb and springs back, and that answer is a large part of why it feels alive.
Headpin's screens scroll inside their own scrollers (the web view itself is
held still, ADR-160), and WebKit bounces a scroller only once its content is
taller than it. A screen that fit, the Score tab between games or a short
History, did not move at all.

**Decision.** `.ios-bounce` (`index.css`) gives a scroller an invisible strut
one pixel taller than itself, so it always has that pixel to scroll and iOS
always bounces it. It is on `<main>` for the tabs it scrolls, on the History
and Stats lists (`FloatingHeader`), on the Settings menu and on every pushed
screen (`PushScreen`). It applies on touch screens only (`pointer: coarse`):
a mouse has no bounce, and a desktop browser would draw a scroll bar for the
pixel. Sheets are left out, since a pull down on a sheet is its dismiss.

**Consequence.** A screen that fits can be scrolled by one pixel; nothing that
reads a scroll position acts on less than four (the pushed title's fade, the
floating header). The web view keeps `bounces = false`, so the tab bar and the
status bar never move with a pull.

## ADR-189: A segmented control is the tab bar's capsule

**Status.** Accepted, 2026-10-22, at the owner's request, against Telegram's
chat filters on iOS 26 as the reference. Supersedes ADR-182 on how the answer
is drawn.

**Context.** ADR-182 filled the chosen segment with the accent, after the
UIKit-style raised segment proved unreadable in dark mode. That read clearly,
but no system control is filled that way, and beside the floating tab bar the
pickers at the top of Stats read as a different family of control. iOS 26 apps
draw a filter bar in the tab bar's materials: a frosted capsule, the choice a
lighter pill within it.

**Decision.** `SegmentedControl` is the page tab bar's capsule and pill
(`.segmented-track`, `.segmented-pill`, kept in step with App.tsx): the track
frosted with a hairline edge and a top highlight, the answer an ink-tinted pill
that slides between segments on the tab bar's curve, every label in ink and the
chosen one heavier. Segments are equal widths so the pill's slide is one
segment exactly. The lane view's hand toggle, which is not the primitive
because the lane is dark in every theme, draws the same capsule and pill in
white glass.

**Consequence.** The answer is shown by a lighter pill and a heavier label
rather than by colour. In dark mode the pill is the tab bar's, which the owner
already reads at a glance at the foot of every screen.

---

## ADR-190: No owner's copy, and a locked screen carries nothing to unlock

**Status.** Accepted, 2026-10-22. Supersedes the owner's copy of ADR-154 and
ADR-167 (`/score`, Pro whatever is listed); the rest of both stands.

**Context.** Ahead of the App Store, the owner asked how a bowler without Pro
could see Pro anyway. An audit found the web open at its front door: typing
`headpin.app/score` gave every feature, the 404 page's button linked there, and
an installed web app opening at `/` was bounced there. Behind that were smaller
leaks a browser's tools reach: the controls under a Pro veil were inert but
still wired, so taking the veil off moved the layout lab's sliders and let a
ball's layout be set and saved, and the blurred row on Stats and the Alley
report was the bowler's real next leave or ball under a 3px blur, readable in
the page. The iPhone app held: Pro is StoreKit's answer, asked on every launch,
and a release build cannot be inspected.

**Decision.**

- **`/score` is gone.** The shell builds to `app/index.html` and answers `/app`
  only. `vercel.json` redirects `/score` and anything under it to `/app`, so an
  old bookmark or home screen install opens the app, locked like anyone's; the
  games stay, since storage is the site's. The 404 page and the landing page's
  bounce for an installed app go to `/app`. The owner tests Pro in the iPhone
  app, with a purchase.
- **Pro opens on the dev server for the tests.** `/app?pro` is Pro only where
  `import.meta.env.DEV` is true (`devProUnlock`, `src/lib/pro.ts`), which a
  build compiles to false and drops. The e2e suite and the screenshot scripts
  use it; no address opens Pro on headpin.app.
- **A veiled control does nothing without Pro.** `LayoutEditor` ignores a change
  to its Pro numbers while Pro is locked, and the ball form ignores a layout
  change and, on save, keeps the layout the ball already had. The veil stays
  the way a bowler is told; the guard is what holds when it is removed.
- **A blurred row is a stand-in.** The leave cell and the ball rows under a
  blur keep their look (pins, name, photo) and carry fixed numbers instead of
  the bowler's (`standInLeave`, `standInBall`, `standInEstimate`), as the Spare
  lines tiles already did.

**Consequences.** On the web, Pro is a lock and not a vault: the code runs in
the visitor's browser, and someone who edits it can open anything. What this
removes is every way in that needs no more than an address or a deleted
attribute. A shared line or layout link still sets the numbers it carries, by
design, and an edited backup can still carry a ball's layout; both are left
as they are.

---

## ADR-191: Lists, tiles and the Settings title are drawn as iOS draws them

**Status.** Accepted, 2026-10-22, at the owner's request. Amends
DESIGN-LANGUAGE §4 on how a grouped list looks; what goes in one stands.

**Context.** The owner set the app beside iOS Settings and the Claude app and
found the menus still read as a web page: grouped lists in 12px cards with an
outline and a shadow, bold row labels, 36px icon tiles, dividers running to the
card's edge and headings flush with it; Home's three tiles left-aligned like
small cards rather than square buttons; and Settings' title a small heading
that scrolled away with nothing taking its place.

**Decision.**

- **A grouped list is an iOS inset grouped list** (`ListGroup`, `ListRow`):
  26px corners, no outline or shadow (the fill alone sets it off the page), rows
  at least 52pt tall and 16pt in from the edge, the label in the body size
  (17px) and weight, a 30px icon tile with 8px corners, and the divider from
  the label's start to 16pt short of the trailing edge. The heading above a
  group lines up with the rows' text. The lists that draw their own rows
  (arsenal, lane notes, oil patterns, ball estimates) follow the same insets,
  and the arsenal is one grouped list rather than a stack of cards; the row
  being dragged lifts off it as a card of its own.
- **A square button centres its content**: Home's spare lines, lane notes and
  Alley report tiles put the bare icon, the name and the count on one centre
  line, with 22px corners and no outline, and the other cards on Home share
  the corners.
- **Settings has iOS's large title.** It is 34px, scrolls away with the page,
  and as it goes the name comes in small and centred in a frosted bar
  (`CompactTitleBar`), so the screen is named at every scroll position and
  never twice. History and Stats keep their small title, since it shares a
  pinned row with their controls and is never scrolled away (ADR-185). A pushed
  screen keeps ADR-177: its title shows only at the top.
- **A menu's items are in the body size** (17px), as iOS's are.

**Consequences.** Cards that are not lists or tiles (the stats cards, sheets'
fields) keep their own corners for now; they are the next pass if the two
looks sit badly together on a phone.

---

## ADR-192: The free leaves are the 7 and the 10, and a shared link carries a check code

**Status.** Accepted, 2026-10-22, at the owner's request. Amends ADR-167 on
which leaves are free; follows ADR-190.

**Context.** Two ways round the Pro lock were left after ADR-190. The free
leaves were the two a bowler left most, ranked within whatever the screen
showed, so changing the date range, the alley, the pattern or the session
ranked a different two to the top, and cycling the filters read most leaves'
records. And a shared line or layout link sets the numbers the line visualizer
or the layout lab opens on, so typing `?da=70&ptp=5` into the address bar was
a free slider.

**Decision.**

- **The free leaves are the 7 and the 10** (`FREE_LEAVE_PINS`,
  `freeLeavePreview`): the corner pins, which bowlers of either hand leave
  most. They are the same two for every bowler and under every filter, shown
  in full even before either has been left (at 0/0), and the leave left most of
  the rest is blurred beside them. Their records are open on the Spare lines
  page and in a leave's sheet too, and no other's is.
- **A shared link carries a check code** (`c`, `src/lib/shareCheck.ts`): six
  characters worked out from the link's other parameters, sorted by name so a
  chat app that reorders them does not break it. A link whose code is missing or
  does not match opens nothing shared: the visualizer and the lab open on their
  defaults.

**Consequences.** The code is a checksum, not a signature: the recipe is in the
page, so someone who reads the app's code can make one for any numbers. It
stops the edit anybody would try, which is what it is for. Links shared before
this carry no code and now open on the defaults; the iPhone app is not out yet,
so they are the web's, and few. The ball the free tier shows is still the
best by strike rate within the screen's filters (ADR-167).

---

## ADR-193: A ball's layout is free to set, and View layout is Pro

**Status.** Accepted, 2026-10-22, by the owner's decision. Supersedes ADR-172.

**Context.** ADR-172 put the ball form's whole Layout section under Pro, because
the arsenal's View layout opened a ball's layout in the lab, drawn and read
out, which made a free layout field the lab's sliders by another door. But
writing down how a ball is drilled is recording, and recording is free
(PRO-LAUNCH rule 1): a bowler without Pro could not even note the numbers their
pro shop gave them. The thing worth paying for is seeing them drawn.

**Decision.**

- **The ball form's layout is free.** Adding, changing and removing it, on the
  same sliders, with no veil, and it saves for everyone.
- **View layout is Pro.** The button stays on every arsenal row whose ball has
  a layout, so a bowler sees it is there. Without Pro a tap opens no lab: it
  says "Get Pro to visualize your ball layout" in a dialog whose one action is
  the way to Pro (`useProEntry`: the Pro page in the app, the steps for moving
  games and the App Store on the web), and "Not now" closes it.
- **Nothing else moves.** The arsenal row still writes the numbers out, the read
  sheet still reads them, and the lab opened from Home or a shared link is still
  free to read (ADR-170).

**Consequences.** The dialog is the one Pro lock that is a prompt rather than a
veil on the thing itself (ADR-163): there is no drawing on the arsenal row to
blur, only a button that goes somewhere. A bowler without Pro can still type a
ball's numbers into the lab's link by hand, but a link needs its check code
(ADR-192), so that is no easier than before.

---

## ADR-194: The session screen holds still under its sheet

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand. Amends
ADR-188.

**Context.** ADR-188 made every screen rubber-band. With the session sheet up,
a pull on the strip above it (the bar's foot, the lanes, the game chips)
bounced the session screen down, and the sheet, which hangs from the chips and
follows them, came down with it: the whole screen slid away from its bar. iOS
never moves the screen behind a presented sheet.

**Decision.** While the session sheet is up, the box that scrolls the session
(the pushed screen's scroller, or `<main>` on the Score tab) is
`overflow-y: hidden`, set and restored by `ActiveSessionView`, which finds it
from the session header rather than having it handed down. It scrolls and
bounces again as soon as the sheet goes. Where the reader had scrolled to is
kept, since a box that cannot scroll still holds its offset.

**Consequences.** Nothing behind the sheet scrolls while it is up. Opening the
sheet already scrolls the header back into view first, so the chips the sheet
hangs from are always on screen when it holds.

---

## ADR-195: The free leaves are the two left most again

**Status.** Accepted, 2026-10-22, by the owner's decision. Supersedes ADR-192
on which leaves are free; ADR-192's check code on shared links stands.

**Context.** ADR-192 fixed the free leaves at the 7 and the 10, because
ranking within the screen's filters let a bowler cycle the filters and read
more leaves' records. On reflection that guarded little: under any one filter
the bowler still sees only that filter's top two, never the whole list, never
the shares and never the rest of the conversions. And the corner pins at 0/0
on a card read as the app not knowing the bowler.

**Decision.** Without Pro the Spares card, the All leaves sheet, Spare lines and
a leave's sheet open the two leaves left most within what the screen shows,
ranked as the card ranks them (`freeLeavePreview`, `isOpenLeave`), and blur the
next one. This is the ADR-167 rule as it stood before ADR-192.

**Consequences.** A bowler who cycles filters can read more than two leaves'
records, one filter's top two at a time. That is accepted: it is still never
the whole picture, which is what Pro sells.

---

## ADR-196: Stats cards hold what they show, and only screens draw scroll bars

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand.

**Context.** The First ball card read as thrown together: pins a ball in the
heading's corner, strike on strike and the longest run pushed to the two ends
of a footer line, three sizes and three alignments for numbers of the same
weight. The Spares and Balls cards each scrolled inside the scrolling screen,
a second scroll to find and to fight, and their way to the whole list was a
line of accent text in the corner ("View all 78 leaves") that read as a link
in a heading and made a small target.

**Decision.**

- **One shape for every card:** a heading, the card's one large answer, and its
  smaller numbers in one even row, each centred over its label
  (`Companions`). The headline's high, low and games use it, and so does the
  First ball card under its pocket, carry and strike chain: pins a ball, strike
  on strike, strikes in a row. The headline stays about scores; the first
  ball's numbers stay with the first ball.
- **The Spares card says what its rate counts:** "of makeables made", since
  splits and washouts are left out of it.
- **Cards hold what they show.** The Spares card shows two rows of three
  leaves, the Balls card six balls, and neither scrolls. Everything else is
  under View all.
- **View all is a glass pill the card's width at its foot** (`Button`'s
  `glass` variant, the bar buttons' material): "View all 78", the count kept so
  the bowler knows the size of what is behind it, the noun left to a screen
  reader because the heading already says what is counted.
- **Only a screen draws a scroll bar.** A screen, a sheet and a list that
  fills one keep the indicator iOS draws while the list moves. Every sideways
  strip and every small box inside a screen hides it (`.scrollbar-none`), and
  `src/test/scrollers.test.ts` holds that for the sideways ones.

**Consequences.** A bowler with more than six leaves or balls taps once more to
see the seventh. The Balls card still scrolls sideways on a phone too narrow
for its columns (ADR-144), without a bar.

---

## ADR-197: The games behind a Stats figure open in a sheet

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand.

**Context.** A ball's game column on the All balls sheet and a point on the
by-game chart each open the sessions behind them. Both opened as a card centred
over the screen, with no bar and no close, its title loose at the top, raw ISO
dates, and its rates in tinted pills that nothing else in the app draws. Over
the All balls sheet it read as a stray panel rather than a step further in.

**Decision.** Both open as a `FormSheet` (`GameRowsSheet`): the title is the
ball, or "Game 2", the subtitle says how many sessions, and the close is in the
bar. The sessions are an inset grouped list (ADR-191) on the sheet's muted fill,
each row the venue and a short date, the event and lanes, then its figures as
words ("Pocket 92% 11/12"), with a good rate in the accent, and a chevron,
since a row opens its game. Tapping a row closes the sheet and opens the game,
as before.

**Consequences.** Every list the app opens over a screen is now a sheet; the
centred dialog is left for a question with an answer (`ConfirmDialog`).

---

## ADR-198: A pushed screen's title always shows

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand.
Supersedes ADR-177.

**Context.** ADR-177 faded a pushed screen's title once the page scrolled under
it, because its words sat over the page's own text with only the scroll edge
behind them. In use, Spare lines, Headpin Pro and the Alley report lost their
names a flick into the page, and the bowler could no longer tell where they
were.

**Decision.** The title, and a session's bar, stays at every scroll position.
The bar stands on the floating headers' ground (`.floating-header-ground`,
ADR-185, ADR-196): the page's own color nearly solid over a blur, running a
little below the bar and fading out there. Over the empty top of a page it is
the page's color on the page's color, so it shows nothing; over content it
turns what passes under the title into a soft shape.

**Consequences.** `PushScreen` no longer tracks its scroll, and `bar` is a plain
node rather than a function of it. Sheet bars are unchanged.

---

## ADR-199: The lane view's oil, hook sliders, quick moves and spare lines

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand.

**Context.** Four rough edges on the lane view. Its options sheet had a "Show
oil pattern" switch, a second way to say what clearing the pattern already
says. Without Pro its hook sliders were left off the sheet entirely, so a
bowler never saw that Pro shapes the hook. The quick moves panel could only be
put away by tapping one of the line's fields: its full-screen backdrop sat
inside the lane view's transformed frame, so `fixed` covered only that frame,
and it lay over the button, so a second tap closed the panel on the way down
and the button's click opened it again. And a spare line's lane, opened from
its sheet with the pencil on, let a bowler without Pro drag the line, which
everywhere else is Pro (ADR-165).

**Decision.**

- **The oil is drawn whenever a pattern is chosen.** The switch is gone; the
  sheet still reads the pattern out.
- **Without Pro the hook sliders show, under the lane's Pro veil** ("Shape it
  with Pro"), and move nothing past it (ADR-190). The options button is offered
  wherever editing is locked behind Pro, so the sheet can be reached.
- **Quick moves close on a second tap of their button or a tap anywhere
  outside,** listened for on the document in the capture phase, so the tap
  that closes it still reaches the lane.
- **A spare line's lane is read-only without Pro,** its controls under the
  lock, as in score entry; the boards are still typed in the sheet's fields.

---

## ADR-200: The segmented control follows the finger

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand. Builds on
ADR-189.

**Context.** Beside the iPhone's own tab bar (ADR-161), the Stats screen's
range and chart pickers still read as web controls. They only jumped to a
tapped segment on a flat ease, did nothing under a finger that slid, and their
pill all but vanished on the dark track.

**Decision.** `SegmentedControl` behaves as UIKit's does. The pill follows a
finger across the track with a selection tick at each segment it crosses, and
the answer lands when the finger lifts; a vertical scroll that takes the finger
cancels the press without choosing. The pill swells a little while held and
settles on a spring that overshoots slightly. It is a raised pill, lit along
its top and lifted by a soft shadow, rather than a tenth of the ink. The
keyboard still chooses with Enter and Space.

**Consequences.** A finger's click after its lift is ignored, since the lift
already chose; only a click with no pointer behind it (the keyboard) chooses
by itself.

---

## ADR-201: Every leave is free; carry, strike and the first ball's other numbers are Pro

**Status.** Accepted, 2026-10-22, by the owner's decision. Supersedes ADR-195
and ADR-174 on what Stats keeps free, and amends ADR-167.

**Context.** A bowler's leaves, and how often each is made, are the read every
bowler wants and would most resent paying for. What a first ball does beyond
where it went (whether the pocket hit carried, how often it struck, how many
pins it takes, how strikes follow strikes) is the deeper read, and the one Pro
should carry.

**Decision.**

- **Every leave is free:** the Spares card, the All leaves sheet with its
  filters, each leave's record on Spare lines and in its sheets. The leave
  locks and their stand-ins are gone.
- **The pocket is free,** since the bowler enters it at every frame. Without Pro
  the First ball card leads with it ("73% pocket hits") and blurs carry, strike,
  pins a ball, strike on strike and strikes in a row under one lock, over
  stand-in figures (ADR-190).
- **The chart plots the average, the pocket and the spare without Pro,** which
  are first on the picker in that order. Strike, strike on strike, carry, first
  ball and most strikes in a row keep their chips, each with a lock beside its
  name, and a tap goes to Pro rather than plotting. A metric remembered from a
  time with Pro plots the average without it.
- **Balls are unchanged:** the best ball's row in full, the next blurred
  (ADR-167).

**Consequences.** The best ball's row still shows that ball's carry and strike
without Pro, as the taste of the Balls card.

---

## ADR-202: The lane's fields stay at its side, and back from Pro returns to the lane

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand. Amends
ADR-167 and ADR-199 on how the lane says what is Pro.

**Context.** In bowler view the lane's peg fields were a bar along the foot of
the screen, and the keyboard that opens to type in them covered them. Without
Pro the fields' veil carried "Move it with Pro", and the points on the lane
said nothing. And a lock's tap to the Pro page closed the lane first, or, for
the line sandbox, hid it while the Pro page was up, so back from the Pro page
showed the screen under the lane (Home, a sheet) for a moment, or stayed there.

**Decision.**

- **The fields are a side column in both views,** on the side away from the
  line (left for a right-hander), on the lane's dark glass, with the drag hints
  under them. Top-down, the lane steps aside from them as before.
- **Without Pro each point of the line carries a lock** where it sits, and
  none of them drags; the fields' veil is the lock alone, as is the hook
  sliders'.
- **The lane stays as it is under the Pro page.** That page opens on the layer
  above the lane (ADR-175), so nothing closes or hides first, and back slides
  it away to the lane. `editLocked` is a plain flag now, and `ProVeil` has no
  `before`.

---

## ADR-203: The layout lab is the ball and its bars side by side, and its sliders lock as they are

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand. Amends
ADR-163 on the lab's order and ADR-170 on how its sliders lock.

**Context.** The lab pinned a full-width ball under its bar, with "What it will
do" in a section of its own below: the pinned ball took a third of the screen
from everything that scrolled. Without Pro the sliders were faded and blurred
under "Try your layouts with Pro".

**Decision.**

- **The ball and what it will do share the top row,** the ball on the left and
  the four bars on the right with the sentence they add up to under them, no
  heading. Nothing is pinned; the page is one scroll, and on a phone it is
  most of one screen.
- **Without Pro the sliders are drawn as they are** (`ProVeil clear`), out of
  reach, with the lock alone at the top of their card and the card as the tap.

**Consequences.** The drawing has half the width it had, which still reads the
pin, PAP, PSA and their angles at phone size.

---

## ADR-204: The layout lab says nothing about the thumb-hole band

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand.

**Context.** A pin-to-PAP distance between 2 3/8" and 3 3/8" runs a
one-hander's track over the thumb hole, and the lab marked it three ways: a
shaded stretch of the slider, the number in amber, and a warning under the
ball. Most bowlers set the numbers their pro shop drilled, and the marks read
as the app saying their ball was wrong.

**Decision.** None of the three is drawn, in the lab or on a ball's form. The
band itself stays in `ballLayout` (`DO_NOT_USE_BAND`, `inDoNotUseBand`), so it
can come back as a gentler note, and the layout presets still keep clear of
it. `readMotion` no longer takes the grip, which only that warning read; the
lab's other warnings stand.

---

## ADR-205: The layout lab's reset needs no confirming

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand.

**Context.** "Reset to your saved settings", under the lab's More, asked first
whether to put the bowler's own hand, grip and PAP back, because someone
reading a shared layout would be swapping the sender's axis for theirs. But
nothing on the lab is saved, the layout's numbers stay as they are, and the
fields the reset changes are right above the button, so the question guarded
nothing a second look could not undo.

**Decision.** The button resets at once, with no dialog.

---

## ADR-206: A ball's retire and delete live under More, and retiring asks first

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand.

**Context.** A ball's read sheet ended in two full-width buttons, Retire ball
and Delete ball, the largest things on it for the two things a bowler does
least, and Retire acted on the tap.

**Decision.** They move into a More menu beside the pencil in the sheet's bar
(`AnchoredMenu`, its anchor helper now shared). Retiring asks first ("Retire
Phaze II?"), with what it does and that the ball can come back; delete asks as
it did. Bringing a retired ball back asks nothing, since it loses nothing.

---

## ADR-207: Under the session sheet there is no new game, and the stats controls close it

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand.

**Context.** With the session sheet up, the chip row above it is the sheet's
(ADR-183): a tap on a game chip scopes the sheet. The new game button stayed
in that row, so a tap meant for a chip could start a game under the sheet.
And the bar's stats button and score only ever opened the sheet; putting it
away took the drag, Escape or the session's name.

**Decision.** The new game button is not drawn while the sheet is up, and comes
back when it goes. The bar's stats button and its score open the sheet and,
with it up, close it, as the session's name already did.

---

## ADR-208: Last 10 is offered once there are ten sessions

**Status.** Accepted, 2026-10-22, by the owner from a phone in hand. Amends
ADR-126 on the Stats range.

**Context.** With fewer than ten sessions in scope, "Last 10" read exactly what
"All" did, and a share card made under it said "Last 10 sessions" over a
handful of nights.

**Decision.** The range control leaves "Last 10" off until the sessions in
scope, filters included, number ten. A "Last 10" remembered from a time with
more, or under a broader filter, reads as All until there are ten again, so
nothing is ever labelled with a window it does not have.

---

## ADR-209: The layout lab's bars are a rail beside a cropped ball, the core rides the notation row, and the card is mostly ball

**Status.** Accepted, 2026-10-23, by the owner. Amends ADR-203 on the lab's
top row, and supersedes the centred ball 0.63.0 went back to.

**Context.** ADR-203 put the ball and its four bars side by side, and the ball
lost half its width to bars that kept their long names. 0.63.0 centred the ball
at full width again with the bars under it, which pushed the core and the
sliders below the fold: a bowler could watch the ball or move the numbers, not
both. And the ball fills only 220 of the diagram's 320 units, the rest kept as
a margin for its labels, so a third of every box it was given was empty. The
share card had the same problem in miniature: a sentence, a long eyebrow and a
ball at half the card.

**Decision.**

- **The ball is cropped to itself.** `BallLayoutDiagram` takes a `crop`, units
  trimmed off every side, and its labels flip inward at the cropped edge rather
  than the full square's. The lab crops 44, so a box about 16rem wide draws the
  ball as wide as the full-width square did.
- **The bars are a narrow rail on its right** (`MotionRail`): Flare, Length,
  Backend and Strength, each a short bar with its reading in a word under it
  (Low to High, Early to Late, Smooth to Sharp, Weak to Strong), in the same
  thirds as the sentence (`motionBand`, `MOTION_METERS`). The sentence sits
  under the card, in the long words the rail has no room for. The Pro page's
  sample draws the same rail.
- **The core rides the end of the notation row**, a narrow column beside the
  Dual angle and Storm VLS cards, which keep their numbers. The bowler (PAP,
  hand, grip) stays behind More: set once and then read against.
- **Without Pro each slider's thumb is a lock**, where it sits, instead of one
  lock at the top of their card (amending ADR-203): the lock is on the thing
  that will not move. The card is still the one tap that opens Pro. The lane
  view does the same (amending ADR-167 and ADR-202): Hook start and Hook
  length lock on their thumbs, and the laydown, target and final fields are
  no longer blurred, each wearing a small lock badge with its number still
  readable under it (`ProVeil bare`).
- **The share card is mostly ball.** The eyebrow names the core in a word
  (Asym, Sym) and a two-handed grip as 2H; the title and the VLS reading are
  drawn with dim separators and smaller fractions, as the app draws them; the
  sentence is gone, and the four readings are small bars beside the VLS reading
  under a ball 800 px across, rasterized at 900 in the page's own typeface.

**Consequences.** On a phone the ball, its bars, the notation, the core and all
three sliders are on one screen, so a slider or a toggle moves the ball and the
bars in view. Nothing is pinned; the page is still one scroll.

---

## ADR-210: A layout slider is one row, and its track is the same length in every row

**Status.** Accepted, 2026-10-23, by the owner from a phone in hand.

**Context.** Each layout slider was two rows, its name and number over a
full-width track, which spent a band of the screen per slider on a label.

**Decision.** The name, the track and the number share one row. The name sits
in a fixed column wide enough for the longest of them on one line, and the
number in a fixed column of its own, so every track in a card is the same
length and two thumbs at the same fraction of their range line up. The name is
still the button that opens what the slider does.
