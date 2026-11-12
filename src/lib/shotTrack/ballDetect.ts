import type { Roi } from "./background";
import { apply, downAt } from "./homography";
import { median, parabolaPeak, sample } from "./image";
import { contactPoint, expectedRadiusPx, imageToLane } from "./laneModel";
import type { GrayFrame, Mat3, Point } from "./types";

/** Finding the ball in one frame (plan 7.4). */

export interface Candidate {
  frame: number;
  t: number;
  /** Rough centre in the frame's own pixels. */
  x: number;
  y: number;
  /** Expected radius there, pixels. */
  r: number;
  u: number;
  v: number;
  /** Blob box in calibration pixels, for drawing and the size filter. */
  box: { x0: number; y0: number; x1: number; y1: number };
  area: number;
}

export interface CandidateOptions {
  /** Threshold in multiples of the frame's noise (plan: start with 4). */
  k?: number;
  /** Smallest threshold, grey levels: compression blocks are not noise. */
  floor?: number;
  /** Allowed error of the blob's width against the expected ball, a fraction (0.35). */
  widthTolerance?: number;
}

/**
 * Blobs that differ from the empty lane and are the size of a ball where they
 * sit. The bowler fails on size, the scoring screen and a ball on the next
 * lane on position, and balls in the return are part of the background.
 *
 * `steadied` and `bg` are in calibration pixels (the `roi` box); `S` takes
 * calibration pixels to this frame's, and `H` is this frame's lane mapping.
 */
export function findCandidates(
  steadied: GrayFrame,
  bg: GrayFrame,
  roi: Roi,
  S: Mat3,
  H: Mat3,
  frame: number,
  opts: CandidateOptions = {}
): Candidate[] {
  const { width: w, height: h } = steadied;
  const n = w * h;
  const diff = new Float32Array(n);
  const probe: number[] = [];
  const env = envelope(bg);
  for (let i = 0; i < n; i++) {
    // Outside the empty lane's 3 by 3 range: a strong static edge that the
    // steadying misses by a fraction of a pixel does not count as change.
    const p = steadied.data[i];
    const d = Math.max(0, p - env.hi[i], env.lo[i] - p);
    diff[i] = Number.isFinite(d) ? d : 0;
    if (i % 7 === 0) probe.push(diff[i]);
  }
  const noise = 1.4826 * median(probe);
  const thr = Math.max((opts.k ?? 4) * noise, opts.floor ?? 14);
  // Smooth the difference over 3 by 3 so a ball's highlights do not split it.
  const mask = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += diff[(y + j) * w + x + i];
      if (s / 9 > thr) mask[y * w + x] = 1;
    }
  }
  const out: Candidate[] = [];
  const label = new Int32Array(n);
  const stack: number[] = [];
  let next = 0;
  const tol = opts.widthTolerance ?? 0.35;
  for (let s0 = 0; s0 < n; s0++) {
    if (!mask[s0] || label[s0]) continue;
    next++;
    label[s0] = next;
    stack.push(s0);
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    let area = 0;
    const rowsX: number[][] = [];
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      (rowsX[y] ??= []).push(x);
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= n || label[q] || !mask[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        label[q] = next;
        stack.push(q);
      }
    }
    if (area < 12) continue;
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    // The top of the blob is the top of the ball (the reflection hangs below).
    // Its centre is one radius down from the top, across the top rows' middle.
    let r = 0;
    let cxCal = (x0 + x1) / 2;
    let cyCal = y0;
    for (let it = 0; it < 4; it++) {
      const top = apply(S, { x: cxCal + roi.x0, y: y0 + roi.y0 });
      const guess = r || bw / 2;
      const lane = imageToLane(H, { x: top.x, y: top.y + 2 * guess });
      r = expectedRadiusPx(H, lane.u, lane.v);
      const span: number[] = [];
      for (let y = y0; y <= Math.min(y1, y0 + Math.round(1.4 * r)); y++) for (const x of rowsX[y] ?? []) span.push(x);
      cxCal = span.length ? (Math.min(...span) + Math.max(...span)) / 2 : cxCal;
      cyCal = y0 + r;
    }
    if (!(r > 1)) continue;
    if (Math.abs(bw / (2 * r) - 1) > tol) continue;
    if (bh < 1.4 * r || bh > 7 * r) continue;
    if (area < 0.35 * bw * Math.min(bh, 2 * r)) continue;
    const c = apply(S, { x: cxCal + roi.x0, y: cyCal + roi.y0 });
    const cp = contactPoint(H, c, r);
    // Behind the foul line the ball is still in the hand: never a sighting.
    if (cp.u < -2.5 || cp.u > 42.5 || cp.v < 0 || cp.v > 64) continue;
    out.push({ frame, t: steadied.t, x: c.x, y: c.y, r, u: cp.u, v: cp.v, box: { x0: x0 + roi.x0, y0: y0 + roi.y0, x1: x1 + roi.x0, y1: y1 + roi.y0 }, area });
  }
  return out;
}

