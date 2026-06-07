# Pin UX + Frame Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three interrelated pin-input UX features — invert the pin default (B), slide-to-select gesture (C), and inline editing of past frames (A) — in that order.

**Architecture:** All three converge on `src/lib/frameController.ts` + `src/components/PinGrid.tsx` + `src/components/Scorecard.tsx` + `src/components/ActiveGameScorer.tsx`. The persisted data model is unchanged (frames still store pins-left-standing per ADR-001); only input defaults, gesture handling, and an edit flow are added. Pure logic stays in `src/lib/` with vitest unit tests; gesture/edit wiring lives in components.

**Tech Stack:** React 18, TypeScript, Tailwind, Dexie, Vitest, Playwright. Pointer Events API for the gesture.

**Spec:** `docs/superpowers/specs/2026-06-07-pin-ux-and-frame-editing-design.md`

**Per-feature definition of done:** `npm test` green, `npm run build` green (includes `tsc -b`), verified at 390×844 in the preview MCP, one commit, CHANGELOG updated.

---

## FEATURE B — Invert pin default

The controller already tracks `availablePins` (tappable) separately from `standingPins` (currently marked standing). PinGrid already renders pins not in `standingPins` as "down" (felt-filled) and disabled pins at opacity-30. So inverting is: seed every `standingPins` value to `[]` instead of `ALL_PINS`/leftover, keep every `availablePins` value, and update tests. No PinGrid visual rewrite.

### Task B1: Flip the seeds in frameController

**Files:**
- Modify: `src/lib/frameController.ts`
- Test: `src/lib/frameController.test.ts`

- [ ] **Step 1: Update the existing tests to the inverted model**

Open `src/lib/frameController.test.ts`. The current suite seeds shots with the standing-pin convention already (a strike is `submitShot(state, [])`), so the *scoring* assertions stay valid. What changes is the **seed** of `state.standingPins` and `state.availablePins` after each transition. Replace the two assertions that check post-shot standing seeds:

In test "moves from shot one to shot two for an open first shot":
```ts
it("moves from shot one to shot two for an open first shot", () => {
  const result = submitShot(createInitialFrameControllerState(), [7, 10]);

  expect(result.savedFrame).toBeNull();
  expect(result.state.currentFrameNumber).toBe(1);
  expect(result.state.currentShot).toBe(2);
  // Inverted: nothing marked standing yet for shot 2; only [7,10] are tappable.
  expect(result.state.standingPins).toEqual([]);
  expect(result.state.availablePins).toEqual([7, 10]);
});
```

In test "allows three shots in the tenth after a strike", change the two
`standingPins` expectations from the full rack to `[]`:
```ts
  state = submitShot(state, []).state;
  expect(state.currentFrameNumber).toBe(10);
  expect(state.currentShot).toBe(2);
  expect(state.standingPins).toEqual([]); // was [1..10]
```
(There is one more `standingPins` full-rack expectation later in that test if present — set it to `[]` as well.)

Add a new test asserting the initial seed is empty and a no-tap shot is a strike:
```ts
it("starts each shot with no pins marked standing (inverted input)", () => {
  const init = createInitialFrameControllerState();
  expect(init.standingPins).toEqual([]);
  expect(init.availablePins).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // Recording with nothing tapped = a strike.
  const result = submitShot(init, []);
  expect(result.savedFrame?.is_strike).toBe(true);
  expect(result.state.currentFrameNumber).toBe(2);
  expect(result.state.standingPins).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/frameController.test.ts`
Expected: FAIL — current code seeds `standingPins` to `ALL_PINS`, so the new `[]` expectations fail.

- [ ] **Step 3: Flip the seeds in `frameController.ts`**

Make these exact edits (keep every `availablePins` value unchanged):

`createInitialFrameControllerState` — change `standingPins: ALL_PINS` to `standingPins: []`:
```ts
export function createInitialFrameControllerState(): FrameControllerState {
  return {
    frames: [],
    currentFrameNumber: 1,
    currentShot: 1,
    availablePins: ALL_PINS,
    standingPins: [],
    isComplete: false
  };
}
```

