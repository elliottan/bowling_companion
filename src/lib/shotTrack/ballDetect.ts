import type { Roi } from "./background";
import { apply, downAt } from "./homography";
import { median, parabolaPeak, sample } from "./image";
import { DECK_END_FT, contactPoint, expectedRadiusPx, imageToLane } from "./laneModel";
import type { GrayFrame, Mat3, Point } from "./types";
import * as fdlibm from "./detMath";

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
 * How far each pixel of a steadied frame is from the empty lane, grey levels,
 * and the level over which it counts as changed.
 */
export function changeMap(
  steadied: GrayFrame,
  bg: GrayFrame & { spread?: Float32Array },
  opts: CandidateOptions = {}
): { diff: Float32Array; threshold: number } {
  const { width: w, height: h } = steadied;
  const n = w * h;
  const diff = new Float32Array(n);
  const probe = new Float64Array(Math.ceil(n / 7));
  let probed = 0;
  const env = envelope(bg);
  const { lo, hi } = env;
  const data = steadied.data;
  const bgData = bg.data;
  const spread = bg.spread;
  for (let i = 0; i < n; i++) {
    // Outside the empty lane's 3 by 3 range: a strong static edge that the
    // steadying misses by a fraction of a pixel does not count as change.
    // Over the rack that range spans black to white (bright pins and their
    // mirror images beside dark gaps) and hides a mid-grey ball, so a pixel
    // also counts as changed when it leaves its own range over time: five
    // spreads from its median (a jittering edge has a wide spread, a still
    // pin's body a narrow one).
    const p = data[i];
    const sp = spread?.[i];
    const own = sp !== undefined && Number.isFinite(sp) ? Math.abs(p - bgData[i]) - K_SPREAD * (sp > 2 ? sp : 2) : 0;
    // The largest of the four, written out; NaN anywhere (a pixel not seen) counts as no change.
    let d = 0;
    if (p !== p || own !== own) d = NaN;
    else {
      const up = p - hi[i];
      const down = lo[i] - p;
      if (up > d) d = up;
      if (down > d) d = down;
      if (own > d) d = own;
    }
    diff[i] = Number.isFinite(d) ? d : 0;
    if (i % 7 === 0) probe[probed++] = diff[i];
  }
  const noise = 1.4826 * median(probe.subarray(0, probed));
  return { diff, threshold: Math.max((opts.k ?? 4) * noise, opts.floor ?? 14) };
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
  bg: GrayFrame & { spread?: Float32Array },
  roi: Roi,
  S: Mat3,
  H: Mat3,
  frame: number,
  opts: CandidateOptions = {}
): Candidate[] {
  const { width: w, height: h } = steadied;
  const n = w * h;
  const { diff, threshold: thr } = changeMap(steadied, bg, opts);
  // Smooth the difference over 3 by 3 so a ball's highlights do not split it.
  // A mean over the threshold needs a pixel near it at the threshold (a hair
  // under, for the sum's rounding), and most of the lane has none: the rows
  // with one are found first, and only around those pixels is the mean taken.
  const near = thr * (1 - 1e-9);
  const mask = new Uint8Array(n);
  const hot = new Uint8Array(n);
  const hotRow = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0, i = y * w; x < w; x++, i++) {
      if (diff[i] >= near) {
        hot[i] = 1;
        hotRow[y] = 1;
      }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    if (!hotRow[y - 1] && !hotRow[y] && !hotRow[y + 1]) continue;
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      if (!(hot[c - w - 1] | hot[c - w] | hot[c - w + 1] | hot[c - 1] | hot[c] | hot[c + 1] | hot[c + w - 1] | hot[c + w] | hot[c + w + 1])) continue;
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += diff[(y + j) * w + x + i];
      if (s / 9 > thr) mask[c] = 1;
    }
  }
  const tol = opts.widthTolerance ?? 0.35;
  const out = collect(mask);
  // In front of the rack the gaps between the pins cut the ball's change into
  // strips (a grey ball does not differ from a dark gap). The same search on
  // the change with gaps up to four pixels wide closed finds it; what it
  // finds where the plain search already found a ball is dropped.
  for (const c of collect(closeGaps(mask, w, h, 2))) {
    if (!out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < c.r)) out.push(c);
  }
  return out;

  function collect(mask: Uint8Array): Candidate[] {
    const out: Candidate[] = [];
    const blobs: Blob[] = [];
    const label = new Int32Array(n);
    const stack: number[] = [];
    let next = 0;
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
        // The four neighbors, in the order left, right, up, down.
        if (x > 0 && !label[p - 1] && mask[p - 1]) {
          label[p - 1] = next;
          stack.push(p - 1);
        }
        if (x < w - 1 && !label[p + 1] && mask[p + 1]) {
          label[p + 1] = next;
          stack.push(p + 1);
        }
        if (p - w >= 0 && !label[p - w] && mask[p - w]) {
          label[p - w] = next;
          stack.push(p - w);
        }
        if (p + w < n && !label[p + w] && mask[p + w]) {
          label[p + w] = next;
          stack.push(p + w);
        }
      }
      if (area >= MIN_PIECE) blobs.push({ x0, x1, y0, y1, area, rowsX });
    }
    for (const { x0, x1, y0, y1, area, rowsX } of joinPieces(blobs)) {
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
      // Behind the foul line the ball is still in the hand, and past the deck
      // end it has fallen into the pit, off the lane's plane: never a sighting.
      if (cp.u < -2.5 || cp.u > 42.5 || cp.v < 0 || cp.v > DECK_END_FT) continue;
      out.push({ frame, t: steadied.t, x: c.x, y: c.y, r, u: cp.u, v: cp.v, box: { x0: x0 + roi.x0, y0: y0 + roi.y0, x1: x1 + roi.x0, y1: y1 + roi.y0 }, area });
    }
    return out;
  }
}