const envelopes = new WeakMap<GrayFrame, { lo: Float32Array; hi: Float32Array }>();

/** The 3 by 3 minimum and maximum of a picture, kept per picture. */
export function envelope(bg: GrayFrame): { lo: Float32Array; hi: Float32Array } {
  const known = envelopes.get(bg);
  if (known) return known;
  const { width: w, height: h, data } = bg;
  const lo = new Float32Array(w * h);
  const hi = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = Infinity;
      let b = -Infinity;
      for (let j = Math.max(0, y - 1); j <= Math.min(h - 1, y + 1); j++) {
        for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + 1); i++) {
          const v = data[j * w + i];
          if (v < a) a = v;
          if (v > b) b = v;
        }
      }
      lo[y * w + x] = a;
      hi[y * w + x] = b;
    }
  }
  const e = { lo, hi };
  envelopes.set(bg, e);
  return e;
}

/**
 * The plan starts with 20%. Next to the pins a free fit that grows by 15 to
 * 20% is grabbing the pins' outline, not the ball's (seen on the synthetic
 * lane), so a free radius is trusted within 10% and the fixed fit used beyond.
 */
export const FREE_RADIUS_TOLERANCE = 0.1;

export interface CircleFit {
  cx: number;
  cy: number;
  r: number;
  /** Fraction of the upper-arc rays that found an edge. */
  weight: number;
  /** Edge points used, for drawing. */
  edges: Point[];
  /** Free-radius fit was rejected for straying more than 20% from the expected radius. */
  fixed: boolean;
}

function fitCircle(pts: Point[], c0: Point, r0: number, freeRadius: boolean): { cx: number; cy: number; r: number } {
  let cx = c0.x;
  let cy = c0.y;
  let r = r0;
  for (let it = 0; it < 15; it++) {
    // Gauss-Newton with Huber weights (1 px) on the radial residuals.
    const m = freeRadius ? 3 : 2;
    const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    const b = new Array<number>(m).fill(0);
    for (const p of pts) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1e-9;
      const res = d - r;
      const wgt = Math.abs(res) <= 1 ? 1 : 1 / Math.abs(res);
      const J = freeRadius ? [-dx / d, -dy / d, -1] : [-dx / d, -dy / d];
      for (let i = 0; i < m; i++) {
        b[i] -= wgt * J[i] * res;
        for (let j = 0; j < m; j++) A[i][j] += wgt * J[i] * J[j];
      }
    }
    for (let i = 0; i < m; i++) A[i][i] += 1e-6;
    const det2 = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    let step: number[];
    if (m === 2) step = [(b[0] * A[1][1] - b[1] * A[0][1]) / det2, (A[0][0] * b[1] - A[1][0] * b[0]) / det2];
    else step = solve3(A, b);
    cx += step[0];
    cy += step[1];
    if (m === 3) r += step[2];
    if (Math.hypot(step[0], step[1]) < 1e-4) break;
  }
  return { cx, cy, r };
}