`submitShot` shot-1 open branch — change `standingPins: normalized` to `standingPins: []`:
```ts
  if (state.currentShot === 1) {
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, updated),
        currentShot: 2,
        availablePins: normalized,
        standingPins: []
      }
    };
  }
```

`completeFrame` — change `standingPins: nextStandingPins` to `standingPins: []` (the param now only feeds `availablePins`):
```ts
function completeFrame(
  state: FrameControllerState,
  frame: Frame,
  nextAvailablePins: PinNumber[]
): ShotSubmissionResult {
  const nextFrameNumber = state.currentFrameNumber + 1;
  return {
    savedFrame: frame,
    state: {
      frames: upsertFrame(state.frames, frame),
      currentFrameNumber: nextFrameNumber,
      currentShot: 1,
      availablePins: nextAvailablePins,
      standingPins: [],
      isComplete: nextFrameNumber > 10
    }
  };
}
```

`advanceTenthFrame` — in all three seed spots, set `standingPins: []` while keeping the `availablePins` expressions:
```ts
  if (state.currentShot === 1) {
    const strike = isStrike(frame);
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, frame),
        currentShot: 2,
        availablePins: strike ? ALL_PINS : pinsStanding,
        standingPins: []
      }
    };
  }

  if (state.currentShot === 2) {
    const strike = isStrike(frame);
    const spare = !strike && isSpare(frame);
    const earnsThird = strike || spare;

    if (!earnsThird) {
      return finishTenth(state, frame);
    }

    const racked = pinsStanding.length === 0 ? ALL_PINS : pinsStanding;
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, frame),
        currentShot: 3,
        availablePins: racked,
        standingPins: []
      }
    };
  }
```

`getDefaultPinsForShot` — used only by `resetCurrentShotPins`; reset now clears all marks:
```ts
function getDefaultPinsForShot(_state: FrameControllerState): PinNumber[] {
  return [];
}
```
(The `knockedDownCount` import becomes unused inside this function but is still used elsewhere in the file via `hydrateFrameController` — leave the import.)

`hydrateFrameController` — in the two 10th-frame partial branches, set `standingPins: []` while keeping the `availablePins` expressions:
```ts
  if (!last.shot_2_pins_standing) {
    return {
      ...createInitialFrameControllerState(),
      frames: ordered,
      currentFrameNumber: 10,
      currentShot: 2,
      availablePins: shotOne === 10 ? ALL_PINS : last.shot_1_pins_standing,
      standingPins: []
    };
  }
```
```ts
  if (needsThird && !last.shot_3_pins_standing) {
    const racked = last.shot_2_pins_standing.length === 0
      ? ALL_PINS
      : last.shot_2_pins_standing;
    return {
      ...createInitialFrameControllerState(),
      frames: ordered,
      currentFrameNumber: 10,
      currentShot: 3,
      availablePins: racked,
      standingPins: []
    };
  }
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run src/lib/frameController.test.ts src/lib/scoring.test.ts`
Expected: PASS (scoring untouched; controller seeds now `[]`).

- [ ] **Step 5: Run the full unit suite + build**

Run: `npm test && npm run build`
Expected: all unit tests PASS; build (tsc + vite) succeeds.

### Task B2: PinGrid affordance copy + label for inverted model

**Files:**
- Modify: `src/components/PinGrid.tsx`

The grid already renders not-standing pins as felt-filled ("down") and standing pins as outlined-white, which matches inverted input. Only the `aria-label` wording needs to read naturally for "tap to leave standing."

- [ ] **Step 1: Update the aria-label**

In `src/components/PinGrid.tsx`, the button currently has:
```tsx
aria-label={`Pin ${pin}${isStanding ? " standing" : " down"}`}
```
Leave this — "standing"/"down" still describe the pin's marked state correctly. No code change required unless a label reads wrong in manual testing. (This task is a checkpoint, not a forced edit.)

- [ ] **Step 2: Manual gut-check via preview**

