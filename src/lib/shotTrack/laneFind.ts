import { apply, intersect, lineDistance, mapLine, type Line3 } from "./homography";
import { boxBlur, downsample, gradient, median, medianOf, parabolaPeak, sample } from "./image";
import { robustLine, snapEdge } from "./edgeSnap";
import { fitCalibration, type CalibrationFit, type CalMark } from "./calibrate";
import { checkPins, type LandmarkError } from "./calibrationCheck";
import { PIN_POSITIONS } from "../pinGeometry";
import type { FrameLane } from "./laneTrack";
import type { MarkLines } from "./marking";
import { BACK_ROW_FT, LEFT_U, RIGHT_U } from "./laneModel";
import type { GrayFrame, Mat3, Point } from "./types";
import * as fdlibm from "./detMath";

/**
 * Finding the lane with no marks (plan, PR 8; docs/SHOT-TRACKER-HANDOFF.md).
 *
 * The stages, each its own function so the harness can measure it:
 * 1. `lanesOnFrame`: on each frame, the vanishing point of the lane-parallel
 *    lines (Hough, then the point most of them run through), the camera's
 *    roll, and a "fan" of the picture in which every line through the
 *    vanishing point is a column; medians down the columns show every edge,
 *    gutter and cap in the house as a peak.
 * 2. `rankLanes`: the lane width (every lane is as wide in the fan) and, on
 *    each frame, the pair of edges one lane width apart nearest the picture's
 *    center: the bowler films from behind their own lane.
 * 3. `findLane`: on the best few frames, each edge snapped at full resolution
 *    to the first rising edge from the lane side (the lane's own edge, not the
 *    gutter's groove), as a ray through the refined vanishing point; the back
 *    pin row across every rack; the foul line from both sides of the lane;
 *    and the frame whose lines agree best (and put the camera where the other
 *    frames do) is kept, as calibration marks for `fitCalibration`.
 *
 * Frames are full resolution in full range gray (0 to 255, `grayRange.ts`),
 * as everywhere in the tracer.
 */

export interface HoughLine {
  /** Normal angle, radians in [0, pi): the line is x cos(theta) + y sin(theta) = rho. */
  theta: number;
  rho: number;
  /** Summed gradient magnitude of the pixels that voted for it. */
  votes: number;
  line: Line3;
}

export interface HoughOptions {
  /** Angle bins over pi. */
  angles?: number;
  /** A pixel votes for normals within this many radians of its gradient. */
  spread?: number;
  /** Pixels with a gradient magnitude under this are ignored. */
  minMagnitude?: number;
  /** Only pixels with y at least this vote. */
  fromY?: number;
  /** Lines kept. */
  max?: number;
}

/** Straight lines by a gradient-oriented Hough transform, strongest first. */
export function houghLines(f: GrayFrame, opts: HoughOptions = {}): HoughLine[] {
  const A = opts.angles ?? 360;
  const spread = opts.spread ?? (2.5 * Math.PI) / 180;
  const minMag = opts.minMagnitude ?? 6;
  const fromY = Math.max(1, Math.floor(opts.fromY ?? 1));
  const max = opts.max ?? 40;
  const { width: w, height: h } = f;
  const { gx, gy } = gradient(f);
  const D = Math.ceil(Math.hypot(w, h));
  const R = 2 * D + 1;
  const acc = new Float32Array(A * R);
  const cos = new Float64Array(A);
  const sin = new Float64Array(A);
  for (let a = 0; a < A; a++) {
    cos[a] = fdlibm.cos((a * Math.PI) / A);
    sin[a] = fdlibm.sin((a * Math.PI) / A);
  }
  const sb = Math.ceil((spread * A) / Math.PI);
  for (let y = fromY; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = Math.hypot(gx[i], gy[i]);
      if (m < minMag) continue;
      let th = fdlibm.atan2(gy[i], gx[i]);
      if (th < 0) th += Math.PI;
      const a0 = Math.round((th * A) / Math.PI);
      for (let k = -sb; k <= sb; k++) {
        const a = (((a0 + k) % A) + A) % A;
        const r = Math.round(x * cos[a] + y * sin[a]) + D;
        acc[a * R + r] += m;
      }
    }
  }
  // Peaks: local maxima over a window, angle wrapping (rho flips sign across pi).
  const wa = 3;
  const wr = 4;
  const peaks: { a: number; r: number; v: number }[] = [];
  for (let a = 0; a < A; a++) {
    for (let r = wr; r < R - wr; r++) {
      const v = acc[a * R + r];
      if (v <= 0) continue;
      let isMax = true;
      for (let da = -wa; da <= wa && isMax; da++) {
        let aa = a + da;
        let rr0 = r;
        if (aa < 0) {
          aa += A;
          rr0 = 2 * D - r;
        } else if (aa >= A) {
          aa -= A;
          rr0 = 2 * D - r;
        }
        for (let dr = -wr; dr <= wr; dr++) {
          if (da === 0 && dr === 0) continue;
          const rr = rr0 + dr;
          if (rr < 0 || rr >= R) continue;
          const u = acc[aa * R + rr];
          if (u > v || (u === v && (aa < a || (aa === a && rr < r)))) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ a, r, v });
    }
  }
  peaks.sort((p, q) => q.v - p.v);
  return peaks.slice(0, max).map(({ a, r, v }) => {
    const theta = (a * Math.PI) / A;
    const rho = r - D;
    return { theta, rho, votes: v, line: [fdlibm.cos(theta), fdlibm.sin(theta), -rho] as Line3 };
  });
}

/**
 * The point most of the lines run through, weighting each by its votes: the
 * best pairwise intersection, then refined by least squares over the lines
 * within `tolerance` pixels of it.
 */
export function vanishingPoint(lines: HoughLine[], tolerance: number, accept: (p: Point) => boolean = () => true): { point: Point; support: HoughLine[] } | null {
  let best: { point: Point; score: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const p = intersect(lines[i].line, lines[j].line);
      if (!p || !accept(p)) continue;
      let score = 0;
      for (const l of lines) {
        const d = lineDistance(l.line, p) / tolerance;
        score += l.votes * fdlibm.exp(-d * d);
      }
      if (!best || score > best.score) best = { point: p, score };
    }
  }
  if (!best) return null;
  let p = best.point;
  let support: HoughLine[] = [];
  for (let it = 0; it < 4; it++) {
    support = lines.filter((l) => Math.abs(lineDistance(l.line, p)) <= tolerance);
    if (support.length < 2) break;
    // Least squares point nearest all supporting lines (normals are unit).
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const l of support) {
      const [nx, ny, c] = l.line;
      const wgt = l.votes;
      a11 += wgt * nx * nx;
      a12 += wgt * nx * ny;
      a22 += wgt * ny * ny;
      b1 -= wgt * nx * c;
      b2 -= wgt * ny * c;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-9) break;
    p = { x: (a22 * b1 - a12 * b2) / det, y: (a11 * b2 - a12 * b1) / det };
  }
  return { point: p, support };
}

/** Smoothed, halved picture the finder works on. */
export function prepare(f: GrayFrame, factor = 2): GrayFrame {
  return boxBlur(factor > 1 ? downsample(f, factor) : f, 1);
}

/**
 * The picture resampled so that every line through the vanishing point is a
 * column: column x is the ray from `vp` through (x, yRef), row y is the
 * picture's row y. Lane-parallel lines (edges, gutters, caps) stand upright.
 */
export interface Fan {
  vp: Point;
  yRef: number;
  /** Slope of the reference line (the camera's roll), rows per column. */
  roll: number;
  /** Picture x at yRef of column 0; columns are one pixel apart at yRef. */
  x0: number;
  cols: number;
  /** Picture row of fan row 0. */
  y0: number;
  rows: number;
  /** Grey level, NaN outside the picture. */
  F: Float32Array;
  /** Across-ray gradient in grey levels per picture pixel, positive when brighter to the right. */
  G: Float32Array;
}

export function buildFan(f: GrayFrame, vp: Point, roll = 0): Fan {
  const W = f.width;
  const yRef = f.height - 1;
  const x0 = Math.floor(vp.x - 1.5 * W);
  const cols = 3 * W;
  const y0 = Math.ceil(Math.max(0, vp.y + 0.02 * f.height));
  const rows = Math.max(0, f.height - y0);
  const F = new Float32Array(cols * rows).fill(NaN);
  const G = new Float32Array(cols * rows).fill(NaN);
  // Column i is the ray through (x, yRef + roll (x - vp.x)): the reference line
  // runs parallel to the horizon, a line of one distance down the lane, so
  // every lane is the same number of columns wide.
  const yr = new Float64Array(cols);
  const cx = new Float64Array(cols);
  for (let i = 0; i < cols; i++) {
    cx[i] = x0 + i - vp.x;
    yr[i] = yRef + roll * (x0 + i - vp.x) - vp.y;
  }
  // Where a row's rays meet the picture, `sampleRow` written out: picture x
  // grows with the column (the reference line lies below the vanishing
  // point), so each row reads from the first column inside to the last,
  // found by bisection and then checked a few columns either side.
  const d = f.data;
  const xMax = W - 1;
  // (With a reference line that crosses the horizon somewhere, every column is read.)
  let rising = true;
  for (let i = 0; i < cols; i++) if (!(yr[i] > 0)) rising = false;
  for (let j = 0; j < rows; j++) {
    const y = y0 + j;
    const dy = y - vp.y;
    const at = (i: number) => vp.x + (cx[i] * dy) / yr[i];
    const [lo, hi] = rising ? insideColumns(at, cols, xMax) : [0, cols - 1];
    const r = y * W;
    for (let i = lo; i <= hi; i++) {
      const x = at(i);
      if (!(x >= 0 && x <= xMax)) continue;
      const k = Math.min(Math.floor(x), W - 2);
      const t = x - k;
      F[j * cols + i] = d[r + k] * (1 - t) + d[r + k + 1] * t;
    }
    for (let i = Math.max(2, lo); i <= Math.min(cols - 3, hi); i++) G[j * cols + i] = (F[j * cols + i + 2] - F[j * cols + i - 2]) / ((4 * dy) / yr[i]);
  }
  return { vp, yRef, roll, x0, cols, y0, rows, F, G };
}

/**
 * The columns a fan row reads, for a picture x that grows with the column
 * (`at`): from the first at or past 0 to the last at or before `xMax`, found
 * by bisection, with three more either side for the rounding.
 */
function insideColumns(at: (i: number) => number, cols: number, xMax: number): [number, number] {
  let a = 0;
  let b = cols - 1;
  while (a < b) {
    const m = (a + b) >> 1;
    if (at(m) >= 0) b = m;
    else a = m + 1;
  }
  const lo = Math.max(0, a - 3);
  a = 0;
  b = cols - 1;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (at(m) <= xMax) a = m;
    else b = m - 1;
  }
  return [lo, Math.min(cols - 1, a + 3)];
}

/**
 * The camera's roll: the slope the house's level lines have in the picture
 * (racks, masking units, the foul line, the ceiling's joints all run across
 * the lanes, and all are nearly parallel to the horizon). The vote-weighted
 * median slope of the nearly level Hough lines.
 */
export function estimateRoll(lines: HoughLine[]): number {
  const level = lines.filter((l) => Math.abs(l.theta - Math.PI / 2) < (8 * Math.PI) / 180);
  if (!level.length) return 0;
  const sl = level.map((l) => ({ s: -fdlibm.cos(l.theta) / fdlibm.sin(l.theta), w: l.votes })).sort((a, b) => a.s - b.s);
  const total = sl.reduce((a, b) => a + b.w, 0);
  let acc = 0;
  for (const x of sl) {
    acc += x.w;
    if (acc >= total / 2) return x.s;
  }
  return 0;
}

/** The picture line of fan column `x` (picture x at yRef). */
export function columnLine(fan: Fan, x: number): Line3 {
  const a = fan.vp;
  const b = { x, y: fan.yRef + fan.roll * (x - fan.vp.x) };
  return [a.y - b.y, b.x - a.x, a.x * b.y - b.x * a.y];
}

/** Mean |G| along each fan row: high over the lanes' structure, low over the approach. */
export function rowEnergy(fan: Fan): Float32Array {
  const E = new Float32Array(fan.rows);
  for (let j = 0; j < fan.rows; j++) {
    let a = 0;
    let c = 0;
    for (let i = 0; i < fan.cols; i++) {
      const g = fan.G[j * fan.cols + i];
      if (Number.isFinite(g)) {
        a += Math.abs(g);
        c++;
      }
    }
    E[j] = c ? a / c : 0;
  }
  return E;
}

/**
 * Rough picture rows of the lane's two ends: the far end where the racks make
 * the most structure, the near end where the structure stops (the gutters end
 * just past the foul line; the approach is plain).
 */
