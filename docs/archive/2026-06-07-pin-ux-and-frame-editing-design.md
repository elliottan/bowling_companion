# Pin UX + frame editing — design

**Date:** 2026-06-07
**Status:** approved (design); not yet implemented
**Scope:** three interrelated UX changes to `PinGrid` + `frameController` +
`ActiveGameScorer` / `Scorecard`.

## Context

Scoring input today: each shot starts with **all pins standing**; the bowler
taps pins to knock them **down**; the pins left standing are stored (ADR-001).
Two friction points and one missing capability:

1. **No way to fix a mistake.** Once a frame is recorded you cannot reopen it.
   The `frameController` is a forward-only state machine.
2. **Wrong default for real play.** Most balls knock most pins down, so the
   common case is "mark the few left standing," not "knock down eight." Starting
   all-standing means lots of taps for a good shot.
3. **One-pin-at-a-time tapping** is slow for clearing a cluster.

User decisions (locked):
- **Edit flow:** inline — tapping a completed frame on the scorecard makes it
  the active target; the pin grid re-captures that frame's shots; Save returns
  to the live frame.
- **Invert mode:** replace the current input entirely (no settings toggle).
- **Edit ripple:** recompute totals + completion only; never discard later
  frames. Each frame already stores its own shots independently, so this is
  safe.

## Data model

**Unchanged.** Frames still store **pins left standing** per shot (ADR-001).
Only the *input default* and *interaction* change, not what is persisted. No
Dexie migration. Backups stay compatible.

This deserves a one-line amendment to ADR-001 and a new **ADR-006** recording
the inverted-input decision (the stored representation is unchanged; the UI
seed flips from full-rack to empty).

---

## Feature B — Invert pin default (do first)

Sequenced first because it changes the interaction model that the other two
build on.

**Behaviour.** Each shot starts with **no pins marked standing** (`standingPins
= []`). Every *available* pin renders as "down" and the bowler taps the pins
that **remain standing**. Recording with nothing tapped = a strike (shot 1) or
spare (shot 2).

**Where the seed lives** (`src/lib/frameController.ts`): every place that seeds
`standingPins` to `ALL_PINS` or to the prior shot's standing set flips to `[]`.
`availablePins` is already tracked separately and keeps its current meaning
(which pins are tappable). Concretely:

- `createInitialFrameControllerState`: `standingPins: []` (keep
  `availablePins: ALL_PINS`).
- `submitShot` shot-1 non-strike branch: `standingPins: []` (keep
  `availablePins: normalized`).
- `completeFrame` next-frame seed: `standingPins: []`.
- `advanceTenthFrame` (each branch): `standingPins: []`, `availablePins` keeps
  its fresh-rack vs leftover logic.
- `resetCurrentShotPins` / `getDefaultPinsForShot`: return `[]` for the seed.

**PinGrid** (`src/components/PinGrid.tsx`): the toggle stays identical; only the
visual default is now "down" for available-but-unselected pins. Add a clear
disabled style for pins already down from a prior shot (not tappable) so they
read differently from "down but tappable this shot."

**`pinsDown` indicator** in `ActiveGameScorer` still works:
`knockedDownCount(standingPins)` = `10 - standing.length`.

**Tests:** update `frameController.test.ts` expectations (initial/seed standing
sets become `[]`; "do nothing → strike"). The scoring engine and
`scoring.test.ts` are untouched — they read stored standing arrays, which are
unchanged in meaning.

**Risk:** muscle-memory flip for the existing single user. Acceptable per the
"replace entirely" decision; documented in CHANGELOG + ADR-006.

---

## Feature C — Slide-to-select on the pin deck

Additive gesture layer on `PinGrid`, built on the Feature-B interaction.

**Behaviour.** Press a pin and drag across others to toggle many in one stroke.
The **first** pin toggled fixes the gesture's mode — *select* (down→standing) or
*deselect* (standing→down) — from that pin's resulting state. Every pin the
finger subsequently enters is forced to that same mode; a pin already in the
target state is left alone. One stroke never both selects and deselects.

**Implementation** (`src/components/PinGrid.tsx`):
- Pointer events: `onPointerDown` on a pin → compute target state = opposite of
  that pin's current standing membership → apply → store the mode in a ref →
  `setPointerCapture`.
