import type { Handedness, LineSpec } from "../types/bowling";

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