export function laneRows(fan: Fan): NearRows & { far: number } {
  const E = rowEnergy(fan);
  const n = E.length;
  let far = 0;
  for (let j = 1; j < Math.floor(n * 0.6); j++) if (E[j] > E[far]) far = j;
  let near = nearRows(E, far);
  // The racks stand where a camera `CAMERA_FT` behind the foul line puts them:
  // along the lane, (pin row - vp) / (foul line - vp) = d / (d + 62.6). A
  // camera held low has the masking units' artwork just under the horizon,
  // busier than the racks below it (2026-11-19: a phone at waist height took
  // the masking for the far end, a row under the vanishing point, and no pin
  // was looked for where they stand). The far end is then the busiest row
  // where the racks can be, with a margin for the rough near row.
  const rows = fan.y0 + near.near - fan.vp.y;
  if (rows > 0) {
    const ratio = (d: number) => d / (d + BACK_ROW_FT);
    const lo = Math.max(1, Math.ceil(fan.vp.y + 0.8 * ratio(CAMERA_FT[0]) * rows - fan.y0));
    const hi = Math.min(n - 1, Math.floor(fan.vp.y + 1.15 * ratio(CAMERA_FT[1]) * rows - fan.y0));
    if ((far < lo || far > hi) && hi > lo) {
      far = lo;
      for (let j = lo + 1; j <= hi; j++) if (E[j] > E[far]) far = j;
      near = nearRows(E, far);
    }
  }
  return { far: fan.y0 + far, near: fan.y0 + near.near, sharp: near.sharp, alts: near.alts.map((j) => fan.y0 + j) };
}

/** The lane's near end as `laneRows` finds it, picture rows. */
export interface NearRows {
  near: number;
  /** The structure falls sharply there (`NEAR_SHARP`): the near end beyond doubt. */
  sharp: boolean;
  /** Without a sharp fall, the other rows it could be (the other soft falls, the lowest busy row), for the clip to choose among (`settleNear`). */
  alts: number[];
}

/** A fall in structure going down the picture by this ratio, over a few rows either side, is plainly the lane's near end (`laneRows`): the sample clips' falls are 2 and more. */
export const NEAR_SHARP = 1.5;

/**
 * With no fall as sharp as `NEAR_SHARP`, a fall of at least this ratio may
 * be the near end (`laneRows`). A camera far back behind the approach
 * (IMG_5853, 23 ft behind the foul line, the lane a fifth of the picture
 * wide) sees the bowler's legs, their reflection and a ball return on the
 * approach, which keep half the lane's structure there, and the gutters'
 * ends blur over six rows: its fall is 1.31 to 1.47. The near end used to
 * fall back to the picture's bottom row then, 150 rows below the foul line,
 * the lane's columns were read over the approach, and the pair found ran
 * from the bowler's leg to the ball return. A soft fall can also come
 * inside the lane (8133: the lane's sheen fades 70 rows before the gutters
 * end, as softly as the end itself) or on the approach (6447, 40 rows below
 * the foul line), so a frame's soft falls are only offered, and the clip
 * chooses among them and the lowest busy row (`settleNear`).
 */
export const NEAR_FALL = 1.3;

/** `laneRows`' near end below the far row `far`, in fan rows. */
function nearRows(E: Float32Array, far: number): NearRows {
  const n = E.length;
  // The near end: the sharpest fall in structure going down (the gutters and
  // caps end, the approach is plain), over a few rows either side, when one
  // is sharp (`NEAR_SHARP`); else the lowest row still at half the lane's
  // typical structure, with the soft falls (`NEAR_FALL`) as the alternatives,
  // the sharpest first.
  const k = Math.max(4, Math.round(0.025 * n));
  const mean = (a: number, b: number) => {
    let s = 0;
    for (let j = a; j <= b; j++) s += E[j];
    return s / (b - a + 1);
  };
  const from = far + Math.round(0.3 * (n - far));
  const R = new Float64Array(n);
  let near = -1;
  let best = NEAR_SHARP;
  for (let j = from; j < n - k - 1; j++) {
    const r = mean(j - k, j - 1) / (mean(j + 1, j + k) + 0.05);
    R[j] = r;
    if (r > best) {
      best = r;
      near = j;
    }
  }
  if (near >= 0) return { near, sharp: true, alts: [] };
  const mid = median(Array.from(E.subarray(far, n)).slice(0, Math.max(1, Math.floor((n - far) / 2))));
  let low = n - 1;
  while (low > far && E[low] < 0.5 * mid) low--;
  // The soft falls, one row each: the sharpest of each run of rows over
  // `NEAR_FALL` no more than two windows apart.
  const falls: number[] = [];
  let last = -Infinity;
  for (let j = from; j < n - k - 1; j++) {
    if (R[j] < NEAR_FALL) continue;
    if (j - last > 2 * k) falls.push(j);
    else if (R[j] > R[falls[falls.length - 1]]) falls[falls.length - 1] = j;
    last = j;
  }
  return { near: low, sharp: false, alts: falls.filter((j) => Math.abs(j - low) > 2 * k).sort((a, b) => R[b] - R[a]) };
}

export interface ColumnProfile {
  /** Median across-ray gradient down each column. */
  grad: Float32Array;
  /** Median grey level down each column. */
  level: Float32Array;
}

/**
 * Medians down each fan column between picture rows `from` and `to`; without
 * `withLevel`, the gradient's only (`level` is left NaN).
 */
export function columnProfile(fan: Fan, from: number, to: number, withLevel = true): ColumnProfile {
  const ja = Math.max(0, Math.round(from - fan.y0));
  const jb = Math.min(fan.rows - 1, Math.round(to - fan.y0));
  const grad = new Float32Array(fan.cols).fill(NaN);
  const level = new Float32Array(fan.cols).fill(NaN);
  const n = jb - ja + 1;
  if (n < 3) return { grad, level };
  const g = new Float64Array(n);
  const l = new Float64Array(n);
  const { G, F, cols } = fan;
  for (let i = 0; i < cols; i++) {
    let k = 0;
    let m = 0;
    for (let j = ja, at = ja * cols + i; j <= jb; j++, at += cols) {
      const v = G[at];
      if (!Number.isFinite(v)) continue;
      g[k++] = v;
      const w = F[at];
      if (Number.isFinite(w)) l[m++] = w;
    }
    // Columns mostly outside the picture say nothing.
    if (k < 0.6 * n) continue;
    grad[i] = medianOf(g, k);
    if (withLevel && m) level[i] = medianOf(l, m);
  }
  return { grad, level };
}

export interface LaneCandidate {
  /** Fan columns (picture x at yRef) of the left and right edges. */
  left: number;
  right: number;
  /** Their median gradients (positive for the left edge, negative for the right). */
  leftEdge: number;
  rightEdge: number;
}

/**
 * Lanes in a column profile: wide quiet stretches (the lane surface has no
 * lane-parallel structure) between busy clusters (gutters, caps, kickbacks).
 * Each edge is the first edge met going out from the lane: rising toward the
 * lane, never the stronger gutter groove or cap a board or more out.
 */
export function laneCandidates(p: ColumnProfile, x0: number, minWidth: number): LaneCandidate[] {
  const g = p.grad;
  const abs: number[] = [];
  for (let i = 0; i < g.length; i++) if (Number.isFinite(g[i])) abs.push(Math.abs(g[i]));
  if (!abs.length) return [];
  abs.sort((a, b) => a - b);
  const strong = abs[Math.floor(abs.length * 0.99)];
  const busy = Math.max(1, 0.12 * strong);
  // Quiet stretches: runs of finite columns under the busy level.
  const out: LaneCandidate[] = [];
  let i = 0;
  while (i < g.length) {
    if (!(Number.isFinite(g[i]) && Math.abs(g[i]) < busy)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < g.length && Number.isFinite(g[j + 1]) && Math.abs(g[j + 1]) < busy) j++;
    if (j - i + 1 >= minWidth) {
      const l = edgeOut(g, i, -1, busy);
      const r = edgeOut(g, j, 1, busy);
      if (l && r && g[l.at] > 0 && g[r.at] < 0) out.push({ left: x0 + l.x, right: x0 + r.x, leftEdge: g[l.at], rightEdge: g[r.at] });
    }
    i = j + 1;
  }
  return out;
}

/** From the quiet column `from`, step `dir` to the first gradient peak over `level`; its sub-column position. */
function edgeOut(g: Float32Array, from: number, dir: 1 | -1, level: number): { at: number; x: number } | null {
  let k = from + dir;
  while (k > 0 && k < g.length - 1 && Number.isFinite(g[k]) && Math.abs(g[k]) < level) k += dir;
  if (!(k > 0 && k < g.length - 1) || !Number.isFinite(g[k])) return null;
  const s = Math.sign(g[k]);
  // Climb to the peak of this lobe.
  while (k + dir > 0 && k + dir < g.length - 1 && s * g[k + dir] > s * g[k]) k += dir;
  const off = parabolaPeak(s * g[k - 1], s * g[k], s * g[k + 1]);
  return { at: k, x: k + off };
}

/** What one frame says about the lanes. */
export interface FrameLanes {
  vp: Point;
  /** Rough picture rows of the far and near ends. */
  far: number;
  near: number;
  candidates: LaneCandidate[];
  fan: Fan;
  profile: ColumnProfile;
  /** The whole length's profile as measured (`profile` is changed by `steadyProfiles`), kept for `refineVanishingPoint`. */
  whole?: ColumnProfile;
  /** The near end was a sharp fall of structure (`laneRows`); otherwise `alts` holds the frame read to its other likely near ends. */
  sharp?: boolean;
  alts?: NearSide[];
}

/** What a frame's lanes are when its near end is at `near` (`lanesOnFrame`). */
export interface NearSide {
  near: number;
  candidates: LaneCandidate[];
  profile: ColumnProfile;
  whole: ColumnProfile;
}

/** Vanishing point, fan and lane candidates on one frame (full resolution, video-range grey). */
export function lanesOnFrame(f: GrayFrame): FrameLanes | null {
  const k = 2;
  const small = prepare(f, k);
  const all = houghLines(small, { fromY: small.height * 0.25, max: 60 });
  const lines = all.filter((l) => Math.abs(l.theta - Math.PI / 2) > (20 * Math.PI) / 180);
  const roll = estimateRoll(all);
  const found = vanishingPoint(lines, 3, (p) => p.y < small.height * 0.7 && p.y > -small.height);
  if (!found || found.support.length < 4) return null;
  // Pixel centers: small pixel i covers full pixels k i .. k i + k - 1.
  const vp = { x: found.point.x * k + (k - 1) / 2, y: found.point.y * k + (k - 1) / 2 };
  const fan = buildFan(f, vp, roll);
  if (fan.rows < 10) return null;
  const rows = laneRows(fan);
  const { far } = rows;
  const side = (near: number): NearSide | null => {
    const span = near - far;
    if (span < 0.15 * f.height) return null;
    // (The finder reads the gradient's medians only; the level's are left out.)
    const prof = columnProfile(fan, far + 0.08 * span, near - 0.04 * span, false);
    // The bowler, the ball return and a scoring screen stand near the camera and
    // hide the near half of an edge far more often than the far half: each
    // column keeps the stronger of its whole-length and far-half medians.
    const farHalf = columnProfile(fan, far + 0.08 * span, far + 0.5 * span, false);
    const grad = prof.grad.map((g, i) => (Math.abs(farHalf.grad[i]) > Math.abs(g) && Math.sign(farHalf.grad[i]) === Math.sign(g || farHalf.grad[i]) ? farHalf.grad[i] : g));
    const profile = { grad: Float32Array.from(grad), level: prof.level };
    return { near, candidates: laneCandidates(prof, fan.x0, 0.08 * f.width), profile, whole: prof };
  };
  const main = side(rows.near);
  if (!main) return null;
  const alts = rows.alts.map(side).filter((a): a is NearSide => !!a);
  return { vp, far, fan, ...main, sharp: rows.sharp, ...(alts.length ? { alts } : {}) };
}

/** Frames with a sharp near end needed to settle the others' (`settleNear`). */
export const MIN_SHARP_FRAMES = 3;

/**
 * Each frame whose near end was a soft fall (`laneRows`) takes the row, of
 * those it offered, nearest the depth below the vanishing point the frames
 * with a sharp near end give it, the nearest three of them in the clip
 * (their median): the person filming stays put, or moves slowly, so the
 * foul line keeps its depth, while a soft fall inside the lane (8133, 70
 * rows short) or the picture's bottom row past a busy approach (IMG_5853,
 * 140 rows past) stands out. Depths are compared as ratios (a zoom scales
 * them). With fewer than `MIN_SHARP_FRAMES` sharp frames, each frame keeps
 * its lowest busy row, as before there were soft falls (1856 has none),
 * unless that row and the far row put the camera outside `CAMERA_FT` and a
 * soft fall does not. In place, before `steadyProfiles`.
 */
