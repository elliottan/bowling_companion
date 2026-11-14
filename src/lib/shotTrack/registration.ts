import { apply, invert, multiply, normalize, solveHomography, solveLinear } from "./homography";
import { downsample, parabolaPeak } from "./image";
import { BACK_ROW_FT, LEFT_U, RIGHT_U } from "./laneModel";
import type { GrayFrame, LaneMarks, Mat3, Point } from "./types";

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
  reason?: "lane-lost" | "jump";
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
  const c = Math.cos(th);
  const s = Math.sin(th);
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
  const fz = lens.f * Math.exp(p[3]);
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
interface Matches {
  index: number;
  P: Point[];
  Q: Point[];
  inliers: number[];
  p: TurnParams;
  ok: boolean;
  reason?: FrameGeometry["reason"];
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
  const maxJump = opts.maxJump ?? 0.05;
  const tol = opts.tolerance ?? 1.5;
  const c0 = source.frame(calibFrame);
  const W = c0.width;
  const Hh = c0.height;
  const lens0: Lens = { f: opts.focal ?? 1.5 * Math.max(W, Hh), cx: (W - 1) / 2, cy: (Hh - 1) / 2 };
  const patches = choosePatches(c0);
  const zero: TurnParams = [0, 0, 0, 0];
  const all: Matches[] = [{ index: calibFrame, P: [], Q: [], inliers: [], p: zero, ok: true }];
  for (const dir of [1, -1]) {
    let prev = zero;
    for (let i = calibFrame + dir; i >= first && i <= last; i += dir) {
      const f = source.frame(i);
      const g = globalShift(source.frame(i - dir), f);
      const prevH = turnHomography(lens0, prev);
      // The coarse shift as a small pan and tilt on top of the last frame's turn.
      const guess: TurnParams = [prev[0] - g.y / lens0.f, prev[1] + g.x / lens0.f, prev[2], prev[3]];
      const guessH = multiply([1, 0, g.x, 0, 1, g.y, 0, 0, 1], prevH);
      const P: Point[] = [];
      const Q: Point[] = [];
      for (const pt of patches) {
        const m = matchPatch(c0, f, pt, apply(guessH, pt));
        if (m) {
          P.push(pt);
          Q.push(m);
        }
      }
      const fit = robustTurn(lens0, guess, P, Q, tol);
      const share = fit ? fit.inliers.length / Math.max(1, patches.length) : 0;
      if (!fit || fit.inliers.length < 8 || share < 0.15) {
        all.push({ index: i, P, Q, inliers: fit?.inliers ?? [], p: guess, ok: false, reason: "lane-lost" });
        prev = guess;
        continue;
      }
      const bad = jumpedTurn(prev, fit.p, lens0.f, W, Hh, maxJump);
      all.push({ index: i, P, Q, inliers: fit.inliers, p: fit.p, ok: !bad, reason: bad ? "jump" : undefined });
      prev = fit.p;
    }
  }
  const lens = opts.focal ? lens0 : fitFocal(lens0, all);
  const out: FrameGeometry[] = [];
  for (const m of all) {
    let p = m.p;
    if (lens !== lens0 && m.inliers.length >= 4) p = fitTurn(lens, p, m.inliers.map((k) => m.P[k]), m.inliers.map((k) => m.Q[k])).p;
    const S = m.index === calibFrame ? ([1, 0, 0, 0, 1, 0, 0, 0, 1] as Mat3) : turnHomography(lens, p);
    const H = normalize(multiply(S, H0));
    out[m.index - first] = {
      index: m.index, ok: m.ok, reason: m.reason, S, H, marks: laneMarksOf(H),
      share: m.index === calibFrame ? 1 : m.inliers.length / Math.max(1, patches.length),
      turn: [p[0], p[1], p[2]], zoom: Math.exp(p[3]), lens
    };
  }
  return out;
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
    const L = { ...lens, f: lens.f * Math.exp(lf) };
    let c = 0;
    for (const m of turned) {
      const P = m.inliers.map((k) => m.P[k]);
      const Q = m.inliers.map((k) => m.Q[k]);
      c += fitTurn(L, m.p, P, Q, 8).rms ** 2 * P.length;
    }
    return c;
  };
  let a = Math.log(0.25);
  let b = Math.log(4);
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
  return { ...lens, f: lens.f * Math.exp((a + b) / 2) };
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
  opts: { tolerance?: number; minPatches?: number; focal?: number } = {}
): FrameGeometry[] {
  const tol = opts.tolerance ?? 1.5;
  const minPatches = opts.minPatches ?? 12;
  const c0 = source.frame(calibFrame);
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
  const patches = choosePatches(c0, undefined, onFloor, 260);
  const a = apply(H0, { x: 20, y: 0 });
  const b = apply(H0, { x: 21, y: 0 });
  const travelled = Math.max(1.5, 0.25 * Math.hypot(b.x - a.x, b.y - a.y));
  const laneV = patches.map((p) => apply(G0, p).y);
  const out: FrameGeometry[] = pictures.map((g) => ({ ...g }));
  for (const dir of [1, -1]) {
    let prevPlane: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let prevPic: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let k = calibFrame - first + dir; k >= 0 && k < pictures.length; k += dir) {
      const g = pictures[k];
      if (!g) continue;
      // The guess: the last floor transform measured, moved as the whole
      // picture moved since that frame.
      const guess = normalize(multiply(multiply(g.S, invert(prevPic)), prevPlane));
      const f = source.frame(g.index);
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
      const fit = robustHomography(P, Q, tol);
      const span = fit ? Math.max(...fit.inliers.map((i) => V[i])) - Math.min(...fit.inliers.map((i) => V[i])) : 0;
      // The turn (a camera that does not travel) is the simpler model, so it
      // is fitted to the same floor patches and kept unless the floor's own
      // homography moves the lane by more than a quarter of a board at the foul
      // line from where the turn puts it (a camera that travelled), with
      // enough agreeing patches spread along the lane to be trusted.
      const lens = opts.focal ? { ...g.lens, f: opts.focal } : g.lens;
      const turn = robustTurn(lens, [g.turn[0], g.turn[1], g.turn[2], Math.log(g.zoom)], P, Q, tol);
      const St = turn && turn.inliers.length >= minPatches ? turnHomography(lens, turn.p) : g.S;
      // With four more unknowns than the turn, the floor fit must earn them:
      // it must agree with clearly more patches (a third more), or it has
      // only bent itself around noise and repeating patterns.
      const planeOk = fit !== null && fit.inliers.length >= minPatches && span >= 20 && fit.inliers.length >= 1.3 * (turn?.inliers.length ?? 0);
      if (!planeOk || disagreement(St, fit.H, H0) < travelled) {
        const H = normalize(multiply(St, H0));
        out[k] = { ...g, S: St, H, marks: laneMarksOf(H), lens };
        // A frame whose floor could not be measured (a hand or the bowler over
        // a third of the floor's patches) does not become the next guess: on a
        // camera that travels the turn puts the near floor 20 pixels out
        // (shot-01 from frame 210), beyond the patch search, and the floor was
        // never found again.
        if (planeOk) {
          prevPlane = St;
          prevPic = g.S;
        }
        continue;
      }
      prevPlane = fit.H;
      prevPic = g.S;
      const H = normalize(multiply(fit.H, H0));
      out[k] = { ...g, S: fit.H, H, marks: laneMarksOf(H), plane: fit.inliers.length };
    }
  }
  return out;
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
  const clean = (f: GrayFrame): GrayFrame => ({ ...f, data: Float32Array.from(f.data, (v) => (Number.isFinite(v) ? v : -1000)) });
  const a = clean(ref);
  const b = clean(img);
  const size = Math.max(8, Math.min(16, Math.round(Math.min(ref.width, ref.height) / 12)));
  const patches = choosePatches(a, size, (p) => {
    const h = size / 2 + 1;
    for (const [dx, dy] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
      const v = ref.data[Math.round(p.y + dy) * ref.width + Math.round(p.x + dx)];
      if (!Number.isFinite(v)) return false;
    }
    return true;
  }, 160);
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