- Touch fires subsequent moves only on the captured element, so on
  `onPointerMove` use `document.elementFromPoint(clientX, clientY)` to find the
  pin under the finger and apply the locked mode (idempotent — only flips pins
  not already in the target state).
- `onPointerUp` / `onPointerCancel`: clear the mode ref, release capture.
- `touch-action: none` on the pin-deck container so dragging doesn't scroll the
  page. Keep the whole interaction inside the existing `availablePins` gate —
  unavailable pins are skipped.
- Accessibility: keep per-pin `onClick` (a tap is a one-pin gesture) and the
  existing `aria-pressed` / `aria-label`. Pointer logic must not break keyboard
  or single-tap.

**Tests:** unit-test the pure mode-lock helper (given a start pin + a sequence
of entered pins, the resulting standing set toggles single-mode). A Playwright
drag test is optional/stretch (touch drag is fiddly in headless); the helper
test is the gate.

---

## Feature A — Edit previously-entered frames (do last)

Built on the finalized pin interaction.

**Behaviour.** Tapping any frame on the `Scorecard` enters **edit mode** for
that frame: the frame highlights, the pin grid + Record button re-capture that
frame's shots from shot 1, and a Cancel/Save affordance is shown. On completing
the frame's shots the frame is saved (`saveFrame` upsert by
`[game_id+frame_number]`), totals + completion recompute, and the controller
returns to the **live** position it had before the edit.

**Controller** (`src/lib/frameController.ts`): add an edit path that does not
disturb later frames. Two parts:
- `beginEdit(state, frameNumber)` → returns a controller state scoped to
  re-bowling just `frameNumber` (shot 1), remembering the prior live
  `currentFrameNumber` / `currentShot` to restore.
- On edit completion, merge the edited frame back via the existing
  `upsertFrame`, then restore the remembered live position. `isComplete` is
  re-derived from `calculateGameScore(frames).isComplete` (reuse the logic
  already in `hydrateFrameController`).

Because each frame's shots are independent, editing frame *k* only changes
stored shots for *k*; downstream frames keep their recorded shots and the score
recomputes. The only special case is the 10th frame, where editing can add or
remove the bonus-shot requirement — handled by the same 10th-frame branch the
controller already has.

**Scorecard** (`src/components/Scorecard.tsx`): make frame cells focusable
buttons that emit `onEditFrame(frameNumber)`; today they're static. Highlight
the frame under edit distinctly from the live active frame.

**ActiveGameScorer**: hold an `editingFrame: number | null`; wire
`onEditFrame` → `beginEdit`; show Save/Cancel while editing; persist on save;
clear on cancel (restore prior state).

**Tests:** `frameController.test.ts` — edit a middle frame and assert later
frames + totals recompute without loss; edit the 10th to add/remove a bonus
shot. A Playwright test covering tap-frame → re-score → total updates is a good
addition to `e2e/score.spec.ts`.

---

## Sequencing & commits

Three logical commits, each green (`npm test` + `npm run build` + e2e where
touched), verified at 390×844 in the preview:

1. `feat: invert pin input (start down, tap to leave standing)` — Feature B.
2. `feat: slide-to-select on the pin deck` — Feature C.
3. `feat: edit previously-entered frames` — Feature A.

Each commit updates CHANGELOG; B adds ADR-006 (and amends ADR-001's note);
DATA_MODEL needs no change (representation unchanged). ROADMAP "Editing past
frames" and "Pin-input ergonomics" move to Shipped as they land.

## Verification (per feature)

- **B:** start a game, Record with no taps → strike; shot 1 leave [7,10] then
  Record nothing on shot 2 → spare; pinsDown indicator correct; no 390px
  overflow.
- **C:** drag across the back row → all toggle to standing in one stroke;
  reverse drag → all clear; a stroke that starts on a standing pin only
  deselects; page does not scroll mid-drag.
- **A:** score 3 frames, tap frame 1, re-score it differently, Save → frame-1
  symbols + all rolling totals update, live position restored; edit the 10th to
  flip strike/open and confirm bonus-shot requirement updates.

## Out of scope

- Persisted user setting for input mode (decision: replace entirely).
- Undo/redo history beyond direct frame edits.
- Splits-left analytics (separate ROADMAP item).
