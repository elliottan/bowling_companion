import { apply, invert, multiply, normalize, solveHomography, solveLinear } from "./homography";
import { downsample, parabolaPeak } from "./image";
import { BACK_ROW_FT, LEFT_U, RIGHT_U } from "./laneModel";
import type { GrayFrame, LaneMarks, Mat3, Point } from "./types";
import * as fdlibm from "./detMath";

/**
 * Carry the calibration from the marked frame to every other frame (plan 7.3).
 *
 * Assumption, stated because everything here rests on it: the person filming
 * turns and zooms the camera but does not walk. The whole picture then moves
 * by one transform whatever the depth, and it is exactly H = K' R K^-1: R the
 * camera's turn, K its lens (focal length f in pixels, centred), K' the same
 * lens zoomed by s. A similarity is only the first-order part of it; with a
 * phone's wide lens and a few degrees of tilt the difference is pixels at the
 * bottom of the picture, where the laydown is. The focal length is one
 * unknown for the whole clip, fitted once; each frame has three angles and a
 * zoom, measured on everything static in the picture (see `register`).
 */

export interface FrameSource {
  count: number;
  frame(i: number): GrayFrame;
}

export interface FrameGeometry {
  index: number;
  ok: boolean;
  /** Lost; "lane-left" once lost for `GIVE_UP_S`, after which the pass stopped looking. */
  reason?: "lane-lost" | "jump" | "lane-left";
  /** Calibration frame pixels to this frame's pixels. */
  S: Mat3;
  /** The lane's edges, foul line and pin row in this frame, from H. */
  marks: LaneMarks;
  /** Lane (u, v) to this frame's pixels. */
  H: Mat3;
  /** Share of the calibration frame's patches that agreed with the transform. */
  share: number;
  /** The camera's turn from the calibration frame (radians, rotation vector) and zoom. */
  turn: [number, number, number];
  zoom: number;
  /** The lens the turn was fitted with. */
  lens: Lens;
  /** Floor patches that agreed, when the frame was registered on the lane's plane (`registerPlane`). */
  plane?: number;
}

export interface RegisterOptions {
  /** R4: the largest change between consecutive frames, a fraction of the picture. */
  maxJump?: number;
  /** A patch match within this many pixels of the model agrees with it. */
  tolerance?: number;
  /** The lens's focal length in pixels, when known; otherwise fitted. */
  focal?: number;
}

/**
 * The mean absolute difference of `a` and `b` shifted by (dx, dy) over the
 * box, every `stride`th pixel; Infinity when no pixel falls inside `b`. Given
 * up (returning more than `bound`, never less) once the sum alone is past
 * `bound` of the mean: it only grows.
 */
function sad(a: GrayFrame, b: GrayFrame, dx: number, dy: number, x0: number, x1: number, y0: number, y1: number, stride: number, bound = Infinity): number {
  // The pixels counted, worked out first so the running sum can be judged as a mean.
  let ny = 0;
  for (let y = y0; y < y1; y += stride) if (y + dy >= 0 && y + dy < b.height) ny++;
  let nx = 0;
  for (let x = x0; x < x1; x += stride) if (x + dx >= 0 && x + dx < b.width) nx++;
  const n = nx * ny;
  if (!n) return Infinity;
  const ad = a.data;
  const bd = b.data;
  let s = 0;
  for (let y = y0; y < y1; y += stride) {
    const yb = y + dy;
    if (yb < 0 || yb >= b.height) continue;
    const ra = y * a.width;
    const rb = yb * b.width + dx;
    for (let x = x0; x < x1; x += stride) {
      const xb = x + dx;
      if (xb < 0 || xb >= b.width) continue;
      s += Math.abs(ad[ra + x] - bd[rb + x]);
    }
    if (s / n > bound) return s / n;
  }
  return s / n;
}

/** Side of the blocks `bestShift` bounds a shift's cost by, pixels. */
const SHIFT_BLOCK = 8;

/**
 * The shift of least `sad` within +-r of (cx, cy), the first in row order on
 * a tie, and every shift's cost (NaN where given up). With `stride` 1, a
 * shift whose box lies inside `b` is skipped when its blocks' sums show it
 * cannot beat the best (the absolute differences over a block are at least
 * the difference of its sums), read from `b`'s running sums.
 */
function bestShift(a: GrayFrame, b: GrayFrame, cx: number, cy: number, r: number, box: [number, number, number, number], stride: number) {
  const [x0, x1, y0, y1] = box;
  const w = 2 * r + 1;
  const grid = new Float64Array(w * w).fill(NaN);
  let bound: ((dx: number, dy: number) => number) | null = null;
  if (stride === 1 && x1 > x0 && y1 > y0) {
    const xs: number[] = [];
    for (let x = x0; x < x1; x += SHIFT_BLOCK) xs.push(x);
    xs.push(x1);
    const ys: number[] = [];
    for (let y = y0; y < y1; y += SHIFT_BLOCK) ys.push(y);
    ys.push(y1);
    const sums: number[] = [];
    for (let j = 0; j + 1 < ys.length; j++) {
      for (let i = 0; i + 1 < xs.length; i++) {
        let t = 0;
        for (let y = ys[j]; y < ys[j + 1]; y++) for (let x = xs[i]; x < xs[i + 1]; x++) t += a.data[y * a.width + x];
        sums.push(t);
      }
    }
    const I = new Float64Array((b.width + 1) * (b.height + 1));
    const IW = b.width + 1;
    for (let y = 0; y < b.height; y++) {
      let row = 0;
      for (let x = 0; x < b.width; x++) {
        row += b.data[y * b.width + x];
        I[(y + 1) * IW + x + 1] = I[y * IW + x + 1] + row;
      }
    }
    const n = (x1 - x0) * (y1 - y0);
    bound = (dx, dy) => {
      if (x0 + dx < 0 || x1 + dx > b.width || y0 + dy < 0 || y1 + dy > b.height) return -Infinity;
      let lb = 0;
      let k = 0;
      for (let j = 0; j + 1 < ys.length; j++) {
        const top = (ys[j] + dy) * IW;
        const bottom = (ys[j + 1] + dy) * IW;
        for (let i = 0; i + 1 < xs.length; i++, k++) {
          const left = xs[i] + dx;
          const right = xs[i + 1] + dx;
          lb += Math.abs(sums[k] - (I[bottom + right] - I[top + right] - I[bottom + left] + I[top + left]));
        }
      }
      // A hair under, for the rounding of the sums.
      return (lb / n) * (1 - 1e-9) - 1e-9;
    };
  }
  // The middle first: near the answer, it makes a low bound early.
  let best = { dx: cx, dy: cy, e: sad(a, b, cx, cy, x0, x1, y0, y1, stride), k: r * w + r };
  grid[best.k] = best.e;
  for (let dy = cy - r; dy <= cy + r; dy++) {
    for (let dx = cx - r; dx <= cx + r; dx++) {
      const k = (dy - cy + r) * w + dx - cx + r;
      if (k === r * w + r || (bound && bound(dx, dy) > best.e)) continue;
      const e = sad(a, b, dx, dy, x0, x1, y0, y1, stride, best.e);
      if (e <= best.e) grid[k] = e;
      if (e < best.e || (e === best.e && e < Infinity && k < best.k)) best = { dx, dy, e, k };
    }
  }
  /** A shift's cost, summed in full when it was given up; undefined outside the search. */
  const cost = (dx: number, dy: number): number | undefined => {
    if (Math.abs(dx - cx) > r || Math.abs(dy - cy) > r) return undefined;
    const k = (dy - cy + r) * w + dx - cx + r;
    if (Number.isNaN(grid[k])) grid[k] = sad(a, b, dx, dy, x0, x1, y0, y1, stride);
    return grid[k];
  };
  return { dx: best.dx, dy: best.dy, e: best.e, cost };
}

