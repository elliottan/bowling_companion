# Lane Line Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable fullscreen `LaneVisualizer` that draws a chosen bowling line (laydown → target → breakpoint board + breakpoint distance) as a realistic hook over a wood lane, viewable from a continuously tiltable top-down⇄bowler-eye camera, reachable from score entry, the spare-line form, and ad-hoc from Settings.

**Architecture:** A pure, view-agnostic geometry module (`laneGeometry.ts`) maps a `LineSpec` to 2D coordinates on a flat lane plane and an SVG hook path. A presentational SVG `LaneSurface` renders that plane (wood, boards, arrows, pins, pocket, path, markers). A `LaneVisualizer` modal wraps the surface in a CSS-3D perspective container whose `rotateX` is driven by drag (continuous tilt morph), and — when snapped to top-down — enables 2D draggable handles that edit the line. Integrations add a "View line" button on each surface and a new `breakpoint_distance` line field.

**Tech Stack:** React 18 + TypeScript, Tailwind, SVG, CSS 3D transforms, Vitest + @testing-library/react. No new dependencies.

---

## Design decisions (from grilling, 2026-06-22)

- **Two viewpoints, one plane, continuous tilt morph.** Default = angled (~20°). Drag tilts the camera via `perspective() rotateX(θ)`; the GPU reprojects everything. No WebGL.
- **Editing only in top-down.** When snapped to 90° (top-down, flat) the tilt locks and 2D drag-handles edit laydown/target/breakpoint; angled is read-only. Flat = trivial hit-testing.
- **Realistic hook path.** Straight skid `laydown ?? stance` → target(15 ft), then a quadratic bend through the breakpoint board (at breakpoint distance) into the 1-3 pocket.
- **New persisted field** `breakpoint_distance` (ft, default 42) on `LineSpec`. Added to the spare form; score-entry already has stance/target/breakpoint and persists the whole `LineSpec`.
- **Aesthetic:** restrained maple/amber wood + faint board lines + soft oil sheen front ~40 ft; amber path is the hero.
- **Markers:** dots + upright (billboarded) board labels at laydown/target/breakpoint; breakpoint shows distance; 7 arrows; foul-line board ruler; pocket glow; 10 pins dimmed; standing leave lit on the spare surface.
- **Motion:** subtle ball-roll along the path on open + on change; honors `prefers-reduced-motion`.
- **Form factor:** one `LaneVisualizer` fullscreen modal, opened by a "View line" button on all three surfaces. Score-entry edits the **intended** line.
- **Handedness:** board numbers rise to the left for a right-hander; the whole plane mirrors for a left-hander (consistent with `useHandedness()` usage elsewhere).

## File structure

| File | Responsibility | Action |
|---|---|---|
| `src/types/bowling.ts` | Add `breakpoint_distance?: number` to `LineSpec` | Modify |
| `docs/DECISIONS.md` | New **ADR-011** (breakpoint distance + line visualizer) | Modify |
| `docs/CHANGELOG.md` | Unreleased entry | Modify |
| `src/lib/laneGeometry.ts` | Pure geometry: board/feet ↔ plane coords, hook path, inverse mapping | Create |
| `src/lib/laneGeometry.test.ts` | Unit tests for the above | Create |
| `src/components/LaneSurface.tsx` | Presentational SVG lane plane (wood, boards, arrows, pins, pocket, path, markers) | Create |
| `src/components/LaneSurface.test.tsx` | Structural/coords tests | Create |
| `src/components/LaneVisualizer.tsx` | Fullscreen modal: tilt morph + edit mode + ball-roll, owns interaction | Create |
| `src/components/LaneVisualizer.test.tsx` | Behavior tests (open, mode toggle, edit write-back) | Create |
| `src/components/SpareLineFormDialog.tsx` | Add breakpoint + breakpoint-distance inputs; "View line" button | Modify |
| `src/views/SpareLinesView.tsx` | Show breakpoint in card spec line | Modify |
| `src/components/ActiveGameScorer.tsx` | "View line" button in `ShotDetailBar` (edits intended line) | Modify |
| `src/views/SettingsView.tsx` | New "Line Visualizer" menu row | Modify |
| `src/App.tsx` | Ad-hoc visualizer overlay state + wiring | Modify |

**No backup/validation change:** `validateBackup` never inspects `LineSpec` internals (frames validate `pins_standing`; spare lines validate `pins`). `breakpoint_distance` rides along in serialized `intended`/`actual`/`spare_lines[].line` automatically. Backup `version` stays 3.

---

## Phase 1 — Data model + ADR

### Task 1: Add `breakpoint_distance` to `LineSpec` + ADR + changelog

**Files:**
- Modify: `src/types/bowling.ts:3-8`
- Modify: `docs/DECISIONS.md` (append ADR-011)
- Modify: `docs/CHANGELOG.md` (Unreleased)

- [ ] **Step 1: Add the field**

In `src/types/bowling.ts`, change the `LineSpec` interface to:

```ts
export interface LineSpec {
  stance?: number;
  laydown?: number;
  target?: number;
  breakpoint?: number;
  /** Down-lane distance (feet from foul line) where the ball reaches the
   *  breakpoint board. Used to draw the hook. Defaults to 42 ft when unset. */
  breakpoint_distance?: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (additive optional field).

- [ ] **Step 3: Append ADR-011 to `docs/DECISIONS.md`**

Add at end of file:

```markdown
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
```

- [ ] **Step 4: Add a CHANGELOG entry**

In `docs/CHANGELOG.md`, under `## [Unreleased]`, add a new `### Added` bullet (create the section if the nearest one is unrelated):

