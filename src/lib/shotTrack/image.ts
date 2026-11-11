import { apply } from "./homography";
import type { GrayFrame, Mat3 } from "./types";

/** Small, dull pixel helpers (plan 5.2). Every function takes a `GrayFrame`. */

export function makeFrame(width: number, height: number, t = 0, fill = 0): GrayFrame {
  const data = new Float32Array(width * height);
  if (fill) data.fill(fill);
  return { width, height, data, t };
}

/** Bilinear sample; points outside the picture read as NaN. */
export function sample(f: GrayFrame, x: number, y: number): number {
  if (!(x >= 0 && y >= 0 && x <= f.width - 1 && y <= f.height - 1)) return NaN;
  const x0 = Math.min(Math.floor(x), f.width - 2);
  const y0 = Math.min(Math.floor(y), f.height - 2);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * f.width + x0;
  const d = f.data;
  const top = d[i] + (d[i + 1] - d[i]) * fx;
  const bot = d[i + f.width] + (d[i + f.width + 1] - d[i + f.width]) * fx;
  return top + (bot - top) * fy;
}

/** Mean over a (2r+1) square box, edges clamped. Separable, so linear in r. */
export function boxBlur(f: GrayFrame, r: number): GrayFrame {
  const { width: w, height: h } = f;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += f.data[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = s / n;
    }
  }
  return { width: w, height: h, data: out, t: f.t };
}

/** Central difference gradient, zero on the border. */
export function gradient(f: GrayFrame): { gx: Float32Array; gy: Float32Array } {
  const { width: w, height: h, data: d } = f;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = (d[i + 1] - d[i - 1]) / 2;
      gy[i] = (d[i + w] - d[i - w]) / 2;
    }
  }
  return { gx, gy };
}

/**
 * Fill a `width` by `height` picture whose pixel (x, y) is read from `src` at
 * `M (x + x0, y + y0)`, bilinear. NaN where it falls outside `src`.
 */
export function warp(src: GrayFrame, M: Mat3, x0: number, y0: number, width: number, height: number): GrayFrame {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = apply(M, { x: x + x0, y: y + y0 });
      out[y * width + x] = sample(src, p.x, p.y);
    }
  }
  return { width, height, data: out, t: src.t };
}

/** Shrink by an integer factor, averaging each block. */
export function downsample(f: GrayFrame, k: number): GrayFrame {
  const w = Math.floor(f.width / k);
  const h = Math.floor(f.height / k);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += f.data[(y * k + j) * f.width + x * k + i];
      out[y * w + x] = s / (k * k);
    }
  }
  return { width: w, height: h, data: out, t: f.t };
}

/** Median of the finite values; NaN when there are none. Sorts a copy. */
export function median(values: ArrayLike<number>): number {
  const a: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) a.push(values[i]);
  if (!a.length) return NaN;
  a.sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Peak position refined by a parabola through the sample and its neighbours.
 * Returns an offset in [-0.5, 0.5] from the middle sample.
 */
export function parabolaPeak(left: number, mid: number, right: number): number {
  const den = left - 2 * mid + right;
  if (den === 0 || !Number.isFinite(den)) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / den));
}
