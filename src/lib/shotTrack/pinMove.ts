import { PIN_POSITIONS } from "../pinGeometry";
import { apply, downAt } from "./homography";
import { median, sample } from "./image";
import { BALL_DIAMETER_IN, expectedRadiusPx } from "./laneModel";
import type { GrayFrame, Mat3 } from "./types";

/**
 * The first frame on which a pin moves (2026-11-17, the owner: the board at
 * the pins is read on the last frame before the first pin moves; shot-01's
 * first pin moves on frame 234, shot-06's on 103). Each standing pin is
 * sampled over its own body (its base from its spot on the lane, up to its
 * height, a little wider than its belly either side), the ball and its
 * mirror image masked out, and compared with the same points on the frames
 * before the ball got near. A pin that moves changes a share of its own
 * points; the rack as a whole hardly changes on the first frame, which a
 * mean over the whole deck (the earlier test) missed by three frames on
 * shot-01, and it waited for the last sighting of the ball, which can be one
 * among the falling pins. Pure.
 */

/** A frame for `pinMoves`: its index and time, the picture, its lane mapping, and the ball's circle on it when known. */
export interface PinFrame {
  index: number;
  t: number;
  f: GrayFrame;
  H: Mat3;
  ball: { cx: number; cy: number; r: number } | null;
}

/** Across each pin, boards either side of its spot (the belly is 2.3 boards either side). */
const ACROSS = [-3, -2.25, -1.5, -0.75, 0, 0.75, 1.5, 2.25, 3];
/** Up each pin, shares of its height. */
const UP = [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92];
/** A point counts as changed past this many of its own spreads over the reference frames... */
export const PIN_K = 4;
/** ...and at least this many gray levels. */
export const PIN_FLOOR = 10;
/** A pin moves when at least this share of its points change. */
export const PIN_SHARE = 0.2;
/** A pin's middle is at least this many gray levels brighter than either side, where it is seen. */
export const PIN_CONTRAST = 20;
/** Frames just before each frame it is compared with. */
export const PIN_REFS = 5;

const PIN_IN = 15;

/**
 * A pin's points within this many of the ball's radii of its circle (or its
 * mirror image's) are left out: the ball's own edge and blur. Not more: a pin
 * the ball touches has its near side about 1.3 radii from the ball's center,
 * and that side moves first. At 1.5, with shot-01's circle on the ball at
 * last (2026-11-20), frame 234's first move was hidden and found a frame
 * late; at 1.35 the synthetic shot's ball edge counted as a move a frame
 * early. At 1.42 shot-01, shot-06 and the synthetic shots all find theirs.
 */
export const BALL_MASK = 1.42;

/** Each pin's sample points on a frame, picture pixels; NaN where the ball or its mirror image covers the point. */
function pinPoints(p: PinFrame): { x: number; y: number }[][] {
  const r60 = expectedRadiusPx(p.H, 20, 60);
  const pinH = (PIN_IN / BALL_DIAMETER_IN) * 2 * r60;
  const ball = p.ball;
  return Object.values(PIN_POSITIONS).map((pin) => {
    const pts: { x: number; y: number }[] = [];
    for (const du of ACROSS) {
      const base = apply(p.H, { x: pin.board + du, y: pin.feet });
      const down = downAt(p.H, base);
      for (const k of UP) {
        const q = { x: base.x - k * pinH * down.x, y: base.y - k * pinH * down.y };
        let hidden = false;
        if (ball) {
          const bd = downAt(p.H, { x: ball.cx, y: ball.cy });
          const m = { x: ball.cx + 2 * ball.r * bd.x, y: ball.cy + 2 * ball.r * bd.y };
          hidden = Math.hypot(q.x - ball.cx, q.y - ball.cy) < BALL_MASK * ball.r || Math.hypot(q.x - m.x, q.y - m.y) < BALL_MASK * ball.r;
        }
        pts.push(hidden ? { x: NaN, y: NaN } : q);
      }
    }
    return pts;
  });
}

const valuesOf = (p: PinFrame) => pinPoints(p).map((pts) => pts.map((q) => (Number.isFinite(q.x) ? sample(p.f, q.x, q.y) : NaN)));

/**
 * Per frame of `frames` (in time order), the largest share of one pin's
 * points that changed against the `PIN_REFS` frames just before it (see
 * `pinShares`), over the pins `use` keeps (all of them by default).
 */
