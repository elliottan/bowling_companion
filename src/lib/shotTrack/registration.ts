import { snapEdge } from "./edgeSnap";
import { apply, invert, lineDistance, multiply, similarityFrom, similarityParts, solveLinear } from "./homography";
import { downsample, parabolaPeak } from "./image";
import { homographyFromMarks, markCorners } from "./laneModel";
import type { GrayFrame, LaneMarks, Mat3, Point, Segment } from "./types";

/**
 * Carry the calibration from the marked frame to every other frame (plan 7.3).
 *
 * Assumption, stated because everything here rests on it: the person filming
 * turns and zooms the camera but does not walk. The whole picture then moves
 * by one transform whatever the depth, close to a similarity (shift, rotation,
 * scale), and it is measured on everything static in the picture (see
 * `register`).
 */

export interface FrameSource {
  count: number;
  frame(i: number): GrayFrame;
}

export interface FrameGeometry {
  index: number;
  ok: boolean;
  reason?: "lane-lost" | "jump";
  /** Calibration frame pixels to this frame's pixels. */
  S: Mat3;
  /** The lane lines as found in this frame (the foul line carried by S). */
  marks: LaneMarks;
  /** Lane (u, v) to this frame's pixels. */
  H: Mat3;
  /** Edge snap support, and (as `deck`) the share of patches that agreed. */
  support: { left: number; right: number; deck: number };
  /** Lines that kept their prediction in this frame. */
  predicted?: (keyof LaneMarks)[];
}

export interface RegisterOptions {
  /** Search band either side of the predicted line, pixels. */
  band?: number;
  /** R4: the largest change between consecutive frames, a fraction of the picture. */
  maxJump?: number;
  /** How far a re-snapped line may land from its prediction, pixels. */
  slack?: number;
  /** Distance of the far marked line, feet (the deck end unless marked at the back row). */
  farFeet?: number;
}

function sad(a: GrayFrame, b: GrayFrame, dx: number, dy: number, x0: number, x1: number, y0: number, y1: number, stride: number): number {
  let s = 0;
  let n = 0;
  for (let y = y0; y < y1; y += stride) {
    const yb = y + dy;
    if (yb < 0 || yb >= b.height) continue;
    for (let x = x0; x < x1; x += stride) {
      const xb = x + dx;
      if (xb < 0 || xb >= b.width) continue;
      s += Math.abs(a.data[y * a.width + x] - b.data[yb * b.width + xb]);
      n++;
    }
  }
  return n ? s / n : Infinity;
}

function bestShift(a: GrayFrame, b: GrayFrame, cx: number, cy: number, r: number, box: [number, number, number, number], stride: number) {
  let best = { dx: cx, dy: cy, e: Infinity };
  const grid = new Map<string, number>();
  for (let dy = cy - r; dy <= cy + r; dy++) {
    for (let dx = cx - r; dx <= cx + r; dx++) {
      const e = sad(a, b, dx, dy, box[0], box[1], box[2], box[3], stride);
      grid.set(`${dx},${dy}`, e);
      if (e < best.e) best = { dx, dy, e };
    }
  }
  return { ...best, grid };
}

/**
 * The shift of the picture from `a` to `b`, by block matching the top third
 * (the ceiling and the masking units: static, textured, and above the bowler),
 * coarse at a quarter of the resolution and then at full resolution, with a
 * parabola for the sub-pixel part (plan 7.1).
 */
export function globalShift(a: GrayFrame, b: GrayFrame, range = 40): Point {
  const qa = downsample(a, 4);
  const qb = downsample(b, 4);
  const qbox: [number, number, number, number] = [Math.round(qa.width * 0.1), Math.round(qa.width * 0.9), 2, Math.round(qa.height / 3)];
  const coarse = bestShift(qa, qb, 0, 0, Math.ceil(range / 4), qbox, 1);
  const box: [number, number, number, number] = [Math.round(a.width * 0.1), Math.round(a.width * 0.9), 8, Math.round(a.height / 3)];
  const fine = bestShift(a, b, coarse.dx * 4, coarse.dy * 4, 4, box, 3);
  const e = (dx: number, dy: number) => fine.grid.get(`${dx},${dy}`) ?? fine.e;
  const sub = (l: number, m: number, r: number) => {
    const den = l - 2 * m + r;
    return den > 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
  };
  return {
    x: fine.dx + sub(e(fine.dx - 1, fine.dy), fine.e, e(fine.dx + 1, fine.dy)),
    y: fine.dy + sub(e(fine.dx, fine.dy - 1), fine.e, e(fine.dx, fine.dy + 1))
  };
}

