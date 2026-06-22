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

/** Distance from foul line (ft) → y on the plane. Foul-relative feet map across
 *  the [DRAW_FRONT_FEET, DRAW_BACK_FEET] drawing extent; smaller feet → lower. */
export function feetToY(feet: number): number {
  return PLANE_L * (1 - (feet - DRAW_FRONT_FEET) / DRAW_SPAN);
}

/** Inverse of feetToY. */
export function yToFeet(y: number): number {
  return DRAW_FRONT_FEET + (1 - y / PLANE_L) * DRAW_SPAN;
}

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
  let d: string;
  if (line.breakpoint != null) {
    const dist = line.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET;
    breakpoint = pt(boardToX(line.breakpoint, hand), feetToY(dist));
    // Skid straight laydown→target, then a quadratic from target to pocket whose
    // control point is placed so the curve passes THROUGH the breakpoint at its
    // midpoint (t=0.5): B(0.5) = ¼·target + ½·ctrl + ¼·pocket ⇒ ctrl = 2·bp − ½(target+pocket).
    // The breakpoint marker then sits on the line instead of floating off it.
    const ctrl = pt(
      2 * breakpoint.x - 0.5 * (target.x + pocket.x),
      2 * breakpoint.y - 0.5 * (target.y + pocket.y)
    );
    d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} Q ${ctrl.x} ${ctrl.y} ${pocket.x} ${pocket.y}`;
  } else {
    d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} L ${pocket.x} ${pocket.y}`;
  }

  return { d, points: { laydown, target, breakpoint, pocket } };
}