Run the preview (see Task B3) and confirm: a fresh shot shows all pins felt-filled (down); tapping a pin outlines it (standing); the pins-down counter top-left reads 10 on a fresh shot before any tap.

### Task B3: Verify Feature B in the browser

**Files:** none (verification only).

- [ ] **Step 1: Start the preview**

Use the preview MCP: `preview_start` with launch config name `bowling-companion`, then `preview_resize` to 390×844.

- [ ] **Step 2: Walk the inverted flow**

In the page: clear IndexedDB and reload, start a session ("Invert Test"), then:
- Record with **no taps** → expect a strike (frame advances to 2, scorecard shows `X`).
- On frame 2 shot 1, tap pins 7 and 10 (leave them standing), Record → shot 2 with only 7 and 10 tappable; Record with no taps → spare.
- Confirm `document.documentElement.scrollWidth - clientWidth === 0`.

- [ ] **Step 3: Stop the preview**

`preview_stop`.

### Task B4: Docs + commit for Feature B

**Files:**
- Modify: `docs/CHANGELOG.md`, `docs/DECISIONS.md`

- [ ] **Step 1: Add ADR-006 to `docs/DECISIONS.md`**

Append:
```markdown

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
```

- [ ] **Step 2: Add a CHANGELOG entry**

Under `## [Unreleased] — Roadmap features (2026-06)` → `### Added` (or a new `### Changed`), add:
```markdown
- **Inverted pin input.** Each shot now starts with all pins down; tap the pins
  left standing. Recording with no taps is a strike/spare. Stored data and
  scoring are unchanged (see ADR-006).
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: invert pin input (start down, tap to leave standing)

Each shot now seeds standingPins to [] instead of the full rack; the bowler
taps the pins left standing. availablePins still gates which pins are tappable.
Recording with no taps is a strike/spare. Stored representation and the scoring
engine are unchanged (ADR-001 holds); ADR-006 records the input-model flip.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## FEATURE C — Slide-to-select on the pin deck

Add a single-mode drag gesture to PinGrid. Pure mode-lock logic goes in a small helper with its own test; PinGrid wires pointer events to it.

### Task C1: Pure gesture mode-lock helper

**Files:**
- Create: `src/lib/pinGesture.ts`
- Test: `src/lib/pinGesture.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pinGesture.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { applyGesture } from "./pinGesture";
import type { PinNumber } from "../types/bowling";

describe("applyGesture", () => {
  it("select mode adds a pin not yet standing", () => {
    // start pin 7 from a down state -> mode 'select'
    const next = applyGesture([], "select", 7);
    expect(next).toEqual([7]);
  });

  it("select mode leaves an already-standing pin unchanged", () => {
    const next = applyGesture([7], "select", 7);
    expect(next).toEqual([7]);
  });

  it("deselect mode removes a standing pin", () => {
    const next = applyGesture([7, 10], "deselect", 10);
    expect(next).toEqual([7]);
  });

  it("deselect mode leaves an already-down pin unchanged", () => {
    const next = applyGesture([7], "deselect", 10);
    expect(next).toEqual([7]);
  });

  it("keeps the result sorted", () => {
    const next = applyGesture([10], "select", 2);
    expect(next).toEqual([2, 10]);
  });

  it("modeFromToggle derives mode from the first pin's current state", () => {
    // first pin currently down -> first tap raises it -> 'select'
    expect(modeFor([], 7)).toBe("select");
    // first pin currently standing -> first tap lowers it -> 'deselect'
    expect(modeFor([7], 7)).toBe("deselect");
  });
});

import { modeFor } from "./pinGesture";
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/pinGesture.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/pinGesture.ts`:
```ts
import type { PinNumber } from "../types/bowling";

export type GestureMode = "select" | "deselect";

/** The mode a gesture locks into, based on the first pin it touches. */
export function modeFor(standing: PinNumber[], firstPin: PinNumber): GestureMode {
  return standing.includes(firstPin) ? "deselect" : "select";
}

