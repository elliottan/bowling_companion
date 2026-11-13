import type { Mat3, Point, Segment } from "./types";

/**
 * Plane to plane mapping (plan 6.2). A flat lane seen by a pinhole camera is a
 * homography: image = H * lane, in homogeneous coordinates.
 */

/** Homogeneous line ax + by + c = 0. */
export type Line3 = [number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function apply(H: Mat3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w
  };
}

export function multiply(A: Mat3, B: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    }
  }
  return out as Mat3;
}

export function invert(M: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = M;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-300) throw new Error("singular matrix");
  const s = 1 / det;
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s
  ];
}

export function transpose(M: Mat3): Mat3 {
  return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
}

/** Scale so H[8] is 1 (or the largest entry is 1 when H[8] is near zero). */
export function normalize(M: Mat3): Mat3 {
  let s = M[8];
  if (Math.abs(s) < 1e-12) s = Math.max(...M.map(Math.abs));
  return M.map((x) => x / s) as Mat3;
}

/** Solve A x = b in place by Gaussian elimination with partial pivoting. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error("singular system");
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Shift to the centroid, scale so the mean distance from it is root 2. */
function normalizer(pts: Point[]): Mat3 {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const md = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;
  const k = md > 0 ? Math.SQRT2 / md : 1;
  return [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1];
}

/**
 * The homography taking each `src` point to its `dst` point. Four pairs fix
 * it exactly; more are solved in the least squares sense. Points are
 * normalised first, or the solve is badly conditioned at a lane's aspect ratio.
 */
export function solveHomography(src: Point[], dst: Point[]): Mat3 {
  if (src.length !== dst.length || src.length < 4) throw new Error("need 4 or more point pairs");
  const Ts = normalizer(src);
  const Td = normalizer(dst);
  const s = src.map((p) => apply(Ts, p));
  const d = dst.map((p) => apply(Td, p));
  // Unknowns h0..h7 with h8 = 1. Normal equations of the 2n by 8 system.
  const AtA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const Atb = new Array<number>(8).fill(0);
  const addRow = (row: number[], rhs: number) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let i = 0; i < s.length; i++) {
    const { x, y } = s[i];
    const { x: X, y: Y } = d[i];
    addRow([x, y, 1, 0, 0, 0, -X * x, -X * y], X);
    addRow([0, 0, 0, x, y, 1, -Y * x, -Y * y], Y);
  }
  const h = solveLinear(AtA, Atb);
  const Hn: Mat3 = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  return normalize(multiply(invert(Td), multiply(Hn, Ts)));
}

export function lineThrough(a: Point, b: Point): Line3 {
  return [a.y - b.y, b.x - a.x, a.x * b.y - a.y * b.x];
}

export function segmentLine(s: Segment): Line3 {
  return lineThrough(s.a, s.b);
}

/** Where two lines cross, or null when they are parallel. */
export function intersect(l: Line3, m: Line3): Point | null {
  const w = l[0] * m[1] - l[1] * m[0];
  const scale = Math.max(Math.hypot(l[0], l[1]) * Math.hypot(m[0], m[1]), 1e-300);
  if (Math.abs(w) / scale < 1e-12) return null;
  return { x: (l[1] * m[2] - l[2] * m[1]) / w, y: (l[2] * m[0] - l[0] * m[2]) / w };
}

/** Signed distance of a point from a line, positive on the side the normal points to. */
export function lineDistance(l: Line3, p: Point): number {
  return (l[0] * p.x + l[1] * p.y + l[2]) / Math.hypot(l[0], l[1]);
}

/** Lines map by the inverse transpose: a line l on the source is H^-T l on the target. */
export function mapLine(H: Mat3, l: Line3): Line3 {
  const M = transpose(invert(H));
  return [
    M[0] * l[0] + M[1] * l[1] + M[2] * l[2],
    M[3] * l[0] + M[4] * l[1] + M[5] * l[2],
    M[6] * l[0] + M[7] * l[1] + M[8] * l[2]
  ];
}

/** The image of the lane's line at infinity: the horizon (plan 6.4). */
export function horizon(H: Mat3): Line3 {
  return mapLine(H, [0, 0, 1]);
}

/**
 * Unit vector at right angles to the horizon, pointing away from it, at an
 * image point that is below it. "Down" on the lane surface for that point.
 */
export function downAt(H: Mat3, p: Point): Point {
  const hz = horizon(H);
  const n = Math.hypot(hz[0], hz[1]);
  if (n < 1e-12) return { x: 0, y: 1 };
  let dx = hz[0] / n;
  let dy = hz[1] / n;
  if (lineDistance(hz, p) < 0) {
    dx = -dx;
    dy = -dy;
  }
  return { x: dx, y: dy };
}

/** A similarity (shift, rotation, scale) taking p0 to q0 and p1 to q1 exactly. */
export function similarityFrom(p0: Point, p1: Point, q0: Point, q1: Point): Mat3 {
  // Complex numbers: q = z p + t, with z = (q1 - q0) / (p1 - p0).
  const px = p1.x - p0.x;
  const py = p1.y - p0.y;
  const qx = q1.x - q0.x;
  const qy = q1.y - q0.y;
  const den = px * px + py * py;
  if (den < 1e-18) throw new Error("coincident points");
  const a = (qx * px + qy * py) / den;
  const b = (qy * px - qx * py) / den;
  const tx = q0.x - (a * p0.x - b * p0.y);
  const ty = q0.y - (b * p0.x + a * p0.y);
  return [a, -b, tx, b, a, ty, 0, 0, 1];
}

/** Rotation (radians), scale and shift of a similarity matrix. */
export function similarityParts(S: Mat3): { angle: number; scale: number; tx: number; ty: number } {
  return { angle: Math.atan2(S[3], S[0]), scale: Math.hypot(S[0], S[3]), tx: S[2], ty: S[5] };
}
