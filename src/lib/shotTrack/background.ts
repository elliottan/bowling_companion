import { apply } from "./homography";
import { warp } from "./image";
import { BALL_DIAMETER_BOARDS, DECK_END_FT, LEFT_U, RIGHT_U, expectedRadiusPx } from "./laneModel";
import type { GrayFrame, Mat3 } from "./types";

/**
 * The lane with nothing on it (plan 7.4): every usable frame's lane region is
 * warped back into the calibration frame's pixels, and the per-pixel median
 * over every fourth frame is the empty lane, ceiling reflections included. If
 * the bowler stands in one place for most of the window the median holds them
 * too. That is fine: the bowler is not the ball.
 */

export interface Roi {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/**
 * The calibration frame's box around the lane and 3 boards either side (a
 * ball in the gutter is still a ball), from a little behind the foul line to
 * the deck end, raised by a ball's height so the top of a ball is inside.
 */
export function laneRoi(H: Mat3, frameWidth: number, frameHeight: number): Roi {
  const pts = [];
  for (const u of [LEFT_U - 3, RIGHT_U + 3]) for (const v of [-4, 0, 20, DECK_END_FT + 0.5]) pts.push(apply(H, { x: u, y: v }));
  const lift = 2.6 * expectedRadiusPx(H, 20, -4) + 4;
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const x1 = Math.min(frameWidth, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - 0.8 * lift - BALL_DIAMETER_BOARDS));
  const y1 = Math.min(frameHeight, Math.ceil(Math.max(...pts.map((p) => p.y)) + lift));
  return { x0, y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

/** A frame's lane region in the calibration frame's pixels. `S` maps calibration pixels to this frame's. */
export function steady(f: GrayFrame, S: Mat3, roi: Roi): GrayFrame {
  return warp(f, S, roi.x0, roi.y0, roi.width, roi.height);
}

/** Per-pixel median of steadied frames; NaN where no frame saw the pixel. */
export function medianBackground(frames: GrayFrame[]): GrayFrame {
  const { width, height } = frames[0];
  const out = new Float32Array(width * height);
  const col = new Float32Array(frames.length);
  for (let i = 0; i < out.length; i++) {
    let n = 0;
    for (const f of frames) {
      const v = f.data[i];
      if (Number.isFinite(v)) col[n++] = v;
    }
    if (!n) {
      out[i] = NaN;
      continue;
    }
    const s = col.subarray(0, n).sort();
    out[i] = n % 2 ? s[n >> 1] : (s[(n >> 1) - 1] + s[n >> 1]) / 2;
  }
  return { width, height, data: out, t: 0 };
}