/**
 * The shift of the picture from `a` to `b`, by block matching the top third
 * (the ceiling and the masking units: static, textured, and above the bowler),
 * coarse at a quarter of the resolution and then at full resolution, with a
 * parabola for the sub-pixel part (plan 7.1). `qa` and `qb` are the two
 * pictures at a quarter of the resolution, when already made.
 */
export function globalShift(a: GrayFrame, b: GrayFrame, range = 40, qa = downsample(a, 4), qb = downsample(b, 4)): Point {
  const qbox: [number, number, number, number] = [Math.round(qa.width * 0.1), Math.round(qa.width * 0.9), 2, Math.round(qa.height / 3)];
  const coarse = bestShift(qa, qb, 0, 0, Math.ceil(range / 4), qbox, 1);
  const box: [number, number, number, number] = [Math.round(a.width * 0.1), Math.round(a.width * 0.9), 8, Math.round(a.height / 3)];
  const fine = bestShift(a, b, coarse.dx * 4, coarse.dy * 4, 4, box, 3);
  const e = (dx: number, dy: number) => fine.cost(dx, dy) ?? fine.e;
  const sub = (l: number, m: number, r: number) => {
    const den = l - 2 * m + r;
    return den > 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
  };
  return {
    x: fine.dx + sub(e(fine.dx - 1, fine.dy), fine.e, e(fine.dx + 1, fine.dy)),
    y: fine.dy + sub(e(fine.dx, fine.dy - 1), fine.e, e(fine.dx, fine.dy + 1))
  };
}

/** A textured square of the calibration frame, matched in every other frame. */
export interface Patch {
  x: number;
  y: number;
  /** Half-size, pixels. */
  h: number;
}

/**
 * Textured patches over the whole calibration frame: the masking units, the
 * ceiling, the neighbouring lanes and racks. A patch needs structure in both
 * directions (a plain line cannot fix a shift along itself).
 */
export function choosePatches(f: GrayFrame, size?: number, keep?: (p: Point) => boolean, max = 220): Patch[] {
  const h = Math.round((size ?? Math.max(12, Math.min(f.width, f.height) / 36)) / 2);
  // Only where `keep` allows (the floor), patches overlap by half, as that region is small.
  const step = keep ? h : 2 * h + Math.max(4, Math.round(h * 1.5));
  const out: (Patch & { e: number })[] = [];
  for (let y = h + 8; y < f.height - h - 8; y += step) {
    for (let x = h + 8; x < f.width - h - 8; x += step) {
      if (keep && !keep({ x, y })) continue;
      // Smaller eigenvalue of the structure tensor: high only where the patch
      // has edges in two directions (a line, straight or slanted, does not).
      let xx = 0;
      let yy = 0;
      let xy = 0;
      let n = 0;
      for (let j = -h; j < h; j++) {
        for (let i = -h; i < h; i++) {
          const k = (y + j) * f.width + x + i;
          const dx = f.data[k + 1] - f.data[k];
          const dy = f.data[k + f.width] - f.data[k];
          xx += dx * dx;
          yy += dy * dy;
          xy += dx * dy;
          n++;
        }
      }
      const tr = (xx + yy) / 2;
      const lam = tr - Math.sqrt(Math.max(0, ((xx - yy) / 2) ** 2 + xy * xy));
      out.push({ x, y, h, e: Math.sqrt(Math.max(0, lam) / n) });
    }
  }
  // Sensor noise alone gives every patch some gradient: keep the patches well
  // above the typical one.
  const typical = out.map((p) => p.e).sort((a, b) => a - b)[out.length >> 1] ?? 0;
  return out.filter((p) => p.e > Math.max(4, 1.5 * typical)).sort((a, b) => b.e - a.e).slice(0, max);
}

/** Blocks a patch is cut into across and down for `matchPatch`'s bound. */
const BLOCKS = 4;

/** The last picture's running sums (`integral`): every patch of one frame is matched in turn. */
let summed: { data: GrayFrame["data"]; I: Float64Array | Int32Array } | null = null;

/**
 * The picture's sums over every rectangle from its top left corner, (width +
 * 1) by (height + 1): whole numbers for a picture of bytes (exact, and
 * quicker to write), else doubles.
 */
function integral(f: GrayFrame): Float64Array | Int32Array {
  if (summed && summed.data === f.data) return summed.I;
  const w = f.width;
  const W = w + 1;
  const n = W * (f.height + 1);
  const I = !(f.data instanceof Float32Array) && f.width * f.height * 255 < 2 ** 31 ? new Int32Array(n) : new Float64Array(n);
  const d = f.data;
  for (let y = 0; y < f.height; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += d[y * w + x];
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
    }
  }
  summed = { data: f.data, I };
  return I;
}

const orders = new Map<number, number[]>();

/** The shifts of a +-r search but its middle, as indices in row order: the eight around the middle first, then the rest in row order. */
function searchOrder(r: number): number[] {
  const known = orders.get(r);
  if (known) return known;
  const w = 2 * r + 1;
  const ring: number[] = [];
  const rest: number[] = [];
  for (let k = 0; k < w * w; k++) {
    const dx = (k % w) - r;
    const dy = Math.floor(k / w) - r;
    if (!dx && !dy) continue;
    (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? ring : rest).push(k);
  }
  const order = [...ring, ...rest];
  orders.set(r, order);
  return order;
}

