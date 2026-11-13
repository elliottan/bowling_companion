import { arrowFeet } from "../laneGeometry";
import { PIN_POSITIONS } from "../pinGeometry";
import { apply, invert, mapLine, multiply, normalize, solveLinear } from "./homography";
import { BACK_ROW_FT, BOARD_FT, DECK_END_FT, LEFT_U, RIGHT_U } from "./laneModel";
import type { Mat3, Point } from "./types";

/**
 * Calibration from the lane's own markings (revised after the sample clips;
 * the plan's four marked lines guessed a hidden edge on one of them).
 *
 * Every regulation lane carries the same marks: arrows on boards 5 to 35, the
 * foul line, the pin spots, and two edges 39 boards apart. Each mark placed on
 * the picture is either a point whose lane position is known (an arrow's tip,
 * a pin's base) or a point known to lie on a lane line (an edge, the foul
 * line, the pin row, which runs straight across the whole house). The
 * lane-to-picture mapping is the weighted least squares fit to all of them,
 * and every mark's residual is reported, so a mark that disagrees with the
 * rest shows itself. Nothing hidden is ever marked: a hidden edge comes out
 * of the fit.
 */

/** A point whose lane position (u boards, v feet) is known. */
export interface PointMark {
  kind: "point";
  label: string;
  u: number;
  v: number;
  at: Point;
  weight?: number;
}

/** Points known to lie on the lane line u = value (axis "u") or v = value (axis "v"). */
export interface LineMark {
  kind: "line";
  label: string;
  axis: "u" | "v";
  value: number;
  at: Point[];
  weight?: number;
}

export type CalMark = PointMark | LineMark;

export interface MarkResidual {
  label: string;
  /** Index of the point within a line mark; 0 for a point mark. */
  index: number;
  /** Distance in the picture between the mark and where the fit puts it, pixels. */
  px: number;
  /** Across the lane, boards (null for a point on a cross-lane line). */
  boards: number | null;
  /** Along the lane, feet (null for a point on an edge). */
  feet: number | null;
}

export interface CalibrationFit {
  /** Lane (u, v) to picture. */
  H: Mat3;
  residuals: MarkResidual[];
  /** Largest across-lane residual of any point, boards. */
  worstBoards: number;
  /** Equations beyond the 8 the mapping needs; 0 means nothing checks anything. */
  redundancy: number;
}

/** A pin's base as seen: the front of its base, a pin-base radius nearer than the spot. */
export const PIN_BASE_RADIUS_FT = 2.03 / 2 / 12;

/**
 * Lane position of a named mark: "arrow N" (handed board N, its tip), or
 * "pin N" (the front of the pin's base). Pin spots are given in lane u.
 */
export function namedPoint(name: string, laneUOfBoard: (b: number) => number): { u: number; v: number } | null {
  const m = /^(arrow|pin)\s+(\d+)$/.exec(name.trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === "arrow") {
    if (n < 5 || n > 35 || n % 5) return null;
    return { u: laneUOfBoard(n), v: arrowFeet(n) };
  }
  const p = PIN_POSITIONS[n as keyof typeof PIN_POSITIONS];
  return p ? { u: p.board, v: p.feet - PIN_BASE_RADIUS_FT } : null;
}

/** Lane line of a named line mark: the two edges (as seen), the foul line, the pin row, the deck end (tail plank). */
export function namedLine(name: string): { axis: "u" | "v"; value: number } | null {
  switch (name.trim()) {
    case "left":
      return { axis: "u", value: LEFT_U };
    case "right":
      return { axis: "u", value: RIGHT_U };
    case "foul":
      return { axis: "v", value: 0 };
    case "pinrow":
      return { axis: "v", value: BACK_ROW_FT };
    case "deck":
      return { axis: "v", value: DECK_END_FT };
    default:
      return null;
  }
}

/** One equation of the linear fit: coefficients over g0..g7 of G = H^-1 (picture to lane), and its right side. */
function rows(m: CalMark, T: Mat3): { row: number[]; rhs: number; w: number }[] {
  const out: { row: number[]; rhs: number; w: number }[] = [];
  const w = m.weight ?? 1;
  // target * (g6 x + g7 y + 1) = g0 x + g1 y + g2 (u) or g3 x + g4 y + g5 (v)
  const eq = (p: Point, axis: "u" | "v", target: number) => {
    const q = apply(T, p);
    const row = new Array<number>(8).fill(0);
    const o = axis === "u" ? 0 : 3;
    row[o] = q.x;
    row[o + 1] = q.y;
    row[o + 2] = 1;
    row[6] = -target * q.x;
    row[7] = -target * q.y;
    out.push({ row, rhs: target, w });
  };
  if (m.kind === "point") {
    eq(m.at, "u", m.u);
    eq(m.at, "v", m.v);
  } else for (const p of m.at) eq(p, m.axis, m.value);
  return out;
}

function equationCount(marks: CalMark[]): number {
  return marks.reduce((s, m) => s + (m.kind === "point" ? 2 : m.at.length), 0);
}

/** Residuals in the picture, pixels, as a flat list (two per point mark, one per line point), weighted. */
function geometricResiduals(H: Mat3, marks: CalMark[]): number[] {
  const out: number[] = [];
  for (const m of marks) {
    const w = Math.sqrt(m.weight ?? 1);
    if (m.kind === "point") {
      const p = apply(H, { x: m.u, y: m.v });
      out.push(w * (p.x - m.at.x), w * (p.y - m.at.y));
    } else {
      const l = mapLine(H, m.axis === "u" ? [1, 0, -m.value] : [0, 1, -m.value]);
      const n = Math.hypot(l[0], l[1]);
      for (const p of m.at) out.push((w * (l[0] * p.x + l[1] * p.y + l[2])) / n);
    }
  }
  return out;
}