```markdown
- **Lane line visualizer (ADR-011).** A fullscreen view that draws your line
  (laydown → target → breakpoint board + new breakpoint distance) as a hook over
  a wood lane, with a drag-to-tilt camera (top-down ⇄ bowler-eye) and top-down
  handle editing. Reachable from score entry, the spare-line form, and Settings.
  Adds an optional `breakpoint_distance` (ft) to the line model.
```

- [ ] **Step 5: Commit**

```bash
git add src/types/bowling.ts docs/DECISIONS.md docs/CHANGELOG.md
git commit -m "feat(line): add breakpoint_distance to LineSpec + ADR-011"
```

---

## Phase 2 — Pure geometry (`laneGeometry.ts`)

### Task 2: Plane constants + board/feet ↔ coordinate mapping

**Files:**
- Create: `src/lib/laneGeometry.ts`
- Test: `src/lib/laneGeometry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/laneGeometry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, LANE_FEET,
  boardToX, feetToY, xToBoard, yToFeet
} from "./laneGeometry";

describe("board ↔ x", () => {
  it("right-hander: board 1 is the right edge, board 39 the left", () => {
    expect(boardToX(1, "right")).toBeCloseTo(PLANE_W, 5);
    expect(boardToX(LANE_BOARDS, "right")).toBeCloseTo(0, 5);
    expect(boardToX(20, "right")).toBeCloseTo(PLANE_W * (1 - 19 / 38), 5);
  });

  it("left-hander mirrors the right-hander", () => {
    expect(boardToX(1, "left")).toBeCloseTo(0, 5);
    expect(boardToX(LANE_BOARDS, "left")).toBeCloseTo(PLANE_W, 5);
  });

  it("clamps out-of-range boards onto the lane", () => {
    expect(boardToX(50, "right")).toBeCloseTo(boardToX(LANE_BOARDS, "right"), 5);
    expect(boardToX(0, "right")).toBeCloseTo(boardToX(1, "right"), 5);
  });

  it("xToBoard inverts boardToX", () => {
    for (const b of [1, 10, 17.5, 20, 39]) {
      expect(xToBoard(boardToX(b, "right"), "right")).toBeCloseTo(b, 4);
      expect(xToBoard(boardToX(b, "left"), "left")).toBeCloseTo(b, 4);
    }
  });
});

describe("feet ↔ y", () => {
  it("foul line (0 ft) is the bottom, head pin (60 ft) the top", () => {
    expect(feetToY(0)).toBeCloseTo(PLANE_L, 5);
    expect(feetToY(LANE_FEET)).toBeCloseTo(0, 5);
    expect(feetToY(30)).toBeCloseTo(PLANE_L / 2, 5);
  });

  it("yToFeet inverts feetToY", () => {
    for (const ft of [0, 15, 42, 60]) {
      expect(yToFeet(feetToY(ft))).toBeCloseTo(ft, 4);
    }
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test -- --run src/lib/laneGeometry.test.ts`
Expected: FAIL — module `./laneGeometry` not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/laneGeometry.ts`:

```ts
import type { Handedness } from "../types/bowling";

// Physical landmarks.
export const LANE_BOARDS = 39;
export const LANE_FEET = 60;            // foul line → head pin
export const ARROWS_FEET = 15;          // target arrows
export const DEFAULT_BREAKPOINT_FEET = 42;
export const POCKET_BOARD = 17.5;       // 1-3 pocket (right-hander); mirrored by boardToX

// Flat-plane drawing dimensions (SVG user units). Length is compressed vs.
// width for phone legibility (true ratio ≈ 17:1; we use ≈ 4.2:1). Tune in the
// visual pass — all geometry derives from these two constants.
export const PLANE_W = 100;
export const PLANE_L = 420;

const clampBoard = (b: number) => Math.max(1, Math.min(LANE_BOARDS, b));

/** Board number → x on the plane. Right-handers: board 1 = right edge. */
export function boardToX(board: number, hand: Handedness): number {
  const f = (clampBoard(board) - 1) / (LANE_BOARDS - 1); // 0 at board 1
  return hand === "right" ? PLANE_W * (1 - f) : PLANE_W * f;
}

/** Inverse of boardToX (not clamped, so dragging past the edge reads sensibly). */
export function xToBoard(x: number, hand: Handedness): number {
  const f = hand === "right" ? 1 - x / PLANE_W : x / PLANE_W;
  return 1 + f * (LANE_BOARDS - 1);
}

/** Distance from foul line (ft) → y on the plane (0 ft at bottom). */
export function feetToY(feet: number): number {
  return PLANE_L * (1 - feet / LANE_FEET);
}