/** A patch of the calibration frame as `matchPatch` reads it, made once for every frame it is matched in. */
interface Prepared {
  data: GrayFrame["data"];
  /** Bytes, so whole-number sums. */
  ints: boolean;
  /** The patch, row after row. */
  tpl: Int32Array | Float64Array;
  /** Block edges from the patch's middle, and each block's sum and size; the same in quarters. */
  edges: number[];
  sumsA: Float64Array;
  sizes: Float64Array;
  sumsA2: Float64Array;
  sizes2: Float64Array;
}

const prepared = new WeakMap<Patch, Prepared>();

function prepare(c0: GrayFrame, p: Patch): Prepared {
  const known = prepared.get(p);
  if (known && known.data === c0.data) return known;
  const a = c0.data;
  const aw = c0.width;
  const h = p.h;
  const side = 2 * h;
  const ints = !(a instanceof Float32Array) && side * side * 255 * 255 < 2 ** 31;
  const tpl = ints ? new Int32Array(side * side) : new Float64Array(side * side);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) tpl[j * side + i] = a[(p.y - h + j) * aw + p.x - h + i];
  const edges: number[] = [];
  for (let k = 0; k <= BLOCKS; k++) edges.push(-h + Math.round((2 * h * k) / BLOCKS));
  const sumsA = new Float64Array(BLOCKS * BLOCKS);
  const sizes = new Float64Array(BLOCKS * BLOCKS);
  for (let by = 0; by < BLOCKS; by++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      let t = 0;
      for (let j = edges[by]; j < edges[by + 1]; j++) for (let i = edges[bx]; i < edges[bx + 1]; i++) t += a[(p.y + j) * aw + p.x + i];
      sumsA[by * BLOCKS + bx] = t;
      sizes[by * BLOCKS + bx] = (edges[by + 1] - edges[by]) * (edges[bx + 1] - edges[bx]);
    }
  }
  // The same in quarters (2 by 2 of the blocks), a quarter of the reads: tried first.
  const H2 = BLOCKS / 2;
  const sumsA2 = new Float64Array(4);
  const sizes2 = new Float64Array(4);
  for (let k = 0; k < BLOCKS * BLOCKS; k++) {
    const q = (Math.floor(k / BLOCKS) >= H2 ? 2 : 0) + ((k % BLOCKS) >= H2 ? 1 : 0);
    sumsA2[q] += sumsA[k];
    sizes2[q] += sizes[k];
  }
  const out = { data: a, ints, tpl, edges, sumsA, sizes, sumsA2, sizes2 };
  prepared.set(p, out);
  return out;
}

/**
 * The squared differences of a patch (`side` by `side`, row after row) and
 * the picture from `at` (`width` a row), given up after the first row that
 * takes them past `bound`. Bytes: each row's sum is a whole number, exact in
 * 32 bits.
 */
function ssdBytes(tpl: Int32Array, b: Uint8Array | Uint8ClampedArray, side: number, at: number, width: number, bound: number): number {
  let e = 0;
  for (let j = 0, r0 = 0, r1 = at; j < side; j++, r0 += side, r1 += width) {
    let row = 0;
    for (let i = 0; i < side; i++) {
      const d = tpl[r0 + i] - b[r1 + i];
      row = (row + d * d) | 0;
    }
    e += row;
    if (e > bound) return e;
  }
  return e;
}

/** `ssdBytes` for any picture, summed one pixel at a time in row order. */
function ssdFloats(tpl: Int32Array | Float64Array, b: GrayFrame["data"], side: number, at: number, width: number, bound: number): number {
  let e = 0;
  for (let j = 0, r0 = 0, r1 = at; j < side; j++, r0 += side, r1 += width) {
    for (let i = 0; i < side; i++) {
      const d = tpl[r0 + i] - b[r1 + i];
      e += d * d;
    }
    if (e > bound) return e;
  }
  return e;
}

/** Where a calibration patch lies in frame f, searched +-r around `guess`, sub-pixel; null when not found. */
export function matchPatch(c0: GrayFrame, f: GrayFrame, p: Patch, guess: Point, r = 6): Point | null {
  const gx = Math.round(guess.x);
  const gy = Math.round(guess.y);
  if (gx - p.h - r < 1 || gy - p.h - r < 1 || gx + p.h + r >= f.width - 1 || gy + p.h + r >= f.height - 1) return null;
  const b = f.data;
  const bw = f.width;
  const h = p.h;
  const prep = prepare(c0, p);
  const { tpl, edges, sumsA, sizes, sumsA2, sizes2 } = prep;
  const ints = prep.ints && !(b instanceof Float32Array);
  // Squared differences: a smooth cost surface, so the parabola through its
  // minimum gives the sub-pixel part (absolute differences make a V). A
  // shift's sum is given up once it passes the best so far (it only grows),
  // so only the best and its four neighbors are ever summed in full; the
  // best is the first smallest in the order the shifts are listed, as a full
  // search finds it.
  const side = 2 * h;
  const err = (dx: number, dy: number, bound: number) =>
    ints
      ? ssdBytes(tpl as Int32Array, b as Uint8Array, side, (gy + dy - h) * bw + gx + dx - h, bw, bound)
      : ssdFloats(tpl, b, side, (gy + dy - h) * bw + gx + dx - h, bw, bound);
  // A shift is not summed at all when it cannot beat the best: over each
  // block of the patch the squared differences are at least the square of the
  // summed difference over the block's size (Cauchy-Schwarz), and the frame's
  // block sums come from its running sums in four reads.
  const I = integral(f);
  const IW = bw + 1;
  const H2 = BLOCKS / 2;
  // A hair under, for the rounding of the sums of fractional pictures.
  const under = (lb: number) => lb * (1 - 1e-9) - 1e-6;
  const lowest = (dx: number, dy: number, bound: number) => {
    const x0 = gx + dx;
    const y0 = gy + dy;
    let lb = 0;
    for (let qy = 0; qy < 2; qy++) {
      const top = (y0 + edges[qy * H2]) * IW;
      const bottom = (y0 + edges[qy * H2 + H2]) * IW;
      for (let qx = 0; qx < 2; qx++) {
        const left = x0 + edges[qx * H2];
        const right = x0 + edges[qx * H2 + H2];
        const diff = sumsA2[qy * 2 + qx] - (I[bottom + right] - I[top + right] - I[bottom + left] + I[top + left]);
        lb += (diff * diff) / sizes2[qy * 2 + qx];
      }
    }
    if (under(lb) > bound) return lb;
    lb = 0;
    for (let by = 0; by < BLOCKS; by++) {
      const top = (y0 + edges[by]) * IW;
      const bottom = (y0 + edges[by + 1]) * IW;
      for (let bx = 0; bx < BLOCKS; bx++) {
        const left = x0 + edges[bx];
        const right = x0 + edges[bx + 1];
        const k = by * BLOCKS + bx;
        const diff = sumsA[k] - (I[bottom + right] - I[top + right] - I[bottom + left] + I[top + left]);
        lb += (diff * diff) / sizes[k];
      }
    }
    return under(lb);
  };
  const w = 2 * r + 1;
  // The guess and the shifts around it first: near the answer, they make a low bound early.
  let best = r * w + r;
  let bestE = err(0, 0, Infinity);
  for (const k of searchOrder(r)) {
    const dx = (k % w) - r;
    const dy = Math.floor(k / w) - r;
    if (lowest(dx, dy, bestE) > bestE) continue;
    const e = err(dx, dy, bestE);
    if (e < bestE || (e === bestE && k < best)) {
      bestE = e;
      best = k;
    }
  }
  const bx = (best % w) - r;
  const by = Math.floor(best / w) - r;
  if (Math.abs(bx) === r || Math.abs(by) === r) return null;
  const at = (dx: number, dy: number) => err(dx, dy, Infinity);
  return {
    x: gx + bx + parabolaPeak(-at(bx - 1, by), -bestE, -at(bx + 1, by)),
    y: gy + by + parabolaPeak(-at(bx, by - 1), -bestE, -at(bx, by + 1))
  };
}