const fromParams = (h: number[]): Mat3 => [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];

/**
 * The weighted least squares lane mapping through every mark. A linear
 * solve for the picture-to-lane mapping starts it (each mark gives one or two
 * linear equations), then Levenberg-Marquardt minimises the marks' distances
 * in the picture, where the marking error lives. Throws when the marks cannot
 * fix the mapping (fewer than 8 equations, or degenerate).
 */
export function fitCalibration(marks: CalMark[]): CalibrationFit {
  const n = equationCount(marks);
  if (n < 8) throw new Error(`the marks give ${n} equations; the mapping needs 8`);
  const all = marks.flatMap((m) => (m.kind === "point" ? [m.at] : m.at));
  const cx = all.reduce((s, p) => s + p.x, 0) / all.length;
  const cy = all.reduce((s, p) => s + p.y, 0) / all.length;
  const md = all.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / all.length || 1;
  const k = Math.SQRT2 / md;
  const T: Mat3 = [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1];
  const AtA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const Atb = new Array<number>(8).fill(0);
  for (const m of marks) {
    for (const { row, rhs, w } of rows(m, T)) {
      for (let i = 0; i < 8; i++) {
        Atb[i] += w * row[i] * rhs;
        for (let j = 0; j < 8; j++) AtA[i][j] += w * row[i] * row[j];
      }
    }
  }
  let g: number[];
  try {
    g = solveLinear(AtA, Atb);
  } catch {
    throw new Error("the marks do not fix the mapping");
  }
  // G maps normalised picture points to the lane; H = (G T)^-1.
  let H = normalize(invert(multiply(fromParams(g), T)));
  if (!H.every(Number.isFinite)) throw new Error("the marks do not fix the mapping");

  // Levenberg-Marquardt on the picture distances, H normalised so h8 = 1.
  let h = H.slice(0, 8);
  let cost = sumSq(geometricResiduals(fromParams(h), marks));
  let lambda = 1e-3;
  for (let it = 0; it < 60 && n > 8; it++) {
    const r0 = geometricResiduals(fromParams(h), marks);
    const J: number[][] = [];
    for (let j = 0; j < 8; j++) {
      const step = 1e-6 * Math.max(1, Math.abs(h[j]));
      const hp = h.slice();
      hp[j] += step;
      const r1 = geometricResiduals(fromParams(hp), marks);
      J.push(r1.map((v, i) => (v - r0[i]) / step));
    }
    const A = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => J[i].reduce((s, v, q) => s + v * J[j][q], 0)));
    const b = Array.from({ length: 8 }, (_, i) => -J[i].reduce((s, v, q) => s + v * r0[q], 0));
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
      let d: number[];
      try {
        d = solveLinear(Ad, b);
      } catch {
        lambda *= 8;
        continue;
      }
      const hn = h.map((v, i) => v + d[i]);
      const c = sumSq(geometricResiduals(fromParams(hn), marks));
      if (Number.isFinite(c) && c < cost) {
        const done = cost - c < 1e-12 * Math.max(1, cost);
        h = hn;
        cost = c;
        lambda = Math.max(1e-9, lambda / 4);
        improved = !done;
        break;
      }
      lambda *= 8;
    }
    if (!improved) break;
  }
  H = fromParams(h);
  const residuals = markResiduals(H, marks);
  const worstBoards = residuals.reduce((w, r) => Math.max(w, r.boards === null ? 0 : Math.abs(r.boards)), 0);
  return { H, residuals, worstBoards, redundancy: n - 8 };
}

/** Every mark's residual under H, in pixels and in lane units. */
export function markResiduals(H: Mat3, marks: CalMark[]): MarkResidual[] {
  const G = invert(H);
  const out: MarkResidual[] = [];
  for (const m of marks) {
    if (m.kind === "point") {
      const p = apply(H, { x: m.u, y: m.v });
      const q = apply(G, m.at);
      out.push({ label: m.label, index: 0, px: Math.hypot(p.x - m.at.x, p.y - m.at.y), boards: q.x - m.u, feet: q.y - m.v });
    } else {
      const l = mapLine(H, m.axis === "u" ? [1, 0, -m.value] : [0, 1, -m.value]);
      const nrm = Math.hypot(l[0], l[1]);
      m.at.forEach((p, index) => {
        const q = apply(G, p);
        out.push({
          label: m.label, index, px: Math.abs(l[0] * p.x + l[1] * p.y + l[2]) / nrm,
          boards: m.axis === "u" ? q.x - m.value : null,
          feet: m.axis === "v" ? q.y - m.value : null
        });
      });
    }
  }
  return out;
}

const sumSq = (r: number[]) => r.reduce((s, v) => s + v * v, 0);

/**
 * The lens's focal length in pixels from the lane mapping alone, with the
 * lens centred in the picture: the lane's two directions (across, in feet,
 * and along) are at right angles in the world, which fixes f (the
 * single-plane case of Zhang's calibration). Null when the mapping does not
 * give a real value (a lane seen square on, or a picture cropped off centre).
 */
export function focalFromPlane(H: Mat3, width: number, height: number): number | null {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const col = (j: number, k: number) => [(H[j] - cx * H[6 + j]) * k, (H[3 + j] - cy * H[6 + j]) * k, H[6 + j] * k];
  const a = col(0, 1 / BOARD_FT);
  const b = col(1, 1);
  const f2 = -(a[0] * b[0] + a[1] * b[1]) / (a[2] * b[2]);
  if (!(f2 > 0) || !Number.isFinite(f2)) return null;
  const f = Math.sqrt(f2);
  return f > 0.3 * Math.max(width, height) && f < 8 * Math.max(width, height) ? f : null;
}
