import * as fdlibm from "./detMath";
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

/** From here on down the lane a pixel is a foot or more, and sightings may cross by... */
export const FAR_FT = 45;
/** ...this many feet. */
export const FAR_SLACK_FT = 2;

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
    const w = pts.map((p) => fdlibm.exp(-(((p.v - v) / 8) ** 2) / 2) + 1e-6);
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
  // Down-lane position increases with time. Half a foot of slack, and
  // `FAR_SLACK_FT` from `FAR_FT` on: at the far end a pixel is about a foot,
  // so two honest sightings can cross by more (shot-01 frame 231, the ball
  // plain against the pins, a pixel low and 1.4 ft short of the frame
  // before's sighting, was dropped).
  const mono: T[] = [];
  for (const c of best) {
    const last = mono[mono.length - 1];
    if (!last || c.v > last.v - (last.v >= FAR_FT ? FAR_SLACK_FT : 0.5)) mono.push(c);
  }
  return onePace(mono);
}

/** Sightings this far apart in time or more are two pieces of the ball's run, seconds. */
export const PIECE_GAP_S = 0.1;
/** A piece's speed is trusted when it is seen over this long, seconds. */
export const PACE_SPAN_S = 0.2;
/** Across a gap the ball goes on at no less than this share of the longest piece's speed... */
export const GAP_PACE = 0.6;
/** ...give or take this many feet (a sighting's own error far down the lane). */
export const GAP_SLACK_FT = 1.5;

/**
 * The ball, once seen in pieces (lost behind the bowler, among the pins),
 * goes on between them at about its speed: it loses a quarter of it at most
 * over the lane. The set the fit above keeps is one straight line in time
 * within 3 ft, which a run of 9 ft and something standing a few feet past it
 * half a second later can both be near: shot-04 read from just before the
 * foul line kept the ball to 9.7 ft and then something at 12.5 to 16 ft that
 * hardly moved for 0.3 s, read the arrows 9.3 off the line through them,
 * and the near lane's own follow (`followNear`), which reads the ball to
 * 12.9 ft, was never tried. The heaviest piece, when it is seen over
 * `PACE_SPAN_S`, sets the speed (its straight line in time); a piece after
 * it whose sightings are mostly short of where the ball would be at
 * `GAP_PACE` of that speed, or a piece before it mostly past where the ball
 * could have come from, is left out. Each piece is judged by most of its
 * sightings, not its end: a stray at a piece's end is common. Pure.
 */
export function onePace<T extends Track3>(set: T[]): T[] {
  const pieces: T[][] = [];
  for (const c of set) {
    const last = pieces[pieces.length - 1];
    if (last && c.t - last[last.length - 1].t < PIECE_GAP_S) last.push(c);
    else pieces.push([c]);
  }
  if (pieces.length < 2) return set;
  const weightOf = (p: T[]) => p.reduce((s, c) => s + (c.weight ?? 1), 0);
  const main = pieces.reduce((a, p) => (weightOf(p) > weightOf(a) ? p : a));
  const t0 = main[0].t;
  const t1 = main[main.length - 1].t;
  if (t1 - t0 < PACE_SPAN_S) return set;
  const line = polyfit(main.map((c) => c.t), main.map((c) => c.v), 1);
  const speed = line[1];
  if (!(speed > 0)) return set;
  const v0 = evalPoly(line, t0);
  const v1 = evalPoly(line, t1);
  // How far each sighting is inside where the ball can be: after the piece,
  // at least that slow; before it, at most that far on.
  const margin = (c: T) => (c.t > t1 ? c.v - (v1 + GAP_PACE * speed * (c.t - t1)) : v0 - GAP_PACE * speed * (t0 - c.t) - c.v) + GAP_SLACK_FT;
  const fits = (p: T[]) => {
    const m = p.map(margin).sort((a, b) => a - b);
    return m[(m.length - 1) >> 1] >= 0;
  };
  return pieces.filter((p) => p === main || fits(p)).flat();
}
