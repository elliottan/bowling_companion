import type { Roi } from "./background";
import { apply, downAt } from "./homography";
import { median, parabolaPeak, sample } from "./image";
import { DECK_END_FT, contactPoint, expectedRadiusPx, imageToLane } from "./laneModel";
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
  const probe: number[] = [];
  const env = envelope(bg);
  for (let i = 0; i < n; i++) {
    // Outside the empty lane's 3 by 3 range: a strong static edge that the
    // steadying misses by a fraction of a pixel does not count as change.
    // Over the rack that range spans black to white (bright pins and their
    // mirror images beside dark gaps) and hides a mid-grey ball, so a pixel
    // also counts as changed when it leaves its own range over time: five
    // spreads from its median (a jittering edge has a wide spread, a still
    // pin's body a narrow one).
    const p = steadied.data[i];
    const sp = bg.spread?.[i];
    const own = sp !== undefined && Number.isFinite(sp) ? Math.abs(p - bg.data[i]) - K_SPREAD * Math.max(sp, 2) : 0;
    const d = Math.max(0, p - env.hi[i], env.lo[i] - p, own);
    diff[i] = Number.isFinite(d) ? d : 0;
    if (i % 7 === 0) probe.push(diff[i]);
  }
  const noise = 1.4826 * median(probe);
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
  const mask = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += diff[(y + j) * w + x + i];
      if (s / 9 > thr) mask[y * w + x] = 1;
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
        for (const q of [p - 1, p + 1, p - w, p + w]) {
          if (q < 0 || q >= n || label[q] || !mask[q]) continue;
          if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
          label[q] = next;
          stack.push(q);
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
  const pass = (src: Uint8Array, grow: boolean) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = !grow;
        for (let j = -radius; j <= radius && hit !== grow; j++) {
          for (let i = -radius; i <= radius; i++) {
            const xx = x + i;
            const yy = y + j;
            // Outside the picture is clear, so nothing near the border comes out larger than it went in.
            const v = xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx] === 1;
            if (v === grow) {
              hit = grow;
              break;
            }
          }
        }
        out[y * w + x] = hit ? 1 : 0;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
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