/** The lens: focal length and centre, pixels. */
export interface Lens {
  f: number;
  cx: number;
  cy: number;
}

/** A rotation matrix from a rotation vector (Rodrigues). */
export function rotation(r: [number, number, number]): number[] {
  const th = Math.hypot(r[0], r[1], r[2]);
  if (th < 1e-12) return [1, -r[2], r[1], r[2], 1, -r[0], -r[1], r[0], 1];
  const [x, y, z] = [r[0] / th, r[1] / th, r[2] / th];
  const c = fdlibm.cos(th);
  const s = fdlibm.sin(th);
  const C = 1 - c;
  return [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C
  ];
}

/** Camera parameters of one frame against the calibration frame: rotation vector and log zoom. */
export type TurnParams = [number, number, number, number];

/** H = K' R K^-1 for a camera that turns by r and zooms by exp(p[3]). */
export function turnHomography(lens: Lens, p: TurnParams): Mat3 {
  const R = rotation([p[0], p[1], p[2]]);
  const fz = lens.f * fdlibm.exp(p[3]);
  const K2: Mat3 = [fz, 0, lens.cx, 0, fz, lens.cy, 0, 0, 1];
  const Ki: Mat3 = [1 / lens.f, 0, -lens.cx / lens.f, 0, 1 / lens.f, -lens.cy / lens.f, 0, 0, 1];
  return normalize(multiply(K2, multiply(R as Mat3, Ki)));
}

function residuals(lens: Lens, p: TurnParams, P: Point[], Q: Point[]): number[] {
  const H = turnHomography(lens, p);
  const out: number[] = [];
  for (let i = 0; i < P.length; i++) {
    const r = apply(H, P[i]);
    out.push(r.x - Q[i].x, r.y - Q[i].y);
  }
  return out;
}

/** Least squares turn and zoom taking each P to its Q, from a starting guess (Gauss-Newton, damped). */
export function fitTurn(lens: Lens, start: TurnParams, P: Point[], Q: Point[], iterations = 12): { p: TurnParams; rms: number } {
  let p = start.slice() as TurnParams;
  let r0 = residuals(lens, p, P, Q);
  let cost = r0.reduce((s, v) => s + v * v, 0);
  let lambda = 1e-4;
  for (let it = 0; it < iterations; it++) {
    const J: number[][] = [];
    for (let j = 0; j < 4; j++) {
      const q = p.slice() as TurnParams;
      q[j] += 1e-6;
      J.push(residuals(lens, q, P, Q).map((v, i) => (v - r0[i]) / 1e-6));
    }
    const A = J.map((a) => J.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
    const g = J.map((a) => -a.reduce((s, v, i) => s + v * r0[i], 0));
    let stepped = false;
    for (let tries = 0; tries < 6; tries++) {
      let d: number[];
      try {
        d = solveLinear(A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v))), g);
      } catch {
        lambda *= 10;
        continue;
      }
      const q = p.map((v, i) => v + d[i]) as TurnParams;
      const r1 = residuals(lens, q, P, Q);
      const c = r1.reduce((s, v) => s + v * v, 0);
      if (c <= cost) {
        const small = Math.max(...d.map(Math.abs)) < 1e-9;
        p = q;
        r0 = r1;
        cost = c;
        lambda = Math.max(1e-9, lambda / 10);
        stepped = !small;
        break;
      }
      lambda *= 10;
    }
    if (!stepped) break;
  }
  return { p, rms: Math.sqrt(cost / Math.max(1, P.length)) };
}

/**
 * The turn and zoom from calibration pixels to this frame's, robustly: small
 * random-free samples of the matches (evenly spread triples) are fitted from
 * the guess, the matches within `tol` pixels are each sample's support, and
 * the best support is refitted. Patches on the bowler or the ball move
 * against the rest and fall out.
 */
export function robustTurn(lens: Lens, guess: TurnParams, P: Point[], Q: Point[], tol = 1.5): { p: TurnParams; inliers: number[] } | null {
  const n = P.length;
  if (n < 4) return null;
  const support = (p: TurnParams) => {
    const H = turnHomography(lens, p);
    const inl: number[] = [];
    for (let k = 0; k < n; k++) {
      const r = apply(H, P[k]);
      if (Math.hypot(r.x - Q[k].x, r.y - Q[k].y) < tol) inl.push(k);
    }
    return inl;
  };
  let best = support(guess);
  let bestP = guess;
  const trials = Math.min(60, n * 2);
  for (let t = 0; t < trials; t++) {
    const idx = [(t * 7) % n, (t * 13 + n / 3) % n, (t * 29 + (2 * n) / 3) % n].map(Math.floor);
    if (new Set(idx).size < 3) continue;
    const fit = fitTurn(lens, guess, idx.map((k) => P[k]), idx.map((k) => Q[k]), 6);
    const inl = support(fit.p);
    if (inl.length > best.length) {
      best = inl;
      bestP = fit.p;
    }
  }
  if (best.length < 4) return null;
  let p = bestP;
  for (let it = 0; it < 3; it++) {
    p = fitTurn(lens, p, best.map((k) => P[k]), best.map((k) => Q[k])).p;
    const inl = support(p);
    if (inl.length < 4) break;
    best = inl;
  }
  return { p, inliers: best };
}

