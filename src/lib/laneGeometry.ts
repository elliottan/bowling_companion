import type { Handedness, LineSpec } from "../types/bowling";

// Physical landmarks.
export const LANE_BOARDS = 39;
export const LANE_FEET = 60;            // foul line → head pin
export const ARROWS_FEET = 15;          // target arrows
export const DEFAULT_BREAKPOINT_FEET = 42;
export const POCKET_BOARD = 17.5;       // 1-3 pocket (right-hander); mirrored by boardToX

// Vertical drawing extent, in feet measured from the foul line. We draw a short
// approach BELOW the foul line (negative) so the laydown handle isn't jammed
// against the bottom edge, and extend ABOVE the head pin so the full pin deck
// (pins reach ~62.9 ft) is visible rather than clipped to the foul-line→head-pin
// span. The foul line (0 ft) therefore sits a little above the very bottom.
export const DRAW_FRONT_FEET = -4;      // approach, below the foul line
export const DRAW_BACK_FEET = 63;       // just behind the pin deck
const DRAW_SPAN = DRAW_BACK_FEET - DRAW_FRONT_FEET;

// Flat-plane drawing dimensions (SVG user units). Length is compressed vs.
// width for phone legibility. Tune in the visual pass — all geometry derives
// from these two constants.
export const PLANE_W = 100;
export const PLANE_L = 300;

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

/** Distance from foul line (ft) → y on the plane. Foul-relative feet map across
 *  the [DRAW_FRONT_FEET, DRAW_BACK_FEET] drawing extent; smaller feet → lower. */
export function feetToY(feet: number): number {
  return PLANE_L * (1 - (feet - DRAW_FRONT_FEET) / DRAW_SPAN);
}

/** Inverse of feetToY. */
export function yToFeet(y: number): number {
  return DRAW_FRONT_FEET + (1 - y / PLANE_L) * DRAW_SPAN;
}

export const DEFAULT_HOOK_START_FEET = 30;

export interface PlanePoint { x: number; y: number; }

export interface LinePath {
  d: string;
  points: {
    laydown: PlanePoint;
    target: PlanePoint;
    hookStart: PlanePoint | null;
    breakpoint: PlanePoint | null;
    final: PlanePoint;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pt = (x: number, y: number): PlanePoint => ({ x: r2(x), y: r2(y) });
const unit = (dx: number, dy: number) => {
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
};

/** Board the straight skid line (laydown→target) reaches at a given distance. */
export function skidBoard(foul: number, target: number, feet: number): number {
  return foul + (target - foul) * (feet / ARROWS_FEET);
}

/**
 * Build the SVG path + marker points for a line as skid → hook → roll (ADR-012).
 * Needs a foul-line board (`laydown ?? stance`) and a `target`; returns null
 * otherwise.
 *
 * - Skid (straight): laydown → target → hook-start. The hook-start board rides
 *   the skid line; only its distance (`hook_start_distance`) is free.
 * - Hook (smooth cubic): hook-start → breakpoint apex, tangent to the skid line
 *   on entry and the roll line on exit.
 * - Roll (straight): breakpoint → final (`final_board`, default pocket 17.5).
 *
 * With no breakpoint set, the line runs straight to the final point.
 */
export function buildLinePath(line: LineSpec | undefined, hand: Handedness): LinePath | null {
  const foul = line?.laydown ?? line?.stance;
  if (line == null || foul == null || line.target == null) return null;

  const laydown = pt(boardToX(foul, hand), feetToY(0));
  const target = pt(boardToX(line.target, hand), feetToY(ARROWS_FEET));
  const final = pt(boardToX(line.final_board ?? POCKET_BOARD, hand), feetToY(LANE_FEET));

  if (line.breakpoint == null) {
    const d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} L ${final.x} ${final.y}`;
    return { d, points: { laydown, target, hookStart: null, breakpoint: null, final } };
  }

  const bpDist = line.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET;
  const breakpoint = pt(boardToX(line.breakpoint, hand), feetToY(bpDist));

  // Hook-start rides the skid line, clamped between the arrows and the breakpoint.
  const hsDist = Math.max(ARROWS_FEET + 1, Math.min(bpDist - 1, line.hook_start_distance ?? DEFAULT_HOOK_START_FEET));
  const hookStart = pt(boardToX(skidBoard(foul, line.target, hsDist), hand), feetToY(hsDist));

  // Smooth cubic: leave hook-start along the skid heading, arrive at the
  // breakpoint along the roll heading, so both joins are tangent-continuous.
  const len = Math.hypot(breakpoint.x - hookStart.x, breakpoint.y - hookStart.y);
  const t = len * 0.45;
  const skid = unit(target.x - laydown.x, target.y - laydown.y);
  const roll = unit(final.x - breakpoint.x, final.y - breakpoint.y);
  const c1 = pt(hookStart.x + skid.x * t, hookStart.y + skid.y * t);
  const c2 = pt(breakpoint.x - roll.x * t, breakpoint.y - roll.y * t);

  const d =
    `M ${laydown.x} ${laydown.y} L ${hookStart.x} ${hookStart.y} ` +
    `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${breakpoint.x} ${breakpoint.y} ` +
    `L ${final.x} ${final.y}`;

  return { d, points: { laydown, target, hookStart, breakpoint, final } };
}
