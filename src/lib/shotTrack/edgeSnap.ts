import { lineDistance, lineThrough, type Line3 } from "./homography";
import { parabolaPeak, sample } from "./image";
import { markCorners } from "./laneModel";
import type { GrayFrame, LaneMarks, Point, Segment } from "./types";

/**
 * Refine a rough line to the true edge at sub-pixel precision (plan 7.2).
 *
 * Which edge is "the lane edge": the boundary between the lane surface and
 * whatever bounds it, taken where the lane side is the brighter one. On the
 * sample clips the gutter's lip casts a thin dark line beside the lane, so the
 * edge is the lane-side flank of that line; on a lane with a dark gutter it is
 * the gutter boundary itself. `sign: "rising"` asks for that: intensity rising
 * toward `interior`. This is the definition of board 0.5 (and 39.5), and it is
 * one function so a different centre's lanes change one place.
 */
export type EdgeSign = "rising" | "falling" | "auto";

export interface SnapOptions {
  /** Half-width of the search across the line, pixels. Start with 12. */
  band?: number;
  /** Spacing of the steps along the line, pixels. */
  step?: number;
  /** "rising": brighter toward `interior`. "auto": the stronger of the two in the mean profile. */
  sign?: EdgeSign;
  /** A point on the lane side of the line; orients the search. */
  interior?: Point;
  /** Inlier distance for the robust fit, pixels. */
  tolerance?: number;
  /** Below this fraction of steps agreeing, the line is not found. */
  minSupport?: number;
}

export interface SnapResult {
  ok: boolean;
  segment: Segment;
  line: Line3;
  /** Fraction of the steps whose edge agreed with the fitted line. */
  support: number;
  /** Edge positions that agreed, for drawing. */
  inliers: Point[];
  /** RMS distance of the inliers from the line, pixels. */
  rms: number;
}

/** Robust line through points: RANSAC on pairs, then least squares on the agreeing ones. */
export function robustLine(pts: Point[], tolerance: number): { line: Line3; inliers: Point[]; rms: number } | null {
  if (pts.length < 2) return null;
  let best: Point[] = [];
  const n = pts.length;
  // Deterministic: every pair among an evenly spread subset of at most 40 points.
  const pick = n <= 40 ? pts : Array.from({ length: 40 }, (_, i) => pts[Math.floor((i * n) / 40)]);
  for (let i = 0; i < pick.length; i++) {
    for (let j = i + 1; j < pick.length; j++) {
      if (Math.hypot(pick[i].x - pick[j].x, pick[i].y - pick[j].y) < 1e-9) continue;
      const l = lineThrough(pick[i], pick[j]);
      const inl = pts.filter((p) => Math.abs(lineDistance(l, p)) <= tolerance);
      if (inl.length > best.length) best = inl;
    }
  }
  if (best.length < 2) return null;
  let line = fitLine(best);
  let inliers = best;
  for (let it = 0; it < 3; it++) {
    inliers = pts.filter((p) => Math.abs(lineDistance(line, p)) <= tolerance);
    if (inliers.length < 2) return null;
    line = fitLine(inliers);
  }
  const rms = Math.sqrt(inliers.reduce((s, p) => s + lineDistance(line, p) ** 2, 0) / inliers.length);
  return { line, inliers, rms };
}

/** Total least squares line through points. */
export function fitLine(pts: Point[]): Line3 {
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  // The normal is the eigenvector of the smaller eigenvalue.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  return [nx, ny, -(nx * mx + ny * my)];
}

/** Foot of the perpendicular from p onto l. */
export function projectOnto(l: Line3, p: Point): Point {
  const n = Math.hypot(l[0], l[1]);
  const d = lineDistance(l, p);
  return { x: p.x - (d * l[0]) / n, y: p.y - (d * l[1]) / n };
}