export function settleNear(per: (FrameLanes | null)[]): void {
  const sharp = per.map((r, i) => ({ i, depth: r?.sharp ? r.near - r.vp.y : NaN })).filter((x) => x.depth > 0);
  per.forEach((r, i) => {
    if (!r || r.sharp || !r.alts?.length) return;
    const own: NearSide = { near: r.near, candidates: r.candidates, profile: r.profile, whole: r.whole ?? r.profile };
    let best = own;
    if (sharp.length >= MIN_SHARP_FRAMES) {
      const near = [...sharp].sort((a, b) => Math.abs(a.i - i) - Math.abs(b.i - i) || a.i - b.i).slice(0, MIN_SHARP_FRAMES);
      const ref = median(near.map((x) => x.depth));
      const off = (s: NearSide) => {
        const d = s.near - r.vp.y;
        return d > 0 ? Math.abs(fdlibm.log(d / ref)) : Infinity;
      };
      for (const a of r.alts) if (off(a) < off(best)) best = a;
    } else {
      // No clip to go by: the lowest busy row stands unless it puts the
      // camera nearer than `CAMERA_FT` allows with the far row (IMG_5853's
      // picture bottom: 7 to 10 ft), and a soft fall does not.
      const fits = (s: NearSide) => roughCamera(r, s.near) >= CAMERA_FT[0] && roughCamera(r, s.near) <= CAMERA_FT[1];
      if (!fits(own)) best = r.alts.find(fits) ?? own;
    }
    if (best !== own) per[i] = { ...r, ...best, alts: [own, ...r.alts.filter((a) => a !== best)] };
  });
}

/** The camera's distance behind the foul line, feet, that a frame's far row and a near row `near` put it at (rough, as the rows are); NaN when they cannot. */
function roughCamera(r: FrameLanes, near: number): number {
  const a = r.far - r.vp.y;
  const b = near - r.vp.y;
  if (!(a > 0 && b > a)) return NaN;
  const q = a / b;
  return (BACK_ROW_FT * q) / (1 - q);
}

/** `r` with its near end at `near`, one of the rows it offered (`settleNear`), or as it is. */
export function atNear(r: FrameLanes, near: number): FrameLanes {
  if (r.near === near) return r;
  const a = r.alts?.find((x) => x.near === near);
  return a ? { ...r, ...a, alts: [{ near: r.near, candidates: r.candidates, profile: r.profile, whole: r.whole ?? r.profile }, ...r.alts!.filter((x) => x !== a)] } : r;
}

/**
 * How far below the vanishing point a frame's reference line passes (it runs
 * through (vp.x, yRef)): a lane `w` columns wide spans w / depth of a ray's
 * slope (`laneSpread`). One number per frame: the fan already makes every
 * lane in the frame the same number of columns wide.
 */
export function fanDepth(r: FrameLanes): number {
  return r.fan.yRef - r.vp.y;
}

/**
 * The width every lane has, from the candidates of many frames: the most
 * common width, within 8%, weighted by width. The neighbouring lanes are the
 * same width as the bowler's on a line of constant distance, so a gutter cap
 * (a third as wide) or two lanes run together (when an edge is hidden) stand
 * out.
 *
 * A width is counted as a spread, the columns over the reference line's
 * depth below the vanishing point (`fanDepth`): the two edges' rays differ
 * by that much in slope. A lane's columns at the picture's bottom row change
 * whenever the camera zooms or tilts (the vanishing point moves up or down
 * the picture while the bottom row stays put), its spread does not: a zoom
 * or a shift of the picture keeps every line's slope. IMG_2938 zooms from
 * 0.57 to 1.88 of its calibration frame's scale while the ball rolls; its
 * lanes were 431 columns wide at the start and 520 later, the zoomed frames
 * outnumbered the rest, and on the early frames the only pair one "lane
 * width" apart ran from the left gutter's far side to the right edge, a
 * gutter too wide. Their spreads are 0.73 to 0.77 throughout.
 */
export function laneSpread(all: FrameLanes[]): number | null {
  const widths = all.flatMap((r) => r.candidates.map((c) => (c.right - c.left) / fanDepth(r)));
  if (!widths.length) return null;
  let best = 0;
  let bestScore = 0;
  for (const w of widths) {
    const near = widths.filter((x) => Math.abs(x - w) <= 0.08 * w);
    // Weighted by width: a cap's quiet top, a third of a lane wide, can turn up
    // as often as the lanes themselves.
    const score = near.length * w;
    if (score > bestScore) {
      best = median(near);
      bestScore = score;
    }
  }
  return best || null;
}

export interface LanePick {
  /** Index into the frames given. */
  index: number;
  vp: Point;
  far: number;
  near: number;
  candidate: LaneCandidate;
  left: Line3;
  right: Line3;
  /** Lane width in this frame's fan, columns: `laneSpread` at its middle's depth. */
  width: number;
}

/**
 * Edge pairs of one lane width in a frame's profile: a rising edge (the left
 * edge, the lane brighter to its right) and a falling one `width` further on,
 * within 6% (a gutter is a fifth of a lane wide, so a pair that took the
 * groove or the cap instead of the lane's own edge is too wide). Unlike the
 * quiet stretches, a pair does not need the lane between to be clear: the
 * bowler can stand in it.
 */
export function lanePairs(r: FrameLanes, width: number): LaneCandidate[] {
  const g = r.profile.grad;
  const peaks: { x: number; g: number }[] = [];
  for (let i = 1; i < g.length - 1; i++) {
    const v = g[i];
    if (!Number.isFinite(v) || Math.abs(v) < 1.5) continue;
    if (Math.abs(v) >= Math.abs(g[i - 1]) && Math.abs(v) >= Math.abs(g[i + 1]) && Math.sign(g[i - 1]) === Math.sign(v)) {
      const s = Math.sign(v);
      peaks.push({ x: r.fan.x0 + i + parabolaPeak(s * g[i - 1], s * v, s * g[i + 1]), g: v });
    }
  }
  const out: LaneCandidate[] = [];
  for (const l of peaks) {
    if (l.g <= 0) continue;
    for (const rr of peaks) {
      if (rr.g >= 0 || Math.abs(rr.x - l.x - width) > 0.06 * width) continue;
      out.push({ left: l.x, right: rr.x, leftEdge: l.g, rightEdge: rr.g });
    }
  }
  return out;
}

/** How far in from each edge a pair's interior starts, a fraction of its width (`interiorPeak`): clear of the edges' own lobes. */
export const INTERIOR_MARGIN = 0.06;
/**
 * A frame's pair is chosen among those with nothing inside stronger than
 * this times their stronger edge, when it has any (`rankLanes`). IMG_2938's
 * and IMG_9960's lanes, the bowler and the ball in them: under 0.3; the same
 * width over the ball return (the next gutter's far side for its left edge,
 * this lane's gutter groove and the capping inside): 0.9 and up.
 */
export const INTERIOR_RATIO = 0.5;

/**
 * The strongest lane-parallel line inside a pair (its profile's largest
 * |gradient| between its edges, `INTERIOR_MARGIN` in from each). The lane's
 * surface has no line along it as strong as its own edges; a stretch of the
 * same width over the ball return does (both gutters' grooves and the
 * capping's sides run inside it).
 */
export function interiorPeak(r: FrameLanes, c: LaneCandidate): number {
  const g = r.profile.grad;
  const m = INTERIOR_MARGIN * (c.right - c.left);
  const i0 = Math.max(0, Math.ceil(c.left + m - r.fan.x0));
  const i1 = Math.min(g.length - 1, Math.floor(c.right - m - r.fan.x0));
  let peak = 0;
  for (let i = i0; i <= i1; i++) if (Number.isFinite(g[i])) peak = Math.max(peak, Math.abs(g[i]));
  return peak;
}

/** Center of a candidate at the near end, in lane widths from the picture's center. */
function centerOffset(r: FrameLanes, c: LaneCandidate, frameWidth: number): number {
  const s = (r.near - r.vp.y) / (r.fan.yRef - r.vp.y);
  const center = r.vp.x + ((c.left + c.right) / 2 - r.vp.x) * s;
  return (center - frameWidth / 2) / ((c.right - c.left) * s);
}

/**
 * The bowler's lane on each frame, best first: the pair of edges one lane
 * width apart whose middle is within three quarters of a lane width of the
 * picture's center at the near end (the bowler films from behind their own
 * lane; the next lanes' middles are a lane and a half or more away), scored
 * by its weaker edge. Among a frame's pairs, those with no line inside as
 * strong as their edges (`interiorPeak`, `INTERIOR_RATIO`) are preferred.
 */
export function rankLanes(all: (FrameLanes | null)[], frameWidth: number): LanePick[] {
  const ok = all.filter((r): r is FrameLanes => !!r);
  const spread = laneSpread(ok);
  if (!spread) return [];
  const out: { score: number; pick: LanePick }[] = [];
  all.forEach((r, index) => {
    if (!r) return;
    // The lane's columns on this frame.
    const width = spread * fanDepth(r);
    const near = lanePairs(r, width).filter((c) => Math.abs(centerOffset(r, c, frameWidth)) < 0.75);
    // A pair with a line inside it as strong as its stronger edge is less
    // likely the lane than one without (`INTERIOR_RATIO`): the frame's pick
    // is made among the quiet pairs when it has any.
    const quiet = near.filter((c) => interiorPeak(r, c) <= INTERIOR_RATIO * Math.max(c.leftEdge, -c.rightEdge));
    const pairs = quiet.length ? quiet : near;
    if (!pairs.length) return;
    const centered = (c: LaneCandidate) => 1 - 0.3 * Math.abs(centerOffset(r, c, frameWidth));
    const score = (c: LaneCandidate) => Math.min(c.leftEdge, -c.rightEdge) * centered(c);
    // Within the frame, both edges choose: pairs that share their weaker edge
    // would otherwise tie, and the centering alone would pick between a lane's
    // edge and a faint line beside it (the gutter's lip, a board or two out).
    const both = (c: LaneCandidate) => Math.sqrt(-c.leftEdge * c.rightEdge) * centered(c);
    const c = pairs.reduce((a, b) => (both(a) >= both(b) ? a : b));
    out.push({ score: score(c), pick: { index, vp: r.vp, far: r.far, near: r.near, candidate: c, left: columnLine(r.fan, c.left), right: columnLine(r.fan, c.right), width } });
  });
  return out.sort((a, b) => b.score - a.score).map((o) => o.pick);
}

/**
 * The vanishing point to a fraction of a pixel: every lane-parallel line the
 * fan shows (both edges of every lane, the gutters, the caps) snapped at full
 * resolution, and the point nearest all of them. Many lines spread across
 * the picture fix it far better than the Hough lines on the halved picture.
 */
export function refineVanishingPoint(f: GrayFrame, r: FrameLanes): { vp: Point; lines: number } {
  const span = r.near - r.far;
  const prof = r.whole ?? columnProfile(r.fan, r.far + 0.08 * span, r.near - 0.04 * span);
  const g = prof.grad;
  const abs: number[] = [];
  for (let i = 0; i < g.length; i++) if (Number.isFinite(g[i])) abs.push(Math.abs(g[i]));
  abs.sort((a, b) => a - b);
  const level = Math.max(2, 0.25 * (abs[Math.floor(abs.length * 0.99)] ?? 0));
  const snapped: HoughLine[] = [];
  let last = -Infinity;
  for (let i = 2; i < g.length - 2; i++) {
    const v = Math.abs(g[i]);
    if (!(v >= level && v >= Math.abs(g[i - 1]) && v >= Math.abs(g[i + 1]))) continue;
    if (i - last < 4) continue;
    last = i;
    const l = columnLine(r.fan, r.fan.x0 + i);
    const at = (y: number) => ({ x: -(l[1] * y + l[2]) / l[0], y });
    const s = snapEdge(f, { a: at(r.far + 0.1 * span), b: at(r.near - 0.02 * span) }, { band: 3, sign: g[i] > 0 ? "rising" : "falling", interior: at(r.far + 0.5 * span), minSupport: 0.5 });
    if (!s.ok || s.rms > 0.6) continue;
    const n = Math.hypot(s.line[0], s.line[1]);
    const len = Math.hypot(s.segment.b.x - s.segment.a.x, s.segment.b.y - s.segment.a.y);
    snapped.push({ theta: 0, rho: 0, votes: s.support * len, line: [s.line[0] / n, s.line[1] / n, s.line[2] / n] });
  }
  const vp = vanishingPoint(snapped, 1.5, (p) => Math.hypot(p.x - r.vp.x, p.y - r.vp.y) < 0.05 * f.width);
  return vp && vp.support.length >= 4 ? { vp: vp.point, lines: vp.support.length } : { vp: r.vp, lines: 0 };
}

/** The line through `vp` nearest the points (least squares on their distances). */
export function rayThrough(vp: Point, pts: Point[]): Line3 | null {
  if (!pts.length) return null;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    const dx = p.x - vp.x;
    const dy = p.y - vp.y;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * fdlibm.atan2(2 * sxy, sxx - syy);
  const nx = -fdlibm.sin(theta);
  const ny = fdlibm.cos(theta);
  return [nx, ny, -(nx * vp.x + ny * vp.y)];
}

