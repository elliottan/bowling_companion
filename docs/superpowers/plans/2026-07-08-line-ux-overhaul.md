# Line-entry UX + Lane Visualizer Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make line entry (score screen) and the ball-path visualizer honest and
intuitive: derived laydown from stance, breakpoint never below the target, spare
shots get spare mode, no off-lane curves, tap-to-lock pegs, arrow steppers, a
decompressed pin deck with a pocket-snap chip, dynamic hook-slider bounds, and a
header-free full-height lane.

**Architecture:** Geometry invariants land first in `src/lib/laneGeometry.ts`
(pure, test-driven). A new per-user `laydown_offset` setting flows through a new
React context (mirroring `HandednessContext`). All UI changes layer on top in
`LaneVisualizer.tsx` / `LaneSurface.tsx` / `ActiveGameScorer.tsx`. No schema
migration: `LineSpec` already has both `stance` and `laydown`.

**Tech Stack:** React 18 + TypeScript + Tailwind, Dexie settings table, Vitest +
@testing-library/react. Test command: `npx vitest run <file>` (or `npm test` for all).

**Decisions locked in (grill-me interview, 2026-07-07):**
1. Laydown = `stance − offset` (hand-relative boards, both hands mirror). Offset
   is a per-user setting (default 6) in Settings → Preferences next to
   handedness. Dragging the laydown peg writes an explicit `laydown` that
   overrides the derivation for that line. No migration.
2. Score entry keeps Stance/Target/Breakpoint and adds a **read-only derived
   laydown chip** (tap → opens the visualizer).
3. Breakpoint is honest: apex candidates start at the target depth (never the
   foul line); the marker is **hidden** when the line has no genuine outward
   apex (straight / inward / unreachable-final lines). No fake points.
4. Replay button deleted. Tap-on-lane replays; the animated ball is styled as an
   obvious amber ball and fades out at the path end.
5. Hook sliders get **dynamic min/max** computed from the current line (dead
   zones impossible by construction) + bigger touch targets.
6. Drawn curve never exits boards 1–39 (laydown loft margin excepted) — the
   spare hook zone gets the same lane cap strikes already have.
7. Pin deck decompressed via constants (linear y-scale stays — no distortion);
   "Pocket" chip (strike) / "Re-aim" chip (spare) snaps the final back.
8. Steppers use screen-spatial ◀/▶ arrows (hand-mirrored board math), matching
   the score-entry pattern. Depth field (Final ft) keeps −/+.
9. Tap a peg to hard-lock it (laydown/target/final only, max 2). Locked pegs:
   no drag, disabled steppers, solver edits that would move them are rejected
   ("stops at the wall"). Breakpoint cascade give-way skips locked pegs.
10. Header row removed. X floats top-right; view toggle + hook options float
    top-left. Lane renders full height.

---

## File Structure

| File | Change |
|---|---|
| `src/lib/laneGeometry.ts` | Apex-≥-target rule, `apexReal` flag, spare lane cap, `DRAW_BACK_FEET` bump |
| `src/lib/laneGeometry.test.ts` | New invariant tests; update any literal-constant expectations |
| `src/lib/laydownOffsetContext.ts` | **New** — context + `DEFAULT_LAYDOWN_OFFSET` + `deriveLaydown()` |
| `src/services/bowlingRepository.ts` (+ test) | `getLaydownOffset` / `setLaydownOffset` |
| `src/App.tsx` | Load setting, provide context, plumb to SettingsView |
| `src/views/SettingsView.tsx`, `src/views/HandednessView.tsx` | Laydown-offset control in Preferences |
| `src/components/LaneVisualizer.tsx` (+ test) | Strike laydown seed, replay removal, dynamic sliders, chips, arrows, locks, floating controls |
| `src/components/LaneSurface.tsx` (+ test) | Ball styling/fade, deck decompression |
| `src/components/ActiveGameScorer.tsx` | Laydown chip, spare context to visualizer |
| `docs/DECISIONS.md`, `docs/CHANGELOG.md` | ADR-028 + changelog entry |

Task order matters: 1–3 (geometry) → 4–7 (laydown + spare wiring) → 8–13 (visualizer UI) → 14 (docs + gate).

---

### Task 1: Honest derived breakpoint (apex ≥ target depth, hidden when not real)

The bug: `hookGeomRaw` seeds the apex scan at the **laydown (0 ft)** and
`strikeApexPoint`'s unreachable branch returns `feet: 0` — that's the
"Bkpt 20·0ft below the target" screenshot. Fix: apex candidates start at the
target; a marker is only shown when the apex genuinely swings outside the
target board ("real"). Stored `breakpoint`/`breakpoint_distance` keep being
written (non-null `breakpoint` still flags a strike line) but can never sit
above (shallower than) the target depth again.

**Files:**
- Modify: `src/lib/laneGeometry.ts:141-197` (HookGeom + hookGeomRaw), `:268-285` (strikeApexPoint), `:445-482` (buildLinePath branches)
- Test: `src/lib/laneGeometry.test.ts`