function mapSegment(M: Mat3, s: Segment): Segment {
  return { a: apply(M, s.a), b: apply(M, s.b) };
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
export function choosePatches(f: GrayFrame, size?: number): Patch[] {
  const h = Math.round((size ?? Math.max(12, Math.min(f.width, f.height) / 36)) / 2);
  const step = 2 * h + Math.max(4, Math.round(h * 1.5));
  const out: (Patch & { e: number })[] = [];
  for (let y = h + 8; y < f.height - h - 8; y += step) {
    for (let x = h + 8; x < f.width - h - 8; x += step) {
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
  return out.filter((p) => p.e > Math.max(4, 1.5 * typical)).sort((a, b) => b.e - a.e).slice(0, 220);
}

/** Where a calibration patch lies in frame f, searched +-r around `guess`, sub-pixel; null when not found. */
export function matchPatch(c0: GrayFrame, f: GrayFrame, p: Patch, guess: Point, r = 6): Point | null {
  const gx = Math.round(guess.x);
  const gy = Math.round(guess.y);
  if (gx - p.h - r < 1 || gy - p.h - r < 1 || gx + p.h + r >= f.width - 1 || gy + p.h + r >= f.height - 1) return null;
  const err = (dx: number, dy: number) => {
    let e = 0;
    // Squared differences: a smooth cost surface, so the parabola through its
    // minimum gives the sub-pixel part (absolute differences make a V).
    for (let j = -p.h; j < p.h; j++) {
      const r0 = (p.y + j) * c0.width + p.x;
      const r1 = (gy + dy + j) * f.width + gx + dx;
      for (let i = -p.h; i < p.h; i++) {
        const d = c0.data[r0 + i] - f.data[r1 + i];
        e += d * d;
      }
    }
    return e;
  };
  const grid: number[] = [];
  let best = 0;
  const w = 2 * r + 1;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const e = err(dx, dy);
      grid.push(e);
      if (e < grid[best]) best = grid.length - 1;
    }
  }
  const bx = (best % w) - r;
  const by = Math.floor(best / w) - r;
  if (Math.abs(bx) === r || Math.abs(by) === r) return null;
  const at = (dx: number, dy: number) => grid[(dy + r) * w + dx + r];
  return {
    x: gx + bx + parabolaPeak(-at(bx - 1, by), -at(bx, by), -at(bx + 1, by)),
    y: gy + by + parabolaPeak(-at(bx, by - 1), -at(bx, by), -at(bx, by + 1))
  };
}

/** Least squares similarity taking each p to its q. */
export function fitSimilarity(p: Point[], q: Point[]): Mat3 {
  // q = (a, -b; b, a) p + t, linear in a, b, tx, ty.
  const A = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
  const v = new Array<number>(4).fill(0);
  const add = (row: number[], rhs: number) => {
    for (let i = 0; i < 4; i++) {
      v[i] += row[i] * rhs;
      for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j];
    }
  };
  p.forEach((pt, k) => {
    add([pt.x, -pt.y, 1, 0], q[k].x);
    add([pt.y, pt.x, 0, 1], q[k].y);
  });
  const [a, b, tx, ty] = solveLinear(A, v);
  return [a, -b, tx, b, a, ty, 0, 0, 1];
}

/**
 * The similarity from calibration pixels to this frame's, by RANSAC over the
 * patch matches: pairs fix a similarity, the matches within 1.2 pixels of it
 * are its support, and the best support is refitted. Patches on the bowler or
 * the ball move against the rest and fall out as outliers.
 */
export function robustSimilarity(p: Point[], q: Point[]): { S: Mat3; inliers: number[] } | null {
  const n = p.length;
  if (n < 4) return null;
  let best: number[] = [];
  const m = Math.min(n, 40);
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      if (Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y) < 20) continue;
      const S = similarityFrom(p[i], p[j], q[i], q[j]);
      const inl: number[] = [];
      for (let k = 0; k < n; k++) {
        const r = apply(S, p[k]);
        if (Math.hypot(r.x - q[k].x, r.y - q[k].y) < 1.2) inl.push(k);
      }
      if (inl.length > best.length) best = inl;
    }
  }
  if (best.length < 4) return null;
  let S = fitSimilarity(best.map((k) => p[k]), best.map((k) => q[k]));
  for (let it = 0; it < 2; it++) {
    const inl: number[] = [];
    for (let k = 0; k < n; k++) {
      const r = apply(S, p[k]);
      if (Math.hypot(r.x - q[k].x, r.y - q[k].y) < 1) inl.push(k);
    }
    if (inl.length < 4) break;
    best = inl;
    S = fitSimilarity(best.map((k) => p[k]), best.map((k) => q[k]));
  }
  return { S, inliers: best };
}

