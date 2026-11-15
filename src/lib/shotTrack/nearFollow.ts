import { MAX_SPEED_FTS } from "./associate";
import type { Candidate } from "./ballDetect";
import { expectedRadiusPx, imageToLane } from "./laneModel";
import { followForward } from "./release";
import type { GrayFrame, Mat3 } from "./types";

/**
 * The ball over the near lane when the empty lane cannot show it (2026-11-15,
 * shot-04). The empty lane is the median of the clip; a bowler who stays in
 * front of the lane for the whole clip is in it, so a dark ball rolling past
 * dark trousers changes nothing there and is not a candidate, although it is
 * plain to the eye: a dark disc on the bright lane. The detector does see the
 * ball as it comes down to the lane (the hand and the ball against the
 * approach), for a few frames; from there it is followed forward by its own
 * darkness (`followForward`), as the laydown is followed back, until it goes
 * behind the bowler.
 */

/** A run of candidates starting this near the foul line, feet, may seed the follow. */
export const NEAR_SEED_FT = 10;
/** Candidates in a run, at least. */
export const MIN_RUN = 3;
/** How far up the lane a run must move, feet: a shoe or a reflection stays put. */
export const MIN_ADVANCE_FT = 0.3;

/**
 * The seeds: runs of candidates in consecutive frames (one or two apart) on
 * the near lane, each no more than 1.5 boards across from the last and moving
 * up the lane at a ball's speed or less; the last candidate of each run of
 * `MIN_RUN` or more that moves `MIN_ADVANCE_FT` up the lane, longest first.
 */
export function nearSeeds(cands: Candidate[], maxV = NEAR_SEED_FT): Candidate[] {
  const runs: Candidate[][] = [];
  for (const c of [...cands].filter((c) => c.v >= -1 && c.v <= maxV).sort((a, b) => a.frame - b.frame)) {
    const run = runs.find((r) => {
      const p = r[r.length - 1];
      const df = c.frame - p.frame;
      return df >= 1 && df <= 2 && Math.abs(c.u - p.u) <= 1.5 && c.v >= p.v - 0.3 && c.v - p.v <= MAX_SPEED_FTS * Math.max(c.t - p.t, 0) + 0.5;
    });
    if (run) run.push(c);
    else runs.push([c]);
  }
  return runs
    .filter((r) => r.length >= MIN_RUN && r[r.length - 1].v - r[0].v >= MIN_ADVANCE_FT)
    .sort((a, b) => b.length - a.length)
    .map((r) => r[r.length - 1]);
}

/**
 * The ball followed forward by its darkness from `seed` to frame `to`, as
 * candidates for the tracer's circle stage. It stops where the ball stops
 * looking like the ball: its disc shrinks under 85% of the radius the lane
 * predicts there (going behind a leg or a hand), or it moves back down the
 * lane, or further up it than a ball can in the time. `frame(i)` and `H(i)`
 * give each frame and its lane mapping (null where the frame is not usable).
 */
export function followNear(
  frame: (i: number) => GrayFrame | null,
  H: (i: number) => Mat3 | null,
  seed: { frame: number; x: number; y: number },
  to: number
): Candidate[] {
  const h0 = H(seed.frame);
  const f0 = frame(seed.frame);
  if (!h0 || !f0) return [];
  const lane0 = imageToLane(h0, { x: seed.x, y: seed.y });
  const r0 = expectedRadiusPx(h0, lane0.u, lane0.v);
  const out: Candidate[] = [];
  let prev: { v: number; t: number } | null = null;
  for (const d of followForward(frame, seed.frame, { cx: seed.x, cy: seed.y, r: r0 }, to)) {
    const h = H(d.frame);
    const f = frame(d.frame);
    if (!h || !f) break;
    // The point under the ball, roughly (the circle stage places it exactly).
    const { u, v } = imageToLane(h, { x: d.cx, y: d.cy + d.r });
    const r = expectedRadiusPx(h, u, v);
    if (d.r < 0.85 * r) break;
    if (prev && (v < prev.v - 0.3 || v - prev.v > MAX_SPEED_FTS * (f.t - prev.t) + 0.5)) break;
    prev = { v, t: f.t };
    out.push({
      frame: d.frame, t: f.t, x: d.cx, y: d.cy, r, u, v,
      box: { x0: d.cx - d.r, y0: d.cy - d.r, x1: d.cx + d.r, y1: d.cy + d.r }, area: Math.PI * d.r * d.r
    });
  }
  return out;
}