/** A mask with gaps up to `2 * radius` pixels wide closed: grown by `radius`, then shrunk by it. */
export function closeGaps(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  // A square is a row of the square's width swept down its height, so each
  // pass is one along the rows and one down the columns. Outside the picture
  // is clear, so nothing near the border comes out larger than it went in.
  // The change is a few blobs on an empty lane: rows with nothing set are
  // passed over.
  const full = 2 * radius + 1;
  const anyIn = (src: Uint8Array) => {
    const any = new Uint8Array(h);
    for (let y = 0; y < h; y++) {
      for (let x = 0, i = y * w; x < w; x++, i++) {
        if (src[i]) {
          any[y] = 1;
          break;
        }
      }
    }
    return any;
  };
  // Along each row: how many set pixels lie within the radius (the window cut by the border counts fewer).
  const rows = (src: Uint8Array, any: Uint8Array, grow: boolean) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      if (!any[y]) continue;
      const base = y * w;
      let count = 0;
      for (let k = 0; k < Math.min(radius, w); k++) count += src[base + k];
      for (let k = 0; k < w; k++) {
        if (k + radius < w) count += src[base + k + radius];
        if (k - radius - 1 >= 0) count -= src[base + k - radius - 1];
        // Growing: any set within reach. Shrinking: all of the reach set, which a window cut by the border cannot be.
        if (grow ? count > 0 : count === full) out[base + k] = 1;
      }
    }
    return out;
  };
  // Down the columns, a row at a time: each pixel from the rows within the radius.
  const cols = (src: Uint8Array, any: Uint8Array, grow: boolean) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const lo = y - radius;
      const hi = y + radius;
      let need = false;
      if (grow) {
        for (let j = Math.max(0, lo); j <= Math.min(h - 1, hi) && !need; j++) need = any[j] === 1;
      } else {
        need = lo >= 0 && hi < h;
        for (let j = lo; j <= hi && need; j++) need = any[j] === 1;
      }
      if (!need) continue;
      const base = y * w;
      for (let x = 0; x < w; x++) {
        let hit = !grow;
        for (let j = Math.max(0, lo); j <= Math.min(h - 1, hi); j++) {
          if ((src[j * w + x] === 1) === grow) {
            hit = grow;
            break;
          }
        }
        if (hit) out[base + x] = 1;
      }
    }
    return out;
  };
  const grownRows = rows(mask, anyIn(mask), true);
  const grown = cols(grownRows, anyIn(grownRows), true);
  const shrunkRows = rows(grown, anyIn(grown), false);
  return cols(shrunkRows, anyIn(shrunkRows), false);
}

interface Blob {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  area: number;
  rowsX: number[][];
}

/** Smallest piece of change kept for joining, pixels. */
const MIN_PIECE = 6;