/**
 * Apply the locked gesture mode to one pin. Idempotent: select only adds,
 * deselect only removes, so a single stroke never both adds and removes.
 * Result stays sorted ascending.
 */
export function applyGesture(
  standing: PinNumber[],
  mode: GestureMode,
  pin: PinNumber
): PinNumber[] {
  const has = standing.includes(pin);
  if (mode === "select") {
    if (has) return standing;
    return [...standing, pin].sort((a, b) => a - b);
  }
  if (!has) return standing;
  return standing.filter((p) => p !== pin);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/pinGesture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pinGesture.ts src/lib/pinGesture.test.ts
git commit -m "feat: pure single-mode pin gesture helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C2: Wire the gesture into PinGrid

**Files:**
- Modify: `src/components/PinGrid.tsx`

- [ ] **Step 1: Add pointer-driven drag using the helper**

Replace the body of `PinGrid` so the deck handles pointer drag. Key points: a `useRef` holds the active gesture mode; `onPointerDown` on a pin locks the mode and applies the first toggle + `setPointerCapture`; `onPointerMove` hit-tests with `document.elementFromPoint` and applies the locked mode to whatever pin is under the finger; `onPointerUp`/`onPointerCancel` clear the ref. The deck container gets `style={{ touchAction: "none" }}`. Keep `onClick` off (pointerdown covers taps) but keep `aria-pressed`/`aria-label`. Each pin button gets `data-pin={pin}` so the hit-test can read it.

```tsx
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { PinNumber } from "../types/bowling";
import { ALL_PINS } from "../lib/pins";
import { applyGesture, modeFor, type GestureMode } from "../lib/pinGesture";

const PIN_ROWS: PinNumber[][] = [
  [7, 8, 9, 10],
  [4, 5, 6],
  [2, 3],
  [1]
];

interface PinGridProps {
  standingPins: PinNumber[];
  availablePins?: PinNumber[];
  onChange: (standingPins: PinNumber[]) => void;
}

export function PinGrid({
  standingPins,
  availablePins = ALL_PINS,
  onChange
}: PinGridProps) {
  const standingSet = new Set(standingPins);
  const availableSet = new Set(availablePins);
  const modeRef = useRef<GestureMode | null>(null);
  // Track the latest standing set within a single drag so successive
  // elementFromPoint hits compose instead of clobbering each other.
  const dragStandingRef = useRef<PinNumber[]>(standingPins);

  function pinFromPoint(x: number, y: number): PinNumber | null {
    const el = document.elementFromPoint(x, y);
    const attr = el?.closest<HTMLElement>("[data-pin]")?.dataset.pin;
    if (!attr) return null;
    const pin = Number(attr) as PinNumber;
    return availableSet.has(pin) ? pin : null;
  }

  function startGesture(e: ReactPointerEvent<HTMLButtonElement>, pin: PinNumber) {
    if (!availableSet.has(pin)) return;
    const mode = modeFor(standingPins, pin);
    modeRef.current = mode;
    const next = applyGesture(standingPins, mode, pin);
    dragStandingRef.current = next;
    onChange(next);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveGesture(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!modeRef.current) return;
    const pin = pinFromPoint(e.clientX, e.clientY);
    if (pin == null) return;
    const next = applyGesture(dragStandingRef.current, modeRef.current, pin);
    if (next === dragStandingRef.current) return; // no-op, skip render
    dragStandingRef.current = next;
    onChange(next);
  }

  function endGesture() {
    modeRef.current = null;
  }

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      style={{ touchAction: "none" }}
    >
      <div className="mx-auto flex w-full max-w-[16rem] flex-col items-center gap-2 sm:gap-3">
        {PIN_ROWS.map((row) => (
          <div key={row.join("-")} className="flex w-full justify-center gap-2 sm:gap-3">
            {row.map((pin) => {
              const isStanding = standingSet.has(pin);
              const isAvailable = availableSet.has(pin);
              return (
                <button
                  key={pin}
                  type="button"
                  data-pin={pin}
                  aria-pressed={isStanding}
                  aria-label={`Pin ${pin}${isStanding ? " standing" : " down"}`}
                  disabled={!isAvailable}
                  onPointerDown={(e) => startGesture(e, pin)}
                  onPointerMove={moveGesture}
                  onPointerUp={endGesture}
                  onPointerCancel={endGesture}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition active:scale-95 sm:h-12 sm:w-12 ${
                    isStanding
                      ? "border-slate-300 bg-white text-slate-900"
                      : "border-felt-700 bg-felt-700 text-white"
                  } ${isAvailable ? "" : "cursor-not-allowed opacity-30"}`}
                >
                  {pin}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Keep the standing-prop in sync for the next drag**

