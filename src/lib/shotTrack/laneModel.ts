import type { Handedness } from "../../types/bowling";
import { LANE_BOARDS } from "../laneGeometry";
import { apply, intersect, invert, segmentLine, solveHomography, downAt } from "./homography";
import type { LaneMarks, Mat3, Point } from "./types";

/**
 * The lane's real dimensions and its coordinates (plan 6.1).
 *
 * `u` runs across the lane in boards from the left edge as seen from the foul
 * line: left edge 0.5, right edge 39.5. `v` is feet from the foul line. This is
 * the only file that turns `u` into the bowler's handed board (ADR-111).
 */

export const LANE_WIDTH_IN = 41.5;
export const BOARD_IN = LANE_WIDTH_IN / LANE_BOARDS;
export const BOARD_FT = BOARD_IN / 12;
export const LEFT_U = 0.5;
export const RIGHT_U = LANE_BOARDS + 0.5;
export const CENTER_U = (LEFT_U + RIGHT_U) / 2;
/** Foul line to the end of the pin deck (the tail plank): 62 ft 10 3/16 in. */
export const DECK_END_FT = 62 + (10 + 3 / 16) / 12;
export const BALL_DIAMETER_IN = 8.5;
export const BALL_RADIUS_FT = BALL_DIAMETER_IN / 2 / 12;
/** The ball's diameter in boards: about 8. */
export const BALL_DIAMETER_BOARDS = BALL_DIAMETER_IN / BOARD_IN;
export const PIN_HEIGHT_FT = 15 / 12;
export const PIN_BELLY_IN = 4.75;
/** Ball centre to pin centre at contact: ball radius plus pin belly radius. */
export const CONTACT_IN = BALL_DIAMETER_IN / 2 + PIN_BELLY_IN / 2;

/**
 * The shape a ball makes across the lane (plan 7.5), in lane u against feet:
 * straight (skid) to `s`, a quadratic bend of strength `k` over `L` feet,
 * then straight again with the slope it left the bend at.
 */
export interface HookShape {
  u0: number;
  a: number;
  s: number;
  L: number;
  k: number;
}

export function hookU(p: HookShape, v: number): number {
  const base = p.u0 + p.a * v;
  if (v <= p.s) return base;
  if (v <= p.s + p.L) return base + p.k * (v - p.s) ** 2;
  const end = p.s + p.L;
  return p.u0 + p.a * end + p.k * p.L ** 2 + (p.a + 2 * p.k * p.L) * (v - end);
}

/** Slope du/dv of the hook shape at v. */
export function hookSlope(p: HookShape, v: number): number {
  if (v <= p.s) return p.a;
  if (v <= p.s + p.L) return p.a + 2 * p.k * (v - p.s);
  return p.a + 2 * p.k * p.L;
}

/** Lane u to the bowler's handed board: board 1 is their own gutter. */
export function handedBoard(u: number, hand: Handedness): number {
  return hand === "right" ? LANE_BOARDS + 1 - u : u;
}

/** Handed board back to lane u. The flip is its own inverse. */
export function laneU(board: number, hand: Handedness): number {
  return handedBoard(board, hand);
}

/** Lane (u, v) to world feet: x across from the lane's centre, y down-lane. */
export function laneToWorld(u: number, v: number): { x: number; y: number } {
  return { x: (u - CENTER_U) * BOARD_FT, y: v };
}

export function worldToLane(x: number, y: number): { u: number; v: number } {
  return { u: x / BOARD_FT + CENTER_U, v: y };
}

/**
 * The far cross-lane line's distance when it is marked through the bases of
 * the 7 and 10 pins. From a phone held at chest height the tail plank is
 * hidden behind the pins (every sample clip), so that line is marked instead;
 * it is 3 inches in front of the deck end.
 */
export const BACK_ROW_FT = 62.6;

/** The corners the marks meet at, in lane coordinates, in the order NL, NR, FL, FR. */
export function laneCorners(farFeet = DECK_END_FT): Point[] {
  return [
    { x: LEFT_U, y: 0 },
    { x: RIGHT_U, y: 0 },
    { x: LEFT_U, y: farFeet },
    { x: RIGHT_U, y: farFeet }
  ];
}

export const LANE_CORNERS: Point[] = laneCorners();

/** Image corners of the marked rectangle, NL, NR, FL, FR, or null if lines are parallel. */
export function markCorners(m: LaneMarks): Point[] | null {
  const L = segmentLine(m.left);
  const R = segmentLine(m.right);
  const F = segmentLine(m.foul);
  const D = segmentLine(m.deck);
  const pts = [intersect(L, F), intersect(R, F), intersect(L, D), intersect(R, D)];
  return pts.every((p) => p !== null) ? (pts as Point[]) : null;
}

/** Lane to image homography from the four marked lines (plan 6.2); the far line sits at `farFeet`. */
export function homographyFromMarks(m: LaneMarks, farFeet = DECK_END_FT): Mat3 {
  const c = markCorners(m);
  if (!c) throw new Error("marked lines do not meet");
  return solveHomography(laneCorners(farFeet), c);
}

export function laneToImage(H: Mat3, u: number, v: number): Point {
  return apply(H, { x: u, y: v });
}

export function imageToLane(H: Mat3, p: Point): { u: number; v: number } {
  const q = apply(invert(H), p);
  return { u: q.x, v: q.y };
}

/**
 * The ball's expected radius in pixels with its contact point at lane (u, v):
 * half the picture's width of 8.5 inches across the lane there (plan 6.5).
 */
export function expectedRadiusPx(H: Mat3, u: number, v: number): number {
  const half = BALL_DIAMETER_BOARDS / 2;
  const a = apply(H, { x: u - half, y: v });
  const b = apply(H, { x: u + half, y: v });
  return Math.hypot(b.x - a.x, b.y - a.y) / 2;
}

/**
 * The lane point under a ball whose circle is (c, r) in the picture (plan 6.4):
 * the centre moved one radius along "down", then mapped through H^-1. This is
 * exact for a camera whose roll matches the horizon and close otherwise.
 */
export function contactPoint(H: Mat3, c: Point, r: number): { contact: Point; u: number; v: number } {
  const d = downAt(H, c);
  const contact = { x: c.x + r * d.x, y: c.y + r * d.y };
  const { u, v } = imageToLane(H, contact);
  return { contact, u, v };
}