- [ ] **Step 1: Write the failing tests** (append to the `buildLinePath` describe block in `laneGeometry.test.ts`; `arrowFeet` is already exported from `./laneGeometry` — add it to the test file's import list):

```ts
it("no breakpoint marker when the final is unreachable — the straight-ride case (ADR-028)", () => {
  // Screenshot bug: laydown 20 → target 22 (inward, RH) with pocket final is
  // unreachable; the marker used to sit at the foul line (board 20, 0 ft).
  const r = buildLinePath({ laydown: 20, target: 22, breakpoint: 8, final_board: 17.5 }, "right")!;
  expect(r.points.breakpoint).toBeNull();
});

it("no breakpoint marker on a purely inward reachable line (ADR-028)", () => {
  // Everything moves inward; there is no outward apex to mark.
  const r = buildLinePath({ laydown: 20, target: 22, breakpoint: 8, final_board: 30 }, "right")!;
  expect(r.points.breakpoint).toBeNull();
});

it("a real out-and-back hook keeps its breakpoint marker (ADR-028)", () => {
  const r = buildLinePath({ laydown: 20, target: 15, breakpoint: 8, breakpoint_distance: 42, final_board: 17.5 }, "right")!;
  expect(r.points.breakpoint).not.toBeNull();
});

it("stored breakpoint_distance never sits shallower than the target depth (ADR-028)", () => {
  const solved = solveLine({ laydown: 20, target: 22, breakpoint: 8, final_board: 17.5 }, "right");
  expect(solved.breakpoint_distance!).toBeGreaterThanOrEqual(arrowFeet(22) - 1e-6);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/laneGeometry.test.ts`
Expected: the four new tests FAIL (breakpoint non-null / distance 0); all others pass.

- [ ] **Step 3: Implement in `laneGeometry.ts`**

3a. `HookGeom` interface — add the flag:

```ts
interface HookGeom {
  dS: number; dE: number;                        // effective (clamped) hook span
  pts: Array<{ board: number; feet: number }>;   // path samples, ft = fF·k/N, k = 1…N
  apex: { board: number; feet: number };         // furthest-out at/past the target depth; deepest on ties; board ∈ [1,39]
  apexReal: boolean;                             // apex swings genuinely outside the target board (ADR-028) — drives the marker
  hookRawBoard: number;                          // hook-zone extreme (ft > tgtFt only), unclamped — drives the on-lane cap
}
```

3b. In `hookGeomRaw`, replace the apex seeding + scan. Change:

```ts
  const moreOut = (a: number, b: number) => (p.dir > 0 ? a < b : a > b);
  let extB = p.foul, extFt = 0; // laydown is furthest-out on an inside line
  // Furthest-out wins; on a board tie (laydown == target: the whole skid rides
  // one board) the DEEPEST point wins, so the breakpoint sits at/past the
  // target, never back at the foul line.
  const consider = (b: number, f: number) => {
    if (moreOut(b, extB) || (Math.abs(b - extB) < 1e-6 && f > extFt)) { extB = b; extFt = f; }
  };
  consider(p.tgt, p.tgtFt);
```

to:

```ts
  const moreOut = (a: number, b: number) => (p.dir > 0 ? a < b : a > b);
  // Apex candidates start AT THE TARGET (ADR-028): the breakpoint is the
  // furthest-out point at/past the target depth. The laydown and the skid below
  // the arrows are excluded, so a straight or inward line can no longer report
  // an apex at the foul line. Deepest point wins board ties.
  let extB = p.tgt, extFt = p.tgtFt;
  const consider = (b: number, f: number) => {
    if (moreOut(b, extB) || (Math.abs(b - extB) < 1e-6 && f > extFt)) { extB = b; extFt = f; }
  };
```

3c. In the same function's sampling loop, restrict apex candidates to at/past the target depth. Change:

```ts
    const b = board(ft);
    consider(b, ft);
    if (ft > p.tgtFt) considerHook(b);
```

to:

```ts
    const b = board(ft);
    if (ft >= p.tgtFt) consider(b, ft);
    if (ft > p.tgtFt) considerHook(b);
```

3d. Return the flag (replace the return statement):

```ts
  // Real apex: the ball genuinely swings outside the target board before
  // recovering (> ¼ board, so float noise on a dead-straight skid doesn't
  // conjure a marker). Not real ⇒ the marker is hidden.
  const apexReal = p.dir * (p.tgt - extB) > 0.25;
  return { dS, dE, pts, apex: { board: clamp(extB, 1, 39), feet: extFt }, apexReal, hookRawBoard: hookB };
```

3e. `strikeApexPoint` — return the flag and floor the unreachable branch at the target depth. New signature + body changes:

```ts
export function strikeApexPoint(line: LineSpec, hand: Handedness): { board: number; feet: number; dS: number; len: number; real: boolean } | null {
```

Unreachable branch (`if (dir * (fB - p.focalBoard(fF)) <= 0)`), replace the return with:

```ts
    // Unreachable: the ball rides the focal straight — there is no hook, so no
    // real apex (ADR-028). Stored values floor at the target depth, never 0 ft.
    const endB = p.focalBoard(fF), outEnd = !moreOut(foul, endB); // ties → deep end
    const g = hookGeomRaw(p, t.dS, t.len); // effective timing for the write-back
    return {
      board: clamp(outEnd ? endB : line.target, 1, 39),
      feet: outEnd ? fF : p.tgtFt,
      dS: g.dS, len: g.dE - g.dS, real: false,
    };
```

Reachable tail, replace the return with:

```ts
  const g = hookGeom(p, t.dS, t.len, true);
  return { board: g.apex.board, feet: g.apex.feet, dS: g.dS, len: g.dE - g.dS, real: g.apexReal };
```

3f. `buildLinePath` — hide the marker when not real. In the **unreachable** branch replace:

```ts
    const breakpoint = pt(boardToX(clamp(outEnd ? endB : foul, 1, 39), hand, true), feetToY(outEnd ? end : 0));
    return { d, focal, miss, points: { laydown, target, hookStart: null, breakpoint, final } };
```

with:

```ts
    // No hook ⇒ no breakpoint marker (ADR-028).
    return { d, focal, miss, points: { laydown, target, hookStart: null, breakpoint: null, final } };
```

(The `outEnd`/`endB` locals become unused in this branch — delete them.)

In the **strike** branch replace:

```ts
    const breakpoint = pt(boardToX(g.apex.board, hand, true), feetToY(g.apex.feet));
```

with:

```ts
    const breakpoint = g.apexReal ? pt(boardToX(g.apex.board, hand, true), feetToY(g.apex.feet)) : null;
```

In the **spare** branch replace:

```ts
  const spBreakpoint = pt(boardToX(sg.apex.board, hand, true), feetToY(sg.apex.feet));
```

with:

```ts
  const spBreakpoint = sg.apexReal ? pt(boardToX(sg.apex.board, hand, true), feetToY(sg.apex.feet)) : null;
```

Also update the `LinePath.points.breakpoint` doc comment: `/** null when the line has no genuine outward apex (ADR-028). */`

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run src/lib src/components`
Expected: the four new tests PASS. If any existing test asserted a non-null
breakpoint for a straight/inward/unreachable line, update that test to the new
contract (marker null) — real out-and-back hook tests (e.g. "strict rightmost
point", "spareCurve ignores a stored breakpoint" with laydown 18 → target 10)
must still pass untouched, since those apexes are real.
Note: `LaneVisualizer` already renders "—" and no handle for a null breakpoint —
no UI change needed here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/laneGeometry.ts src/lib/laneGeometry.test.ts
git commit -m "fix(lane): breakpoint is honest — apex at/past target depth, marker hidden when no real hook (ADR-028)"
```

---

### Task 2: Spare hook zone gets the on-lane cap

Screenshot 2 bug: the spare curve bulges past the gutter (off the lane and off
screen). Strike mode already caps the hook zone to the lane
(`hookGeom(..., capToLane = true)`); spare mode calls `hookGeomRaw` directly.
Give spares the same cap. (The `miss` flag path — unreachable focal ride — is
untouched; the lofted-laydown skid margin is untouched by design.)

**Files:**
- Modify: `src/lib/laneGeometry.ts:472-481` (spare branch of `buildLinePath`)
- Test: `src/lib/laneGeometry.test.ts`

- [ ] **Step 1: Write the failing test** (needs `PLANE_W` in the test import list):

```ts
it("spare hook zone stays on the lane (ADR-028)", () => {
  // Screenshot case: deep cross-lane spare with a big hook used to bulge past
  // board 1 (x > PLANE_W for a right-hander) and off screen.
  const line: LineSpec = {
    laydown: 20, target: 6, final_board: 17.5, final_distance: 60,
    hook_start_distance: 24, hook_length: 20,
  };
  const r = buildLinePath(line, "right", true)!;
  const nums = r.d.replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
  for (let i = 0; i < nums.length; i += 2) {
    expect(nums[i]).toBeLessThanOrEqual(PLANE_W + 0.01);  // board 1 edge (RH)
    expect(nums[i]).toBeGreaterThanOrEqual(-0.01);         // board 39 edge
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/laneGeometry.test.ts`
Expected: FAIL — some x exceeds PLANE_W.

- [ ] **Step 3: Implement** — in the spare branch of `buildLinePath`, replace:

```ts
  const sg = hookGeomRaw(sp, st.dS, st.len);
```

with:

```ts
  // Same on-lane cap as strikes (ADR-028): a huge hook request shrinks the
  // hook start until the curve stays on the boards, instead of bulging past
  // the gutter. The miss flag (focal-ride) path above is unaffected.
  const sg = hookGeom(sp, st.dS, st.len, true);
```

Update the stale comment above the branch ("no on-lane cap" → remove that clause).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/laneGeometry.test.ts src/lib/solveLine.test.ts`
Expected: all PASS (the existing "spareCurve ignores a stored breakpoint"
shape-equality test compares two spare builds with identical timing, so the cap
applies equally to both — still passes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/laneGeometry.ts src/lib/laneGeometry.test.ts
git commit -m "fix(lane): spare hook zone capped to the lane — no more off-screen bulge (ADR-028)"
```

---

### Task 3: Decompress the pin deck

Linear y-scale stays (ADR-020 — no distortion). Decompress by giving the deck
more room: extend the drawing extent past the back row, spread the decorative
rack rows, and draw pins larger.

**Files:**
- Modify: `src/lib/laneGeometry.ts:30` (`DRAW_BACK_FEET`), `src/components/LaneSurface.tsx:10` (`RACK_ROW_DY`), `:141` (pin radius)

- [ ] **Step 1: Change the constants**

`laneGeometry.ts`:

```ts
export const DRAW_BACK_FEET = 65;       // room behind the back pin row (~62.6 ft) so the deck isn't crushed
```

`LaneSurface.tsx`:

```ts
const RACK_ROW_DY = 5; // plane-units between decorative pin-deck rows
```

and in the deck render, `const r = 3;` → `const r = 3.4;`

- [ ] **Step 2: Run unit tests; fix literal expectations**

Run: `npx vitest run src/lib src/components`
Expected: mapping tests that compute from the exported constants pass
unchanged; any test hard-coding a y value derived from `DRAW_BACK_FEET = 63.4`
must be updated to compute from the constant instead of the literal.

- [ ] **Step 3: Visual check**

Start the dev server (`preview_start` / `npm run dev`), open the Line sandbox
(Settings → line visualizer), and confirm in both views: back pin row fully
visible with clear separation between rows, no pin clipped at the top, ball
path still reaches the final marker. Adjust `RACK_ROW_DY` within 4.5–5.5 and
`r` within 3.2–3.6 if rows touch — the invariant is: back row top edge ≥ 2
plane-units below the SVG top (`feetToY(60) − 3·RACK_ROW_DY − r ≥ 2`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/laneGeometry.ts src/components/LaneSurface.tsx src/lib/laneGeometry.test.ts
git commit -m "feat(lane): decompress the pin deck — deeper draw extent, taller rack, bigger pins"
```

---

### Task 4: `laydown_offset` setting — repository, context, Settings UI

**Files:**
- Create: `src/lib/laydownOffsetContext.ts`
- Modify: `src/services/bowlingRepository.ts:6-26`, `src/App.tsx`, `src/views/SettingsView.tsx`, `src/views/HandednessView.tsx`
- Test: `src/services/bowlingRepository.test.ts`

- [ ] **Step 1: Write the failing repository test** (append to `bowlingRepository.test.ts`, following that file's existing setup pattern for db access):

```ts
describe("laydown offset setting", () => {
  it("defaults to 6 when unset", async () => {
    expect(await getLaydownOffset()).toBe(6);
  });
  it("round-trips a stored value", async () => {
    await setLaydownOffset(4.5);
    expect(await getLaydownOffset()).toBe(4.5);
  });
  it("falls back to the default on a garbage stored value", async () => {
    await setSetting("laydown_offset", "banana");
    expect(await getLaydownOffset()).toBe(6);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/services/bowlingRepository.test.ts` — FAIL: `getLaydownOffset` not exported.

- [ ] **Step 3: Create `src/lib/laydownOffsetContext.ts`**

```ts
import { createContext, useContext } from "react";

/** Default boards between the stance (slide foot) and where the ball touches
 *  down. Hand-relative board numbers mirror per hand, so `stance − offset`
 *  works unchanged for both hands (ADR-028). */
export const DEFAULT_LAYDOWN_OFFSET = 6;

export const LaydownOffsetContext = createContext<number>(DEFAULT_LAYDOWN_OFFSET);
export const useLaydownOffset = (): number => useContext(LaydownOffsetContext);

/** Derived laydown board for a stance, snapped to half-boards on the lane. */
export function deriveLaydown(stance: number, offset: number): number {
  return Math.max(1, Math.min(39, Math.round((stance - offset) * 2) / 2));
}
```

- [ ] **Step 4: Add repository accessors** (in `bowlingRepository.ts`, next to the handedness pair):

```ts
import { DEFAULT_LAYDOWN_OFFSET } from "../lib/laydownOffsetContext";

const LAYDOWN_OFFSET_KEY = "laydown_offset";

/** Boards between stance and laydown (ADR-028). Clamped sane; default 6. */
export async function getLaydownOffset(): Promise<number> {
  const v = Number(await getSetting(LAYDOWN_OFFSET_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 15 ? v : DEFAULT_LAYDOWN_OFFSET;
}

export async function setLaydownOffset(value: number): Promise<void> {
  await setSetting(LAYDOWN_OFFSET_KEY, String(value));
}
```

Run: `npx vitest run src/services/bowlingRepository.test.ts` — PASS.

- [ ] **Step 5: Wire App.tsx** (mirror the handedness pattern at `App.tsx:58,151-165,238`):

```tsx
import { LaydownOffsetContext, DEFAULT_LAYDOWN_OFFSET } from "./lib/laydownOffsetContext";
// add to the existing bowlingRepository import: getLaydownOffset, setLaydownOffset as persistLaydownOffset

const [laydownOffset, setLaydownOffsetState] = useState<number>(DEFAULT_LAYDOWN_OFFSET);

useEffect(() => {
  getLaydownOffset().then(setLaydownOffsetState).catch(() => {});
}, []);

function chooseLaydownOffset(value: number) {
  setLaydownOffsetState(value);
  void persistLaydownOffset(value).catch(() => {});
}
```

Wrap the tree just inside the existing provider:

```tsx
<HandednessContext.Provider value={handedness ?? "right"}>
  <LaydownOffsetContext.Provider value={laydownOffset}>
    {/* existing children unchanged */}
  </LaydownOffsetContext.Provider>
</HandednessContext.Provider>
```

Pass to settings: `laydownOffset={laydownOffset} onLaydownOffsetChange={chooseLaydownOffset}` on `<SettingsView …>`.

- [ ] **Step 6: Settings UI.** `SettingsView.tsx`: add `laydownOffset: number; onLaydownOffsetChange: (v: number) => void;` to props and forward both to `<HandednessView value={handedness} onChange={onHandednessChange} laydownOffset={laydownOffset} onLaydownOffsetChange={onLaydownOffsetChange} />`. In `HandednessView.tsx` extend props and append below the picker (inside the same `<section>`):

```tsx
<h2 className="mb-1 mt-8 text-base font-bold text-slate-950">Laydown offset</h2>
<p className="mb-3 text-sm text-slate-500">
  Boards between where you stand and where the ball touches down. The lane view
  derives your laydown as stance − offset; drag the laydown point to override it
  for a single line.
</p>
<div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
  <button
    type="button"
    aria-label="Decrease laydown offset"
    onClick={() => onLaydownOffsetChange(Math.max(0, laydownOffset - 0.5))}
    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg font-bold text-slate-600 hover:bg-slate-100"
  >
    −
  </button>
  <span className="w-12 text-center text-base font-bold tabular-nums text-slate-900">{laydownOffset}</span>
  <button
    type="button"
    aria-label="Increase laydown offset"
    onClick={() => onLaydownOffsetChange(Math.min(15, laydownOffset + 0.5))}
    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg font-bold text-slate-600 hover:bg-slate-100"
  >
    +
  </button>
</div>
```

- [ ] **Step 7: Verify + commit**

Run: `npm test` — all pass; `npx tsc --noEmit` clean. In the dev preview open
Settings → Preferences: offset stepper renders, persists across reload.

```bash
git add src/lib/laydownOffsetContext.ts src/services/bowlingRepository.ts src/services/bowlingRepository.test.ts src/App.tsx src/views/SettingsView.tsx src/views/HandednessView.tsx
git commit -m "feat(settings): per-user laydown offset (stance − offset → laydown, ADR-028)"
```

---

### Task 5: Visualizer seeds laydown from stance − offset

**Files:**
- Modify: `src/components/LaneVisualizer.tsx` (after the spare seeding effect, ~line 89)
- Test: `src/components/LaneVisualizer.test.tsx`

- [ ] **Step 1: Write the failing test:**

```tsx
import { LaydownOffsetContext } from "../lib/laydownOffsetContext";

it("strike mode seeds a missing laydown from stance − offset (ADR-028)", () => {
  const onChange = vi.fn();
  render(
    <HandednessContext.Provider value="right">
      <LaydownOffsetContext.Provider value={6}>
        <LaneVisualizer line={{ stance: 20, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </LaydownOffsetContext.Provider>
    </HandednessContext.Provider>
  );
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls[0][0]).toMatchObject({ stance: 20, laydown: 14 });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/LaneVisualizer.test.tsx` — FAIL (onChange not called).

- [ ] **Step 3: Implement.** In `LaneVisualizer.tsx`:

```tsx
import { useLaydownOffset, deriveLaydown } from "../lib/laydownOffsetContext";
// inside the component:
const laydownOffset = useLaydownOffset();

// Strike mode: derive a missing laydown from stance − per-user offset (ADR-028).
// Runs once while laydown is unset; a typed/dragged laydown then owns the value.
useEffect(() => {
  if (spare || !onChange || !line) return;
  if (line.laydown != null || line.stance == null) return;
  onChange({ ...line, laydown: deriveLaydown(line.stance, laydownOffset) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [spare, line?.stance, line?.laydown]);
```

- [ ] **Step 4: Run tests** — `npx vitest run src/components/LaneVisualizer.test.tsx` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LaneVisualizer.tsx src/components/LaneVisualizer.test.tsx
git commit -m "feat(lane): visualizer derives laydown from stance − offset (ADR-028)"
```

---

### Task 6: Derived-laydown chip on the score entry screen

**Files:**
- Modify: `src/components/ActiveGameScorer.tsx` (LineInput ~line 78-225, ShotDetailBar ~line 244-330)

- [ ] **Step 1: Add props + chip to `LineInput`.** Extend `LineInputProps`:

```tsx
  /** Derived laydown board (stance − offset, or the explicit override). Renders a read-only chip. */
  derivedLaydown?: number;
  /** Tap on the laydown chip — opens the lane visualizer. */
  onLaydownTap?: () => void;
```

Destructure both in the signature, and render the chip directly after the fields row `</div>` (before the focus-reveal adjusters):

```tsx
{derivedLaydown != null && (
  <button
    type="button"
    onClick={onLaydownTap}
    title="Derived laydown board (stance − offset). Tap to view on the lane."
    className="mt-1 inline-flex h-6 items-center gap-1 rounded-full bg-slate-100 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-200"
  >
    Laydown {derivedLaydown}
  </button>
)}
```

- [ ] **Step 2: Feed it from `ShotDetailBar`.** Add imports `useLaydownOffset, deriveLaydown` from `"../lib/laydownOffsetContext"`. Inside `ShotDetailBar`:

```tsx
const laydownOffset = useLaydownOffset();
const derivedLaydown =
  intended?.laydown ??
  (intended?.stance != null ? deriveLaydown(intended.stance, laydownOffset) : undefined);
```

and on the Intended `<LineInput …>`: `derivedLaydown={derivedLaydown} onLaydownTap={() => setShowViz(true)}`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm test` green. Dev preview: enter a stance of 20 on the Intended line → chip reads "Laydown 14"; tap opens the visualizer; drag the laydown peg, close → chip shows the dragged value.

- [ ] **Step 4: Commit**

```bash
git add src/components/ActiveGameScorer.tsx
git commit -m "feat(scorer): read-only derived-laydown chip on the intended line (ADR-028)"
```

---

### Task 7: Spare shots open the visualizer in spare mode

Root cause of the "green Final 17.5 on a spare shot" screenshot:
`ActiveGameScorer.tsx:311` renders `<LaneVisualizer>` with no `spare`/`leave`,
so a spare attempt gets strike mode and a pocket-defaulted final.

**Files:**
- Modify: `src/components/ActiveGameScorer.tsx` (ShotDetailBar props ~line 227-330, render call ~line 857-875)

- [ ] **Step 1: Add the prop.** `ShotDetailBarProps` gains:

```tsx
  /** Standing leave the shot faces (spare attempt) — undefined on a fresh rack. */
  spareLeave?: PinNumber[];
```

Destructure it; change the visualizer render (`ActiveGameScorer.tsx:310-317`) to:

```tsx
{showViz && (
  <LaneVisualizer
    title="Intended line"
    line={intended}
    onChange={onIntendedChange}
    spare={!!spareLeave?.length}
    leave={spareLeave}
    onClose={() => setShowViz(false)}
  />
)}
```

- [ ] **Step 2: Compute the leave in `ActiveGameScorer`.** Above the JSX return (near `detailKey`):

```tsx
// Leave the viewed shot faces: live entry uses the current available pins;
// editing derives from the pins entering the selected shot. Fresh rack ⇒ none.
const shownLeave = (() => {
  if (isEditing && recordedFrame && selectedShot) {
    const avail = availableEnteringShot(recordedFrame, selectedShot.shotIndex);
    return avail && avail.length < 10 ? avail : undefined;
  }
  return gameState.availablePins.length < 10 ? gameState.availablePins : undefined;
})();
```

and pass `spareLeave={shownLeave}` on `<ShotDetailBar …>`.

- [ ] **Step 3: Verify.** `npm test` green. Dev preview: record a first ball
leaving pins, then tap "View intended line" on the second ball — the visualizer
lights the leave, seeds the aim at the leave (not the pocket), and shows the
spare stepper cluster (Final ft present). A fresh-rack 10th-frame bonus ball
still opens strike mode.

- [ ] **Step 4: Commit**

```bash
git add src/components/ActiveGameScorer.tsx
git commit -m "fix(scorer): spare attempts open the visualizer in spare mode with the real leave"
```

---

### Task 8: Delete the replay button; tap-to-replay; obvious ball that fades out

**Files:**
- Modify: `src/components/LaneVisualizer.tsx:1` (imports), `:102-117` (tilt handlers), `:279-290` (replay button)
- Modify: `src/components/LaneSurface.tsx:189-196` (ball)

- [ ] **Step 1: Remove the button.** Delete the whole "Replay the ball animation" `<button>` block (`LaneVisualizer.tsx:279-290`) and drop `RotateCcw` from the lucide import.

- [ ] **Step 2: Tap-on-lane replays.** In the tilt drag handlers, track movement and fire on a clean tap:

```tsx
const tiltMoved = useRef(0);

function onPointerDown(e: React.PointerEvent) {
  dragY.current = e.clientY;
  tiltMoved.current = 0;
  setDragging(true);
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onPointerMove(e: React.PointerEvent) {
  if (dragY.current === null) return;
  const dy = e.clientY - dragY.current;
  dragY.current = e.clientY;
  tiltMoved.current += Math.abs(dy);
  setDeg((d) => clamp(d + dy * 0.4, TOPDOWN_DEG, BOWLER_DEG));
}
function onPointerUp() {
  // A tap (no real tilt movement) replays the shot — replaces the old button.
  if (dragY.current !== null && tiltMoved.current < 4) setReplayKey((k) => k + 1);
  dragY.current = null;
  setDragging(false);
}
```

- [ ] **Step 3: Ball styling + fade.** In `LaneSurface.tsx` replace both animated-ball blocks (`:189-196`) with:

```tsx
{path && animate && !reduceMotion && (
  <circle key={animateKey} data-role="ball" r="3" fill="#f59e0b" stroke="#fff" strokeWidth="0.8" opacity="0.95">
    <animateMotion dur="1.4s" repeatCount="1" fill="freeze" path={path.d} />
    {/* Fade out at the pins — a frozen resting dot read as a mystery marker. */}
    <animate attributeName="opacity" begin="1.5s" dur="0.35s" from="0.95" to="0" fill="freeze" />
  </circle>
)}
```

(The `reduceMotion` static-ball block is deleted — the final peg already marks
the endpoint; `reduceMotion` stays in use guarding the animated block.)

- [ ] **Step 4: Verify.** `npx vitest run src/components` — if any test queries
the replay button (`aria-label="Replay shot"`), delete that assertion. Dev
preview: edit a line → shot auto-replays; tap the lane → replays; ball is amber
and vanishes at the pins; dragging the lane still tilts without replaying.

- [ ] **Step 5: Commit**

```bash
git add src/components/LaneVisualizer.tsx src/components/LaneSurface.tsx src/components/LaneVisualizer.test.tsx
git commit -m "feat(lane): tap-to-replay replaces the replay button; ball reads as a ball and fades out"
```

---### Task 9: Hook sliders — dynamic bounds + bigger touch targets

The solver clamps hook start to `[targetDepth+1, final−2]` and the span end to
`final−0.5` (`laneGeometry.ts:151-152`), so the static 20–55 / 4–25 slider
ranges contain dead zones where dragging does nothing. Compute the real bounds
from the line and hand them to the slider; the whole track is then live.

**Files:**
- Modify: `src/components/LaneVisualizer.tsx:346-413` (OptionsSheet + Slider)

- [ ] **Step 1: Dynamic bounds in `OptionsSheet`.** Extend the laneGeometry import in `LaneVisualizer.tsx` with `arrowFeet, ARROWS_FEET, LANE_FEET, HOOK_START_FT, HOOK_LENGTH_FT`. Replace the two `<Slider …>` calls:

```tsx
function OptionsSheet({ line, onChange, onClose }: { /* unchanged */ }) {
  // Live bounds mirroring the solver's clamps (laneGeometry hookGeomRaw): the
  // whole track is always draggable — no dead zones to explain.
  const fF = line?.final_distance ?? LANE_FEET;
  const tgtFt = line?.target != null ? arrowFeet(line.target) : ARROWS_FEET;
  const dS = line?.hook_start_distance ?? HOOK_START_FT;
  const startMin = Math.ceil(tgtFt + 1);
  const startMax = Math.floor(fF - 2);
  const lenMax = Math.max(4, Math.floor(fF - 0.5 - dS));
  return (
    /* wrapper unchanged … */
    <Slider
      label="Hook start" suffix="ft" min={startMin} max={startMax} step={1}
      value={clamp(dS, startMin, startMax)}
      onChange={(v) => onChange({ hook_start_distance: v })}
    />
    <Slider
      label="Hook length" suffix="ft" min={4} max={lenMax} step={1}
      value={clamp(line?.hook_length ?? HOOK_LENGTH_FT, 4, lenMax)}
      onChange={(v) => onChange({ hook_length: v })}
    />
    /* … */
  );
}
```

- [ ] **Step 2: Fatter slider + bounds readout.** Replace the `Slider` body:

```tsx
function Slider({ label, suffix, min, max, step, value, onChange }: { /* unchanged */ }) {
  return (
    <label className="mb-3 block py-1">
      <div className="mb-1 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-white/70">
        <span>{label}</span>
        <span className="tabular-nums text-white/90">{Math.round(value)} {suffix}</span>
      </div>
      {/* h-8 input = a finger-sized native hit area; the track/thumb stay themed via accent. */}
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full cursor-pointer accent-amber-400"
      />
      <div className="flex justify-between text-[10px] tabular-nums text-white/40">
        <span>{min} {suffix}</span>
        <span>{max} {suffix}</span>
      </div>
    </label>
  );
}
```

- [ ] **Step 3: Verify.** Existing LaneVisualizer slider test ("same pair in
strike and spare mode") still passes: `npx vitest run src/components/LaneVisualizer.test.tsx`.
Dev preview: open Hook options on a spare with a 58 ft final — Hook start max
reads 56 → now 56 is reachable and every position moves the drawn curve; end
labels show the live range.

- [ ] **Step 4: Commit**

```bash
git add src/components/LaneVisualizer.tsx
git commit -m "feat(lane): hook sliders use live solver bounds + finger-sized hit area"
```

---

### Task 10: Pocket / Re-aim snap chip

**Files:**
- Modify: `src/components/LaneVisualizer.tsx:292-328` (stepper clusters)

- [ ] **Step 1: Implement.** Inside the component (near `bp` derivation) add:

```tsx
// Snap targets for the final: the pocket (strike) or the leave's ideal aim (spare).
const spareAim = spare && leave?.length ? spareAimPoint(leave, hand) : undefined;
const finalOffPocket = (line?.final_board ?? POCKET_BOARD) !== POCKET_BOARD;
const finalOffAim =
  spareAim != null &&
  (line?.final_board !== snapBoard(spareAim.board) ||
    (line?.final_distance ?? LANE_FEET) !== Math.round(spareAim.feet * 10) / 10);
```

In the **strike** cluster, after the Final `StepperField`:

```tsx
{finalOffPocket && (
  <button
    type="button"
    onClick={() => applyEdit({ final_board: POCKET_BOARD })}
    className="self-end rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/25"
  >
    Pocket
  </button>
)}
```

In the **spare** cluster, after the Final ft `StepperField`:

```tsx
{finalOffAim && spareAim && (
  <button
    type="button"
    onClick={() =>
      applyEdit({
        final_board: snapBoard(spareAim.board),
        final_distance: Math.round(spareAim.feet * 10) / 10,
      })
    }
    className="self-end rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/25"
  >
    Re-aim
  </button>
)}
```

- [ ] **Step 2: Test** (append to `LaneVisualizer.test.tsx`):

```tsx
it("shows a Pocket chip when the strike final is off the pocket, snapping it back", () => {
  const onChange = vi.fn();
  render(
    <HandednessContext.Provider value="right">
      <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6, final_board: 12 }} onClose={() => {}} onChange={onChange} />
    </HandednessContext.Provider>
  );
  fireEvent.click(screen.getByRole("button", { name: /pocket/i }));
  expect(onChange.mock.lastCall![0].final_board).toBe(17.5);
});
```

Run: `npx vitest run src/components/LaneVisualizer.test.tsx` — PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/LaneVisualizer.tsx src/components/LaneVisualizer.test.tsx
git commit -m "feat(lane): Pocket / Re-aim chip snaps the final back to the ideal"
```

---

### Task 11: Screen-spatial ◀/▶ arrows on lateral steppers

Left arrow moves the peg left on screen. Board math mirrors by hand (RH: board
numbers rise leftward ⇒ ◀ = +boards; LH mirrored) — same convention as the
score-entry adjusters (`ActiveGameScorer.tsx:81-83`). Depth field (Final ft)
keeps −/+.

**Files:**
- Modify: `src/components/LaneVisualizer.tsx:427-480` (StepperField) + the stepper call sites

- [ ] **Step 1: Implement.** `StepperField` gains `lateral?: boolean` and `disabled?: boolean` (disabled is used by Task 12; add it now so the signature is final):

```tsx
function StepperField({
  label, value, min, max, step = 0.5, lateral = false, disabled = false, onCommit,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  /** Lateral board field: arrows move the peg in SCREEN direction (hand-mirrored). */
  lateral?: boolean;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const hand = useHandedness();
  const dir = hand === "right" ? 1 : -1; // ◀ raises the board for a right-hander
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value != null ? String(value) : "");
  const commit = () => {
    if (draft !== null && draft !== "") onCommit(clamp(Number(draft), min, max));
    setDraft(null);
  };
  const nudge = (d: number) => onCommit(clamp((value ?? min) + d, min, max));
  const leftDelta = lateral ? step * dir : -step;
  return (
    <div className={`flex w-[4.75rem] flex-col gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white/70 ${disabled ? "opacity-40" : ""}`}>
      {label}
      <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-white/20 bg-white/10">
        <button
          type="button"
          aria-label={lateral ? `${label} left` : `${label} down`}
          disabled={disabled}
          onClick={() => nudge(leftDelta)}
          className="flex w-6 shrink-0 items-center justify-center text-white/70 hover:bg-white/10"
        >
          {lateral ? <span aria-hidden="true" className="text-[11px]">◀</span> : <Minus size={12} aria-hidden="true" />}
        </button>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={shown}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } }}
          className="min-w-0 flex-1 bg-transparent text-center text-sm font-medium text-white outline-none"
        />
        <button
          type="button"
          aria-label={lateral ? `${label} right` : `${label} up`}
          disabled={disabled}
          onClick={() => nudge(-leftDelta)}
          className="flex w-6 shrink-0 items-center justify-center text-white/70 hover:bg-white/10"
        >
          {lateral ? <span aria-hidden="true" className="text-[11px]">▶</span> : <Plus size={12} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
```

Call sites: add `lateral` to Laydown, Target, and Final in **both** clusters;
"Final ft" stays without it.

- [ ] **Step 2: Test:**

```tsx
it("lateral arrows are screen-spatial: ◀ raises the board for a right-hander", () => {
  const onChange = vi.fn();
  render(
    <HandednessContext.Provider value="right">
      <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
    </HandednessContext.Provider>
  );
  fireEvent.click(screen.getByLabelText("Target left"));
  expect(onChange.mock.lastCall![0].target).toBe(10.5);
});
```

Run: `npx vitest run src/components/LaneVisualizer.test.tsx` — PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/LaneVisualizer.tsx src/components/LaneVisualizer.test.tsx
git commit -m "feat(lane): lateral steppers use hand-mirrored screen-direction arrows"
```

---

### Task 12: Tap-to-lock pegs

Hard locks on laydown/target/final (max 2; breakpoint not lockable — it's
derived). Tap a peg to toggle. Locked: amber ring + 🔒, drag ignored, stepper
disabled, and any edit whose solved result would move a locked value is
rejected (the "wall"). The breakpoint cascade's give-way peg skips locked pegs.

**Files:**
- Modify: `src/components/LaneVisualizer.tsx` (state, grab/drag/release, applyEdit, handles render, stepper call sites, `dragGiveWay` type)
- Test: `src/components/LaneVisualizer.test.tsx`

- [ ] **Step 1: Write the failing test:**

```tsx
it("tapping a peg toggles a hard lock (ADR-028)", () => {
  (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture ??= () => {};
  const onChange = vi.fn();
  render(
    <HandednessContext.Provider value="right">
      <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
    </HandednessContext.Provider>
  );
  const handle = document.querySelector('[data-role="handle"][data-key="target"]')!;
  fireEvent.pointerDown(handle);
  fireEvent.pointerUp(handle);
  expect(handle.getAttribute("data-locked")).toBe("true");
  // Locked ⇒ its stepper is disabled and edits that would move it are rejected.
  expect((screen.getByLabelText("Target") as HTMLInputElement).disabled).toBe(true);
  fireEvent.pointerDown(handle);
  fireEvent.pointerUp(handle);
  expect(handle.getAttribute("data-locked")).toBe("false");
});
```

Run to verify failure: `npx vitest run src/components/LaneVisualizer.test.tsx`.

- [ ] **Step 2: Implement.** In `LaneVisualizer.tsx`:

2a. State + helpers:

```tsx
type LockablePeg = "laydown" | "target" | "final";
const LOCKABLE: ReadonlySet<string> = new Set(["laydown", "target", "final"]);

// inside the component:
const [locked, setLocked] = useState<ReadonlySet<LockablePeg>>(new Set());
const grabbedKey = useRef<string | null>(null);
const dragStarted = useRef(false);
const grabXY = useRef<{ x: number; y: number } | null>(null);

function toggleLock(key: string) {
  if (!LOCKABLE.has(key)) return;
  setLocked((prev) => {
    const next = new Set(prev);
    if (next.has(key as LockablePeg)) next.delete(key as LockablePeg);
    else if (next.size < 2) next.add(key as LockablePeg); // one peg must stay free
    return next;
  });
}

/** Effective value of a lockable peg on a line. */
function pegValue(l: LineSpec | undefined, k: LockablePeg): number | undefined {
  if (k === "final") return l?.final_board ?? POCKET_BOARD;
  if (k === "laydown") return l?.laydown ?? l?.stance;
  return l?.target;
}
```

2b. Lock wall in `applyEdit`:

```tsx
function applyEdit(patch: Partial<LineSpec>) {
  if (!onChange) return;
  const solved = solveLine({ ...(line ?? {}), ...patch }, hand);
  // Hard lock (ADR-028): an edit whose solved result moves a locked peg stops
  // at the wall — the edit is dropped, nothing twitches.
  for (const k of locked) {
    const a = pegValue(line, k), b = pegValue(solved, k);
    if (a != null && b != null && Math.abs(a - b) > 1e-6) return;
  }
  onChange(solved);
}
```

2c. Grab/drag/release — tap-vs-drag deadzone + lock enforcement. Replace `grabHandle`/`releaseHandle` and the handle event wiring:

```tsx
function grabHandle(key: string, e: React.PointerEvent) {
  e.stopPropagation();
  grabbedKey.current = key;
  dragStarted.current = false;
  grabXY.current = { x: e.clientX, y: e.clientY };
  dragGiveWay.current = (() => {
    // Cascade give-way skips locked pegs; both locked ⇒ timing-only drag.
    const pref = lastAimEdit.current === "target" ? "laydown" : "target";
    const alt = pref === "laydown" ? "target" : "laydown";
    if (!locked.has(pref)) return pref;
    if (!locked.has(alt)) return alt;
    return null;
  })();
  setDragging(true);
  setDeg(TOPDOWN_DEG); // snap flat: linear screen→lane mapping (ADR-025)
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
}

function moveHandle(key: string, e: React.PointerEvent) {
  if (!e.buttons || grabbedKey.current !== key) return;
  e.stopPropagation();
  const g = grabXY.current;
  // 5px deadzone separates a lock-toggling tap from a drag.
  if (!dragStarted.current && g && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
  dragStarted.current = true;
  if (LOCKABLE.has(key) && locked.has(key as LockablePeg)) return; // locked pegs don't drag
  dragPoint(key, e);
}

function releaseHandle(key: string) {
  if (grabbedKey.current === key && !dragStarted.current) toggleLock(key);
  grabbedKey.current = null;
  setDragging(false);
}
```

`dragGiveWay` ref type widens: `useRef<"target" | "laydown" | null>("target")`
(`projectBreakpoint` already accepts `null`).

2d. Handles render — wire the new handlers, show lock state:

```tsx
{handles.map((h) => {
  const derived = h.key === "breakpoint";
  const isLocked = LOCKABLE.has(h.key) && locked.has(h.key as LockablePeg);
  return (
    <g key={h.key}>
      {derived ? (
        <rect
          x={h.p.x - 5} y={h.p.y - 5} width="10" height="10"
          transform={`rotate(45 ${h.p.x} ${h.p.y})`}
          fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.1"
        />
      ) : (
        <circle
          cx={h.p.x} cy={h.p.y} r="6" fill="none"
          stroke={isLocked ? "#fbbf24" : "#fff"}
          strokeOpacity={isLocked ? 1 : 0.6}
          strokeWidth={isLocked ? 1.8 : 1.1}
        />
      )}
      {isLocked && (
        <text x={h.p.x + 7} y={h.p.y - 6} fontSize="6" aria-hidden="true">🔒</text>
      )}
      <circle
        data-role="handle"
        data-key={h.key}
        data-locked={isLocked ? "true" : "false"}
        cx={h.p.x} cy={h.p.y} r="13" fill="transparent"
        className="pointer-events-auto touch-none cursor-grab"
        onPointerDown={(e) => grabHandle(h.key, e)}
        onPointerMove={(e) => moveHandle(h.key, e)}
        onPointerUp={() => releaseHandle(h.key)}
        onPointerCancel={() => releaseHandle(h.key)}
      />
    </g>
  );
})}
```

2e. Steppers get `disabled` from lock state — on Laydown: `disabled={locked.has("laydown")}`, Target: `disabled={locked.has("target")}`, Final: `disabled={locked.has("final")}` (both clusters; Final ft also `disabled={locked.has("final")}`).

- [ ] **Step 3: Run tests.** `npx vitest run src/components/LaneVisualizer.test.tsx`.
The pre-existing "stays top-down after a handle drag" test does pointerDown+Up
with no move — it now also toggles a lock, but its tilt assertion is
unaffected; it must still pass. All new + old tests PASS.

- [ ] **Step 4: Verify in preview.** Tap target peg → amber ring + 🔒, its
stepper greys out; drag breakpoint hard inward → laydown gives way, target
stays put; lock laydown too → breakpoint drag becomes timing-only; tap again to
unlock; locking a third peg is a no-op.

- [ ] **Step 5: Commit**

```bash
git add src/components/LaneVisualizer.tsx src/components/LaneVisualizer.test.tsx
git commit -m "feat(lane): tap-to-lock pegs — hard walls for laydown/target/final (ADR-028)"
```

---

### Task 13: Remove the header; float the controls

**Files:**
- Modify: `src/components/LaneVisualizer.tsx:184-218` (header block) and the lane container

- [ ] **Step 1: Implement.** Delete the whole header `<div className="flex items-center gap-2 px-4 py-3 text-white">…</div>` (title, hook-options button, view toggle, close). Keep the `title` prop — it still feeds the dialog `aria-label`. Inside the lane container (`<div className="relative flex-1 touch-none overflow-hidden" …>`), add as first children (siblings of the tilt stage, like the old replay button):

```tsx
{/* Floating controls — the header is gone so the lane gets full height. */}
<button
  type="button"
  onClick={onClose}
  aria-label="Close"
  onPointerDown={(e) => e.stopPropagation()}
  className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-900/70 text-white/80 backdrop-blur hover:bg-white/10"
>
  <X size={18} aria-hidden="true" />
</button>
<div
  className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2"
  onPointerDown={(e) => e.stopPropagation()}
>
  <button
    type="button"
    onClick={() => setDeg((d) => (d <= 2 ? BOWLER_DEG : TOPDOWN_DEG))}
    className="inline-flex h-9 items-center rounded-full border border-white/25 bg-slate-900/70 px-3 text-xs font-semibold text-white/90 backdrop-blur hover:bg-white/10"
  >
    {isTopDown ? "Bowler view" : "Top-down"}
  </button>
  {onChange && (
    <button
      type="button"
      onClick={() => setOptionsOpen(true)}
      aria-label="Hook options"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-900/70 text-white/80 backdrop-blur hover:bg-white/10"
    >
      <SlidersHorizontal size={16} aria-hidden="true" />
    </button>
  )}
</div>
```

- [ ] **Step 2: Verify.** `npx vitest run src/components/LaneVisualizer.test.tsx`
— the existing "close button", "Top-down toggle", and "hook options" queries
still resolve (labels unchanged). Dev preview, both views + both strike/spare:
lane noticeably taller, no control overlaps the lane surface or the top-down
side column (strike top-down puts steppers on the right for RH — the left-side
control stack clears them; for LH steppers sit left, controls overlay the top
~90 px only: check a left-handed profile too, and if the LH side column
collides, change the control stack to `items-end right-3 left-auto` mirrored by
hand — i.e. place the stack opposite `hand`).

- [ ] **Step 3: Commit**

```bash
git add src/components/LaneVisualizer.tsx
git commit -m "feat(lane): drop the visualizer header — floating controls, full-height lane"
```

---

### Task 14: ADR-028, changelog, full gate

**Files:**
- Modify: `docs/DECISIONS.md` (append; never edit accepted ADRs), `docs/CHANGELOG.md`

- [ ] **Step 1: Append ADR-028 to `docs/DECISIONS.md`** (match the file's existing ADR format):

```markdown
## ADR-028 — Honest line geometry: derived laydown, real-only breakpoint, hard locks

**Status:** Accepted (2026-07-08)

**Context.** The visualizer showed a breakpoint below the target (apex scan
seeded at the foul line; unreachable finals returned 0 ft), spare curves could
bulge off the lane, spare attempts opened in strike mode, and the entered
`stance` silently doubled as the drawn laydown.

**Decision.**
1. **Laydown = stance − offset.** Per-user `laydown_offset` setting (default 6,
   hand-relative boards so both hands mirror). The visualizer materialises a
   missing `laydown` on open; an explicit `laydown` (typed/dragged) overrides
   per line. `stance` stays the entry field; no migration.
2. **Breakpoint is real-only.** Apex candidates start at the target depth;
   stored `breakpoint`/`breakpoint_distance` floor there (never 0 ft; non-null
   `breakpoint` still flags a strike line). The marker renders only when the
   ball genuinely swings > ¼ board outside the target; straight, inward, and
   unreachable-final lines show no breakpoint.
3. **Whole curve stays on the lane.** The spare hook zone gets the same
   cap-to-lane the strike zone had (lofted-laydown skid margin unchanged).
4. **Hard peg locks.** Tap laydown/target/final to lock (max 2). Locked pegs
   never move: drags ignored, steppers disabled, solver edits that would move
   them are rejected, cascade give-way skips them.

**Consequences.** Lines drawn are physically plausible by construction; UI
limits are enforced by the geometry (walls) rather than explained by warnings.
Legacy lines with a stored sub-target `breakpoint_distance` re-solve onto the
floor on first edit (existing lazy-migration path, ADR-026).
```

- [ ] **Step 2: Add a `docs/CHANGELOG.md` entry** (match its format) summarising: derived laydown + offset setting + entry chip, spare-mode fix for spare attempts, real-only breakpoint, on-lane spare curves, tap-to-lock, tap-to-replay, dynamic hook sliders, pocket/re-aim chip, arrow steppers, header removal, deck decompression.

- [ ] **Step 3: Full gate**

```bash
npm test && npm run build
```

Expected: all vitest suites pass; tsc + vite + PWA build clean. Then run the
e2e suite: `npm run test:e2e` — fix any selector drift caused by the removed
header/replay button before proceeding.

- [ ] **Step 4: Commit**

```bash
git add docs/DECISIONS.md docs/CHANGELOG.md
git commit -m "docs: ADR-028 — honest line geometry, derived laydown, peg locks"
```

- [ ] **Step 5: Deploy.** Per the user's standing instruction (auto-memory
"Always deploy when done"), run the `deploy` skill once the gate is green.

---

## Self-Review

- **Spec coverage:** stance/laydown derivation + setting (T4, T5), entry chip
  (T6), breakpoint-below-target (T1), spare final/green-dot (T7), replay button
  + black dot (T8), slider drag + limits (T9), off-screen line (T2), pin deck +
  pocket lock (T3, T10), arrow steppers (T11), point locking (T12), header
  removal (T13), docs rule (T14). All ten interview decisions have tasks.
- **Type consistency:** `apexReal`/`real` flags introduced in T1 are consumed
  only in T1's own edits; `deriveLaydown`/`useLaydownOffset` (T4) match usage
  in T5/T6; `StepperField`'s `disabled` prop is added in T11 and consumed in
  T12; `dragGiveWay` widens to `null` in T12 matching `projectBreakpoint`'s
  existing signature.
- **Known judgment points for the executor:** exact Tailwind spacing of chips
  and the LH top-down control placement (T13 step 2 spells out the fallback);
  deck constants have a stated invariant to tune against (T3 step 3).