/**
 * A dark ball in front of the dark pit shows as two pieces of change: the
 * highlight on its top, and its lower half against the lane, with nothing
 * between them (the sample clips' shot-02 from 48 ft on). Neither piece is
 * the shape of a ball. A small piece sitting straight above a wider one, no
 * further up than the wider one's width allows for one ball, is joined to it.
 */
function joinPieces(blobs: Blob[]): Blob[] {
  const gone = new Set<Blob>();
  const out: Blob[] = [];
  for (const low of blobs) {
    if (gone.has(low)) continue;
    const bw = low.x1 - low.x0 + 1;
    let joined = low;
    for (const top of blobs) {
      if (top === low || gone.has(top) || top.area >= low.area) continue;
      if (top.x0 < low.x0 - 1 || top.x1 > low.x1 + 1) continue;
      if (top.y1 >= low.y0 || low.y1 - top.y0 + 1 > 1.25 * bw) continue;
      gone.add(top);
      const rowsX: number[][] = [];
      for (const b of [joined, top]) b.rowsX.forEach((xs, y) => (rowsX[y] ??= []).push(...xs));
      joined = { x0: low.x0, x1: low.x1, y0: Math.min(joined.y0, top.y0), y1: low.y1, area: joined.area + top.area, rowsX };
    }
    out.push(joined);
  }
  return out.filter((b) => !gone.has(b));
}

/** Spreads from its own median at which a pixel counts as changed: well outside what it does over time. */
const K_SPREAD = 5;
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
  /** Placed by the face of the clean sighting on this frame (`carryFace`), its rim being covered. */
  carried?: number;
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
    const dx = fdlibm.cos(th);
    const dy = fdlibm.sin(th);
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
    const dx = fdlibm.cos(th);
    const dy = fdlibm.sin(th);
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

/** A carried face must correlate at least this well to place the ball. */
export const CARRY_MIN = 0.6;

/**
 * The ball placed on frame `f` by its own face on an earlier frame where its
 * outline was clean (`from` on `f0`), when its outline here is not: a leg or
 * a hand over part of its rim leaves too few edges on the circle, and the
 * fit with the lane's radius slides off the ball, down and away from the
 * cover (2026-11-17, shot-04 frames 107 to 109: a quarter of a radius low and
 * right). The picture inside 0.8 of a radius of `from`, scaled to radius `r`,
 * is matched (zero-mean correlation) within `reach` pixels of `near`, first
 * every pixel, then to a quarter pixel round the best. Null when nothing
 * correlates `CARRY_MIN` or better. Pure.
 */
export function carryFace(f0: GrayFrame, from: { cx: number; cy: number; r: number }, f: GrayFrame, near: Point, r: number, reach: number): { cx: number; cy: number; score: number } | null {
  const R = 0.8 * r;
  const k = from.r / r;
  const offs: [number, number][] = [];
  for (let j = -Math.floor(R); j <= R; j++) for (let i = -Math.floor(R); i <= R; i++) if (i * i + j * j <= R * R) offs.push([i, j]);
  const face = offs.map(([i, j]) => sample(f0, from.cx + k * i, from.cy + k * j));
  if (offs.length < 9 || face.some((v) => !Number.isFinite(v))) return null;
  const fm = face.reduce((a, b) => a + b, 0) / face.length;
  const fz = face.map((v) => v - fm);
  const fn = Math.sqrt(fz.reduce((a, b) => a + b * b, 0));
  if (!(fn > 0)) return null;
  const vals = new Float64Array(offs.length);
  const ncc = (x: number, y: number): number => {
    let m = 0;
    for (let q = 0; q < offs.length; q++) {
      const v = sample(f, x + offs[q][0], y + offs[q][1]);
      if (!Number.isFinite(v)) return -1;
      vals[q] = v;
      m += v;
    }
    m /= offs.length;
    let sxy = 0;
    let syy = 0;
    for (let q = 0; q < offs.length; q++) {
      const z = vals[q] - m;
      sxy += z * fz[q];
      syy += z * z;
    }
    return syy > 0 ? sxy / (fn * Math.sqrt(syy)) : -1;
  };
  let best = { cx: near.x, cy: near.y, score: -Infinity };
  const n = Math.ceil(reach);
  for (let dy = -n; dy <= n; dy++) {
    for (let dx = -n; dx <= n; dx++) {
      const c = ncc(near.x + dx, near.y + dy);
      if (c > best.score) best = { cx: near.x + dx, cy: near.y + dy, score: c };
    }
  }
  const at = { x: best.cx, y: best.cy };
  for (let dy = -1; dy <= 1 + 1e-9; dy += 0.25) {
    for (let dx = -1; dx <= 1 + 1e-9; dx += 0.25) {
      const c = ncc(at.x + dx, at.y + dy);
      if (c > best.score) best = { cx: at.x + dx, cy: at.y + dy, score: c };
    }
  }
  return best.score >= CARRY_MIN ? best : null;
}