/** Inverse of feetToY. */
export function yToFeet(y: number): number {
  return LANE_FEET * (1 - y / PLANE_L);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- --run src/lib/laneGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/laneGeometry.ts src/lib/laneGeometry.test.ts
git commit -m "feat(lane): plane geometry — board/feet to plane coordinates"
```

### Task 3: Hook path + marker points (`buildLinePath`)

**Files:**
- Modify: `src/lib/laneGeometry.ts`
- Modify: `src/lib/laneGeometry.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/laneGeometry.test.ts`:

```ts
import { buildLinePath, POCKET_BOARD, DEFAULT_BREAKPOINT_FEET } from "./laneGeometry";
import type { LineSpec } from "../types/bowling";

describe("buildLinePath", () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it("returns null without a foul board or target", () => {
    expect(buildLinePath({ target: 10 }, "right")).toBeNull();      // no laydown/stance
    expect(buildLinePath({ laydown: 18 }, "right")).toBeNull();     // no target
    expect(buildLinePath(undefined, "right")).toBeNull();
  });

  it("uses laydown, falling back to stance", () => {
    const a = buildLinePath({ laydown: 18, target: 10 }, "right");
    const b = buildLinePath({ stance: 18, target: 10 }, "right");
    expect(a!.points.laydown).toEqual(b!.points.laydown);
  });

  it("with a breakpoint, bends quadratically through it into the pocket", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 6, breakpoint_distance: 42 };
    const r = buildLinePath(line, "right")!;
    expect(r.points.breakpoint).not.toBeNull();
    const p = r.points;
    const expected =
      `M ${round2(p.laydown.x)} ${round2(p.laydown.y)} ` +
      `L ${round2(p.target.x)} ${round2(p.target.y)} ` +
      `Q ${round2(p.breakpoint!.x)} ${round2(p.breakpoint!.y)} ` +
      `${round2(p.pocket.x)} ${round2(p.pocket.y)}`;
    expect(r.d).toBe(expected);
  });

  it("without a breakpoint, draws straight to the pocket", () => {
    const r = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    expect(r.points.breakpoint).toBeNull();
    expect(r.d.startsWith("M ")).toBe(true);
    expect(r.d).toContain(" L ");
    expect(r.d).not.toContain(" Q ");
  });

  it("defaults the breakpoint distance to 42 ft", () => {
    const r = buildLinePath({ laydown: 18, target: 10, breakpoint: 6 }, "right")!;
    expect(yToFeet(r.points.breakpoint!.y)).toBeCloseTo(DEFAULT_BREAKPOINT_FEET, 4);
  });

  it("mirrors the pocket for a left-hander", () => {
    const rRight = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    const rLeft = buildLinePath({ laydown: 18, target: 10 }, "left")!;
    expect(rRight.points.pocket.x).toBeCloseTo(PLANE_W - rLeft.points.pocket.x, 4);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test -- --run src/lib/laneGeometry.test.ts`
Expected: FAIL — `buildLinePath` not exported.

- [ ] **Step 3: Implement `buildLinePath`**

Append to `src/lib/laneGeometry.ts`:

```ts
import type { LineSpec } from "../types/bowling";

export interface PlanePoint { x: number; y: number; }

export interface LinePath {
  d: string;
  points: {
    laydown: PlanePoint;
    target: PlanePoint;
    breakpoint: PlanePoint | null;
    pocket: PlanePoint;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pt = (x: number, y: number): PlanePoint => ({ x: r2(x), y: r2(y) });

/**
 * Build the SVG path + marker points for a line. Needs a foul-line board
 * (`laydown ?? stance`) and a `target`; returns null otherwise. With a
 * breakpoint, the path skids straight laydown→target then bends quadratically
 * through the breakpoint board (at `breakpoint_distance`, default 42 ft) into
 * the 1-3 pocket. Without one, it runs straight to the pocket.
 */
export function buildLinePath(line: LineSpec | undefined, hand: Handedness): LinePath | null {
  const foul = line?.laydown ?? line?.stance;
  if (line == null || foul == null || line.target == null) return null;

  const laydown = pt(boardToX(foul, hand), feetToY(0));
  const target = pt(boardToX(line.target, hand), feetToY(ARROWS_FEET));
  const pocket = pt(boardToX(POCKET_BOARD, hand), feetToY(LANE_FEET));

  let breakpoint: PlanePoint | null = null;
  if (line.breakpoint != null) {
    const dist = line.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET;
    breakpoint = pt(boardToX(line.breakpoint, hand), feetToY(dist));
  }

  const d = breakpoint
    ? `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} Q ${breakpoint.x} ${breakpoint.y} ${pocket.x} ${pocket.y}`
    : `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} L ${pocket.x} ${pocket.y}`;

  return { d, points: { laydown, target, breakpoint, pocket } };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- --run src/lib/laneGeometry.test.ts`
Expected: PASS (all geometry tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/laneGeometry.ts src/lib/laneGeometry.test.ts
git commit -m "feat(lane): buildLinePath — hook path + marker points"
```

---

## Phase 3 — Presentational surface (`LaneSurface.tsx`)

### Task 4: Static SVG lane surface (wood, boards, arrows, pins, pocket)

**Files:**
- Create: `src/components/LaneSurface.tsx`
- Test: `src/components/LaneSurface.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/LaneSurface.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LaneSurface } from "./LaneSurface";
import { PLANE_W, PLANE_L } from "../lib/laneGeometry";

describe("LaneSurface", () => {
  it("renders an SVG sized to the plane with 10 pins", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10, breakpoint: 6 }} hand="right" />
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${PLANE_W} ${PLANE_L}`);
    expect(container.querySelectorAll('[data-role="pin"]').length).toBe(10);
  });

  it("draws the ball path when the line is drawable", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10, breakpoint: 6 }} hand="right" />
    );
    expect(container.querySelector('[data-role="ball-path"]')).not.toBeNull();
  });

  it("omits the path when the line is not drawable", () => {
    const { container } = render(<LaneSurface line={{ target: 10 }} hand="right" />);
    expect(container.querySelector('[data-role="ball-path"]')).toBeNull();
  });

  it("lights the standing leave pins when given", () => {
    const { container } = render(
      <LaneSurface line={{ laydown: 18, target: 10 }} hand="right" leave={[10]} />
    );
    const lit = container.querySelectorAll('[data-role="pin"][data-standing="true"]');
    expect(lit.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test -- --run src/components/LaneSurface.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LaneSurface`**

Create `src/components/LaneSurface.tsx`. The component is pure/presentational; it takes a `LineSpec`, handedness, optional `leave`, and renders the full plane. Markers get `data-billboard` so the visualizer can counter-rotate them under tilt.

```tsx
import type { Handedness, LineSpec, PinNumber } from "../types/bowling";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, ARROWS_FEET,
  boardToX, feetToY, buildLinePath, DEFAULT_BREAKPOINT_FEET
} from "../lib/laneGeometry";
import { PIN_POSITIONS } from "../lib/pinGeometry";

const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ARROW_BOARDS = [5, 10, 15, 20, 25, 30, 35]; // 7 arrows
const RULER_BOARDS = [1, 5, 10, 15, 20, 25, 30, 35, 39];

/** Pin board (pinGeometry uses board 20 centre) → plane x for this handedness. */
function pinX(board: number, hand: Handedness): number {
  // pinGeometry boards are absolute (1..39-ish); reuse boardToX directly.
  return boardToX(board, hand);
}
/** Pin depth: pinGeometry feet are ~60–62.6; clamp the deck to the top edge. */
function pinY(feet: number): number {
  return feetToY(Math.min(feet, 60));
}

interface LaneSurfaceProps {
  line: LineSpec | undefined;
  hand: Handedness;
  /** Standing leave to light up (spare surface). */
  leave?: PinNumber[];
  /** Rendered <defs>/markers can be toggled off for a lighter preview. */
  showMarkers?: boolean;
}

export function LaneSurface({ line, hand, leave, showMarkers = true }: LaneSurfaceProps) {
  const path = buildLinePath(line, hand);
  const leaveSet = new Set(leave ?? []);

  return (
    <svg
      viewBox={`0 0 ${PLANE_W} ${PLANE_L}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-label="Bowling lane line diagram"
    >
      <defs>
        {/* Maple/amber wood gradient down the lane. */}
        <linearGradient id="lane-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c4a21" />
          <stop offset="0.18" stopColor="#b07a3e" />
          <stop offset="1" stopColor="#d8a564" />
        </linearGradient>
        {/* Soft oil sheen over the front ~40 ft (top 2/3 of the plane). */}
        <linearGradient id="lane-oil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="0.66" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="pocket-glow">
          <stop offset="0" stopColor="#34d399" stopOpacity="0.55" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Lane body + sheen */}
      <rect x="0" y="0" width={PLANE_W} height={PLANE_L} fill="url(#lane-wood)" />
      <rect x="0" y={feetToY(45)} width={PLANE_W} height={feetToY(0) - feetToY(45)} fill="url(#lane-oil)" />

      {/* Faint board lines (every board). */}
      {Array.from({ length: LANE_BOARDS - 1 }, (_, i) => {
        const x = boardToX(i + 1.5, hand);
        return <line key={i} x1={x} y1="0" x2={x} y2={PLANE_L} stroke="#000000" strokeOpacity="0.06" strokeWidth="0.3" />;
      })}

      {/* Arrows (15 ft). Small triangles pointing down-lane. */}
      {ARROW_BOARDS.map((b) => {
        const x = boardToX(b, hand);
        const y = feetToY(ARROWS_FEET);
        return (
          <polygon
            key={b}
            data-role="arrow"
            points={`${x},${y - 3} ${x - 1.6},${y + 2} ${x + 1.6},${y + 2}`}
            fill="#3f2a12"
            fillOpacity="0.65"
          />
        );
      })}

      {/* Pocket glow at the deck. */}
      <circle cx={boardToX(17.5, hand)} cy={feetToY(60)} r="10" fill="url(#pocket-glow)" />

      {/* Pins (dimmed; leave lit). */}
      {ALL_PINS.map((p) => {
        const pos = PIN_POSITIONS[p];
        const standing = leaveSet.has(p);
        return (
          <circle
            key={p}
            data-role="pin"
            data-standing={standing ? "true" : "false"}
            cx={pinX(pos.board, hand)}
            cy={pinY(pos.feet)}
            r="2.2"
            fill={standing ? "#0f766e" : "#f8fafc"}
            stroke="#0f172a"
            strokeOpacity="0.25"
            strokeWidth="0.3"
          />
        );
      })}

      {/* Ball path (hero). */}
      {path && (
        <path
          data-role="ball-path"
          d={path.d}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Markers: dots + upright labels (billboarded by the visualizer). */}
      {showMarkers && path && (
        <g>
          <Marker p={path.points.laydown} label={`Laydown ${(line!.laydown ?? line!.stance)!}`} />
          <Marker p={path.points.target} label={`Target ${line!.target!}`} />
          {path.points.breakpoint && (
            <Marker
              p={path.points.breakpoint}
              label={`Bkpt ${line!.breakpoint} · ${line!.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET}ft`}
            />
          )}
        </g>
      )}

      {/* Foul-line board ruler. */}
      {RULER_BOARDS.map((b) => (
        <text
          key={b}
          data-billboard="true"
          x={boardToX(b, hand)}
          y={PLANE_L - 1.5}
          textAnchor="middle"
          fontSize="3"
          fill="#1f2937"
          fillOpacity="0.7"
        >
          {b}
        </text>
      ))}
    </svg>
  );
}

function Marker({ p, label }: { p: { x: number; y: number }; label: string }) {
  return (
    <g data-role="marker">
      <circle cx={p.x} cy={p.y} r="2.4" fill="#f59e0b" stroke="#fff" strokeWidth="0.6" />
      <text
        data-billboard="true"
        x={p.x}
        y={p.y - 4}
        textAnchor="middle"
        fontSize="3.2"
        fontWeight="700"
        fill="#1f2937"
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth="0.8"
      >
        {label}
      </text>
    </g>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- --run src/components/LaneSurface.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LaneSurface.tsx src/components/LaneSurface.test.tsx
git commit -m "feat(lane): presentational SVG LaneSurface"
```

---

## Phase 4 — The visualizer modal (`LaneVisualizer.tsx`)

### Task 5: Fullscreen modal shell + tilt morph (read-only)

**Files:**
- Create: `src/components/LaneVisualizer.tsx`
- Test: `src/components/LaneVisualizer.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/LaneVisualizer.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HandednessContext } from "../lib/handednessContext";
import { LaneVisualizer } from "./LaneVisualizer";

function renderViz(props: Partial<React.ComponentProps<typeof LaneVisualizer>> = {}) {
  return render(
    <HandednessContext.Provider value="right">
      <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} {...props} />
    </HandednessContext.Provider>
  );
}

describe("LaneVisualizer", () => {
  it("renders a dialog with the lane surface and a close button", () => {
    renderViz();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText(/close/i)).toBeTruthy();
    expect(document.querySelector('[data-role="ball-path"]')).not.toBeNull();
  });

  it("starts angled and exposes a Top-down toggle", () => {
    renderViz();
    const stage = document.querySelector('[data-role="tilt-stage"]') as HTMLElement;
    expect(stage.style.transform).toContain("rotateX");
    expect(screen.getByRole("button", { name: /top-down/i })).toBeTruthy();
  });

  it("close button fires onClose", () => {
    const onClose = vi.fn();
    renderViz({ onClose });
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test -- --run src/components/LaneVisualizer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the read-only shell + morph**

Create `src/components/LaneVisualizer.tsx`. The tilt is a CSS-3D `rotateX` on a stage element; vertical drag adjusts the angle between `ANGLED_DEG` and `TOPDOWN_DEG`. A footer toggle snaps between the two. Editing arrives in Task 6 (this task ships read-only). Billboard labels are counter-rotated by applying the inverse `rotateX` to every `[data-billboard]` via a CSS variable.

```tsx
import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { LineSpec, PinNumber } from "../types/bowling";
import { useHandedness } from "../lib/handednessContext";
import { LaneSurface } from "./LaneSurface";

const ANGLED_DEG = 58;    // bowler-eye tilt (rotateX degrees away from flat)
const TOPDOWN_DEG = 0;    // flat / top-down

interface LaneVisualizerProps {
  line: LineSpec | undefined;
  onClose: () => void;
  /** Optional live editing (Phase 5). When omitted, the view is read-only. */
  onChange?: (line: LineSpec | undefined) => void;
  /** Standing leave to light (spare surface). */
  leave?: PinNumber[];
  title?: string;
}

export function LaneVisualizer({ line, onClose, onChange, leave, title = "Line" }: LaneVisualizerProps) {
  const hand = useHandedness();
  const [deg, setDeg] = useState(ANGLED_DEG);
  const dragY = useRef<number | null>(null);
  const isTopDown = deg <= 2;

  function onPointerDown(e: React.PointerEvent) {
    // In top-down edit mode, handle-dragging (Task 6) takes over; tilt-drag is
    // only for the angled camera.
    if (isTopDown && onChange) return;
    dragY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragY.current === null) return;
    const dy = e.clientY - dragY.current;
    dragY.current = e.clientY;
    // Drag up → flatten toward top-down; drag down → tilt back to angled.
    setDeg((d) => Math.max(TOPDOWN_DEG, Math.min(ANGLED_DEG, d + dy * 0.4)));
  }
  function onPointerUp() {
    dragY.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-slate-900"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} visualizer`}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <h2 className="flex-1 truncate text-base font-bold">{title}</h2>
        <button
          type="button"
          onClick={() => setDeg((d) => (d <= 2 ? ANGLED_DEG : TOPDOWN_DEG))}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
        >
          {isTopDown ? "Angle" : "Top-down"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {/* 3D camera. perspective on the parent; rotateX on the stage. */}
      <div
        className="relative flex-1 touch-none overflow-hidden"
        style={{ perspective: "900px" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          data-role="tilt-stage"
          className="absolute inset-0 mx-auto"
          style={{
            // Counter-rotate billboards via this CSS var (consumed below).
            // The stage tilts; labels read `--tilt` to stay upright.
            transform: `rotateX(${deg}deg)`,
            transformOrigin: "50% 100%",
            transition: dragY.current === null ? "transform 0.25s ease-out" : "none",
            ["--tilt" as string]: `${deg}deg`,
          }}
        >
          <div className="mx-auto h-full w-full max-w-[420px] [&_[data-billboard]]:[transform-box:fill-box] [&_[data-billboard]]:[transform-origin:center] [&_[data-billboard]]:[transform:rotateX(calc(var(--tilt)*-1))]">
            <LaneSurface line={line} hand={hand} leave={leave} />
          </div>
        </div>
      </div>

      <p className="px-4 py-2 text-center text-xs text-white/60">
        Drag up to flatten · drag down to tilt
      </p>
    </div>
  );
}
```

> **Note on billboards:** the SVG `<text data-billboard>` elements get `rotateX(-tilt)` so they face the camera. Verify legibility in the preview pass; if SVG-element 3D transforms misbehave in a target browser, fall back to rendering labels as HTML overlays positioned from `buildLinePath` points. This is the main visual risk — budget a preview check here.

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- --run src/components/LaneVisualizer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Preview check (manual)**

Run the app (`npm run dev` or the preview tool), open the visualizer from any wired surface (after Phase 6), and confirm: angled default, drag tilts smoothly, labels stay upright, wood + path read well on a 390px viewport. Adjust `ANGLED_DEG`, `PLANE_L`, gradients as needed.

- [ ] **Step 6: Commit**

```bash
git add src/components/LaneVisualizer.tsx src/components/LaneVisualizer.test.tsx
git commit -m "feat(lane): LaneVisualizer modal with tilt morph (read-only)"
```

### Task 6: Top-down drag-to-edit handles

**Files:**
- Modify: `src/components/LaneVisualizer.tsx`
- Modify: `src/components/LaneVisualizer.test.tsx`

- [ ] **Step 1: Add a failing test**

Append to `src/components/LaneVisualizer.test.tsx`:

```tsx
import { boardToX, feetToY, xToBoard } from "../lib/laneGeometry";

describe("LaneVisualizer editing", () => {
  it("shows draggable handles only when editable and top-down", () => {
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    // Angled by default → no handles.
    expect(document.querySelectorAll('[data-role="handle"]').length).toBe(0);
    // Snap to top-down.
    fireEvent.click(screen.getByRole("button", { name: /top-down/i }));
    expect(document.querySelectorAll('[data-role="handle"]').length).toBeGreaterThan(0);
  });

  it("computes board from x via the geometry inverse", () => {
    // Guards the mapping used by the drag handler.
    const x = boardToX(12, "right");
    expect(Math.round(xToBoard(x, "right"))).toBe(12);
    expect(feetToY(15)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test -- --run src/components/LaneVisualizer.test.tsx`
Expected: FAIL — no `[data-role="handle"]` rendered.

- [ ] **Step 3: Add handles + write-back**

In `src/components/LaneVisualizer.tsx`, add an editing overlay rendered only when `onChange && isTopDown`. Handles are positioned with `buildLinePath` points; dragging maps pointer → SVG coords → board (`xToBoard`) / distance (`yToFeet`) and calls `onChange`. Because editing is top-down (flat, no perspective), pointer math is plain 2D against the SVG's bounding box.

Add imports:

```tsx
import { buildLinePath, xToBoard, yToFeet, PLANE_W, PLANE_L } from "../lib/laneGeometry";
```

Add a ref to the surface wrapper (`surfaceRef`) on the `max-w-[420px]` div, then render after `<LaneSurface/>`:

```tsx
{onChange && isTopDown && line && (() => {
  const path = buildLinePath(line, hand);
  if (!path) return null;
  const handles: Array<{ key: "laydown" | "target" | "breakpoint"; p: { x: number; y: number } }> = [
    { key: "laydown", p: path.points.laydown },
    { key: "target", p: path.points.target },
  ];
  if (path.points.breakpoint) handles.push({ key: "breakpoint", p: path.points.breakpoint });

  function setFromPointer(key: string, clientX: number, clientY: number) {
    const el = surfaceRef.current?.querySelector("svg");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * PLANE_W;
    const sy = ((clientY - r.top) / r.height) * PLANE_L;
    const board = Math.max(1, Math.min(39, Math.round(xToBoard(sx, hand) * 2) / 2));
    const next: LineSpec = { ...line };
    if (key === "laydown") next.laydown = board;
    else if (key === "target") next.target = board;
    else if (key === "breakpoint") {
      next.breakpoint = board;
      next.breakpoint_distance = Math.max(20, Math.min(60, Math.round(yToFeet(sy))));
    }
    onChange!(next);
  }

  return (
    <svg viewBox={`0 0 ${PLANE_W} ${PLANE_L}`} className="pointer-events-none absolute inset-0 h-full w-full">
      {handles.map((h) => (
        <circle
          key={h.key}
          data-role="handle"
          cx={h.p.x}
          cy={h.p.y}
          r="4"
          className="pointer-events-auto cursor-grab touch-none"
          fill="#fff"
          stroke="#f59e0b"
          strokeWidth="1.5"
          onPointerDown={(e) => (e.currentTarget as Element).setPointerCapture(e.pointerId)}
          onPointerMove={(e) => { if (e.buttons) setFromPointer(h.key, e.clientX, e.clientY); }}
        />
      ))}
    </svg>
  );
})()}
```

Add the ref near the other hooks:

```tsx
const surfaceRef = useRef<HTMLDivElement | null>(null);
```

and attach it: `<div ref={surfaceRef} className="mx-auto h-full w-full max-w-[420px] ...">`.

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- --run src/components/LaneVisualizer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Preview check (manual)**

Open from a surface with editing, snap to top-down, drag each handle, confirm the numbers update and persist. Tune handle radius / snap step (`0.5` board) for touch.

- [ ] **Step 6: Commit**

```bash
git add src/components/LaneVisualizer.tsx src/components/LaneVisualizer.test.tsx
git commit -m "feat(lane): top-down drag-to-edit handles"
```

### Task 7: Ball-roll animation (reduced-motion aware)

**Files:**
- Modify: `src/components/LaneSurface.tsx`
- Modify: `src/components/LaneSurface.test.tsx`

- [ ] **Step 1: Add a failing test**

Append to `src/components/LaneSurface.test.tsx`:

```tsx
it("animates a rolling ball along the path unless reduced-motion", () => {
  const { container } = render(
    <LaneSurface line={{ laydown: 18, target: 10, breakpoint: 6 }} hand="right" animate />
  );
  // A <circle data-role="ball"> with an <animateMotion> child when animating.
  const ball = container.querySelector('[data-role="ball"]');
  expect(ball).not.toBeNull();
  expect(ball!.querySelector("animateMotion")).not.toBeNull();
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test -- --run src/components/LaneSurface.test.tsx`
Expected: FAIL — no `[data-role="ball"]`.

- [ ] **Step 3: Implement the rolling ball**

In `src/components/LaneSurface.tsx`, add an `animate?: boolean` prop. When `animate` is true and the user does not prefer reduced motion, render a ball that follows the path with SVG `<animateMotion>`; otherwise render the ball parked at the laydown point (or nothing).

Add to props: `animate?: boolean;`

Add a reduced-motion check at the top of the component:

```tsx
const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
```

After the `<path data-role="ball-path">`, add:

```tsx
{path && animate && !reduceMotion && (
  <circle data-role="ball" r="3" fill="#1f2937" stroke="#fff" strokeWidth="0.6">
    <animateMotion dur="1.4s" repeatCount="1" fill="freeze" path={path.d} />
  </circle>
)}
{path && animate && reduceMotion && (
  <circle data-role="ball" r="3" cx={path.points.pocket.x} cy={path.points.pocket.y} fill="#1f2937" />
)}
```

Pass `animate` from `LaneVisualizer`'s `<LaneSurface ... animate />` and key the surface on a serialized line so it re-rolls on change (add `key={JSON.stringify(line)}` to the `<LaneSurface>` usage in `LaneVisualizer`).

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- --run src/components/LaneSurface.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LaneSurface.tsx src/components/LaneSurface.test.tsx src/components/LaneVisualizer.tsx
git commit -m "feat(lane): rolling-ball animation (reduced-motion aware)"
```

---

## Phase 5 — Spare-form line fields (breakpoint + distance)

### Task 8: Add breakpoint + breakpoint-distance inputs to the spare form

**Files:**
- Modify: `src/components/SpareLineFormDialog.tsx:51-58` (spec build) and the board-inputs block (`:107-141`)
- Modify: `src/views/SpareLinesView.tsx` (card spec line)

- [ ] **Step 1: Extend the saved spec**

In `src/components/SpareLineFormDialog.tsx`, replace the `spec` builder so it includes breakpoint + distance:

```tsx
    const spec: LineSpec | undefined =
      line.stance != null || line.laydown != null || line.target != null ||
      line.breakpoint != null || line.breakpoint_distance != null
        ? {
            ...(line.stance != null && { stance: line.stance }),
            ...(line.laydown != null && { laydown: line.laydown }),
            ...(line.target != null && { target: line.target }),
            ...(line.breakpoint != null && { breakpoint: line.breakpoint }),
            ...(line.breakpoint_distance != null && { breakpoint_distance: line.breakpoint_distance })
          }
        : undefined;
```

- [ ] **Step 2: Add the inputs**

In the "Shooting line (board numbers)" block, change the field list from `["stance", "laydown", "target"]` to include breakpoint, and add a separate distance input below the grid. Replace the grid + helper with:

```tsx
            <div className="grid grid-cols-4 gap-2">
              {(["stance", "laydown", "target", "breakpoint"] as const).map((field) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-medium text-slate-600 capitalize">
                    {field === "breakpoint" ? "Bkpt" : field}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={line[field] ?? ""}
                    onChange={(e) =>
                      setLine((l) => ({
                        ...l,
                        [field]: e.target.value === "" ? undefined : Number(e.target.value)
                      }))
                    }
                    placeholder={field === "stance" ? "35" : field === "laydown" ? "18" : field === "target" ? "10" : "6"}
                    className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 w-32">
              <label className="mb-1 block text-xs font-medium text-slate-600">Bkpt dist (ft)</label>
              <input
                type="number"
                inputMode="decimal"
                step="1"
                value={line.breakpoint_distance ?? ""}
                onChange={(e) =>
                  setLine((l) => ({
                    ...l,
                    breakpoint_distance: e.target.value === "" ? undefined : Number(e.target.value)
                  }))
                }
                placeholder="42"
                className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
              />
            </div>
```

- [ ] **Step 3: Show breakpoint in the spare card**

In `src/views/SpareLinesView.tsx`, extend the card's line summary to include the breakpoint:

```tsx
            <span className="block text-xs font-semibold text-slate-700">
              S{sl.line.stance ?? "·"} · L{sl.line.laydown ?? "·"} · T{sl.line.target ?? "·"} · B{sl.line.breakpoint ?? "·"}
              {derivePinBoard(sl.line, sl.pins) != null && (
                <span className="text-felt-700"> · pin {derivePinBoard(sl.line, sl.pins)}</span>
              )}
            </span>
```

- [ ] **Step 4: Typecheck + existing tests**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: no type errors; all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/SpareLineFormDialog.tsx src/views/SpareLinesView.tsx
git commit -m "feat(spare): capture breakpoint + breakpoint distance"
```

---

## Phase 6 — Wire "View line" into all three surfaces

### Task 9: "View line" in the spare-line form (editable)

**Files:**
- Modify: `src/components/SpareLineFormDialog.tsx`

- [ ] **Step 1: Add open state + button + modal**

In `src/components/SpareLineFormDialog.tsx`:

Add imports:

```tsx
import { Eye } from "lucide-react";
import { LaneVisualizer } from "./LaneVisualizer";
```

Add state near the others: `const [showViz, setShowViz] = useState(false);`

Add a button just above the Notes field (inside the `<form>`):

```tsx
          <button
            type="button"
            onClick={() => setShowViz(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Eye size={14} aria-hidden="true" />
            View line
          </button>
```

Render the modal at the end of the dialog's root (after the form, before closing the outer `</div>`):

```tsx
        {showViz && (
          <LaneVisualizer
            title="Spare line"
            line={line}
            leave={pins}
            onChange={setLine}
            onClose={() => setShowViz(false)}
          />
        )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`SpareLineFormDialog` is rendered under `HandednessContext` via the app shell; `useHandedness` defaults to "right" if missing.)

- [ ] **Step 3: Preview check**

From the Spares tab, edit a spare → "View line" → confirm the hook draws over the lit leave, tilt works, and top-down handle edits flow back into the form inputs and save.

- [ ] **Step 4: Commit**

```bash
git add src/components/SpareLineFormDialog.tsx
git commit -m "feat(spare): View line button opens the visualizer"
```

### Task 10: "View line" in score entry (edits the intended line)

**Files:**
- Modify: `src/components/ActiveGameScorer.tsx` (`ShotDetailBar`)

- [ ] **Step 1: Add the button + modal to `ShotDetailBar`**

In `src/components/ActiveGameScorer.tsx`:

Add imports:

```tsx
import { Eye } from "lucide-react";
import { LaneVisualizer } from "./LaneVisualizer";
```

Inside `ShotDetailBar`, add local state:

```tsx
  const [showViz, setShowViz] = useState(false);
```

After the `<LineInput label="Intended" .../>` element, add:

```tsx
      <button
        type="button"
        onClick={() => setShowViz(true)}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Eye size={14} aria-hidden="true" />
        View intended line
      </button>
      {showViz && (
        <LaneVisualizer
          title="Intended line"
          line={intended}
          onChange={onIntendedChange}
          onClose={() => setShowViz(false)}
        />
      )}
```

(`useState` is already imported in this file.)

- [ ] **Step 2: Typecheck + tests**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: clean; all pass (the scorer renders under `HandednessContext` in `App`).

- [ ] **Step 3: Preview check**

In an active game, set an intended line → "View intended line" → confirm the visualizer reflects it; in top-down, drag handles and confirm the intended fields update on the scorer and persist with the shot.

- [ ] **Step 4: Commit**

```bash
git add src/components/ActiveGameScorer.tsx
git commit -m "feat(scorer): View intended line button opens the visualizer"
```

### Task 11: Ad-hoc visualizer from Settings (sandbox)

**Files:**
- Modify: `src/views/SettingsView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add a Settings menu row**

In `src/views/SettingsView.tsx`:

Add `onOpenLineVisualizer: () => void;` to `SettingsViewProps`.

Add an icon import: change the lucide import to include `Spline` (or reuse `CircleDot`). Add after the Ball Catalog `<li>` in the menu:

```tsx
        <li>
          <button
            type="button"
            onClick={onOpenLineVisualizer}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-felt-700"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-felt-700/10 text-felt-700">
              <Spline size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-950">Line Visualizer</span>
              <span className="block text-sm text-slate-500">Sketch a line on the lane</span>
            </span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-slate-400" />
          </button>
        </li>
```

Update the import line to add `Spline`:

```tsx
import { Archive, BookOpen, ChevronLeft, ChevronRight, CircleDot, MapPin, SlidersHorizontal, Spline, type LucideIcon } from "lucide-react";
```

- [ ] **Step 2: Hold a sandbox line + overlay in App**

In `src/App.tsx`:

Add imports near the other view imports:

```tsx
import { LaneVisualizer } from "./components/LaneVisualizer";
import type { LineSpec } from "./types/bowling";
```

Add state with the other `useState` hooks (near line 57-60):

```tsx
  const [lineVizOpen, setLineVizOpen] = useState(false);
  const [sandboxLine, setSandboxLine] = useState<LineSpec | undefined>({
    laydown: 18, target: 10, breakpoint: 7, breakpoint_distance: 42,
  });
```

Pass the new prop to `SettingsView` (around line 287-294):

```tsx
            onOpenLineVisualizer={() => setLineVizOpen(true)}
```

Render the overlay alongside the other overlays (after the arsenal overlay block, before the handedness modal, around line 368):

```tsx
      {lineVizOpen && (
        <LaneVisualizer
          title="Line sandbox"
          line={sandboxLine}
          onChange={setSandboxLine}
          onClose={() => setLineVizOpen(false)}
        />
      )}
```

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: clean; all pass.

- [ ] **Step 4: Preview check**

Settings → Line Visualizer → confirm the sandbox opens angled, tilts, and edits in top-down (sandbox line is not persisted — expected).

- [ ] **Step 5: Commit**

```bash
git add src/views/SettingsView.tsx src/App.tsx
git commit -m "feat(settings): ad-hoc line visualizer sandbox"
```

---

## Phase 7 — Full verification

### Task 12: Gate + manual smoke

- [ ] **Step 1: Full gate**

Run: `npm test -- --run && npx tsc --noEmit && npm run build`
Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 2: Manual smoke (preview, mobile 390px)**

Confirm each:
- Score entry: intended line → View → reflects numbers; top-down edit writes back + persists with the shot.
- Spare form: breakpoint + distance inputs save; View shows hook over the lit leave; edits write back.
- Settings: sandbox opens, tilts, edits (not persisted).
- Left-handed (Settings → Preferences → Left, confirm): the whole lane + path mirror.
- `prefers-reduced-motion`: no ball roll (resize/emulate).
- Labels stay upright across the full tilt range.

- [ ] **Step 3: Final commit (if any tuning)**

```bash
git add -A
git commit -m "chore(lane): visual tuning after smoke test"
```

---

## Self-review notes

- **Spec coverage:** viewpoint morph (Tasks 5–6), hook path (Tasks 3–4), breakpoint distance field (Tasks 1, 8), wood+sheen+markers (Task 4), animation (Task 7), three entry points (Tasks 9–11), handedness mirroring (geometry + tests), edit-on-top-down (Task 6). All present.
- **Type consistency:** `buildLinePath` returns `{ d, points: { laydown, target, breakpoint|null, pocket } }` used identically in `LaneSurface` and `LaneVisualizer`. `boardToX/xToBoard/feetToY/yToFeet` signatures stable across tasks. `LaneVisualizer` prop set (`line, onClose, onChange?, leave?, title?`) is consistent at every call site.
- **Known risks flagged inline:** (1) SVG `[data-billboard]` 3D counter-rotation legibility — preview-verify in Task 5, HTML-overlay fallback noted. (2) `PLANE_L`/`ANGLED_DEG` are tunable constants, not magic — adjust in the preview passes. (3) A line with only `breakpoint_distance` and no boards is treated as empty by the scorer's `hasAny` check — acceptable.