export interface LaneEdgeOptions {
  /** Half-width of the search across the rough line, pixels. */
  band?: number;
  /** The first edge from the lane side must be this share of the strongest across the step... */
  share?: number;
  /** ...and at least this gradient, grey levels a pixel. */
  min?: number;
  /** Then out to the middle of the thin dark line beyond it, within this many pixels. */
  toLine?: number;
}

/**
 * A lane edge at full resolution: the first rising edge from the lane side
 * (the lane's own edge, not the gutter's groove or the cap beyond it, which
 * are often stronger), on the thin dark line where the lane's colour ends,
 * along the rough line from row `far` to row `near`; then the ray through
 * `vp` nearest the points that agree (every lane line runs through it, so
 * only the edge's angle is free and a hidden stretch cannot tilt it).
 *
 * The defaults read the hand-verified edges of the sample clips: the faint
 * line nearest the lane (shot-01's left edge) clears 15% of the strongest
 * edge across the step, and the marks sit on the dark line's middle, about
 * 0.2% of the picture's width out from the gradient's peak.
 */
export function snapLaneEdge(
  f: GrayFrame, rough: Line3, vp: Point, interior: Point, far: number, near: number, opts: LaneEdgeOptions = {}
): { line: Line3; free: Line3; support: number; rms: number; points: Point[] } | null {
  const at = (y: number) => ({ x: -(rough[1] * y + rough[2]) / rough[0], y });
  const s = snapEdge(f, { a: at(far), b: at(near) }, {
    band: opts.band ?? Math.max(4, 0.01 * f.width),
    interior,
    sign: "rising",
    pick: "first",
    firstShare: opts.share ?? 0.15,
    firstMin: opts.min ?? 5,
    toLine: opts.toLine ?? 0.0018 * f.width
  });
  if (s.inliers.length < 3) return null;
  let line = rayThrough(vp, s.inliers)!;
  // Refit on the points near the ray (the free fit's inliers can lean).
  for (let it = 0; it < 2; it++) {
    const near2 = s.inliers.filter((p) => Math.abs(lineDistance(line, p)) <= 1.0);
    if (near2.length < 3) break;
    line = rayThrough(vp, near2)!;
  }
  const d = s.inliers.map((p) => lineDistance(line, p));
  const rms = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / d.length);
  return { line, free: s.line, support: s.support, rms, points: s.inliers };
}

export interface PinRow {
  line: Line3;
  /** The bases on the line. */
  bases: Point[];
  /** Their share of every base found. */
  support: number;
}

/** The best of `pinRows`. */
export function findPinRow(f: GrayFrame, far: number, pinPx: number): PinRow | null {
  return pinRows(f, far, pinPx)[0] ?? null;
}

/**
 * The back pin row across the whole house: the line through the bases of
 * every pin standing in any rack. Down a pin's column the picture is bright
 * from its head to its base, then its mirror image on the glossy deck is
 * bright again below; the base is the narrow darker seam between the two
 * (the pin's foot and its reflection's). The bases of every rack in view lie
 * on one straight line (the racks stand in a row across the house), found by
 * RANSAC, then lifted to the back row's bases (the highest): the best few
 * lines, most bases first, since a row of reflections or of the masking
 * units' lettering can make a line too.
 *
 * `far` is the rough picture row of the far end; `pinPx` the expected height
 * of a pin there, pixels.
 */
export function pinRows(f: GrayFrame, far: number, pinPx: number, max = 3): PinRow[] {
  const bases = pinBases(f, far, pinPx);
  const out: PinRow[] = [];
  let left = bases;
  while (out.length < max && left.length >= 4) {
    const fit = robustLine(left, 1.0);
    if (!fit || fit.inliers.length < 4) break;
    left = left.filter((p) => Math.abs(lineDistance(fit.line, p)) > 1.0);
    // Across the house: nearly level, not a pin's own column.
    if (Math.abs(fit.line[1]) < 0.9 * Math.hypot(fit.line[0], fit.line[1])) continue;
    // The back row stands furthest away, so its bases are the highest: the
    // front pins' bases sit up to a few pixels lower. Lift the line to the
    // upper edge (a fifth of the way up) of the bases within 3 pixels of it.
    const n = fit.line[1] > 0 ? 1 : -1;
    const close = bases.map((p) => n * lineDistance(fit.line, p)).filter((r) => Math.abs(r) <= 3).sort((a, b) => a - b);
    const lift = close.length ? close[Math.floor(0.2 * (close.length - 1))] : 0;
    const line: Line3 = [fit.line[0], fit.line[1], fit.line[2] - n * lift];
    out.push({ line, bases: fit.inliers, support: fit.inliers.length / bases.length });
  }
  return out;
}

/** Each column's pin base (see `pinRows`), where it has one. */
export function pinBases(f: GrayFrame, far: number, pinPx: number): Point[] {
  const D = Math.max(4, Math.round(pinPx));
  const side = Math.max(2, Math.round(D / 3));
  const y0 = Math.max(D + 1, Math.floor(far - 0.5 * D));
  const y1 = Math.min(f.height - 2 - D, Math.ceil(far + 2 * D));
  if (y1 <= y0) return [];
  const w = f.width;
  const d = f.data;
  const bases: Point[] = [];
  const prof = new Float64Array(f.height);
  const mean = (a: number, b: number) => {
    let s = 0;
    for (let y = a; y <= b; y++) s += prof[y];
    return s / (b - a + 1);
  };
  for (let x = side + 1; x < w - side - 1; x++) {
    for (let y = y0 - D; y <= y1 + D; y++) {
      const i = y * w + x;
      prof[y] = (d[i - 1] + 2 * d[i] + d[i + 1]) / 4;
    }
    let best = 0;
    let by = -1;
    for (let yc = y0; yc <= y1; yc++) {
      // A narrow dip: darker than the rows two to four either side.
      const v = Math.min(prof[yc - 1], prof[yc], prof[yc + 1]);
      if (prof[yc] > prof[yc - 1] || prof[yc] > prof[yc + 1]) continue;
      const above = mean(yc - 4, yc - 2);
      const below = mean(yc + 2, yc + 4);
      const depth = Math.min(above, below) - v;
      if (depth < 10) continue;
      // The pin above: bright down its lower half, and brighter than the gaps beside it.
      const pin = mean(yc - Math.round(D / 2), yc - 2);
      if (pin < 150) continue;
      const yy = yc - Math.round(D / 4);
      const gap = Math.max(d[yy * w + x - side], d[yy * w + x + side]);
      if (prof[yy] - gap < 25) continue;
      // The mirror below: bright for a third of a pin.
      if (mean(yc + 2, yc + Math.max(3, Math.round(D / 3))) < 0.6 * pin) continue;
      if (depth > best) {
        best = depth;
        by = yc;
      }
    }
    if (by < 0) continue;
    const o = parabolaPeak(-prof[by - 1], -prof[by], -prof[by + 1]);
    bases.push({ x, y: by + o });
  }
  return bases;
}

/**
 * The foul line: where the lane surface starts above the approach. Read down
 * two strips just inside the edges (boards 2 to 6 from each), clear of the
 * middle where the bowler slides; each gives the rows where the brightness
 * changes across the lane (the approach and the lane differ in colour or
 * gloss, and a thin line often marks the join). The foul line is the pair,
 * one each side, whose line runs at `slope` within 0.03 (the pin row's, or
 * the camera's roll: both are straight across the lane), strongest
 * together; with one side hidden, that side's best row at `slope`.
 */
export function findFoulLine(f: GrayFrame, left: Line3, right: Line3, near: number, span: number, slope: number): FoulLine | null {
  return findFoulLines(f, left, right, near, span, slope)[0] ?? null;
}

export interface FoulLine {
  line: Line3;
  /** Where it crosses each strip (one point when one side is hidden). */
  points: Point[];
  strength: number;
  /** Through both gutters' near ends (`gutterEnds`) rather than a change of brightness. */
  gutters?: boolean;
  /** Through one gutter's near end and a change of brightness that passes through it (`oneGutterFoulLine`). */
  oneGutter?: boolean;
  /** Turned to the clip's tilt against the pin row, its own being out or not measured (`holdToTilt`). */
  tilted?: boolean;
}

/** A gutter's structure above its end at least this, grey levels per pixel, for the end to count. */
export const GUTTER_DROP = 6;

/** One end of the foul line, for `gutterFoulLine`: a gutter's end (`gutterEnds`), the corner where the lane's edge line stops (`edgeEnds`), or both agreeing. */
export interface FoulEnd extends GutterEnd {
  /** Only the edge line's end was seen, no gutter end with it: never enough alone. */
  edgeOnly?: boolean;
  /** The gutter's end and the edge line's end agree: the corner itself, seen twice. */
  corner?: boolean;
}

/** How near a gutter's end and its edge line's end must lie to count as one corner, as a share of the lane's span in rows (about 3 rows on the sample clips). */
export const EDGE_AGREE = 0.012;

/**
 * Each side's end of the foul line from its gutter's end and its edge line's
 * end. The edge line's end is the corner itself and is taken when the
 * gutter's end, carried along `slope` to it, lies within `tol` rows: the
 * gutter strip's structure can run on a row or more past the corner (a lace
 * or a shoe over the gutter; 2026-11-16: shot-05's left corner sat 1.5 rows
 * low on every frame, 3.4 on the owner's frame), and is marked `corner`.
 * When the two disagree the gutter's end is kept, as before; with no gutter
 * end, the edge line's end alone, marked `edgeOnly`.
 */
export function foulEnds(gutters: [GutterEnd | null, GutterEnd | null], edges: [EdgeEnd | null, EdgeEnd | null], slope: number, tol: number): [FoulEnd | null, FoulEnd | null] {
  const one = (g: GutterEnd | null, e: EdgeEnd | null): FoulEnd | null => {
    const gOk = g && g.drop >= GUTTER_DROP ? g : null;
    if (gOk && e) return Math.abs(e.y - (gOk.y + slope * (e.x - gOk.x))) <= tol ? { x: e.x, y: e.y, drop: gOk.drop, corner: true } : gOk;
    if (gOk) return gOk;
    return e ? { x: e.x, y: e.y, drop: 0, edgeOnly: true } : null;
  };
  return [one(gutters[0], edges[0]), one(gutters[1], edges[1])];
}

const counts = (e: FoulEnd | null): e is FoulEnd => !!e && (e.edgeOnly || e.drop >= GUTTER_DROP);

/**
 * The foul line through both ends (`foulEnds`), when both are seen, at most
 * one of them by its edge line alone (a scoring console over the right gutter
 * of shot-02 leaves only the line), and the line between them runs within
 * 0.04 of `slope` across the lane (looser than the brightness pairs: the foul
 * line is near the camera, and on a camera turned off the lane's axis its
 * slope differs from the pin row's by up to 0.03 on the sample clips).
 */
export function gutterFoulLine(ends: [FoulEnd | null, FoulEnd | null], slope: number): FoulLine | null {
  const [a, b] = ends;
  if (!counts(a) || !counts(b) || (a.edgeOnly && b.edgeOnly)) return null;
  if (Math.abs((b.y - a.y) / (b.x - a.x) - slope) > 0.04) return null;
  const strength = Math.min(...[a, b].filter((e) => !e.edgeOnly).map((e) => e.drop));
  return { line: [a.y - b.y, b.x - a.x, a.x * b.y - b.x * a.y], points: [a, b], strength, gutters: true };
}

/**
 * The foul line from one gutter's end, when the other end is hidden (a
 * scoring console over it on shot-02) or too faint to count, or the two do
 * not line up (one of them is something else). One end alone is never
 * enough: a console's bottom, a shoe or the foul light's housing ends as
 * sharply. So it must be corroborated by a change of brightness read on both
 * sides of the lane (`pairs`, the thin dark line or the step to the approach)
 * whose line passes within `tol` rows of the end; the nearest such pair is
 * taken (over either end, when both are seen), and the foul line runs from
 * the gutter end to that pair's point on the far side, within 0.04 of
 * `slope` as for two ends. Null when nothing corroborates an end.
 */
export function oneGutterFoulLine(ends: [FoulEnd | null, FoulEnd | null], pairs: FoulLine[], slope: number, tol: number): FoulLine | null {
  let best: { i: number; end: FoulEnd; far: Point; off: number } | null = null;
  ends.forEach((end, i) => {
    if (!end || end.edgeOnly || end.drop < GUTTER_DROP) return;
    for (const p of pairs) {
      if (p.points.length !== 2) continue;
      const off = Math.abs(-(p.line[0] * end.x + p.line[2]) / p.line[1] - end.y);
      if (off > tol || (best && off >= best.off)) continue;
      const far = p.points[1 - i];
      if (Math.abs((far.y - end.y) / (far.x - end.x) - slope) > 0.04) continue;
      best = { i, end, far, off };
    }
  });
  if (!best) return null;
  const { i, end, far } = best as { i: number; end: FoulEnd; far: Point };
  const [a, b] = i === 0 ? [end, far] : [far, end];
  return { line: [a.y - b.y, b.x - a.x, a.x * b.y - b.x * a.y], points: [a, b], strength: end.drop / 2, oneGutter: true };
}

