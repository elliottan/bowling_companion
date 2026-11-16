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
  // `apply` and `sample` written out, as they compute: this runs on every pixel of every frame's lane.
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = M;
  const d = src.data;
  const sw = src.width;
  const xMax = sw - 1;
  const yMax = src.height - 1;
  for (let y = 0; y < height; y++) {
    const py = y + y0;
    for (let x = 0; x < width; x++) {
      const px = x + x0;
      const w = m6 * px + m7 * py + m8;
      const sx = (m0 * px + m1 * py + m2) / w;
      const sy = (m3 * px + m4 * py + m5) / w;
      if (!(sx >= 0 && sy >= 0 && sx <= xMax && sy <= yMax)) {
        out[y * width + x] = NaN;
        continue;
      }
      const ix = Math.min(Math.floor(sx), sw - 2);
      const iy = Math.min(Math.floor(sy), src.height - 2);
      const fx = sx - ix;
      const fy = sy - iy;
      const i = iy * sw + ix;
      const top = d[i] + (d[i + 1] - d[i]) * fx;
      const bot = d[i + sw] + (d[i + sw + 1] - d[i + sw]) * fx;
      out[y * width + x] = top + (bot - top) * fy;
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

/** The working copy `median` selects in, grown as needed and reused (the finder takes thousands of medians a frame). */
let scratch = new Float64Array(256);

/** Median of the finite values; NaN when there are none. Works on a copy. */
export function median(values: ArrayLike<number>): number {
  if (scratch.length < values.length) scratch = new Float64Array(Math.max(values.length, 2 * scratch.length));
  const a = scratch;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) a[n++] = v;
  }
  return n ? medianOf(a, n) : NaN;
}

/**
 * Median of the first `n` values of `a` (all finite, `n` at least 1),
 * reordering them: the same value a sort gives, found by selection in linear
 * time.
 */
export function medianOf(a: Float64Array | Float32Array, n: number): number {
  const m = n >> 1;
  select(a, n, m);
  if (n % 2) return a[m];
  // Below the m-th value after the selection are the m smallest: the largest of them is the other middle value.
  let below = a[0];
  for (let i = 1; i < m; i++) if (a[i] > below) below = a[i];
  return (below + a[m]) / 2;
}

/** Reorders the first `n` values of `a` so that `a[k]` is the k-th smallest, the smaller before it and the larger after (Hoare's selection). */
function select(a: Float64Array | Float32Array, n: number, k: number): void {
  let lo = 0;
  let hi = n - 1;
  while (hi > lo) {
    // The middle of three as the pivot, moved to `lo`.
    const mid = (lo + hi) >> 1;
    if (a[mid] < a[lo]) swap(a, mid, lo);
    if (a[hi] < a[lo]) swap(a, hi, lo);
    if (a[hi] < a[mid]) swap(a, hi, mid);
    swap(a, lo, mid);
    const p = a[lo];
    let i = lo;
    let j = hi + 1;
    for (;;) {
      do i++;
      while (i <= hi && a[i] < p);
      do j--;
      while (a[j] > p);
      if (i >= j) break;
      swap(a, i, j);
    }
    swap(a, lo, j);
    if (j === k) return;
    if (j < k) lo = j + 1;
    else hi = j - 1;
  }
}

function swap(a: Float64Array | Float32Array, i: number, j: number): void {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
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
