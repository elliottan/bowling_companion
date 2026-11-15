import { apply, intersect, lineDistance, mapLine, type Line3 } from "./homography";
import { boxBlur, downsample, gradient, median, parabolaPeak, sample } from "./image";
import { robustLine, snapEdge } from "./edgeSnap";
import { fitCalibration, type CalibrationFit, type CalMark } from "./calibrate";
import { checkPins, type LandmarkError } from "./calibrationCheck";
import { PIN_POSITIONS } from "../pinGeometry";
import type { FrameLane } from "./laneTrack";
import type { MarkLines } from "./marking";
import { BACK_ROW_FT, LEFT_U, RIGHT_U } from "./laneModel";
import type { GrayFrame, Mat3, Point } from "./types";

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
 * Frames are full resolution in the video's own grey (16 to 235, see
 * `toGray`), as everywhere in the tracer.
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
    cos[a] = Math.cos((a * Math.PI) / A);
    sin[a] = Math.sin((a * Math.PI) / A);
  }
  const sb = Math.ceil((spread * A) / Math.PI);
  for (let y = fromY; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = Math.hypot(gx[i], gy[i]);
      if (m < minMag) continue;
      let th = Math.atan2(gy[i], gx[i]);
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
    return { theta, rho, votes: v, line: [Math.cos(theta), Math.sin(theta), -rho] as Line3 };
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
        score += l.votes * Math.exp(-d * d);
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
  const F = new Float32Array(cols * rows);
  const G = new Float32Array(cols * rows).fill(NaN);
  // Column i is the ray through (x, yRef + roll (x - vp.x)): the reference line
  // runs parallel to the horizon, a line of one distance down the lane, so
  // every lane is the same number of columns wide.
  const yr = new Float64Array(cols);
  for (let i = 0; i < cols; i++) yr[i] = yRef + roll * (x0 + i - vp.x) - vp.y;
  for (let j = 0; j < rows; j++) {
    const y = y0 + j;
    const dy = y - vp.y;
    for (let i = 0; i < cols; i++) F[j * cols + i] = sampleRow(f, vp.x + ((x0 + i - vp.x) * dy) / yr[i], y);
    for (let i = 2; i < cols - 2; i++) G[j * cols + i] = (F[j * cols + i + 2] - F[j * cols + i - 2]) / ((4 * dy) / yr[i]);
  }
  return { vp, yRef, roll, x0, cols, y0, rows, F, G };
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
  const sl = level.map((l) => ({ s: -Math.cos(l.theta) / Math.sin(l.theta), w: l.votes })).sort((a, b) => a.s - b.s);
  const total = sl.reduce((a, b) => a + b.w, 0);
  let acc = 0;
  for (const x of sl) {
    acc += x.w;
    if (acc >= total / 2) return x.s;
  }
  return 0;
}