/**
 * The best guess from one end alone, when nothing on the far side backs it:
 * the line through the stronger gutter end at `slope`, the camera's roll or
 * the pin row's. An edge line's end alone does not count here (on rendered
 * pictures with the foul line below the frame the line "ends" where the
 * picture does). One-sided, so it is weighed after every pair; across the
 * clip the camera's distance (`laneAttempts`) decides whether it is taken.
 */
export function loneEndFoulLine(ends: [FoulEnd | null, FoulEnd | null], slope: number): FoulLine | null {
  const ok = ends.filter((e): e is FoulEnd => !!e && !e.edgeOnly && e.drop >= GUTTER_DROP).sort((p, q) => q.drop - p.drop);
  const end = ok[0];
  if (!end) return null;
  const b = { x: end.x + 100, y: end.y + 100 * slope };
  return { line: [end.y - b.y, b.x - end.x, end.x * b.y - b.x * end.y], points: [end], strength: end.drop / 4 };
}

/** How near a change of brightness on both sides must pass to a lone gutter end to back it, as a share of the lane's span in rows (about 0.15 ft at the foul line on the sample clips). */
export const ONE_GUTTER_TOL = 0.008;

/**
 * Every foul line `findFoulLine` weighs, its choice first: then the other
 * pairs, strongest first, then each side alone. `findLane` picks among them
 * by where they put the camera, which no single frame can tell.
 */
export function findFoulLines(f: GrayFrame, left: Line3, right: Line3, near: number, span: number, slope: number): FoulLine[] {
  const X = (l: Line3, y: number) => -(l[1] * y + l[2]) / l[0];
  const yA = Math.max(1, Math.round(near - 0.18 * span));
  const yB = Math.min(f.height - 2, Math.round(near + 0.04 * span));
  if (yB - yA < 6) return [];
  type Side = { x: (y: number) => number; peaks: { y: number; g: number }[] };
  const sides: Side[] = [];
  for (const [a, b] of [[0.04, 0.15], [0.85, 0.96]]) {
    const xs = (y: number) => {
      const l = X(left, y);
      const r = X(right, y);
      return [l + a * (r - l), l + b * (r - l)];
    };
    const prof: number[] = [];
    for (let y = yA; y <= yB; y++) {
      const [x0, x1] = xs(y);
      const vals: number[] = [];
      // Along the pin row's slope so a rolled camera does not smear the line.
      const xm = (x0 + x1) / 2;
      for (let x = Math.ceil(x0); x <= x1; x++) {
        const yy = y + slope * (x - xm);
        if (x >= 0 && x < f.width && yy >= 0 && yy <= f.height - 1) vals.push(sample(f, x, yy));
      }
      prof.push(vals.length >= 3 ? median(vals) : NaN);
    }
    const g = prof.map((_, i) => (i > 0 && i < prof.length - 1 ? (prof[i + 1] - prof[i - 1]) / 2 : NaN));
    const peaks: { y: number; g: number }[] = [];
    for (let i = 2; i < g.length - 2; i++) {
      const v = Math.abs(g[i]);
      if (!Number.isFinite(v) || v < 4) continue;
      if (v >= Math.abs(g[i - 1]) && v >= Math.abs(g[i + 1])) {
        const off = parabolaPeak(Math.abs(g[i - 1]), v, Math.abs(g[i + 1]));
        peaks.push({ y: yA + i + off, g: v });
      }
    }
    sides.push({ x: (y) => { const [x0, x1] = xs(y); return (x0 + x1) / 2; }, peaks });
  }
  const [L, R] = sides;
  const pairs: FoulLine[] = [];
  for (const pl of L.peaks) {
    for (const pr of R.peaks) {
      const a = { x: L.x(pl.y), y: pl.y };
      const b = { x: R.x(pr.y), y: pr.y };
      const s = (b.y - a.y) / (b.x - a.x);
      if (Math.abs(s - slope) > 0.03) continue;
      pairs.push({ line: [a.y - b.y, b.x - a.x, a.x * b.y - b.x * a.y], points: [a, b], strength: Math.min(pl.g, pr.g) });
    }
  }
  const out: FoulLine[] = [];
  // The gutters begin at the foul line: where each channel's lengthwise
  // structure stops and the flat approach starts is the strongest cue there
  // is (2026-11-15: the brightness rows alone took the edge of a band of
  // boards 1 to 1.7 ft up the lane on four of the six sample clips, and the
  // camera's distance agreed with it on every frame, so the mode could not
  // catch it). Both gutter ends, as a line, come first. One end alone comes
  // first only when a change of brightness across the lane passes through it
  // (`oneGutterFoulLine`): the bottom of a scoring console, a shoe or the foul
  // light's housing beside the gutter end it as sharply.
  // Each end is the gutter's end, or the corner where the lane's edge line
  // stops when the two agree (`foulEnds`).
  const ends = foulEnds(gutterEnds(f, left, right, near, span, slope), edgeEnds(f, left, right, near, span), slope, Math.max(1.5, EDGE_AGREE * span));
  const gutterLine = gutterFoulLine(ends, slope) ?? oneGutterFoulLine(ends, pairs, slope, Math.max(1.5, ONE_GUTTER_TOL * span));
  if (gutterLine) out.push(gutterLine);
  if (pairs.length) {
    // Then, of the pairs nearly as strong as the strongest, the one furthest
    // up the lane (an approach join can be sharper than the foul line; but so
    // can the edge of a band of sheen up the lane, which the gutters and the
    // camera's distance over the clip settle).
    pairs.sort((a, b) => b.strength - a.strength);
    const strongest = pairs[0].strength;
    const yOf = (p: FoulLine) => (p.points[0].y + p.points[1].y) / 2;
    const first = pairs.filter((p) => p.strength >= 0.6 * strongest).reduce((a, b) => (yOf(b) < yOf(a) ? b : a));
    out.push(first, ...pairs.filter((p) => p !== first));
  }
  // With no line through the ends, one end alone at the slope, before the
  // brightness rows of one side.
  const lone = gutterLine ? null : loneEndFoulLine(ends, slope);
  if (lone) out.push(lone);
  // One side only: its rows, strongest first, on the pin row's slope.
  const ones = [...L.peaks.map((p) => ({ ...p, x: L.x(p.y) })), ...R.peaks.map((p) => ({ ...p, x: R.x(p.y) }))].sort((p, q) => q.g - p.g);
  for (const one of ones) {
    const a = { x: one.x, y: one.y };
    const b = { x: one.x + 100, y: one.y + 100 * slope };
    out.push({ line: [a.y - b.y, b.x - a.x, a.x * b.y - b.x * a.y], points: [a], strength: one.g / 2 });
  }
  return out;
}

/** Where one gutter's channel ends at the approach: a picture point in the middle of the gutter, and how much lengthwise structure stops there. */
export interface GutterEnd {
  x: number;
  y: number;
  /** The gutter's structure above the end, mean grey levels per pixel across the gutter. */
  drop: number;
}

/**
 * The near end of each gutter: down a strip in the middle of the channel
 * (from 0.04 to 0.15 lane widths outside each edge; a gutter is 0.22 wide,
 * and the foul light's housing can stand over its outer part),
 * the mean gradient across the strip is high over the channel (its walls,
 * groove and lip all run along the lane) and falls to nearly nothing on the
 * flat approach. The end is the row where it falls below half the gutter's
 * level and stays there, to a fraction of a row; rows `near` - 0.2 `span` to
 * `near` + 0.08 `span`, sampled along `slope`. Null for a side whose channel
 * does not show such a fall (hidden, or out of the picture).
 */
export function gutterEnds(f: GrayFrame, left: Line3, right: Line3, near: number, span: number, slope: number): [GutterEnd | null, GutterEnd | null] {
  const X = (l: Line3, y: number) => -(l[1] * y + l[2]) / l[0];
  const yA = Math.max(1, Math.round(near - 0.2 * span));
  const yB = Math.min(f.height - 2, Math.round(near + 0.08 * span));
  const k = Math.max(3, Math.round(0.012 * span));
  const side = (outside: (y: number) => [number, number]): GutterEnd | null => {
    if (yB - yA < 4 * k) return null;
    // The structure down the strip, or down the part of it from p0 to p1 of its width.
    const energy = (p0: number, p1: number): number[] => {
      const E: number[] = [];
      for (let y = yA; y <= yB; y++) {
        const [s0, s1] = outside(y);
        const xm = (s0 + s1) / 2;
        const x0 = s0 + p0 * (s1 - s0);
        const x1 = s0 + p1 * (s1 - s0);
        let s = 0;
        let n = 0;
        for (let x = Math.ceil(x0); x <= x1; x++) {
          const yy = y + slope * (x - xm);
          const g = Math.abs(sample(f, x + 1, yy) - sample(f, x - 1, yy));
          if (Number.isFinite(g)) {
            s += g;
            n++;
          }
        }
        E.push(n >= 3 && n >= 0.6 * (x1 - x0) ? s / n : NaN);
      }
      return E;
    };
    const E = energy(0, 1);
    const mean = (P: number[], a: number, b: number) => {
      let s = 0;
      for (let j = a; j <= b; j++) s += P[j];
      return s / (b - a + 1);
    };
    // The sharpest fall going down: k rows of channel above, k rows of approach below.
    let best = -1;
    let bestRatio = 3;
    for (let j = k; j < E.length - k; j++) {
      const above = mean(E, j - k, j - 1);
      const below = mean(E, j + 1, j + k);
      if (!Number.isFinite(above) || !Number.isFinite(below) || above < 4) continue;
      const r = above / (below + 0.5);
      if (r > bestRatio) {
        bestRatio = r;
        best = j;
      }
    }
    if (best < 0) return null;
    const level = mean(E, best - k, best - 1);
    // The first row from the channel side under half its level, interpolated.
    const halfDown = (P: number[], lv: number): number | null => {
      let j = best - k;
      while (j < best + k && !(P[j + 1] < lv / 2)) j++;
      if (!(P[j + 1] < lv / 2)) return null;
      const o = P[j] > P[j + 1] ? Math.max(0, Math.min(1, (P[j] - lv / 2) / (P[j] - P[j + 1]))) : 0.5;
      return j + o;
    };
    // The same fall in each third of the strip, and the middle one of them
    // (2026-11-15: a lace hanging from the slide shoe over one part of the
    // gutter kept the whole strip's structure up for two rows below the
    // channel's end on shot-05, so the foul line's left end sat low).
    const thirds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const P = energy(i / 3, (i + 1) / 3);
      const lv = mean(P, best - k, best - 1);
      const at = Number.isFinite(lv) && lv >= 4 ? halfDown(P, lv) : null;
      if (at !== null) thirds.push(at);
    }
    const whole = halfDown(E, level) ?? best + 0.5;
    const y = yA + (thirds.length >= 2 ? median(thirds) : whole);
    // Below a real end is the approach, as light as the lane; below the
    // bottom of a scoring console or a shoe over the gutter it is dark
    // (2026-11-16: the console on shot-02 hides the right gutter, and the
    // strip running into its black face fell like an end 0.3 to 1 ft up the
    // lane on five frames).
    if (gray(outside, y + 1, y + k) < GUTTER_BELOW * gray(inside(outside), y + 1, y + k)) return null;
    const [x0, x1] = outside(y);
    const xm = (x0 + x1) / 2;
    return { x: xm, y, drop: level };
  };
  // Mean gray over a strip from row a to row b, sampled along `slope`.
  const gray = (strip: (y: number) => [number, number], a: number, b: number): number => {
    let s = 0;
    let n = 0;
    for (let y = Math.ceil(a); y <= b; y++) {
      const [s0, s1] = strip(y);
      const xm = (s0 + s1) / 2;
      for (let x = Math.ceil(s0); x <= s1; x++) {
        const v = sample(f, x, y + slope * (x - xm));
        if (Number.isFinite(v)) {
          s += v;
          n++;
        }
      }
    }
    return n ? s / n : NaN;
  };
  const width = (y: number) => X(right, y) - X(left, y);
  const leftStrip = (y: number): [number, number] => [X(left, y) - 0.15 * width(y), X(left, y) - 0.04 * width(y)];
  const rightStrip = (y: number): [number, number] => [X(right, y) + 0.04 * width(y), X(right, y) + 0.15 * width(y)];
  // The same strip mirrored onto the lane, just inside its edge.
  const inside = (strip: (y: number) => [number, number]) =>
    strip === leftStrip
      ? (y: number): [number, number] => [X(left, y) + 0.04 * width(y), X(left, y) + 0.15 * width(y)]
      : (y: number): [number, number] => [X(right, y) - 0.15 * width(y), X(right, y) - 0.04 * width(y)];
  return [side(leftStrip), side(rightStrip)];
}

