/**
 * Pick the candidates that are one ball obeying physics (plan 7.4).
 *
 * A ball goes down-lane at 8 to 26 mph, never comes back, changes speed by at
 * most a quarter over the lane, and moves across by at most 1.5 boards a foot.
 * RANSAC: a pair of candidates at least 0.3 s apart fixes a constant speed and
 * a straight line across; the candidates near both are its support. The best
 * pair's winners are refitted (distance linear in time, board quadratic in
 * feet) and re-selected until the set stops changing. One candidate a frame.
 */

export interface Track3 {
  t: number;
  u: number;
  v: number;
  weight?: number;
  frame: number;
}

export interface AssociateOptions {
  /** Down-lane tolerance, feet (start with 3). */
  feet?: number;
  /** Across tolerance, boards (start with 3). */
  boards?: number;
  minGap?: number;
}

export const MIN_SPEED_FTS = 8 * (5280 / 3600);
export const MAX_SPEED_FTS = 26 * (5280 / 3600);

/** Weighted least squares polynomial of degree 1 or 2: coefficients low first. */
export function polyfit(x: number[], y: number[], deg: 1 | 2, w?: number[]): number[] {
  const m = deg + 1;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);
  for (let i = 0; i < x.length; i++) {
    const wi = w ? w[i] : 1;
    const p = [1, x[i], x[i] * x[i]];
    for (let r = 0; r < m; r++) {
      b[r] += wi * p[r] * y[i];
      for (let c = 0; c < m; c++) A[r][c] += wi * p[r] * p[c];
    }
  }
  for (let r = 0; r < m; r++) A[r][r] += 1e-9;
  // Small system: Gaussian elimination.
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = c + 1; r < m; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < m; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const out = new Array<number>(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < m; k++) s -= A[r][k] * out[k];
    out[r] = s / A[r][r];
  }
  return out;
}

export const evalPoly = (c: number[], x: number) => c[0] + c[1] * x + (c[2] ?? 0) * x * x;

function bestPerFrame<T extends Track3>(cands: T[], vt: number[], uAt: (v: number) => number, feet: number, boards: number): T[] {
  const byFrame = new Map<number, { c: T; e: number }>();
  for (const c of cands) {
    const dv = Math.abs(c.v - evalPoly(vt, c.t)) / feet;
    const du = Math.abs(c.u - uAt(c.v)) / boards;
    if (dv > 1 || du > 1) continue;
    const e = dv * dv + du * du;
    const prev = byFrame.get(c.frame);
    if (!prev || e < prev.e) byFrame.set(c.frame, { c, e });
  }
  return [...byFrame.values()].map((x) => x.c).sort((a, b) => a.t - b.t);
}

/**
 * Board at v from the current winners: a straight line fitted with Gaussian
 * weights (8 ft) around v. One quadratic over the whole lane cannot follow a
 * skid, a hook and a roll; a local line can, and it carries the set outward a
 * few feet an iteration.
 */
function localLine(pts: Track3[]): (v: number) => number {
  return (v) => {
    const w = pts.map((p) => Math.exp(-(((p.v - v) / 8) ** 2) / 2) + 1e-6);
    return evalPoly(polyfit(pts.map((p) => p.v), pts.map((p) => p.u), 1, w), v);
  };
}

/** The largest set of candidates one ball could have produced, in time order. */
export function associate<T extends Track3>(cands: T[], opts: AssociateOptions = {}): T[] {
  const feet = opts.feet ?? 3;
  const boards = opts.boards ?? 3;
  const minGap = opts.minGap ?? 0.3;
  const sorted = [...cands].sort((a, b) => a.t - b.t);
  // Deterministic subsample of pairs when there are many candidates.
  const stride = Math.max(1, Math.floor(sorted.length / 150));
  let best: T[] = [];
  let bestScore = 0;
  for (let i = 0; i < sorted.length; i += stride) {
    for (let j = i + 1; j < sorted.length; j += stride) {
      const a = sorted[i];
      const b = sorted[j];
      const dt = b.t - a.t;
      if (dt < minGap) continue;
      const sp = (b.v - a.v) / dt;
      if (sp < MIN_SPEED_FTS || sp > MAX_SPEED_FTS) continue;
      const slope = (b.u - a.u) / (b.v - a.v);
      if (Math.abs(slope) > 1.5) continue;
      const vt = [a.v - sp * a.t, sp];
      const uv = [a.u - slope * a.v, slope];
      // The straight line across is loose: a hook bends away from it.
      const set = bestPerFrame(sorted, vt, (v) => evalPoly(uv, v), feet, boards * 2);
      const score = set.reduce((s, c) => s + (c.weight ?? 1), 0);
      if (score > bestScore) {
        bestScore = score;
        best = set;
      }
    }
  }
  for (let it = 0; it < 12 && best.length >= 4; it++) {
    const vt = polyfit(best.map((c) => c.t), best.map((c) => c.v), 1);
    const next = bestPerFrame(sorted, vt, localLine(best), feet, boards);
    if (next.length === best.length && next.every((c, k) => c === best[k])) break;
    if (next.length < 4) break;
    best = next;
  }
  // Down-lane position increases with time. Half a foot of slack: at the far
  // end a pixel is about a foot, so two honest sightings can cross.
  const mono: T[] = [];
  for (const c of best) if (!mono.length || c.v > mono[mono.length - 1].v - 0.5) mono.push(c);
  return mono;
}