/** Linear sample along a row; NaN outside the picture. */
function sampleRow(f: GrayFrame, x: number, y: number): number {
  if (!(x >= 0 && x <= f.width - 1)) return NaN;
  const i = Math.min(Math.floor(x), f.width - 2);
  const t = x - i;
  const r = y * f.width;
  return f.data[r + i] * (1 - t) + f.data[r + i + 1] * t;
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
export function laneRows(fan: Fan): { far: number; near: number } {
  const E = rowEnergy(fan);
  const n = E.length;
  let far = 0;
  for (let j = 1; j < Math.floor(n * 0.6); j++) if (E[j] > E[far]) far = j;
  // The near end: the sharpest fall in structure going down (the gutters and
  // caps end, the approach is plain), over a few rows either side; failing a
  // clear fall, the lowest row still at half the lane's typical structure.
  const k = Math.max(4, Math.round(0.025 * n));
  const mean = (a: number, b: number) => {
    let s = 0;
    for (let j = a; j <= b; j++) s += E[j];
    return s / (b - a + 1);
  };
  let near = -1;
  let best = 1.5;
  for (let j = far + Math.round(0.3 * (n - far)); j < n - k - 1; j++) {
    const r = mean(j - k, j - 1) / (mean(j + 1, j + k) + 0.05);
    if (r > best) {
      best = r;
      near = j;
    }
  }
  if (near < 0) {
    const mid = median(Array.from(E.subarray(far, n)).slice(0, Math.max(1, Math.floor((n - far) / 2))));
    near = n - 1;
    while (near > far && E[near] < 0.5 * mid) near--;
  }
  return { far: fan.y0 + far, near: fan.y0 + near };
}

export interface ColumnProfile {
  /** Median across-ray gradient down each column. */
  grad: Float32Array;
  /** Median grey level down each column. */
  level: Float32Array;
}

/** Medians down each fan column between picture rows `from` and `to`. */
export function columnProfile(fan: Fan, from: number, to: number): ColumnProfile {
  const ja = Math.max(0, Math.round(from - fan.y0));
  const jb = Math.min(fan.rows - 1, Math.round(to - fan.y0));
  const grad = new Float32Array(fan.cols).fill(NaN);
  const level = new Float32Array(fan.cols).fill(NaN);
  const n = jb - ja + 1;
  if (n < 3) return { grad, level };
  const g = new Float32Array(n);
  const l = new Float32Array(n);
  for (let i = 0; i < fan.cols; i++) {
    let k = 0;
    for (let j = ja; j <= jb; j++) {
      const v = fan.G[j * fan.cols + i];
      if (!Number.isFinite(v)) continue;
      g[k] = v;
      l[k] = fan.F[j * fan.cols + i];
      k++;
    }
    // Columns mostly outside the picture say nothing.
    if (k < 0.6 * n) continue;
    grad[i] = median(g.subarray(0, k));
    level[i] = median(l.subarray(0, k));
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
  const { far, near } = laneRows(fan);
  const span = near - far;
  if (span < 0.15 * f.height) return null;
  const prof = columnProfile(fan, far + 0.08 * span, near - 0.04 * span);
  // The bowler, the ball return and a scoring screen stand near the camera and
  // hide the near half of an edge far more often than the far half: each
  // column keeps the stronger of its whole-length and far-half medians.
  const farHalf = columnProfile(fan, far + 0.08 * span, far + 0.5 * span);
  const grad = prof.grad.map((g, i) => (Math.abs(farHalf.grad[i]) > Math.abs(g) && Math.sign(farHalf.grad[i]) === Math.sign(g || farHalf.grad[i]) ? farHalf.grad[i] : g));
  const profile = { grad: Float32Array.from(grad), level: prof.level };
  return { vp, far, near, candidates: laneCandidates(prof, fan.x0, 0.08 * f.width), fan, profile };
}

/**
 * The width every lane has in the fan, from the candidates of many frames:
 * the most common width, within 8%, weighted by width. The neighbouring
 * lanes are the same width as the bowler's on a line of constant distance,
 * so a gutter cap (a third as wide) or two lanes run together (when an edge
 * is hidden) stand out.
 */
export function laneWidth(all: FrameLanes[]): number | null {
  const widths = all.flatMap((r) => r.candidates.map((c) => c.right - c.left));
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
  /** Lane width in the fan, as `laneWidth`. */
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
 * by its weaker edge.
 */
export function rankLanes(all: (FrameLanes | null)[], frameWidth: number): LanePick[] {
  const ok = all.filter((r): r is FrameLanes => !!r);
  const width = laneWidth(ok);
  if (!width) return [];
  const out: { score: number; pick: LanePick }[] = [];
  all.forEach((r, index) => {
    if (!r) return;
    const pairs = lanePairs(r, width).filter((c) => Math.abs(centerOffset(r, c, frameWidth)) < 0.75);
    if (!pairs.length) return;
    const score = (c: LaneCandidate) => Math.min(c.leftEdge, -c.rightEdge) * (1 - 0.3 * Math.abs(centerOffset(r, c, frameWidth)));
    const c = pairs.reduce((a, b) => (score(a) >= score(b) ? a : b));
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
  const prof = columnProfile(r.fan, r.far + 0.08 * span, r.near - 0.04 * span);
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
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
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
}

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
  if (pairs.length) {
    // The foul line is where the lane starts: everything nearer the camera is
    // approach, whose joins, dots and a change of finish a foot or two back
    // can be sharper than the foul line itself (shot-01 shows one 1.75 ft
    // back). So of the pairs nearly as strong as the strongest, the one
    // furthest up the lane comes first.
    pairs.sort((a, b) => b.strength - a.strength);
    const strongest = pairs[0].strength;
    const yOf = (p: FoulLine) => (p.points[0].y + p.points[1].y) / 2;
    const first = pairs.filter((p) => p.strength >= 0.6 * strongest).reduce((a, b) => (yOf(b) < yOf(a) ? b : a));
    out.push(first, ...pairs.filter((p) => p !== first));
  }
  // One side only: its rows, strongest first, on the pin row's slope.
  const ones = [...L.peaks.map((p) => ({ ...p, x: L.x(p.y) })), ...R.peaks.map((p) => ({ ...p, x: R.x(p.y) }))].sort((p, q) => q.g - p.g);
  for (const one of ones) {
    const a = { x: one.x, y: one.y };
    const b = { x: one.x + 100, y: one.y + 100 * slope };
    out.push({ line: [a.y - b.y, b.x - a.x, a.x * b.y - b.x * a.y], points: [a], strength: one.g / 2 });
  }
  return out;
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
    const slope = Math.max(...xs) - Math.min(...xs) > 0.25 * f.width ? -p.line[0] / p.line[1] : r.fan.roll;
    if (pins.length === 1) slope0 = slope;
    for (const fl of findFoulLines(f, left, right, pick.near, span, slope)) {
      const yf = rowAt(fl.line, mid(pick.near));
      if (!(yf - y > 0.5 * span)) continue;
      const ratio = (y - vp.y) / (yf - vp.y);
      const d = (BACK_ROW_FT * ratio) / (1 - ratio);
      if (!(d >= CAMERA_FT[0] && d <= CAMERA_FT[1])) continue;
      ends.push({ pin: p, foul: fl, camera: d });
      if (ends.length >= MAX_ENDS) break;
    }
    if (ends.length >= MAX_ENDS) break;
  }
  if (!ends.length && !pins.length) return null;
  return { f, pick, vp, sl, sr, ends, pins, slope: slope0 };
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
  const per = frames.map((f) => lanesOnFrame(f));
  steadyProfiles(per);
  const ranked = rankLanes(per, frames[0].width);
  const measured = ranked.slice(0, tries).map((pick) => measure(frames[pick.index], per[pick.index]!, pick)).filter((m): m is Measured => !!m);
  if (!measured.length) return { attempts: [], camera: NaN };
  const seen = measured.filter((m) => m.ends.length);
  // With no frame showing the foul line, a typical camera distance.
  const camera = seen.length ? modeOf(seen.map((m) => m.ends[0].camera), CAMERA_SPREAD_FT) : TYPICAL_CAMERA_FT;
  const attempts = measured
    .map((m) => {
      if (!m.ends.length) {
        // The foul line not seen on this frame (the bowler over it, or below
        // the picture): placed where the camera's distance puts it.
        const pin = m.pins[0];
        const foul = guessFoul(m.vp, m.sl.line, m.sr.line, pin.line, m.slope, camera);
        return attempt(m, { pin, foul, camera, guess: seen.length ? "camera-from-frames" : "typical-camera" });
      }
      const near = m.ends.filter((e) => Math.abs(e.camera - camera) <= 2 * CAMERA_SPREAD_FT);
      return attempt(m, near[0] ?? m.ends[0]);
    })
    .filter((a): a is Attempt => !!a);
  return { attempts, camera };
}

/** How far the camera's distance behind the foul line wanders between frames of one clip, feet (a hand-held camera sways). */
export const CAMERA_SPREAD_FT = 0.6;

/** The value most of `xs` lie near: the peak of a Gaussian kernel density of width `h`, refined as the kernel-weighted mean. */
export function modeOf(xs: number[], h: number): number {
  const density = (x: number) => xs.reduce((s, v) => s + Math.exp(-0.5 * ((v - x) / h) ** 2), 0);
  let best = xs[0];
  for (const x of xs) if (density(x) > density(best)) best = x;
  for (let it = 0; it < 3; it++) {
    let sw = 0;
    let sx = 0;
    for (const v of xs) {
      const w = Math.exp(-0.5 * ((v - best) / h) ** 2);
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