/** Below a gutter's end the strip must be at least this share of the lane's gray beside it (the approach is as light as the lane; a console's face is not). */
export const GUTTER_BELOW = 0.6;

/** Where the lane's own edge, the thin dark line between the lane and its gutter, stops at the approach. */
export interface EdgeEnd {
  x: number;
  y: number;
  /** How much darker the line is than the lane beside it above the end, gray levels. */
  depth: number;
}

/** The edge's dark line must be at least this much darker than the lane beside it, gray levels, for its end to count. */
export const EDGE_LINE_DEPTH = 8;

/**
 * The near end of each of the lane's edges: the thin dark line the edge
 * finder snaps to (`snapLaneEdge`) runs from the pins to the foul line and
 * stops there, where the flat approach begins. Down the edge line, how much
 * darker the line (the deepest narrow dip near the fitted edge) is than the
 * lane just inside it, from 0.006 to 0.014 lane widths
 * in; the end is where that falls below half its level above and stays
 * there, rows `near` - 0.2 `span` to `near` + 0.08 `span`, to a fraction of a
 * row. It is the corner itself, so it needs nothing of the gutter beyond the
 * line: on shot-02 a scoring console covers the right gutter to within three
 * pixels of the edge, and only the line shows where it stops. Null for a
 * side whose line does not fall so (hidden, out of the picture), and when the
 * lane just inside is much darker below the fall than above it (a shoe or a
 * leg over the line, not the approach).
 */
export function edgeEnds(f: GrayFrame, left: Line3, right: Line3, near: number, span: number): [EdgeEnd | null, EdgeEnd | null] {
  const X = (l: Line3, y: number) => -(l[1] * y + l[2]) / l[0];
  const yA = Math.max(1, Math.round(near - 0.2 * span));
  const yB = Math.min(f.height - 2, Math.round(near + 0.08 * span));
  const k = Math.max(3, Math.round(0.012 * span));
  const side = (l: Line3, s: 1 | -1): EdgeEnd | null => {
    if (yB - yA < 4 * k) return null;
    const D: number[] = [];
    const I: number[] = [];
    for (let y = yA; y <= yB; y++) {
      const w = X(right, y) - X(left, y);
      // The line itself: the deepest narrow dip across the fitted edge, within
      // 0.012 lane widths of it (the fitted ray can be a few pixels off the
      // line near the camera, 3.5 on shot-02's right edge), darker than the
      // picture a pixel and a half out on both sides, so the step to a dark
      // console beside the gutter is not taken for it.
      const x0 = X(l, y);
      const reach = Math.max(1.5, 0.012 * w);
      let x = x0;
      let line = NaN;
      let deepest = 0;
      for (let o = -reach; o <= reach; o += 0.5) {
        const v = sample(f, x0 + o, y);
        const d = Math.min(sample(f, x0 + o - 1.5, y), sample(f, x0 + o + 1.5, y)) - v;
        if (d > deepest) {
          deepest = d;
          x = x0 + o;
          line = v;
        }
      }
      if (!Number.isFinite(line)) line = sample(f, x0, y);
      const a = Math.max(2, 0.006 * w);
      const b = Math.max(a + 2, 0.014 * w);
      let sum = 0;
      let n = 0;
      for (let o = a; o <= b; o += 0.5) {
        const v = sample(f, x + s * o, y);
        if (Number.isFinite(v)) {
          sum += v;
          n++;
        }
      }
      const inside = n >= 3 ? sum / n : NaN;
      I.push(inside);
      D.push(Number.isFinite(line) ? Math.max(0, inside - line) : NaN);
    }
    const mean = (P: number[], a: number, b: number) => {
      let t = 0;
      for (let j = a; j <= b; j++) t += P[j];
      return t / (b - a + 1);
    };
    // The sharpest fall going down: k rows of line above, k rows without below.
    let best = -1;
    let bestRatio = 3;
    for (let j = k; j < D.length - k; j++) {
      const above = mean(D, j - k, j - 1);
      const below = mean(D, j + 1, j + k);
      if (!Number.isFinite(above) || !Number.isFinite(below) || above < EDGE_LINE_DEPTH) continue;
      const r = above / (below + 1);
      if (r > bestRatio) {
        bestRatio = r;
        best = j;
      }
    }
    if (best < 0) return null;
    const level = mean(D, best - k, best - 1);
    if (mean(I, best + 1, best + k) < 0.75 * mean(I, best - k, best - 1)) return null;
    // The first row from the lane side under half the level, interpolated.
    let j = best - k;
    while (j < best + k && !(D[j + 1] < level / 2)) j++;
    if (!(D[j + 1] < level / 2)) return null;
    const o = D[j] > D[j + 1] ? Math.max(0, Math.min(1, (D[j] - level / 2) / (D[j] - D[j + 1]))) : 0.5;
    const y = yA + j + o;
    return { x: X(l, y), y, depth: level };
  };
  return [side(left, 1), side(right, -1)];
}

export interface LaneFound {
  /** Index into the frames given of the frame the lane was found on. */
  index: number;
  /** Calibration marks on that frame, as `fitCalibration` takes them. */
  marks: CalMark[];
  vp: Point;
  left: Line3;
  right: Line3;
  foul: Line3 | null;
  pinRow: Line3 | null;
  /** Share of steps along each edge that agreed. */
  support: { left: number; right: number };
  /** How far behind the foul line the found lines put the camera, feet. */
  camera: number;
  /** The edges as first found on the fan, before the fine snap. */
  coarse: { left: Line3; right: Line3 };
  /** The lines as measured on the frame, before the fit with the pins (`left` and the rest are the fit's). */
  measured: { left: Line3; right: Line3; foul: Line3; pinRow: Line3 };
  /** Lane (u boards, v feet) to picture on that frame: the fit of the marks. */
  H: Mat3;
  /** The pins check against the measured lines alone. */
  pins: LandmarkError[];
  /** How many pins went into the fit as marks (0, 2 or 3). */
  pinsUsed: number;
  /**
   * Null when every line was seen. Otherwise what was guessed: the foul line
   * (hidden or below the picture) placed from the pin row by the camera's
   * distance, measured on the clip's frames that do show it
   * (`camera-from-frames`) or, when none does, `TYPICAL_CAMERA_FT`.
   */
  guess: { foul: "camera-from-frames" | "typical-camera" } | null;
}

/** `n` points on a picture line, evenly between rows a and b. */
function along(l: Line3, a: number, b: number, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const y = a + ((b - a) * i) / (n - 1);
    out.push({ x: -(l[1] * y + l[2]) / l[0], y });
  }
  return out;
}

/** `n` points on a nearly level picture line, evenly between columns a and b. */
function across(l: Line3, a: number, b: number, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const x = a + ((b - a) * i) / (n - 1);
    out.push({ x, y: -(l[0] * x + l[2]) / l[1] });
  }
  return out;
}

/** How far behind the foul line the camera may stand, feet. */
export const CAMERA_FT: [number, number] = [10, 45];

/** The marks and how far to trust them, on one frame for one lane. */
export interface Attempt {
  found: LaneFound;
  quality: number;
}

/** One reading of the pin row and the foul line together, and where they put the camera. */
interface Ends {
  pin: PinRow;
  foul: FoulLine;
  /** Feet behind the foul line. */
  camera: number;
  /** The foul line not seen but placed from the camera's distance (`guessFoul`), and where that distance came from. */
  guess?: "camera-from-frames" | "typical-camera";
  /**
   * The foul line's slope less the pin row's, when the pin row is seen
   * across enough of the picture to give its own slope (NaN otherwise). The
   * two are the same direction on the floor, so on one clip this barely
   * moves (`laneSteps`, `FOUL_TILT_TOL`).
   */
  tilt: number;
  /** The pin row's own slope, the reference `tilt` is taken from (NaN with none). */
  pinSlope: number;
}

/** What one frame measures for the lane picked there, before the pin row and foul line are settled. */
interface Measured {
  f: GrayFrame;
  pick: LanePick;
  vp: Point;
  sl: NonNullable<ReturnType<typeof snapLaneEdge>>;
  sr: NonNullable<ReturnType<typeof snapLaneEdge>>;
  /** Every believable pin row and foul line, the frame's own choice first. */
  ends: Ends[];
  /** With no foul line seen (`ends` empty): the pin rows, for `guessFoul`, and the slope across the lane. */
  pins: PinRow[];
  slope: number;
}

/** Ends kept per frame for `findLane` to choose among. */
const MAX_ENDS = 16;

/** Edges, and the candidate pin rows and foul lines, on one frame for the lane picked there. */
function measure(f: GrayFrame, r: FrameLanes, pick: LanePick): Measured | null {
  const { vp } = refineVanishingPoint(f, r);
  const span = pick.near - pick.far;
  const X = (l: Line3, y: number) => -(l[1] * y + l[2]) / l[0];
  const midY = pick.far + 0.6 * span;
  const interior = { x: (X(pick.left, midY) + X(pick.right, midY)) / 2, y: midY };
  const sl = snapLaneEdge(f, pick.left, vp, interior, pick.far + 0.1 * span, pick.near);
  const sr = snapLaneEdge(f, pick.right, vp, interior, pick.far + 0.1 * span, pick.near);
  if (!sl || !sr) return null;
  const left = sl.line;
  const right = sr.line;
  const wFar = X(right, pick.far) - X(left, pick.far);
  if (!(wFar > 0)) return null;
  const mid = (y: number) => (X(left, y) + X(right, y)) / 2;
  const rowAt = (l: Line3, x: number) => -(l[0] * x + l[2]) / l[1];
  // Each candidate pin row with the foul lines on its slope; kept when the two
  // put the camera a believable distance behind the foul line. Along the
  // lane's middle, (pin row - vp) / (foul - vp) = d / (d + 62.6) for a camera d
  // feet behind the foul line: 18 to 25 ft on the sample clips.
  const ends: Ends[] = [];
  const pins: PinRow[] = [];
  let slope0 = r.fan.roll;
  for (const p of pinRows(f, pick.far, (wFar * 15) / 41.5)) {
    const y = rowAt(p.line, mid(pick.far));
    if (y < pick.far - 0.05 * span || y > pick.far + 0.3 * span || p.bases.length < 4) continue;
    pins.push(p);
    // A pin row seen across a quarter of the picture or more gives the level;
    // one rack alone is too short, and the house's level lines give it instead.
    const xs = p.bases.map((b) => b.x);
    const wide = Math.max(...xs) - Math.min(...xs) > 0.25 * f.width;
    const slope = wide ? -p.line[0] / p.line[1] : r.fan.roll;
    if (pins.length === 1) slope0 = slope;
    for (const fl of findFoulLines(f, left, right, pick.near, span, slope)) {
      const d = cameraFeet(vp, p.line, fl.line, mid, pick.far, pick.near);
      if (d === null) continue;
      ends.push({ pin: p, foul: fl, camera: d, tilt: wide ? -fl.line[0] / fl.line[1] - slope : NaN, pinSlope: wide ? slope : NaN });
      if (ends.length >= MAX_ENDS) break;
    }
    if (ends.length >= MAX_ENDS) break;
  }
  if (!ends.length && !pins.length) return null;
  return { f, pick, vp, sl, sr, ends, pins, slope: slope0 };
}

/**
 * How far behind the foul line `foul` and the pin row `pin` put the camera,
 * feet, along the lane's middle (`mid`, the middle's column at a row): (pin
 * row - vp) / (foul - vp) = d / (d + 62.6). Null when the two are too near
 * together or the distance is outside `CAMERA_FT`.
 */
function cameraFeet(vp: Point, pin: Line3, foul: Line3, mid: (y: number) => number, far: number, near: number): number | null {
  const rowAt = (l: Line3, x: number) => -(l[0] * x + l[2]) / l[1];
  const y = rowAt(pin, mid(far));
  const yf = rowAt(foul, mid(near));
  if (!(yf - y > 0.5 * (near - far))) return null;
  const ratio = (y - vp.y) / (yf - vp.y);
  const d = (BACK_ROW_FT * ratio) / (1 - ratio);
  return d >= CAMERA_FT[0] && d <= CAMERA_FT[1] ? d : null;
}

/** A camera this far behind the foul line, feet, when no frame of the clip shows how far: the middle of the sample clips' 19 to 26. */
export const TYPICAL_CAMERA_FT = 22;

/**
 * The foul line where it would be for a camera `camera` feet behind it, from
 * the pin row (the camera-distance relation `laneAttempts` checks: along the
 * lane's middle, (pin row - vp) / (foul line - vp) = d / (d + 62.6)), at the
 * slope across the lane. For a foul line hidden by the bowler or below the
 * picture; marked as a guess.
 */
