import type { Handedness } from "../../types/bowling";

/**
 * Shared shapes of the shot tracer (docs/SHOT-TRACKER-PLAN.md, section 5).
 *
 * Coordinates used throughout:
 * - image: pixels, x to the right, y down, (0, 0) the top left pixel's centre.
 * - lane: `u` in boards from the left edge as seen from the foul line (left
 *   edge 0.5, right edge 39.5, board n centred on u = n), `v` in feet from the
 *   foul line. Only `laneModel.ts` turns `u` into the bowler's handed board.
 */

/** One grey picture with its presentation time in seconds. */
export interface GrayFrame {
  width: number;
  height: number;
  /** Row-major luma, 0 to 255. */
  data: Uint8Array | Uint8ClampedArray | Float32Array;
  /** Seconds from the start of the clip. */
  t: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A 3 by 3 matrix, row-major. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** A line through two image points. Only its direction and position matter. */
export interface Segment {
  a: Point;
  b: Point;
}

/** The four lines the bowler marks on one frame (R6). */
export interface LaneMarks {
  left: Segment;
  right: Segment;
  foul: Segment;
  deck: Segment;
}

/**
 * How the down-lane distance scale was fixed (plan 6.3). Boards come from the
 * two edges alone; distances and speed need one of these.
 */
export type DistanceSource = "foul" | "arrows" | "default";

export interface LaneCalibration {
  /** Index of the frame the marks were made on. */
  frame: number;
  marks: LaneMarks;
  /** Lane (u, v) to image, in that frame. */
  H: Mat3;
  hand: Handedness;
  distance: DistanceSource;
}

export type MetricState = "measured" | "estimated" | "missing";

export interface Metric {
  value: number | null;
  state: MetricState;
}

/** One frame's measurement of the ball. */
export interface BallSighting {
  frame: number;
  t: number;
  /** Fitted circle in the frame's own pixels. */
  cx: number;
  cy: number;
  r: number;
  /** The point under the ball on the lane, in the frame's pixels (plan 6.4). */
  contact: Point;
  /** Lane position of the contact point. */
  u: number;
  v: number;
  /** 0 to 1, the fraction of the circle's rays that found an edge. */
  weight: number;
  /** The ball's radius the lane's width predicts at its contact point, pixels. */
  rExpected?: number;
  /** Centre of the ball's mirror image, when it was found. */
  reflection?: Point;
  /** Lane position by the radius rule (centre plus expected radius along down), for comparison. */
  radiusU?: number;
  radiusV?: number;
  /** Before the touchdown: not used for the path or the speed (plan 7.4). */
  airborne: boolean;
}

/** The fitted path across the lane, in lane `u` against feet (plan 7.5). */
export interface PathModel {
  kind: "hook" | "spline";
  /** Hook model parameters; for a spline these are the nearest hook fit. */
  u0: number;
  a: number;
  s: number;
  L: number;
  k: number;
  /** Smoothing spline knots (v, u), set when kind is "spline". */
  knots?: [number, number][];
}

export interface TrackMetrics {
  /** Handed boards (ADR-111), feet and degrees. */
  laydown: Metric;
  laydownFeet: Metric;
  arrows: Metric;
  breakpoint: Metric;
  breakpointFeet: Metric;
  pins: Metric;
  entryAngle: Metric;
  launchAngle: Metric;
  /** Miles an hour. */
  speed: Metric;
  speedAtPins: Metric;
}

export type TrackFailure =
  | "unsupported-video"
  | "too-short"
  | "too-small"
  | "lane-not-found"
  | "calibration-off"
  | "too-shaky"
  | "ball-not-found"
  | "too-little-seen";

export interface TrackResult {
  ok: true;
  hand: Handedness;
  sightings: BallSighting[];
  path: PathModel;
  /** Feet of the first and last sighting used by the fit. */
  from: number;
  to: number;
  /** RMS of the across-lane residual, boards. */
  rms: number;
  metrics: TrackMetrics;
  /** Distance against time: v(t) = v0 + w t + d t^2 / 2, feet and seconds. */
  motion: { v0: number; w: number; d: number };
  touchdownFrame: number | null;
  pinFrame: number | null;
}

export interface TrackError {
  ok: false;
  failure: TrackFailure;
  detail: string;
}