function jumped(prev: Mat3, next: Mat3, w: number, h: number, maxJump: number): boolean {
  const d = similarityParts(multiply(next, invert(prev)));
  return Math.hypot(d.tx, d.ty) > maxJump * Math.max(w, h) || Math.abs(d.scale - 1) > maxJump || Math.abs(d.angle) > maxJump;
}

/**
 * Geometry for every frame in [first, last] (plan 7.3, as revised after the
 * sample clips). A camera that turns and zooms moves the whole picture by one
 * transform whatever the depth, so the frame is registered on everything
 * static, not on this lane's far end (which the bowler and the pins hide):
 * textured patches of the calibration frame are found again in each frame
 * around where the last frame's transform puts them, and a similarity is fitted
 * to them by RANSAC. The lane's lines are carried by it; the two edges are then
 * re-snapped where they are visible, since boards come from the edges.
 */
export function register(
  source: FrameSource,
  calibFrame: number,
  calib: LaneMarks,
  first: number,
  last: number,
  opts: RegisterOptions = {}
): FrameGeometry[] {
  const maxJump = opts.maxJump ?? 0.05;
  const band = opts.band ?? 3;
  const slack = opts.slack ?? 1.5;
  const c0 = source.frame(calibFrame);
  const patches = choosePatches(c0);
  const corners = markCorners(calib);
  const out: FrameGeometry[] = [];
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const geometry = (f: GrayFrame, index: number, S: Mat3, ok: boolean, inlierShare: number, reason?: FrameGeometry["reason"]): FrameGeometry => {
    const carried: LaneMarks = { left: mapSegment(S, calib.left), right: mapSegment(S, calib.right), foul: mapSegment(S, calib.foul), deck: mapSegment(S, calib.deck) };
    const support = { left: 0, right: 0, deck: inlierShare };
    const predicted: (keyof LaneMarks)[] = [];
    if (ok && corners) {
      const interior = apply(S, { x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4, y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4 });
      for (const k of ["left", "right"] as const) {
        const r = snapEdge(f, carried[k], { band, interior, sign: "rising", minSupport: 0.15 });
        support[k] = r.support;
        const off = Math.max(Math.abs(lineDistance(r.line, carried[k].a)), Math.abs(lineDistance(r.line, carried[k].b)));
        if (r.ok && off <= slack) carried[k] = r.segment;
        else predicted.push(k);
      }
    }
    return { index, ok, reason, S, marks: carried, H: homographyFromMarks(carried, opts.farFeet), support, predicted: predicted.length ? predicted : undefined };
  };
  out[calibFrame - first] = { ...geometry(c0, calibFrame, I, true, 1), marks: calib, H: homographyFromMarks(calib, opts.farFeet) };
  for (const dir of [1, -1]) {
    let prev = I;
    for (let i = calibFrame + dir; i >= first && i <= last; i += dir) {
      const f = source.frame(i);
      const g = globalShift(source.frame(i - dir), f);
      const guessS = multiply([1, 0, g.x, 0, 1, g.y, 0, 0, 1], prev);
      const p: Point[] = [];
      const q: Point[] = [];
      for (const pt of patches) {
        const m = matchPatch(c0, f, pt, apply(guessS, pt));
        if (m) {
          p.push(pt);
          q.push(m);
        }
      }
      const fit = robustSimilarity(p, q);
      const share = fit ? fit.inliers.length / Math.max(1, patches.length) : 0;
      if (!fit || fit.inliers.length < 8 || share < 0.15) {
        out[i - first] = geometry(f, i, guessS, false, share, "lane-lost");
        prev = guessS;
        continue;
      }
      const bad = jumped(prev, fit.S, f.width, f.height, maxJump);
      out[i - first] = geometry(f, i, fit.S, !bad, share, bad ? "jump" : undefined);
      prev = fit.S;
    }
  }
  return out;
}