export function guessFoul(vp: Point, left: Line3, right: Line3, pin: Line3, slope: number, camera: number): FoulLine {
  const X = (l: Line3, y: number) => -(l[1] * y + l[2]) / l[0];
  // The pin row where it crosses the lane's middle line (the ray through vp
  // halfway between the edges).
  const yRef = vp.y + 100;
  const middle: Line3 = [yRef - vp.y, vp.x - (X(left, yRef) + X(right, yRef)) / 2, 0];
  middle[2] = -(middle[0] * vp.x + middle[1] * vp.y);
  const p = intersect(pin, middle)!;
  const k = (camera + BACK_ROW_FT) / camera;
  const q = { x: vp.x + (p.x - vp.x) * k, y: vp.y + (p.y - vp.y) * k };
  const b = { x: q.x + 100, y: q.y + 100 * slope };
  return { line: [q.y - b.y, b.x - q.x, q.x * b.y - b.x * q.y], points: [], strength: 0 };
}

/**
 * The foul line's ends this frame shows for certain (`foulEnds`): a gutter's
 * end, at its edge line's corner where the two agree, never an edge line's
 * end alone. The points a re-tilted foul line may run through (`holdToTilt`).
 * When one side is such a corner, seen twice, a gutter's end that its own
 * edge line does not confirm is left out: a leg or a shoe over that gutter
 * ends where it does, and the camera's distance cannot tell a few rows apart
 * (2026-11-23: on IMG_0047 just after the release, the trailing leg over the
 * left gutter put its end 4 rows onto the approach; the line at the tilt
 * through it put the camera 0.13 ft from the clip's, nearer than the lines
 * on the foul line itself, and the release frames drew the foul line 0.3 ft
 * short of it).
 */
export function foulAnchors(f: GrayFrame, left: Line3, right: Line3, near: number, span: number, slope: number): FoulEnd[] {
  const ends = foulEnds(gutterEnds(f, left, right, near, span, slope), edgeEnds(f, left, right, near, span), slope, Math.max(1.5, EDGE_AGREE * span));
  const sure = ends.filter((e): e is FoulEnd => !!e && !e.edgeOnly && e.drop >= GUTTER_DROP);
  const corners = sure.filter((e) => e.corner);
  return corners.length ? corners : sure;
}

/** The line through `p` at `slope`. */
export function lineAtSlope(p: Point, slope: number): Line3 {
  const b = { x: p.x + 100, y: p.y + 100 * slope };
  return [p.y - b.y, b.x - p.x, p.x * b.y - b.x * p.y];
}

/** What `holdToTilt` weighs of a pin row and foul line read together (`Ends`). */
export interface TiltEnd {
  foul: FoulLine;
  /** Feet behind the foul line this foul line and its pin row put the camera. */
  camera: number;
  /** The foul line's slope less the pin row's, NaN when the pin row gives no slope of its own. */
  tilt: number;
  /** The pin row's own slope, NaN with none. */
  pinSlope: number;
}

/** What `holdToTilt` may look at on the frame, for a foul line it has to place itself. */
export interface TiltLook {
  /** The ends the frame shows for certain, looked for along `slope` (`foulAnchors`). */
  anchors: (slope: number) => FoulEnd[];
  /** Feet behind the foul line a foul line puts the camera with the pin row (null: not believable). */
  cameraOf: (foul: Line3) => number | null;
  /** The lane's middle column at the near end. */
  middle: number;
}

/**
 * The end to calibrate with among `ends` (those near the clip's camera
 * distance `camera`, best first), held to the clip's foul line tilt `tilt`
 * (`laneSteps`; NaN: none, and the first end as before). The foul line and
 * the pin row are the same direction on the floor, so the foul line's slope
 * is the pin row's plus the clip's tilt, whatever the camera's roll.
 *
 * - The first end stands when its tilt is within `FOUL_TILT_TOL` of the
 *   clip's, or its pin row gives no slope of its own (too short).
 * - A foul line seen at one point only (one end, or one side's change of
 *   brightness) has no tilt of its own, only the slope it was drawn at: it
 *   is turned about that point to the clip's.
 * - Otherwise one of its ends is hidden, or something else was taken for it
 *   (on IMG_9960 the trailing shoe over the right corner, 2026-11-21). Of
 *   the other ends within the tolerance, and lines at the clip's tilt through
 *   each end the frame shows for certain (`look.anchors`), the one that puts
 *   the camera nearest where the clip does; with none of them, the first
 *   end's line turned about the lane's middle. Its `points` are those seen
 *   (one or none), so the frame weighs less as the one to show.
 */
export function holdToTilt<E extends TiltEnd>(ends: E[], tilt: number, camera: number, look: TiltLook): E {
  const first = ends[0];
  if (!Number.isFinite(tilt) || !Number.isFinite(first.pinSlope)) return first;
  const slope = first.pinSlope + tilt;
  const turned = (e: E, through: Point, seen: Point[], strength: number): E | null => {
    const line = lineAtSlope(through, slope);
    const d = look.cameraOf(line);
    return d === null ? null : { ...e, foul: { line, points: seen, strength, tilted: true }, camera: d, tilt };
  };
  const fits = (e: E) => e.foul.points.length === 2 && Math.abs(e.tilt - tilt) <= FOUL_TILT_TOL;
  if (fits(first)) return first;
  if (first.foul.points.length === 1) return turned(first, first.foul.points[0], first.foul.points, first.foul.strength) ?? first;
  const options: E[] = ends.filter(fits);
  for (const e of ends) if (e.foul.points.length === 1 && e.pinSlope === first.pinSlope) options.push(turned(e, e.foul.points[0], e.foul.points, e.foul.strength) ?? e);
  for (const a of look.anchors(slope)) {
    const t = turned(first, a, [{ x: a.x, y: a.y }], a.drop / 4);
    if (t) options.push(t);
  }
  let best: E | null = null;
  for (const o of options) if (Math.abs(o.camera - camera) <= 2 * CAMERA_SPREAD_FT && (!best || Math.abs(o.camera - camera) < Math.abs(best.camera - camera))) best = o;
  if (best) return best;
  const middle = { x: look.middle, y: -(first.foul.line[0] * look.middle + first.foul.line[2]) / first.foul.line[1] };
  return turned(first, middle, [], 0) ?? first;
}

/** `holdToTilt` on a measured frame. */
function atTilt(m: Measured, ends: Ends[], tilt: number, camera: number): Ends {
  const { f, pick, vp, sl, sr } = m;
  const span = pick.near - pick.far;
  const X = (l: Line3, y: number) => -(l[1] * y + l[2]) / l[0];
  const mid = (y: number) => (X(sl.line, y) + X(sr.line, y)) / 2;
  return holdToTilt(ends, tilt, camera, {
    anchors: (slope) => foulAnchors(f, sl.line, sr.line, pick.near, span, slope),
    cameraOf: (line) => cameraFeet(vp, ends[0].pin.line, line, mid, pick.far, pick.near),
    middle: mid(pick.near)
  });
}

/** The marks on one frame from its edges and the pin row and foul line chosen. */
function attempt(m: Measured, ends: Ends): Attempt | null {
  const { f, pick, vp, sl, sr } = m;
  const { pin, foul, camera } = ends;
  const span = pick.near - pick.far;
  const X = (l: Line3, y: number) => -(l[1] * y + l[2]) / l[0];
  const left = sl.line;
  const right = sr.line;
  const mid = (y: number) => (X(left, y) + X(right, y)) / 2;
  const rowAt = (l: Line3, x: number) => -(l[0] * x + l[2]) / l[1];
  const top = rowAt(pin.line, mid(pick.far));
  const bottom = rowAt(foul.line, mid(pick.near));
  const xs = pin.bases.map((p) => p.x);
  const measured: CalMark[] = [
    { kind: "line", label: "left", axis: "u", value: LEFT_U, at: along(left, top + 0.05 * span, bottom, 6) },
    { kind: "line", label: "right", axis: "u", value: RIGHT_U, at: along(right, top + 0.05 * span, bottom, 6) },
    { kind: "line", label: "foul", axis: "v", value: 0, at: across(foul.line, X(left, bottom), X(right, bottom), 3) },
    { kind: "line", label: "pinrow", axis: "v", value: BACK_ROW_FT, at: across(pin.line, Math.min(...xs), Math.max(...xs), 4) }
  ];
  const fitted = withPins(f, measured);
  if (!fitted) return null;
  const { fit, pins, used } = fitted;
  // The marks handed on are the fit's own lines over the same stretches, so
  // the four lines the screen draws (`markLinesOf`) carry the pins too.
  const H = fit.H;
  const lane = {
    left: mapLine(H, [1, 0, -LEFT_U]),
    right: mapLine(H, [1, 0, -RIGHT_U]),
    foul: mapLine(H, [0, 1, 0]),
    pinRow: mapLine(H, [0, 1, -BACK_ROW_FT])
  };
  const marks: CalMark[] = [
    { kind: "line", label: "left", axis: "u", value: LEFT_U, at: along(lane.left, top + 0.05 * span, bottom, 6) },
    { kind: "line", label: "right", axis: "u", value: RIGHT_U, at: along(lane.right, top + 0.05 * span, bottom, 6) },
    { kind: "line", label: "foul", axis: "v", value: 0, at: across(lane.foul, X(lane.left, bottom), X(lane.right, bottom), 3) },
    { kind: "line", label: "pinrow", axis: "v", value: BACK_ROW_FT, at: across(lane.pinRow, Math.min(...xs), Math.max(...xs), 4) }
  ];
  const quality =
    (ends.guess ? -0.5 : 0) +
    Math.min(sl.support, sr.support) +
    0.3 * Math.min(1, pin.bases.length / 30) +
    (foul.points.length === 2 ? 0.3 : 0) +
    0.1 * Math.min(1, pick.candidate.leftEdge / 20) +
    0.1 * Math.min(1, -pick.candidate.rightEdge / 20) +
    pinsAgree(pins);
  return {
    found: {
      index: pick.index, marks, vp, left: lane.left, right: lane.right, foul: lane.foul, pinRow: lane.pinRow,
      support: { left: sl.support, right: sr.support }, camera, coarse: { left: pick.left, right: pick.right },
      measured: { left, right, foul: foul.line, pinRow: pin.line }, H, pins, pinsUsed: used,
      guess: ends.guess ? { foul: ends.guess } : null
    },
    quality
  };
}

/**
 * How well the measured lines meet the standing pins, as a share of the
 * quality: the pins are the one check of the far end that does not come from
 * the lines themselves. Nothing when fewer than two are found (fallen,
 * hidden, or the lines too far out to look in the right place).
 */
function pinsAgree(pins: LandmarkError[]): number {
  if (pins.length < 2) return 0;
  const rms = Math.sqrt(pins.reduce((s, p) => s + p.error * p.error, 0) / pins.length);
  return 0.3 * Math.max(0, 1 - rms) * (pins.length / 3);
}

/** A pin whose axis is found further than this from where the lines put it, boards, is not trusted as a mark. */
export const PIN_AGREE = 1.5;

/**
 * The lane mapping from the measured lines, then the pins (7, 10 and the
 * head pin, `checkPins`) as marks of their own where they stand: each pin's
 * axis is found to a fraction of a pixel, at the far end where the edges are
 * thinnest and an edge's angle carries the most error, and it gives the fit
 * the redundancy that makes its residuals mean something. Two rounds, since
 * the pins are looked for where the mapping puts them. Pins further than
 * `PIN_AGREE` boards from the lines are left out (fallen, hidden, or a
 * bright thing that is not a pin), and so are all of them unless two agree.
 * `pins` is the check against the measured lines alone.
 */
function withPins(f: GrayFrame, measured: CalMark[]): { fit: CalibrationFit; pins: LandmarkError[]; used: number } | null {
  let fit: CalibrationFit;
  try {
    fit = fitCalibration(measured);
  } catch {
    return null;
  }
  const pins = checkPins(f, fit.H);
  let used = 0;
  let H: Mat3 = fit.H;
  for (let round = 0; round < 2; round++) {
    const found = (round === 0 ? pins : checkPins(f, H)).filter((p) => Math.abs(p.error) <= PIN_AGREE);
    if (found.length < 2) break;
    const marks: CalMark[] = found.map((p) => {
      const pos = PIN_POSITIONS[Number(p.name.replace("pin ", "")) as keyof typeof PIN_POSITIONS];
      return { kind: "line", label: p.name, axis: "u", value: pos.board, at: [apply(H, { x: pos.board + p.error, y: pos.feet })], weight: PIN_WEIGHT };
    });
    try {
      fit = fitCalibration([...measured, ...marks]);
    } catch {
      break;
    }
    H = fit.H;
    used = found.length;
  }
  return { fit, pins, used };
}

/** A pin's axis counts as this many points on an edge. */
const PIN_WEIGHT = 4;