/** The lane's edges, foul line and pin row, as lines in the picture, from a lane mapping. */
export function laneMarksOf(H: Mat3): LaneMarks {
  const at = (u: number, v: number) => apply(H, { x: u, y: v });
  return {
    left: { a: at(LEFT_U, 0), b: at(LEFT_U, BACK_ROW_FT) },
    right: { a: at(RIGHT_U, 0), b: at(RIGHT_U, BACK_ROW_FT) },
    foul: { a: at(LEFT_U, 0), b: at(RIGHT_U, 0) },
    deck: { a: at(LEFT_U, BACK_ROW_FT), b: at(RIGHT_U, BACK_ROW_FT) }
  };
}

/** One frame's patch matches against the calibration frame. */
export interface Matches {
  index: number;
  P: Point[];
  Q: Point[];
  inliers: number[];
  p: TurnParams;
  ok: boolean;
  reason?: FrameGeometry["reason"];
  /** How many patches the frame was matched by (its key frame's, `RegisterPass`), when not the calibration frame's. */
  patches?: number;
}

/** The frames a pass from the calibration frame visits, in order: `dir` 1 forward to `last`, -1 back to `first`. */
export function passFrames(calibFrame: number, dir: 1 | -1, first: number, last: number): number[] {
  const out: number[] = [];
  for (let i = calibFrame + dir; i >= first && i <= last; i += dir) out.push(i);
  return out;
}

/** The lens `register` starts from: the given focal length, or one and a half times the picture's larger side. */
function startLens(width: number, height: number, opts: RegisterOptions): Lens {
  return { f: opts.focal ?? 1.5 * Math.max(width, height), cx: (width - 1) / 2, cy: (height - 1) / 2 };
}

/**
 * A pass moves its key frame on (`RegisterPass`) once the camera has zoomed
 * this much from it, as a log: a patch is matched by its picture alone, at
 * one size, and at 5% the rim of a 26 px patch has moved 0.65 px against its
 * middle. IMG_2938 zooms from 0.57 to 1.88 of the calibration frame's scale
 * from the release to the pins; matched against the calibration frame
 * alone, the share of patches found fell under the 0.15 floor outside 0.71
 * to 1.18 of it, and every frame further out was lost.
 */
export const REKEY_ZOOM = 0.05;
/**
 * ...or once fewer than this share of its patches would still be inside the
 * picture (the camera panned away from them): those that left can no longer
 * be found, and the frame would be lost with half the picture still in common.
 */
export const REKEY_IN_VIEW = 0.6;
/**
 * A pass that has lost every frame for this long, seconds, stops looking:
 * no input found its frames again after more than 0.1 s lost (6447's lost
 * frames back from the calibration frame, IMG_2938's once the camera turned
 * to the bowler), and each lost frame costs a full search.
 */
export const GIVE_UP_S = 0.5;

/** A pass's key frame: the frame whose patches are matched, and its turn from the calibration frame. */
interface KeyFrame {
  frame: GrayFrame;
  patches: Patch[];
  /** Key frame pixels back to the calibration frame's; null for the calibration frame itself. */
  back: Mat3 | null;
  p: TurnParams;
}

/**
 * One direction of `register`, a frame at a time: forward (`dir` 1) or back
 * from the calibration frame, each frame matched around where the frame
 * before it in the pass and the coarse shift put the patches. The two
 * directions share nothing, so they can run side by side (in two workers);
 * `step` must be given the frames in `passFrames` order.
 *
 * The patches are the key frame's: the calibration frame's at first, and a
 * frame's own once the camera has zoomed `REKEY_ZOOM` from the key frame or
 * turned most of its patches out of the picture (`REKEY_IN_VIEW`). Each match
 * is carried back to the calibration frame's pixels through the key frame's
 * turn, so every frame's turn and zoom is still fitted from the calibration
 * frame: a phone that zooms or pans while the ball rolls is followed a key
 * frame at a time. A camera that holds still never moves its key frame and
 * is registered as before, to the bit.
 */
export class RegisterPass {
  private readonly lens0: Lens;
  private readonly tol: number;
  private readonly maxJump: number;
  private readonly calibPatches: number;
  private key: KeyFrame;
  private prev: TurnParams = [0, 0, 0, 0];
  private prevFrame: GrayFrame;
  private qPrev: GrayFrame;
  /** When the frames started being lost (the first of a run of lost frames), null while registered. */
  private lostAt: number | null = null;
  /** How many times the key frame moved on. */
  rekeyed = 0;

  constructor(c0: GrayFrame, opts: RegisterOptions = {}) {
    this.lens0 = startLens(c0.width, c0.height, opts);
    this.key = { frame: c0, patches: choosePatches(c0), back: null, p: [0, 0, 0, 0] };
    this.calibPatches = this.key.patches.length;
    this.tol = opts.tolerance ?? 1.5;
    this.maxJump = opts.maxJump ?? 0.05;
    this.prevFrame = c0;
    // Each frame at a quarter of the resolution, made once for the shifts from it and to it.
    this.qPrev = downsample(c0, 4);
  }

  /** The next frame of the pass, `i` its index: its matches and turn. */
  step(i: number, f: GrayFrame): Matches {
    const { lens0, prev, key } = this;
    // Lost for `GIVE_UP_S`: the camera has left the lane for good (IMG_2938
    // turned to the bowler walking back), and the frames after are not looked at.
    if (this.lostAt !== null && Math.abs(f.t - this.lostAt) >= GIVE_UP_S) {
      return { index: i, P: [], Q: [], inliers: [], p: prev, ok: false, reason: "lane-left", patches: key.back ? key.patches.length : undefined };
    }
    const q = downsample(f, 4);
    const g = globalShift(this.prevFrame, f, 40, this.qPrev, q);
    this.qPrev = q;
    this.prevFrame = f;
    const prevH = turnHomography(lens0, prev);
    // The coarse shift as a small pan and tilt on top of the last frame's turn.
    const guess: TurnParams = [prev[0] - g.y / lens0.f, prev[1] + g.x / lens0.f, prev[2], prev[3]];
    const guessH = multiply([1, 0, g.x, 0, 1, g.y, 0, 0, 1], prevH);
    // Key frame pixels to this frame's, as guessed.
    const fromKey = key.back ? multiply(guessH, key.back) : guessH;
    const P: Point[] = [];
    const Q: Point[] = [];
    for (const pt of key.patches) {
      const m = matchPatch(key.frame, f, pt, apply(fromKey, pt));
      if (m) {
        P.push(key.back ? apply(key.back, pt) : pt);
        Q.push(m);
      }
    }
    const fit = robustTurn(lens0, guess, P, Q, this.tol);
    const share = fit ? fit.inliers.length / Math.max(1, key.patches.length) : 0;
    const patches = key.back ? key.patches.length : undefined;
    if (!fit || fit.inliers.length < 8 || share < 0.15) {
      this.prev = guess;
      this.lostAt ??= f.t;
      return { index: i, P, Q, inliers: fit?.inliers ?? [], p: guess, ok: false, reason: "lane-lost", patches };
    }
    this.lostAt = null;
    const bad = jumpedTurn(prev, fit.p, lens0.f, f.width, f.height, this.maxJump);
    this.prev = fit.p;
    if (!bad && this.moveKey(fit.p, f)) {
      this.key = { frame: f, patches: choosePatches(f), back: invert(turnHomography(lens0, fit.p)), p: fit.p };
      this.rekeyed++;
    }
    return { index: i, P, Q, inliers: fit.inliers, p: fit.p, ok: !bad, reason: bad ? "jump" : undefined, patches };
  }