export function snapEdge(f: GrayFrame, rough: Segment, opts: SnapOptions = {}): SnapResult {
  const band = opts.band ?? 12;
  const step = opts.step ?? 4;
  const tol = opts.tolerance ?? 0.75;
  const minSupport = opts.minSupport ?? 0.3;
  const dx = rough.b.x - rough.a.x;
  const dy = rough.b.y - rough.a.y;
  const len = Math.hypot(dx, dy);
  const tx = dx / len;
  const ty = dy / len;
  let nx = -ty;
  let ny = tx;
  if (opts.interior) {
    const s = (opts.interior.x - rough.a.x) * nx + (opts.interior.y - rough.a.y) * ny;
    if (s < 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  const ds = 0.5;
  const m = Math.round(band / ds);
  const steps = Math.max(2, Math.floor(len / step) + 1);
  // Gradient profiles across the line, each averaged over three neighbours along it.
  const profiles: Float64Array[] = [];
  const bases: Point[] = [];
  for (let k = 0; k < steps; k++) {
    const along = (k * len) / (steps - 1);
    const bx = rough.a.x + tx * along;
    const by = rough.a.y + ty * along;
    const vals = new Float64Array(2 * m + 3);
    let valid = true;
    for (let i = 0; i < vals.length; i++) {
      const s = (i - m - 1) * ds;
      let acc = 0;
      for (const o of [-1, 0, 1]) acc += sample(f, bx + nx * s + tx * o, by + ny * s + ty * o);
      vals[i] = acc / 3;
      if (!Number.isFinite(vals[i])) valid = false;
    }
    if (!valid) continue;
    const g = new Float64Array(2 * m + 1);
    for (let i = 0; i < g.length; i++) g[i] = (vals[i + 2] - vals[i]) / (2 * ds);
    profiles.push(g);
    bases.push({ x: bx, y: by });
  }
  let sgn = opts.sign === "falling" ? -1 : 1;
  if (opts.sign === "auto" && profiles.length) {
    const mean = new Float64Array(2 * m + 1);
    for (const g of profiles) for (let i = 0; i < g.length; i++) mean[i] += g[i] / profiles.length;
    let bi = 0;
    for (let i = 1; i < mean.length; i++) if (Math.abs(mean[i]) > Math.abs(mean[bi])) bi = i;
    sgn = mean[bi] < 0 ? -1 : 1;
  }
  const found: Point[] = [];
  const strengths: number[] = [];
  for (let k = 0; k < profiles.length; k++) {
    const g = profiles[k];
    let bi = 1;
    for (let i = 1; i < g.length - 1; i++) if (sgn * g[i] > sgn * g[bi]) bi = i;
    const peak = sgn * g[bi];
    if (peak <= 0) continue;
    const off = parabolaPeak(sgn * g[bi - 1], peak, sgn * g[bi + 1]);
    const s = (bi - m + off) * ds;
    found.push({ x: bases[k].x + nx * s, y: bases[k].y + ny * s });
    strengths.push(peak);
  }
  // Weak peaks are noise, not an edge: keep those at least a third of the typical one.
  const sorted = [...strengths].sort((a, b) => a - b);
  const typical = sorted.length ? sorted[Math.floor(sorted.length * 0.75)] : 0;
  const strong = found.filter((_, i) => strengths[i] >= Math.max(typical / 3, 1));
  const fit = robustLine(strong, tol);
  if (!fit) return { ok: false, segment: rough, line: lineThrough(rough.a, rough.b), support: 0, inliers: [], rms: NaN };
  const support = fit.inliers.length / steps;
  return {
    ok: support >= minSupport,
    segment: { a: projectOnto(fit.line, rough.a), b: projectOnto(fit.line, rough.b) },
    line: fit.line,
    support,
    inliers: fit.inliers,
    rms: fit.rms
  };
}

export interface MarkSnap {
  marks: LaneMarks;
  support: Record<keyof LaneMarks, number>;
  ok: boolean;
  /** The first line that could not be followed, when not ok. */
  failed?: keyof LaneMarks;
}

/**
 * Snap the four marked lines (plan 7.2). The edges use the lane-is-brighter
 * rule. The foul line and the far line take their sign from their
 * neighbourhood: an approach can be lighter or darker than the lane, and the
 * far line may be the deck end (lane over a dark pit) or the bases of the 7
 * and 10 pins (white pins over a dark gap).
 */
export function snapMarks(f: GrayFrame, rough: LaneMarks, band = 4): MarkSnap {
  const c = markCorners(rough);
  const interior = c
    ? { x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4, y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4 }
    : { x: (rough.foul.a.x + rough.deck.b.x) / 2, y: (rough.foul.a.y + rough.deck.b.y) / 2 };
  const keys: (keyof LaneMarks)[] = ["left", "right", "deck", "foul"];
  const marks = { ...rough };
  const support = { left: 0, right: 0, deck: 0, foul: 0 };
  let failed: keyof LaneMarks | undefined;
  for (const k of keys) {
    const r = snapEdge(f, rough[k], { band, interior, sign: k === "foul" || k === "deck" ? "auto" : "rising" });
    support[k] = r.support;
    if (r.ok) marks[k] = r.segment;
    else failed ??= k;
  }
  return { marks, support, ok: !failed, failed };
}