function solve3(A: number[][], b: number[]): number[] {
  const det = (M: number[][]) =>
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-12) return [0, 0, 0];
  return [0, 1, 2].map((k) => det(A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / D);
}

/**
 * The sub-pixel circle (plan 7.4), in the original frame: 48 rays from the
 * rough centre, each taking the strongest edge between 0.6 and 1.4 radii,
 * keeping only the upper 200 degrees (below is where the ball meets its
 * reflection, and on a glossy ball the lower rim mirrors the bright lane).
 * Fixed radius first, then free; the free fit is kept unless it strays more
 * than FREE_RADIUS_TOLERANCE from the expected radius.
 */
export function refineCircle(f: GrayFrame, H: Mat3, rough: Point, r: number, lower = false): CircleFit | null {
  // `lower` fits the ball's mirror image instead: its clean edge is the lower
  // arc (the image of the ball's top), its top is hidden behind the ball.
  const d0 = downAt(H, rough);
  const down = lower ? { x: -d0.x, y: -d0.y } : d0;
  // Inside darker than outside means the edge rises outward.
  let inside = 0;
  let outside = 0;
  let ni = 0;
  let no = 0;
  for (let a = 0; a < 16; a++) {
    const th = (2 * Math.PI * a) / 16;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    if (dx * down.x + dy * down.y > 0.17) continue;
    const vi = sample(f, rough.x + 0.4 * r * dx, rough.y + 0.4 * r * dy);
    const vo = sample(f, rough.x + 1.6 * r * dx, rough.y + 1.6 * r * dy);
    if (Number.isFinite(vi)) {
      inside += vi;
      ni++;
    }
    if (Number.isFinite(vo)) {
      outside += vo;
      no++;
    }
  }
  if (!ni || !no) return null;
  const sgn = inside / ni <= outside / no ? 1 : -1;
  const rays = 48;
  const step = 0.25;
  const found: Point[] = [];
  const strength: number[] = [];
  let kept = 0;
  for (let a = 0; a < rays; a++) {
    const th = (2 * Math.PI * a) / rays;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    if (dx * down.x + dy * down.y > 0.17) continue;
    kept++;
    const r0 = 0.6 * r;
    const m = Math.ceil((0.8 * r) / step);
    const vals: number[] = [];
    for (let i = -1; i <= m + 1; i++) vals.push(sample(f, rough.x + (r0 + i * step) * dx, rough.y + (r0 + i * step) * dy));
    let bi = -1;
    let bg = 0;
    const g: number[] = [];
    for (let i = 1; i <= m + 1; i++) {
      const gi = (sgn * (vals[i + 1] - vals[i - 1])) / (2 * step);
      g.push(gi);
      if (Number.isFinite(gi) && gi > bg) {
        bg = gi;
        bi = g.length - 1;
      }
    }
    if (bi < 0) continue;
    const off = bi > 0 && bi < g.length - 1 ? parabolaPeak(g[bi - 1], g[bi], g[bi + 1]) : 0;
    const rho = r0 + (bi + off) * step;
    found.push({ x: rough.x + rho * dx, y: rough.y + rho * dy });
    strength.push(bg);
  }
  const typical = median(strength);
  const edges = found.filter((_, i) => strength[i] >= Math.max(2, 0.35 * typical));
  if (edges.length < 8) return null;
  const fixedFit = fitCircle(edges, rough, r, false);
  const free = fitCircle(edges, { x: fixedFit.cx, y: fixedFit.cy }, r, true);
  const useFree = Number.isFinite(free.r) && Math.abs(free.r / r - 1) <= FREE_RADIUS_TOLERANCE;
  const fit = useFree ? free : { ...fixedFit, r };
  // Rays whose edge lies on the fitted circle are the ones that found it.
  const on = edges.filter((p) => Math.abs(Math.hypot(p.x - fit.cx, p.y - fit.cy) - fit.r) < 1.5);
  return { cx: fit.cx, cy: fit.cy, r: fit.r, weight: (on.length / kept) * (useFree ? 1 : 0.5), edges: on, fixed: !useFree };
}