  /** Whether a frame registered at `p` should be the key frame from here on (`REKEY_ZOOM`, `REKEY_IN_VIEW`). */
  private moveKey(p: TurnParams, f: GrayFrame): boolean {
    const { key } = this;
    if (Math.abs(p[3] - key.p[3]) > REKEY_ZOOM) return true;
    const H = turnHomography(this.lens0, p);
    const toF = key.back ? multiply(H, key.back) : H;
    let inside = 0;
    for (const pt of key.patches) {
      const r = apply(toF, pt);
      if (r.x - pt.h >= 0 && r.y - pt.h >= 0 && r.x + pt.h < f.width && r.y + pt.h < f.height) inside++;
    }
    return inside < REKEY_IN_VIEW * key.patches.length;
  }

  /** How many patches the calibration frame is matched by. */
  get patchCount(): number {
    return this.calibPatches;
  }
}

/**
 * `register`'s end, once both passes are done: the lens's focal length fitted
 * over every frame's matches (unless given), each frame's turn refitted with
 * it, and the geometry. `forward` and `back` are the two passes' matches in
 * the order they were made.
 */
export function finishRegister(
  size: { width: number; height: number },
  calibFrame: number,
  H0: Mat3,
  first: number,
  forward: Matches[],
  back: Matches[],
  patchCount: number,
  opts: RegisterOptions = {}
): FrameGeometry[] {
  const lens0 = startLens(size.width, size.height, opts);
  const all: Matches[] = [{ index: calibFrame, P: [], Q: [], inliers: [], p: [0, 0, 0, 0], ok: true }, ...forward, ...back];
  const lens = opts.focal ? lens0 : fitFocal(lens0, all);
  const out: FrameGeometry[] = [];
  for (const m of all) {
    let p = m.p;
    if (lens !== lens0 && m.inliers.length >= 4) p = fitTurn(lens, p, m.inliers.map((k) => m.P[k]), m.inliers.map((k) => m.Q[k])).p;
    const S = m.index === calibFrame ? ([1, 0, 0, 0, 1, 0, 0, 0, 1] as Mat3) : turnHomography(lens, p);
    const H = normalize(multiply(S, H0));
    out[m.index - first] = {
      index: m.index, ok: m.ok, reason: m.reason, S, H, marks: laneMarksOf(H),
      share: m.index === calibFrame ? 1 : m.inliers.length / Math.max(1, m.patches ?? patchCount),
      turn: [p[0], p[1], p[2]], zoom: fdlibm.exp(p[3]), lens
    };
  }
  return out;
}

/**
 * Every frame in [first, last] against the calibration frame (plan 7.3, as
 * revised after the sample clips): the picture's transform, not the lane's.
 * Textured patches of the calibration frame (masking units, ceiling, other
 * lanes and racks) are found again in each frame around where the last
 * frame's transform and the coarse shift put them, and the camera's turn and
 * zoom are fitted to them robustly. The lens's focal length is then fitted
 * once over the frames that turned most. `H0`, the calibration frame's lane
 * mapping, is carried to each frame; it may be the identity when only the
 * picture's transforms are wanted (to carry marks made on other frames).
 */
export function register(
  source: FrameSource,
  calibFrame: number,
  H0: Mat3,
  first: number,
  last: number,
  opts: RegisterOptions = {}
): FrameGeometry[] {
  const c0 = source.frame(calibFrame);
  const [forward, back] = ([1, -1] as const).map((dir) => {
    const pass = new RegisterPass(c0, opts);
    return { matches: passFrames(calibFrame, dir, first, last).map((i) => pass.step(i, source.frame(i))), patches: pass.patchCount };
  });
  return finishRegister(c0, calibFrame, H0, first, forward.matches, back.matches, forward.patches, opts);
}

function jumpedTurn(prev: TurnParams, next: TurnParams, f: number, w: number, h: number, maxJump: number): boolean {
  const pan = Math.hypot(next[0] - prev[0], next[1] - prev[1]) * f;
  return pan > maxJump * Math.max(w, h) || Math.abs(next[3] - prev[3]) > maxJump || Math.abs(next[2] - prev[2]) > maxJump;
}

/**
 * The lens's focal length, once for the clip: over the frames that turned
 * most from the calibration frame (where it matters), the f that lets one
 * turn and zoom per frame fit the patch matches best. A golden section search
 * over a factor of four either way of the starting value.
 */
export function fitFocal(lens: Lens, all: { P: Point[]; Q: Point[]; inliers: number[]; p: TurnParams; ok: boolean }[]): Lens {
  const turned = all
    .filter((m) => m.ok && m.inliers.length >= 8)
    .sort((a, b) => Math.hypot(b.p[0], b.p[1], b.p[2]) - Math.hypot(a.p[0], a.p[1], a.p[2]))
    .slice(0, 6);
  // Too little turn to tell one lens from another: keep the starting value.
  if (!turned.length || Math.hypot(turned[0].p[0], turned[0].p[1], turned[0].p[2]) < 0.004) return lens;
  const cost = (lf: number) => {
    const L = { ...lens, f: lens.f * fdlibm.exp(lf) };
    let c = 0;
    for (const m of turned) {
      const P = m.inliers.map((k) => m.P[k]);
      const Q = m.inliers.map((k) => m.Q[k]);
      c += fitTurn(L, m.p, P, Q, 8).rms ** 2 * P.length;
    }
    return c;
  };
  let a = fdlibm.log(0.25);
  let b = fdlibm.log(4);
  const gr = (Math.sqrt(5) - 1) / 2;
  let x1 = b - gr * (b - a);
  let x2 = a + gr * (b - a);
  let f1 = cost(x1);
  let f2 = cost(x2);
  for (let it = 0; it < 24; it++) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - gr * (b - a);
      f1 = cost(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + gr * (b - a);
      f2 = cost(x2);
    }
  }
  return { ...lens, f: lens.f * fdlibm.exp((a + b) / 2) };
}