Because `dragStandingRef` is seeded at `startGesture` from the `standingPins`
prop, a fresh drag always starts from the committed state. No effect needed.
Verify there are no stale-closure bugs by reading the diff once.

- [ ] **Step 3: Build + unit tests**

Run: `npm test && npm run build`
Expected: PASS (no unit test exercises the DOM gesture; the helper test covers logic).

### Task C3: Verify Feature C in the browser

**Files:** none.

- [ ] **Step 1: Start preview at 390×844** (`preview_start` `bowling-companion`, `preview_resize` 390×844).

- [ ] **Step 2: Simulate a drag across the back row**

Clear IndexedDB, reload, start a session. Using `preview_eval`, dispatch a pointer sequence across pins 7→8→9→10 (pointerdown on 7, pointermove over 8/9/10 with their clientX/Y from `getBoundingClientRect`, pointerup). Assert all four become `aria-pressed="true"` in one stroke. Then drag the reverse direction starting on a standing pin and assert they clear (single deselect mode). Assert the page did not scroll: `window.scrollY === 0` after the drag.

- [ ] **Step 3: Stop preview** (`preview_stop`).

### Task C4: Docs + commit for Feature C

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: CHANGELOG entry**

```markdown
- **Slide-to-select pins.** Drag across the pin deck to toggle several pins in
  one stroke. The first pin sets the stroke's mode (select or deselect); the
  rest follow it, so a single drag never both adds and removes. Pure mode-lock
  logic in `src/lib/pinGesture.ts`.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: slide-to-select on the pin deck

Drag across pins to toggle many in one stroke. The first pin locks the gesture
mode (select/deselect) via src/lib/pinGesture.ts; subsequent pins under the
finger follow that mode (idempotent), so one stroke never both selects and
deselects. Pointer Events + setPointerCapture + elementFromPoint for touch;
touch-action:none stops the page scrolling mid-drag.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## FEATURE A — Edit previously-entered frames

Add an edit path to the controller and make scorecard frames tappable. Editing a frame re-bowls only that frame; later frames keep their stored shots; totals + completion recompute.

### Task A1: `beginEdit` + `completeEdit` in the controller

**Files:**
- Modify: `src/lib/frameController.ts`
- Test: `src/lib/frameController.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/frameController.test.ts`:
```ts
import {
  beginEdit,
  completeEdit
} from "./frameController";