/**
 * Every frame calibrated in full (see `findLane`), unranked, and the camera
 * distance they agree on.
 *
 * Which of a frame's pin rows and foul lines are the real ones no single
 * frame can always tell (a band of light reflected on the lane a few feet up,
 * or a join on the approach behind the foul line, can be sharper than the
 * foul line itself), but the frames together can: the person filming turns
 * the camera and stays put (the tracer's registration rests on the same
 * assumption), so the real ones put the camera the same distance behind the
 * foul line on every frame, while a wrong one moves it by feet, by a
 * different amount on each frame. The distance most frames' own choices
 * agree on (a mode, not a median: on a hard clip half of them are wrong),
 * then on each frame the candidate nearest it.
 */
export function laneAttempts(frames: GrayFrame[], tries = 10): { attempts: Attempt[]; camera: number } {
  const store: LaneStore = { per: new Map(), measured: new Map() };
  const steps = laneSteps(frames.length, frames[0].width, tries);
  let next = steps.next();
  while (!next.done) next = steps.next(next.value.map((job) => runLaneJob(job, frames[job.index], store)));
  return next.value;
}

/**
 * The lane search's work on each frame, as jobs (see `laneSteps`): `index`
 * is the frame's place among the frames searched. A frame's three jobs keep
 * what they find in a `LaneStore` for the next, so they run where its first
 * ran; what they hand back is all the search needs across frames.
 */
export type LaneJob =
  | { kind: "lanes"; index: number }
  | { kind: "measure"; index: number; pick: LanePick }
  | { kind: "attempt"; index: number; camera: number; seen: boolean; tilt: number };

/** What a frame's lane jobs keep between them. */
export interface LaneStore {
  per: Map<number, FrameLanes | null>;
  measured: Map<number, Measured | null>;
}

/** A frame's `lanesOnFrame` without the fan's pictures, which nothing after it reads: what `steadyProfiles` and `rankLanes` take. */
export function laneSummary(r: FrameLanes | null): FrameLanes | null {
  return r && { ...r, fan: { ...r.fan, F: new Float32Array(0), G: new Float32Array(0) } };
}

/** What `laneSteps` needs of a frame's `measure`: whether it saw ends, and the first one's camera, gutters and tilt. */
export interface MeasureSummary {
  ends: number;
  camera: number;
  gutters: boolean;
  /** The first end's `tilt` (the foul line's slope less the pin row's), NaN when not measured. */
  tilt: number;
}

/** One lane job on its frame `f`. */
export function runLaneJob(job: LaneJob, f: GrayFrame, store: LaneStore): FrameLanes | MeasureSummary | Attempt | null {
  switch (job.kind) {
    case "lanes": {
      const r = laneSummary(lanesOnFrame(f));
      store.per.set(job.index, r);
      return r;
    }
    case "measure": {
      const m = measure(f, atNear(store.per.get(job.index)!, job.pick.near), job.pick);
      store.measured.set(job.index, m);
      return m && { ends: m.ends.length, camera: m.ends[0]?.camera ?? NaN, gutters: !!m.ends[0]?.foul.gutters, tilt: m.ends[0]?.tilt ?? NaN };
    }
    case "attempt": {
      const m = store.measured.get(job.index)!;
      const { camera } = job;
      if (!m.ends.length) {
        // The foul line not seen on this frame (the bowler over it, or below
        // the picture): placed where the camera's distance puts it.
        const pin = m.pins[0];
        const foul = guessFoul(m.vp, m.sl.line, m.sr.line, pin.line, m.slope, camera);
        return attempt(m, { pin, foul, camera, guess: job.seen ? "camera-from-frames" : "typical-camera", tilt: NaN, pinSlope: NaN });
      }
      const near = m.ends.filter((e) => Math.abs(e.camera - camera) <= 2 * CAMERA_SPREAD_FT);
      return attempt(m, atTilt(m, near.length ? near : [m.ends[0]], job.tilt, camera));
    }
  }
}

/**
 * `laneAttempts` as three batches of jobs over `count` frames `width` pixels
 * wide: every frame's lanes, then the `tries` best frames measured, then each
 * of those calibrated with the camera distance they agree on.
 */
export function* laneSteps(count: number, width: number, tries: number): Generator<LaneJob[], { attempts: Attempt[]; camera: number }, unknown[]> {
  const per = (yield Array.from({ length: count }, (_, index) => ({ kind: "lanes" as const, index }))) as (FrameLanes | null)[];
  settleNear(per);
  steadyProfiles(per);
  const ranked = rankLanes(per, width).slice(0, tries);
  const sums = (yield ranked.map((pick) => ({ kind: "measure" as const, index: pick.index, pick }))) as (MeasureSummary | null)[];
  const measured = ranked.map((pick, k) => ({ index: pick.index, m: sums[k] })).filter((x): x is { index: number; m: MeasureSummary } => !!x.m);
  if (!measured.length) return { attempts: [], camera: NaN };
  const seen = measured.filter((x) => x.m.ends);
  // The frames that show both gutters' near ends say where the foul line is
  // best, so when there are a few of them they alone set the distance; with
  // no frame showing the foul line, a typical camera distance.
  const byGutters = seen.filter((x) => x.m.gutters);
  const camera = seen.length ? modeOf((byGutters.length >= MIN_GUTTER_FRAMES ? byGutters : seen).map((x) => x.m.camera), CAMERA_SPREAD_FT) : TYPICAL_CAMERA_FT;
  // The foul line's tilt against the pin row, from the frames whose foul
  // line runs through both gutters' ends: the two lines are the same
  // direction on the floor, so the frames agree on it however the camera
  // rolls, and a frame where a shoe or a leg hides one end does not.
  const tilts = byGutters.map((x) => x.m.tilt).filter((t) => Number.isFinite(t));
  const tilt = tilts.length >= MIN_GUTTER_FRAMES ? modeOf(tilts, FOUL_TILT_SPREAD) : NaN;
  const attempts = (yield measured.map((x) => ({ kind: "attempt" as const, index: x.index, camera, seen: seen.length > 0, tilt }))) as (Attempt | null)[];
  return { attempts: attempts.filter((a): a is Attempt => !!a), camera };
}

/** Frames showing both gutter ends needed for them alone to set the camera's distance (`laneAttempts`), and to set the foul line's tilt. */
export const MIN_GUTTER_FRAMES = 3;

/** How far the foul line's tilt against the pin row wanders between frames of one clip where both ends show (slope; about a pixel across the lane). */
export const FOUL_TILT_SPREAD = 0.002;

/**
 * A foul line whose tilt against the pin row is further than this from the
 * clip's (slope) has taken something else for one of its ends. The tilt
 * drifts as the camera turns: the frames that show both ends lie within
 * 0.0025 of their mode on IMG_9960 and within 0.008 on shot-01, whose camera
 * pans. On IMG_9960 the trailing shoe over the right corner put frames 0.011
 * to 0.026 out, 3 to 7 pixels at the right end.
 */
export const FOUL_TILT_TOL = 0.01;

/** How far the camera's distance behind the foul line wanders between frames of one clip, feet (a hand-held camera sways). */
export const CAMERA_SPREAD_FT = 0.6;

/** The value most of `xs` lie near: the peak of a Gaussian kernel density of width `h`, refined as the kernel-weighted mean. */
export function modeOf(xs: number[], h: number): number {
  const density = (x: number) => xs.reduce((s, v) => s + fdlibm.exp(-0.5 * ((v - x) / h) ** 2), 0);
  let best = xs[0];
  for (const x of xs) if (density(x) > density(best)) best = x;
  for (let it = 0; it < 3; it++) {
    let sw = 0;
    let sx = 0;
    for (const v of xs) {
      const w = fdlibm.exp(-0.5 * ((v - best) / h) ** 2);
      sw += w;
      sx += w * v;
    }
    best = sx / sw;
  }
  return best;
}

/**
 * Each frame's profile replaced by the median of its own and its neighbours'
 * (`reach` either side), each carried to its rays: a column is the ray at
 * (x - vp.x) / (yRef - vp.y), which a turn of the camera moves with the
 * vanishing point. The lane's lines stay put across frames and the bowler
 * does not, so a trouser leg lying along an edge on one frame is outvoted.
 */
export function steadyProfiles(per: (FrameLanes | null)[], reach = 2): void {
  const grads = per.map((r) => (r ? Float32Array.from(r.profile.grad) : null));
  const vals: number[] = [];
  per.forEach((r, i) => {
    if (!r) return;
    const k = r.fan.yRef - r.vp.y;
    const out = new Float32Array(r.profile.grad.length);
    for (let c = 0; c < out.length; c++) {
      const q = (r.fan.x0 + c - r.vp.x) / k;
      vals.length = 0;
      for (let j = Math.max(0, i - reach); j <= Math.min(per.length - 1, i + reach); j++) {
        const o = per[j];
        const g = grads[j];
        if (!o || !g) continue;
        const x = o.vp.x + q * (o.fan.yRef - o.vp.y) - o.fan.x0;
        const xi = Math.round(x);
        if (xi < 0 || xi >= g.length || !Number.isFinite(g[xi])) continue;
        vals.push(g[xi]);
      }
      out[c] = vals.length >= 2 ? median(vals) : NaN;
    }
    r.profile = { grad: out, level: r.profile.level };
  });
}

/**
 * The lane with no marks (plan, PR 8): on the frames given (full resolution,
 * video-range grey, a dozen or more spread over the clip), the bowler's lane
 * and its edges, the foul line and the back pin row on the frame where they
 * show best, as calibration marks on that frame. The `tries` frames whose
 * lane edges stand out most are each calibrated in full (`laneAttempts`,
 * which settles the pin row and foul line across them), and the one whose
 * edges are clearest and whose lines meet the standing pins best is kept.
 * Null when no frame gives all four.
 */
export function findLane(frames: GrayFrame[], tries = 10): LaneFound | null {
  const { attempts, camera } = laneAttempts(frames, tries);
  return bestAttempt(attempts, camera)?.found ?? null;
}

/**
 * The attempt to show and to start from. The camera barely moves along the
 * lane in a clip: an attempt whose lines put it somewhere else than the others
 * do found a wrong pin row or foul line (it had no candidate near the distance
 * the others agree on).
 */
function bestAttempt(attempts: Attempt[], camera: number): Attempt | null {
  let best: Attempt | null = null;
  for (const a of attempts) {
    const q = a.quality - 0.3 * Math.max(0, Math.abs(a.found.camera - camera) - CAMERA_SPREAD_FT);
    if (!best || q > best.quality) best = { found: a.found, quality: q };
  }
  return best;
}

/** An attempt whose lines put the camera further than this from where most frames do, feet, found a wrong pin row or foul line. */
export const CAMERA_OFF_FT = 2;

/** The lane on every frame it was found on (`findLanes`). */
export interface LanesFound {
  /** Each frame's lane, in the order of the frames given (`found.index`), with the finder's quality. */
  lanes: Attempt[];
  /** The frame `findLane` would choose among them: the one to show and to start from. */
  best: LaneFound | null;
  /** The camera's distance behind the foul line most frames agree on, feet. */
  camera: number;
}

/**
 * The lane on many frames (the tracer's per-frame calibration, `laneTrack`):
 * every frame given is calibrated in full as `findLane` calibrates its best
 * few (`tries` caps how many, best first), and those whose lines put the
 * camera where most frames do are kept. `best` is the one `findLane` would
 * choose among them.
 */
export function findLanes(frames: GrayFrame[], tries = frames.length): LanesFound {
  const { attempts, camera } = laneAttempts(frames, tries);
  return lanesFrom(attempts, camera);
}

/** `findLanes` from `laneAttempts`' answer (or `laneSteps`', run elsewhere). */
export function lanesFrom(attempts: Attempt[], camera: number): LanesFound {
  const lanes = attempts.filter((a) => Math.abs(a.found.camera - camera) <= CAMERA_OFF_FT).sort((a, b) => a.found.index - b.found.index);
  return { lanes, best: bestAttempt(attempts, camera)?.found ?? null, camera };
}

/**
 * The found lanes as the tracer takes them (`TraceInput.lanes`): `frameOf`
 * gives the clip's frame number of each frame the finder was given.
 */
export function frameLanes(found: LanesFound, frameOf: (index: number) => number): FrameLane[] {
  return found.lanes.map((a) => ({ frame: frameOf(a.found.index), H: a.found.H, weight: a.quality, guess: !!a.found.guess }));
}

/**
 * The found lane as the four lines the screen draws and lets the bowler
 * drag: each mark's first and last points (every mark is a straight line).
 */
export function markLinesOf(found: LaneFound): MarkLines {
  const ends = (label: string): [Point, Point] => {
    const m = found.marks.find((k) => k.label === label);
    if (!m || m.kind !== "line") throw new Error(`no ${label} mark`);
    return [{ ...m.at[0] }, { ...m.at[m.at.length - 1] }];
  };
  return { left: ends("left"), right: ends("right"), foul: ends("foul"), pinrow: ends("pinrow") };
}