/**
 * The lane's own plane, frame by frame (revised after shot-01). The whole
 * picture's turn is exact only for a camera that does not travel; a phone in
 * a hand drifts sideways too, and then the near floor moves more than the
 * far wall (parallax): on shot-01, 15 pixels more at the foul line between
 * the calibration frame and the touchdown. Everything on the floor plane
 * (this lane, its gutters and caps, the neighbouring lanes, the approach, the
 * pin decks) moves by one homography whatever the camera does, so it is
 * measured on the floor alone: textured patches of the calibration frame
 * whose lane position (through `H0`) is on the floor are found again in each
 * frame, chained from the frame before, and a homography is fitted to them by
 * RANSAC (reflections in the lane move otherwise and fall out). A turn of
 * the camera is fitted to the same patches, and the frame takes the floor's
 * homography only where it moves the lane measurably from the turn's (see
 * below): a camera that did not travel keeps the simpler, steadier model.
 */
export function registerPlane(
  source: FrameSource,
  calibFrame: number,
  H0: Mat3,
  pictures: FrameGeometry[],
  first: number,
  opts: PlaneOptions = {}
): FrameGeometry[] {
  const c0 = source.frame(calibFrame);
  const out: FrameGeometry[] = pictures.map((g) => ({ ...g }));
  for (const dir of [1, -1] as const) {
    const pass = new PlanePass(c0, H0, opts);
    for (const k of planeSlots(calibFrame, dir, first, pictures)) out[k] = pass.step(pictures[k], source.frame(pictures[k].index));
  }
  return out;
}

/** `registerPlane`'s tuning. */
export interface PlaneOptions {
  tolerance?: number;
  minPatches?: number;
  focal?: number;
}

/** The slots of `pictures` a `registerPlane` pass visits, in order, those with a frame only. */
export function planeSlots(calibFrame: number, dir: 1 | -1, first: number, pictures: readonly (FrameGeometry | undefined)[]): number[] {
  const out: number[] = [];
  for (let k = calibFrame - first + dir; k >= 0 && k < pictures.length; k += dir) if (pictures[k]) out.push(k);
  return out;
}

/**
 * One direction of `registerPlane`, a frame at a time, each frame's guess
 * chained from the frame before it in the pass: `step` takes the frames in
 * `planeSlots` order. The two directions share nothing.
 */
export class PlanePass {
  private readonly c0: GrayFrame;
  private readonly H0: Mat3;
  private readonly tol: number;
  private readonly minPatches: number;
  private readonly focal?: number;
  private readonly patches: Patch[];
  private readonly laneV: number[];
  private readonly travelled: number;
  // The guess for each frame: the last frame's transform, moved as the whole
  // picture moved since...
  private prevPlane: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private prevPic: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // ...and, after a frame whose floor could not be measured, also the last
  // floor that was. On a camera that travels the turn puts the near floor
  // 20 pixels out (shot-01 from frame 210, a hand over a third of the
  // floor's patches), beyond the patch search, and chained from the turn the
  // floor was never found again; the guess that finds more patches is used.
  private lastFloor: { S: Mat3; pic: Mat3 } | null = null;

  constructor(c0: GrayFrame, H0: Mat3, opts: PlaneOptions = {}) {
    this.c0 = c0;
    this.H0 = H0;
    this.tol = opts.tolerance ?? 1.5;
    this.minPatches = opts.minPatches ?? 12;
    this.focal = opts.focal;
    const G0 = invert(H0);
    const horizonSide = (p: Point) => {
      const w = G0[6] * p.x + G0[7] * p.y + G0[8];
      const w0 = G0[6] * apply(H0, { x: 20, y: 0 }).x + G0[7] * apply(H0, { x: 20, y: 0 }).y + G0[8];
      return w * w0 > 0;
    };
    const onFloor = (p: Point) => {
      if (!horizonSide(p)) return false;
      const q = apply(G0, p);
      // Four lanes either side, from behind the foul line to past the pin deck.
      return q.y > -12 && q.y < 64 && q.x > -260 && q.x < 300;
    };
    this.patches = choosePatches(c0, undefined, onFloor, 260);
    const a = apply(H0, { x: 20, y: 0 });
    const b = apply(H0, { x: 21, y: 0 });
    this.travelled = Math.max(1.5, 0.25 * Math.hypot(b.x - a.x, b.y - a.y));
    this.laneV = this.patches.map((p) => apply(G0, p).y);
  }

  /** The next frame of the pass: `g` its picture's registration, `f` the frame. */
  step(g: FrameGeometry, f: GrayFrame): FrameGeometry {
    // The picture's registration stopped looking (`GIVE_UP_S`): so does the floor's.
    if (g.reason === "lane-left") return { ...g };
    const { c0, H0, tol, minPatches, patches, laneV } = this;
    const matchFrom = (guess: Mat3) => {
      const P: Point[] = [];
      const Q: Point[] = [];
      const V: number[] = [];
      patches.forEach((pt, n) => {
        const m = matchPatch(c0, f, pt, apply(guess, pt));
        if (m) {
          P.push(pt);
          Q.push(m);
          V.push(laneV[n]);
        }
      });
      return { P, Q, V };
    };
    let { P, Q, V } = matchFrom(normalize(multiply(multiply(g.S, invert(this.prevPic)), this.prevPlane)));
    // (Only after such a frame: right after a measured floor the two guesses are one.)
    if (this.lastFloor && this.lastFloor.pic !== this.prevPic) {
      const other = matchFrom(normalize(multiply(multiply(g.S, invert(this.lastFloor.pic)), this.lastFloor.S)));
      if (other.P.length > P.length) ({ P, Q, V } = other);
    }
    const fit = robustHomography(P, Q, tol);
    const span = fit ? Math.max(...fit.inliers.map((i) => V[i])) - Math.min(...fit.inliers.map((i) => V[i])) : 0;
    // The turn (a camera that does not travel) is the simpler model, so it
    // is fitted to the same floor patches and kept unless the floor's own
    // homography moves the lane by more than a quarter of a board at the foul
    // line from where the turn puts it (a camera that travelled), with
    // enough agreeing patches spread along the lane to be trusted.
    const lens = this.focal ? { ...g.lens, f: this.focal } : g.lens;
    const turn = robustTurn(lens, [g.turn[0], g.turn[1], g.turn[2], fdlibm.log(g.zoom)], P, Q, tol);
    const St = turn && turn.inliers.length >= minPatches ? turnHomography(lens, turn.p) : g.S;
    // With four more unknowns than the turn, the floor fit must earn them:
    // it must agree with clearly more patches (a third more), or it has
    // only bent itself around noise and repeating patterns.
    const planeOk = fit !== null && fit.inliers.length >= minPatches && span >= 20 && fit.inliers.length >= 1.3 * (turn?.inliers.length ?? 0);
    this.prevPic = g.S;
    if (!planeOk && this.lastFloor) {
      // The floor not measured on this frame (the bowler over it) after
      // frames where it had traveled from the turn: the last floor
      // measured, moved as the whole picture moved since. The turn alone
      // jumps back by what the camera traveled: on shot-01 read from just
      // before the foul line (the calibration frame then 1.6 s on), the
      // release frames that the bowler hides put the foul line 23 pixels,
      // 4 boards, from the frames either side, and the laydown with it.
      const S = normalize(multiply(multiply(g.S, invert(this.lastFloor.pic)), this.lastFloor.S));
      this.prevPlane = S;
      const H = normalize(multiply(S, H0));
      return { ...g, S, H, marks: laneMarksOf(H), lens };
    }
    if (!planeOk || disagreement(St, fit.H, H0) < this.travelled) {
      const H = normalize(multiply(St, H0));
      this.prevPlane = St;
      if (planeOk) this.lastFloor = null;
      return { ...g, S: St, H, marks: laneMarksOf(H), lens };
    }
    this.prevPlane = fit.H;
    this.lastFloor = { S: fit.H, pic: g.S };
    const H = normalize(multiply(fit.H, H0));
    return { ...g, S: fit.H, H, marks: laneMarksOf(H), plane: fit.inliers.length };
  }
}