/** An arc fit must find the rim round at least this share of the ball's upper side to place it. */
export const ARC_MIN = 0.3;

/** How far from where it was expected `arcFit` is asked to look for a covered or blurred ball's center, in its radii. */
export const ARC_REACH = 0.3;

export interface ArcFit {
  cx: number;
  cy: number;
  /** The circle fitted to the rim points alone, radius free, when they go round two thirds of the upper side or more; else null. */
  free: { cx: number; cy: number; r: number } | null;
  /** Rim directions found on the circle against the number round the upper side: with `whole` the lower side's add to it, so it can pass 1. */
  support: number;
}

/** How much a center at the edge of `arcFit`'s reach loses against one at its prior: the ball's run is smooth, a pin's edge beside it is not. */
export const ARC_PULL = 0.5;

/** Directions round the ball's upper side `arcFit` counts the rim in. */
const ARC_BINS = 48;

/**
 * The ball's center from whatever part of its rim shows, its size known
 * (the owner, 2026-11-20: "balls are completely round, so if you can align a
 * part of the circle it should be easy to get the circle right"). The edge
 * pixels near `prior` (the gradient's peak across the edge, to a fraction of
 * a pixel) over the top and sides of the ball (the bottom meets its mirror
 * image); each votes for the centers one radius `r` behind it, against its
 * gradient, and only where its gradient points the way the ball's rim would:
 * out of the ball where the ball is darker than what is round it. A center
 * is scored by the rim it explains, one vote per direction round it (the
 * best edge there, none counted more than the typical one, so a pin's strong
 * edge does not outvote the rest of the rim), falling off gently with its
 * distance from `prior`, within `reach`. A pin's edge, a leg's or the blur
 * round the ball is a line or a band, not an arc of this radius: it explains
 * one or two directions of any one center. The best center is refined by
 * least squares on its rim points. `free` is the circle those points give
 * alone, radius free, when they cover two thirds of the directions. Null when too little
 * rim is found. Pure; the result does not depend on `prior` beyond the
 * window and the gentle pull. `whole` counts the rim all the way round: past
 * the oil the ball's mirror image is too faint to hide its lower rim, and
 * against the dark pit the lower rim and one side may be all that shows.
 */