export function pinScores(frames: PinFrame[], use: (pin: number) => boolean = () => true): number[] {
  return pinShares(frames).map((ps) => Math.max(0, ...ps.filter((x, p) => use(p + 1) && Number.isFinite(x))));
}

/**
 * Per frame, each pin's share of its points that changed against the
 * `PIN_REFS` frames just before it: their median per point, a change counted
 * past `PIN_K` of the point's spread over them and `PIN_FLOOR`. The frames
 * just before, not one stretch long before: a bowler who walks off the rack
 * (shot-06) uncovers pins that then hold still, and the camera's pan moves
 * every pin a little over a second. NaN for a pin that does not look like a
 * pin on those frames (its middle not `PIN_CONTRAST` brighter than either
 * side: a bowler stands in front of the rack, shot-05), for one mostly
 * behind the ball, and on the first frames. A pin half behind something dark
 * still looks like a pin and changes as it is uncovered, as a moving pin
 * does: `firstPinMove` looks only from when the ball nears the pins.
 */
export function pinShares(frames: PinFrame[]): number[][] {
  const vals = frames.map(valuesOf);
  const mid = (ACROSS.length - 1) >> 1;
  const nUp = UP.length;
  return vals.map((v, i) => {
    const refs = vals.slice(Math.max(0, i - PIN_REFS), i);
    const out = v.map(() => NaN);
    if (refs.length < 3) return out;
    for (let p = 0; p < v.length; p++) {
      const ref = v[p].map((_, k) => {
        const xs = refs.map((r) => r[p][k]).filter(Number.isFinite);
        if (xs.length < 3) return null;
        const m = median(xs);
        return { m, sp: 1.4826 * median(xs.map((y) => Math.abs(y - m))) };
      });
      // A pin: its middle brighter than both its sides, up its body.
      const column = (a: number) => {
        const xs: number[] = [];
        for (let u = 2; u < nUp - 1; u++) {
          const r = ref[a * nUp + u];
          if (r) xs.push(r.m);
        }
        return xs.length >= 2 ? median(xs) : NaN;
      };
      const c = column(mid);
      if (!(c - column(0) >= PIN_CONTRAST && c - column(ACROSS.length - 1) >= PIN_CONTRAST)) continue;
      let n = 0;
      let changed = 0;
      for (let k = 0; k < v[p].length; k++) {
        const x = v[p][k];
        const r = ref[k];
        if (!Number.isFinite(x) || !r) continue;
        n++;
        if (Math.abs(x - r.m) > Math.max(PIN_K * r.sp, PIN_FLOOR)) changed++;
      }
      // A pin mostly behind the ball says nothing.
      if (n >= 0.4 * v[p].length) out[p] = changed / n;
    }
    return out;
  });
}

/**
 * The first frame from time `from` on on which a pin moved: a pin's share of
 * changed points (`pinShares`) over `PIN_SHARE` on it and on the next frame
 * (a single frame's jump, a registration slip or a decoding glitch, changes
 * every pin at once and is gone on the next). Only the pins `use` keeps
 * count: the first pin to move is one the ball reaches, and an arm swept
 * across the far side of the rack is not it (shot-02). Null when no pin is
 * seen to move.
 */
export function firstPinMove(frames: PinFrame[], from: number, use: (pin: number) => boolean = () => true): { index: number; t: number; scores: number[] } | null {
  const scores = pinScores(frames, use);
  const over = (i: number) => scores[i] > PIN_SHARE;
  for (let i = 0; i + 1 < frames.length; i++) {
    if (frames[i].t < from || !over(i) || !over(i + 1)) continue;
    return { index: frames[i].index, t: frames[i].t, scores };
  }
  return null;
}

/**
 * Pins this many boards or less across from the ball's path at their row are
 * ones it can reach first: its radius and a pin's belly are 6.4 boards, and
 * the path is extrapolated over the last feet, where the ball still hooks
 * (shot-02: seen to 53 ft, the path puts it 4 boards right of where it meets
 * the head pin).
 */
export const REACH_BOARDS = 10;

/** The pins (numbered 1 to 10) within `REACH_BOARDS` of `pathU`, the ball's path across the lane at a distance. */
export function pinsInReach(pathU: (v: number) => number): (pin: number) => boolean {
  return (pin) => {
    const p = PIN_POSITIONS[pin as keyof typeof PIN_POSITIONS];
    return !!p && Math.abs(p.board - pathU(p.feet)) <= REACH_BOARDS;
  };
}