/** The largest distance in pixels between where two transforms put the lane's foul line ends and middle. */
function disagreement(A: Mat3, B: Mat3, H0: Mat3): number {
  let d = 0;
  for (const [u, v] of [[0.5, 0], [20, 0], [39.5, 0], [20, 30]]) {
    const p = apply(H0, { x: u, y: v });
    const qa = apply(A, p);
    const qb = apply(B, p);
    d = Math.max(d, Math.hypot(qa.x - qb.x, qa.y - qb.y));
  }
  return d;
}

/** A homography by RANSAC over evenly spread quadruples, refitted on the agreeing pairs. */
export function robustHomography(P: Point[], Q: Point[], tol: number): { H: Mat3; inliers: number[] } | null {
  const n = P.length;
  if (n < 8) return null;
  const support = (H: Mat3) => {
    const inl: number[] = [];
    for (let k = 0; k < n; k++) {
      const r = apply(H, P[k]);
      if (Math.hypot(r.x - Q[k].x, r.y - Q[k].y) < tol) inl.push(k);
    }
    return inl;
  };
  // Sorted by height in the picture, so quadruples are drawn from its quarters.
  const order = P.map((_, k) => k).sort((a, b) => P[a].y - P[b].y);
  const q = Math.floor(n / 4);
  let best: number[] = [];
  for (let t = 0; t < 120; t++) {
    const idx = [0, 1, 2, 3].map((j) => order[Math.min(n - 1, j * q + ((t * (7 + 6 * j) + j * 3) % Math.max(1, q)))]);
    if (new Set(idx).size < 4) continue;
    let H: Mat3;
    try {
      H = solveHomography(idx.map((k) => P[k]), idx.map((k) => Q[k]));
    } catch {
      continue;
    }
    if (!H.every(Number.isFinite)) continue;
    const inl = support(H);
    if (inl.length > best.length) best = inl;
  }
  if (best.length < 8) return null;
  let H = solveHomography(best.map((k) => P[k]), best.map((k) => Q[k]));
  for (let it = 0; it < 2; it++) {
    const inl = support(H);
    if (inl.length < 8) break;
    best = inl;
    H = solveHomography(best.map((k) => P[k]), best.map((k) => Q[k]));
  }
  return { H, inliers: best };
}

/**
 * The homography taking `ref`'s pixels to `img`'s, where the two pictures are
 * already within a few pixels of each other (a frame steadied onto the empty
 * lane): textured patches of `ref` found in `img` near where they are, then a
 * robust fit. Null when too few patches agree, or when the pictures already
 * agree within half a pixel. Pixels outside a picture are
 * NaN and patches touching them are skipped.
 */
export function alignTo(ref: GrayFrame, img: GrayFrame, tol = 0.8): Mat3 | null {
  const { a, patches } = refPatches(ref);
  const b = cleaned(img);
  const P: Point[] = [];
  const Q: Point[] = [];
  for (const pt of patches) {
    const m = matchPatch(a, b, pt, pt, 4);
    if (m) {
      P.push(pt);
      Q.push(m);
    }
  }
  const fit = robustHomography(P, Q, tol);
  if (!fit || fit.inliers.length < 12) return null;
  // Under half a pixel anywhere the correction is no larger than its own
  // noise: the pictures are already aligned.
  let most = 0;
  for (const [x, y] of [[0, 0], [ref.width, 0], [0, ref.height], [ref.width, ref.height], [ref.width / 2, ref.height / 2]]) {
    const q = apply(fit.H, { x, y });
    most = Math.max(most, Math.hypot(q.x - x, q.y - y));
  }
  return most < 0.5 ? null : fit.H;
}

/** A picture with NaN (outside what was seen) as -1000, so a patch over it cannot match. */
function cleaned(f: GrayFrame): GrayFrame {
  const data = new Float32Array(f.data.length);
  const d = f.data;
  for (let i = 0; i < data.length; i++) {
    const v = d[i];
    data[i] = Number.isFinite(v) ? v : -1000;
  }
  return { ...f, data };
}

/** `alignTo`'s reference, cleaned, and its patches: the same empty lane is every frame's reference, so they are made once. */
const refs = new WeakMap<GrayFrame, { a: GrayFrame; patches: Patch[] }>();

function refPatches(ref: GrayFrame): { a: GrayFrame; patches: Patch[] } {
  const known = refs.get(ref);
  if (known) return known;
  const a = cleaned(ref);
  const size = Math.max(8, Math.min(16, Math.round(Math.min(ref.width, ref.height) / 12)));
  const patches = choosePatches(a, size, (p) => {
    const h = size / 2 + 1;
    for (const [dx, dy] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
      const v = ref.data[Math.round(p.y + dy) * ref.width + Math.round(p.x + dx)];
      if (!Number.isFinite(v)) return false;
    }
    return true;
  }, 160);
  const out = { a, patches };
  refs.set(ref, out);
  return out;
}