describe("frame editing", () => {
  function playOpen(state, s1, s2) {
    state = submitShot(state, s1).state;
    return submitShot(state, s2).state;
  }

  it("re-bowls one past frame without disturbing later frames", () => {
    // Frame 1 strike, frame 2 open 9, frame 3 open 8.
    let state = createInitialFrameControllerState();
    state = submitShot(state, []).state;            // F1 strike
    state = playOpen(state, [10], [10]);            // F2 = 9
    state = playOpen(state, [9, 10], [9, 10]);      // F3 = 8
    expect(state.currentFrameNumber).toBe(4);

    // Edit frame 2 -> re-bowl as a spare (shot1 leaves [10], shot2 clears).
    const editing = beginEdit(state, 2);
    expect(editing.currentFrameNumber).toBe(2);
    expect(editing.currentShot).toBe(1);

    let edited = submitShot(editing, [10]).state;   // F2 shot1: 9
    const result = completeEdit(submitShot(edited, []), state); // F2 shot2: spare

    // Frame 3 still present; live position restored to frame 4.
    expect(result.state.currentFrameNumber).toBe(4);
    const f2 = result.state.frames.find((f) => f.frame_number === 2);
    const f3 = result.state.frames.find((f) => f.frame_number === 3);
    expect(f2?.is_spare).toBe(true);
    expect(f3).toBeDefined();
  });

  it("editing the 10th re-derives completion", () => {
    let state = createInitialFrameControllerState();
    for (let n = 1; n < 10; n += 1) state = playOpen(state, [10], [10]);
    // 10th open: 9 then 9, game complete.
    state = submitShot(state, [10]).state;
    state = submitShot(state, [10]).state;
    expect(state.isComplete).toBe(true);

    // Edit the 10th to a strike on ball 1 -> now needs bonus shots, not complete.
    const editing = beginEdit(state, 10);
    const afterFirst = submitShot(editing, []);
    const result = completeEdit(afterFirst, state);
    expect(result.state.isComplete).toBe(false);
    expect(result.state.currentFrameNumber).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/frameController.test.ts -t "frame editing"`
Expected: FAIL — `beginEdit` / `completeEdit` not exported.

- [ ] **Step 3: Implement `beginEdit` and `completeEdit`**

Add to `src/lib/frameController.ts`. `beginEdit` returns a controller scoped to re-bowl one frame, remembering nothing in state itself — the caller passes the pre-edit state back into `completeEdit` to restore the live position and re-derive completion.

```ts
/**
 * Enter edit mode for one already-recorded frame: re-bowl it from shot 1.
 * Frames keep their stored shots; only the chosen frame is re-captured.
 */
export function beginEdit(
  state: FrameControllerState,
  frameNumber: number
): FrameControllerState {
  return {
    ...state,
    currentFrameNumber: frameNumber,
    currentShot: 1,
    availablePins: ALL_PINS,
    standingPins: [],
    isComplete: false
  };
}

/**
 * Finish an in-progress edit. `editResult` is the result of the final
 * submitShot during editing; `liveState` is the controller state captured
 * before the edit began. Returns the merged frames with the live position
 * restored and completion re-derived from the full frame set.
 */
export function completeEdit(
  editResult: ShotSubmissionResult,
  liveState: FrameControllerState
): ShotSubmissionResult {
  const frames = editResult.state.frames;
  const complete = isGameComplete(frames);

  // If the edited game is now complete, stay on frame 10; otherwise restore
  // the live cursor, clamped so it never points past an unfinished frame.
  const restored = complete
    ? { currentFrameNumber: 10, currentShot: 1 as ActiveShot }
    : resumePosition(frames);

  return {
    savedFrame: editResult.savedFrame,
    state: {
      ...liveState,
      frames,
      currentFrameNumber: restored.currentFrameNumber,
      currentShot: restored.currentShot,
      availablePins: ALL_PINS,
      standingPins: [],
      isComplete: complete
    }
  };
}
```

Add two small private helpers built on the existing `hydrateFrameController`
logic (reuse it to avoid duplicating the 10th-frame rules):
```ts
function isGameComplete(frames: Frame[]): boolean {
  return hydrateFrameController(frames).isComplete;
}

function resumePosition(frames: Frame[]): {
  currentFrameNumber: number;
  currentShot: ActiveShot;
} {
  const h = hydrateFrameController(frames);
  return { currentFrameNumber: h.currentFrameNumber, currentShot: h.currentShot };
}
```

Note: `hydrateFrameController` already returns the correct resume frame/shot and
completion for any frame set, so editing reuses it directly.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/frameController.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/frameController.ts src/lib/frameController.test.ts
git commit -m "feat: frameController edit path (beginEdit/completeEdit)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A2: Make Scorecard frames tappable

**Files:**
- Modify: `src/components/Scorecard.tsx`

- [ ] **Step 1: Add an optional `onEditFrame` prop and an editing highlight**

Update the props and the cell render. When `onEditFrame` is provided, each
frame cell becomes a `<button>` calling `onEditFrame(frameNumber)`; the cell
under edit (`editingFrameNumber`) gets a distinct ring.

```tsx
interface ScorecardProps {
  frames: Frame[];
  activeFrameNumber: number;
  editingFrameNumber?: number | null;
  onEditFrame?: (frameNumber: number) => void;
}
```

In the cell wrapper, when `onEditFrame` exists, wrap the cell content in a
button:
```tsx
const editable = Boolean(onEditFrame);
const isEditing = editingFrameNumber === cell.frameNumber;
// className adds: isEditing ? "ring-2 ring-felt-700" : isActive ? "bg-lane-50" : "bg-white"
```
Render the existing cell markup inside:
```tsx
{editable ? (
  <button
    type="button"
    onClick={() => onEditFrame?.(cell.frameNumber)}
    className="block w-full text-left"
    aria-label={`Edit frame ${cell.frameNumber}`}
  >
    {/* existing FrameCell content */}
  </button>
) : (
  /* existing FrameCell content unchanged */
)}
```
Keep the compact (mobile) and `sm+` layouts both wired to the same handler.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS (prop is optional; existing callers compile).

### Task A3: Wire edit mode into ActiveGameScorer

**Files:**
- Modify: `src/components/ActiveGameScorer.tsx`

- [ ] **Step 1: Hold edit state and pass through the controller**

Add `editingFrame` state and a saved-live-state ref. When a scorecard frame is
tapped, capture the current live `gameState`, then `beginEdit`. The existing
`recordShot` already calls `submitShot`; in edit mode, route the final shot of
the frame through `completeEdit` and persist with `onFrameComplete`.

Concretely:
```tsx
import { beginEdit, completeEdit } from "../lib/frameController";
// ...
const [editingFrame, setEditingFrame] = useState<number | null>(null);
const liveStateRef = useRef(gameState);

function startEdit(frameNumber: number) {
  if (editingFrame !== null) return;
  liveStateRef.current = gameState;
  setEditingFrame(frameNumber);
  setGameState(beginEdit(gameState, frameNumber));
  setStatusMessage(`Editing frame ${frameNumber}`);
}

function cancelEdit() {
  setGameState(liveStateRef.current);
  setEditingFrame(null);
  setStatusMessage("");
}
```

Modify `recordShot` so that, while editing, a completed frame routes through
`completeEdit`, persists, and exits edit mode:
```tsx
async function recordShot() {
  const submission = submitShot(gameState, gameState.standingPins);

  if (editingFrame !== null) {
    // Did this shot finish the edited frame? A finished frame yields a
    // savedFrame, OR the edited frame advanced (currentFrameNumber changed).
    const frameDone =
      submission.savedFrame !== null ||
      submission.state.currentFrameNumber !== editingFrame;
    if (!frameDone) {
      setGameState(submission.state);
      return;
    }
    const merged = completeEdit(submission, liveStateRef.current);
    setGameState(merged.state);
    setEditingFrame(null);
    try {
      const editedFrame =
        merged.state.frames.find((f) => f.frame_number === editingFrame) ?? null;
      if (editedFrame) await onFrameComplete?.(editedFrame);
      setStatusMessage(`Frame ${editingFrame} updated.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Save failed.");
    }
    return;
  }

  // ...existing non-edit path unchanged...
}
```

Pass the edit props to the scorecard:
```tsx
<Scorecard
  frames={gameState.frames}
  activeFrameNumber={gameState.currentFrameNumber}
  editingFrameNumber={editingFrame}
  onEditFrame={startEdit}
/>
```

Show a Cancel button while editing (next to Record):
```tsx
{editingFrame !== null && (
  <button
    type="button"
    onClick={cancelEdit}
    className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
  >
    Cancel edit
  </button>
)}
```
(Keep Reset/Record; when editing, the grid + Record operate on the edited
frame exactly as normal scoring.)

- [ ] **Step 2: Keep `useRef` import**

Ensure `useRef` is imported from "react" (add to the existing import).

- [ ] **Step 3: Build + unit tests**

Run: `npm test && npm run build`
Expected: PASS.

### Task A4: e2e for editing

**Files:**
- Modify: `e2e/score.spec.ts`

- [ ] **Step 1: Add an edit test**

Append to `e2e/score.spec.ts`:
```ts
test("editing a past frame updates totals", async ({ page }) => {
  await startSession(page, "Edit Lanes");
  await recordShot(page, []);        // F1 strike
  await recordShot(page, [10]);      // F2 shot1 = 9
  await recordShot(page, [10]);      // F2 shot2 = open (9)

  // Tap frame 1 on the scorecard to edit it.
  await page.getByRole("button", { name: "Edit frame 1" }).click();
  await expect(page.getByText(/Editing frame 1/i)).toBeVisible();

  // Re-bowl frame 1 as an open 9 instead of a strike.
  await recordShot(page, [10]);      // shot1 = 9
  await recordShot(page, [10]);      // shot2 = open
  await expect(page.getByText(/Frame 1 updated/i)).toBeVisible();

  // Frame 1 no longer shows a strike symbol; a numeric total appears.
  await expect(page.getByText("X").first()).toHaveCount(0);
});
```
Note: `recordShot` helper already records the pins-left-standing set; under the
inverted model from Feature B it still works (it computes which pins to tap).

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e`
Expected: PASS (all scoring + backup + edit specs).

### Task A5: Docs + commit for Feature A

**Files:**
- Modify: `docs/CHANGELOG.md`, `docs/ROADMAP.md`

- [ ] **Step 1: CHANGELOG entry**

```markdown
- **Edit previous frames.** Tap any frame on the scorecard to re-score it; the
  frame highlights, the pin grid re-captures its shots, and totals + completion
  recompute on save. Later frames keep their recorded shots. Cancel restores the
  pre-edit state.
```

- [ ] **Step 2: Move ROADMAP items to Shipped**

In `docs/ROADMAP.md`, under `## Shipped (2026-06)`, add:
```markdown
- ✅ Inverted pin input (start down, tap to leave standing).
- ✅ Slide-to-select on the pin deck.
- ✅ Editing previously-entered frames.
```
Remove the now-shipped "Editing previously-entered frames" entry from "High
impact" and the "Pin-input ergonomics" entry from "Medium impact".

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: edit previously-entered frames

Tap a scorecard frame to re-bowl it inline. The controller's beginEdit/
completeEdit re-capture that frame's shots and re-derive totals + completion via
the existing hydrate logic; later frames keep their stored shots. ActiveGameScorer
holds editingFrame + a saved live-state ref, routes the final edited shot through
completeEdit, and shows Cancel. Scorecard frames become tappable when onEditFrame
is supplied. e2e covers tap-frame -> re-score -> totals update.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all three features)

- [ ] `npm test` — all unit suites green (frameController, pinGesture, scoring, stats, scoreDisplay, backup, repository, scorecard).
- [ ] `npm run build` — tsc + vite + PWA generation succeed.
- [ ] `npm run test:e2e` — scoring, backup, edit specs green.
- [ ] Preview at 390×844: inverted input, slide-select, and frame editing all work; no horizontal overflow on any view.
- [ ] `docs/CHANGELOG.md`, `docs/DECISIONS.md` (ADR-006), `docs/ROADMAP.md` updated.

## Self-review notes

- **Spec coverage:** B (invert) → Tasks B1–B4; C (slide) → C1–C4; A (edit) → A1–A5. All three spec features mapped.
- **Type consistency:** `GestureMode`, `applyGesture`, `modeFor` consistent across C1/C2. `beginEdit`/`completeEdit` signatures consistent across A1/A3. `completeFrame`'s renamed param (`nextAvailablePins`) is internal only.
- **Data model:** unchanged across all tasks (ADR-001 holds; ADR-006 added).
- **Reuse:** editing reuses `hydrateFrameController` for completion + resume rather than duplicating 10th-frame rules.