export function arcFit(f: GrayFrame, down: Point, prior: Point, r: number, reach: number, whole = false): ArcFit | null {
  const upper = (dx: number, dy: number) => dx * down.x + dy * down.y <= 0.17 * Math.hypot(dx, dy);
  // The directions a rim point counts in: the upper side, or with `whole` all round.
  const counted = (dx: number, dy: number) => whole || upper(dx, dy);
  // The ball's own face: what the inner side of its rim looks like.
  const inner: number[] = [];
  for (let a = 0; a < 16; a++) {
    const th = (2 * Math.PI * a) / 16;
    for (const k of [0, 0.2, 0.4]) {
      const v = sample(f, prior.x + k * r * fdlibm.cos(th), prior.y + k * r * fdlibm.sin(th));
      if (Number.isFinite(v)) inner.push(v);
    }
  }
  if (inner.length < 8) return null;
  const face = median(inner);
  // Edge points: pixels whose gradient is a peak across the edge, placed to a fraction of a pixel along it.
  const R = Math.ceil(r + reach + 1.5);
  const px = Math.round(prior.x);
  const py = Math.round(prior.y);
  const grad = (x: number, y: number) => ({
    gx: (sample(f, x + 1, y) - sample(f, x - 1, y)) / 2,
    gy: (sample(f, x, y + 1) - sample(f, x, y - 1)) / 2
  });
  const edges: { x: number; y: number; nx: number; ny: number; m: number }[] = [];
  for (let y = py - R; y <= py + R; y++) {
    for (let x = px - R; x <= px + R; x++) {
      const dpx = x - prior.x;
      const dpy = y - prior.y;
      const dist = Math.hypot(dpx, dpy);
      if (dist > r + reach + 1.5) continue;
      const { gx, gy } = grad(x, y);
      const m = Math.hypot(gx, gy);
      if (!(m >= 2)) continue;
      const nx = gx / m;
      const ny = gy / m;
      const g0 = grad(x - nx, y - ny);
      const g1 = grad(x + nx, y + ny);
      const m0 = Math.hypot(g0.gx, g0.gy);
      const m1 = Math.hypot(g1.gx, g1.gy);
      if (!(m >= m0 && m >= m1)) continue;
      const off = parabolaPeak(m0, m, m1);
      const ex = x + off * nx;
      const ey = y + off * ny;
      // Out of the ball is the side that looks less like its face: a rim
      // against a white pin rises outward, one against the dark between two
      // pins falls; an edge with the face on neither side is not its rim.
      const lo = sample(f, ex - 1.5 * nx, ey - 1.5 * ny);
      const hi = sample(f, ex + 1.5 * nx, ey + 1.5 * ny);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
      const out = Math.abs(hi - face) >= Math.abs(lo - face) ? 1 : -1;
      if (Math.min(Math.abs(lo - face), Math.abs(hi - face)) > 0.5 * Math.abs(hi - lo)) continue;
      edges.push({ x: ex, y: ey, nx: out * nx, ny: out * ny, m });
    }
  }
  if (edges.length < 4) return null;
  const typical = median(edges.map((e) => e.m));
  const usable = edges.filter((e) => e.m >= typical / 2).map((e) => ({ ...e, w: Math.min(e.m, 2 * typical) }));
  const rimOf = (cx: number, cy: number) => {
    const per = new Map<number, { x: number; y: number; s: number }>();
    for (const e of usable) {
      const dx = e.x - cx;
      const dy = e.y - cy;
      const d = Math.hypot(dx, dy);
      if (!(d > 0) || !counted(dx, dy)) continue;
      const off = Math.abs(d - r);
      if (off >= 1) continue;
      // The way out of the ball must point away from the center, within about 35 degrees.
      const cosA = (e.nx * dx + e.ny * dy) / d;
      if (cosA < 0.82) continue;
      const s = e.w * (1 - off) * ((cosA - 0.82) / 0.18);
      const bin = Math.floor(((fdlibm.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * ARC_BINS) % ARC_BINS;
      if (s > (per.get(bin)?.s ?? 0)) per.set(bin, { x: e.x, y: e.y, s });
    }
    return per;
  };
  let top = { x: prior.x, y: prior.y, s: -Infinity };
  const n = Math.ceil(reach / 0.25);
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const q = ((i * 0.25) ** 2 + (j * 0.25) ** 2) / (reach * reach);
      if (q > 1) continue;
      let s = 0;
      for (const v of rimOf(prior.x + i * 0.25, prior.y + j * 0.25).values()) s += v.s;
      s *= 1 - ARC_PULL * q;
      if (s > top.s) top = { x: prior.x + i * 0.25, y: prior.y + j * 0.25, s };
    }
  }
  // Directions round the upper side that a rim can show in.
  let bins = 0;
  for (let b = 0; b < ARC_BINS; b++) {
    const th = ((b + 0.5) / ARC_BINS) * 2 * Math.PI - Math.PI;
    if (upper(fdlibm.cos(th), fdlibm.sin(th))) bins++;
  }
  const on = [...rimOf(top.x, top.y).values()];
  if (on.length < Math.max(4, ARC_MIN * bins)) return null;
  const c = fitCircle(on, top, r, false);
  const at = Math.hypot(c.cx - prior.x, c.cy - prior.y) <= reach ? c : { cx: top.x, cy: top.y };
  const final = [...rimOf(at.cx, at.cy).values()];
  const free = final.length >= (2 / 3) * bins ? fitCircle(final, { x: at.cx, y: at.cy }, r, true) : null;
  return { cx: at.cx, cy: at.cy, free: free && Number.isFinite(free.r) && free.r > 0 ? free : null, support: final.length / bins };
}
