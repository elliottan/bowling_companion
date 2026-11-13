import type { Handedness } from "../../types/bowling";
import { BOARD_FT, CONTACT_IN, handedBoard, hookSlope, hookU, type HookShape } from "./laneModel";
import { PIN_POSITIONS } from "../pinGeometry";
import type { Metric, MetricState, PathModel, TrackMetrics } from "./types";

/** Fitting the path, the distance against time, and the metrics (plan 7.5, 7.6). */

export interface PathPoint {
  v: number;
  u: number;
  /** 0 to 1. */
  w: number;
  /** Down-lane uncertainty of this sighting, feet. */
  sv?: number;
  /** When it was seen, seconds. */
  t?: number;
}

/** Nelder-Mead minimiser, deterministic. */
export function nelderMead(f: (x: number[]) => number, x0: number[], scale: number[], iters = 600): { x: number[]; f: number } {
  const n = x0.length;
  let simplex = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + scale[j] : v)))];
  let values = simplex.map(f);
  for (let it = 0; it < iters; it++) {
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    if (Math.abs(values[n] - values[0]) < 1e-10 * (1 + Math.abs(values[0]))) break;
    const centroid = x0.map((_, j) => simplex.slice(0, n).reduce((s, p) => s + p[j], 0) / n);
    const at = (t: number) => centroid.map((c, j) => c + t * (simplex[n][j] - c));
    const xr = at(-1);
    const fr = f(xr);
    if (fr < values[0]) {
      const xe = at(-2);
      const fe = f(xe);
      if (fe < fr) {
        simplex[n] = xe;
        values[n] = fe;
      } else {
        simplex[n] = xr;
        values[n] = fr;
      }
    } else if (fr < values[n - 1]) {
      simplex[n] = xr;
      values[n] = fr;
    } else {
      const xc = at(fr < values[n] ? -0.5 : 0.5);
      const fc = f(xc);
      if (fc < Math.min(fr, values[n])) {
        simplex[n] = xc;
        values[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          values[i] = f(simplex[i]);
        }
      }
    }
  }
  let bi = 0;
  for (let i = 1; i <= n; i++) if (values[i] < values[bi]) bi = i;
  return { x: simplex[bi], f: values[bi] };
}

const huber = (r: number, d: number) => (Math.abs(r) <= d ? 0.5 * r * r : d * (Math.abs(r) - 0.5 * d));

// Wide on purpose. Real shots bend from the first feet on (shot-05's slope
// across falls steadily from the laydown to 44 ft), and with the skid held to
// 15 ft or more and the bend to 30 ft or less the fit ran into both limits and
// flattened the breakpoint away.
export const S_RANGE: [number, number] = [0, 55];
export const L_RANGE: [number, number] = [2, 60];

/**
 * The sightings the fit may use: a handful seen again after a long unseen
 * stretch (the ball behind the bowler, say) cannot be told from something
 * else that moved, and a path fitted across the gap is a guess. Groups are
 * split where consecutive sightings are more than `gapFt` apart; groups of
 * fewer than `min` are dropped, unless none is that big, when the biggest
 * stays.
 */
export function withoutIslands<T extends { v: number }>(pts: T[], gapFt = 15, min = 8): T[] {
  const sorted = [...pts].sort((a, b) => a.v - b.v);
  const groups: T[][] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (g && p.v - g[g.length - 1].v <= gapFt) g.push(p);
    else groups.push([p]);
  }
  const big = groups.filter((g) => g.length >= min);
  const keep = new Set((big.length ? big : groups.sort((a, b) => b.length - a.length).slice(0, 1)).flat());
  return pts.filter((p) => keep.has(p));
}

function shape(x: number[]): HookShape {
  return { u0: x[0], a: x[1], s: x[2], L: x[3], k: x[4] };
}

function cost(p: HookShape, pts: PathPoint[]): number {
  let c = 0;
  for (const q of pts) {
    // Far sightings are uncertain in v, which matters where the path is steep.
    const sl = hookSlope(p, q.v);
    const sigma = Math.sqrt(0.25 + (sl * (q.sv ?? 0)) ** 2);
    c += q.w * huber((q.u - hookU(p, q.v)) / sigma, 1.5);
  }
  const out = (x: number, [lo, hi]: [number, number]) => (x < lo ? lo - x : x > hi ? x - hi : 0);
  return c + 1e3 * (out(p.s, S_RANGE) ** 2 + out(p.L, L_RANGE) ** 2);
}

export interface PathFit {
  path: PathModel;
  rms: number;
}

/** Weighted RMS of the across residual, boards. */
export function residualRms(pts: PathPoint[], at: (v: number) => number): number {
  const sw = pts.reduce((s, q) => s + q.w, 0) || 1;
  return Math.sqrt(pts.reduce((s, q) => s + q.w * (q.u - at(q.v)) ** 2, 0) / sw);
}

/**
 * Board against feet with the shape a ball makes: skid, a quadratic bend,
 * roll. Five unknowns, Nelder-Mead from three starts. A ball with no hook
 * fits with k near zero, and that is a valid answer. Above 0.7 board RMS the
 * shape is wrong for this shot and a smoothing spline is used instead.
 */
export function fitPath(pts: PathPoint[]): PathFit {
  const vs = pts.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const early = pts.filter((p) => p.v <= lo + Math.max(10, 0.3 * (hi - lo)));
  let u0 = early.reduce((s, p) => s + p.u, 0) / early.length;
  let a = 0;
  if (early.length >= 2) {
    const mv = early.reduce((s, p) => s + p.v, 0) / early.length;
    const num = early.reduce((s, p) => s + (p.v - mv) * (p.u - u0), 0);
    const den = early.reduce((s, p) => s + (p.v - mv) ** 2, 0);
    a = den > 0 ? num / den : 0;
    u0 -= a * mv;
  }
  let best: { x: number[]; f: number } | null = null;
  for (const s of [25, 35, 45]) {
    const r = nelderMead((x) => cost(shape(x), pts), [u0, a, s, 12, -Math.sign(a || 1) * 0.02], [1, 0.05, 5, 5, 0.01], 1500);
    const again = nelderMead((x) => cost(shape(x), pts), r.x, [0.3, 0.02, 2, 2, 0.005], 1500);
    if (!best || again.f < best.f) best = again;
  }
  const p = shape(best!.x);
  p.s = Math.min(S_RANGE[1], Math.max(S_RANGE[0], p.s));
  p.L = Math.min(L_RANGE[1], Math.max(L_RANGE[0], p.L));
  const rms = residualRms(pts, (v) => hookU(p, v));
  if (rms <= 0.7) return { path: { kind: "hook", ...p }, rms };
  const knots = smoothingKnots(pts);
  const sp: PathModel = { kind: "spline", ...p, knots };
  return { path: sp, rms: residualRms(pts, (v) => pathU(sp, v)) };
}

/** Weighted medians every 3 ft, then a three-point running mean. */
function smoothingKnots(pts: PathPoint[]): [number, number][] {
  const sorted = [...pts].sort((a, b) => a.v - b.v);
  const bins = new Map<number, PathPoint[]>();
  for (const p of sorted) {
    const k = Math.floor(p.v / 3);
    bins.set(k, [...(bins.get(k) ?? []), p]);
  }
  const raw = [...bins.values()].map((b) => {
    const us = b.map((p) => p.u).sort((x, y) => x - y);
    return [b.reduce((s, p) => s + p.v, 0) / b.length, us[us.length >> 1]] as [number, number];
  });
  return raw.map((k, i) => {
    const nb = raw.slice(Math.max(0, i - 1), i + 2);
    return [k[0], nb.reduce((s, x) => s + x[1], 0) / nb.length];
  });
}

/** The fitted path's u at v feet. Linear between spline knots, held flat-sloped beyond. */
export function pathU(p: PathModel, v: number): number {
  if (p.kind === "hook" || !p.knots || p.knots.length < 2) return hookU(p, v);
  const k = p.knots;
  if (v <= k[0][0]) return k[0][1] + ((k[1][1] - k[0][1]) / (k[1][0] - k[0][0])) * (v - k[0][0]);
  for (let i = 1; i < k.length; i++) {
    if (v <= k[i][0]) return k[i - 1][1] + ((k[i][1] - k[i - 1][1]) * (v - k[i - 1][0])) / (k[i][0] - k[i - 1][0]);
  }
  const n = k.length - 1;
  return k[n][1] + ((k[n][1] - k[n - 1][1]) / (k[n][0] - k[n - 1][0])) * (v - k[n][0]);
}

export interface MotionPoint {
  t: number;
  v: number;
  w: number;
}

/**
 * Distance against time, v(t) = v0 + w t + d t^2 / 2 with d at or below zero
 * (a ball only slows). Weighted, iteratively reweighted for robustness.
 */
export function fitMotion(pts: MotionPoint[]): { v0: number; w: number; d: number } {
  let wts = pts.map((p) => p.w);
  let res = { v0: 0, w: 0, d: 0 };
  for (let it = 0; it < 6; it++) {
    res = solveMotion(pts, wts, true);
    if (res.d > 0) res = solveMotion(pts, wts, false);
    const r = pts.map((p) => p.v - (res.v0 + res.w * p.t + 0.5 * res.d * p.t * p.t));
    const sw = wts.reduce((s, x) => s + x, 0) || 1;
    const sigma = Math.max(0.2, Math.sqrt(r.reduce((s, x, i) => s + wts[i] * x * x, 0) / sw));
    wts = pts.map((p, i) => p.w * (Math.abs(r[i]) <= 2 * sigma ? 1 : (2 * sigma) / Math.abs(r[i])));
  }
  return res;
}

function solveMotion(pts: MotionPoint[], wts: number[], quad: boolean): { v0: number; w: number; d: number } {
  const m = quad ? 3 : 2;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);
  pts.forEach((p, i) => {
    const row = [1, p.t, 0.5 * p.t * p.t].slice(0, m);
    for (let r = 0; r < m; r++) {
      b[r] += wts[i] * row[r] * p.v;
      for (let c = 0; c < m; c++) A[r][c] += wts[i] * row[r] * row[c];
    }
  });
  for (let r = 0; r < m; r++) A[r][r] += 1e-9;
  for (let c = 0; c < m; c++) {
    for (let r = c + 1; r < m; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < m; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array<number>(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < m; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return { v0: x[0], w: x[1], d: quad ? x[2] : 0 };
}

export const FTS_TO_MPH = 3600 / 5280;

/** Time at which v(t) reaches `v`, or null. */
export function timeAtFeet(m: { v0: number; w: number; d: number }, v: number): number | null {
  if (Math.abs(m.d) < 1e-9) return m.w > 0 ? (v - m.v0) / m.w : null;
  const disc = m.w * m.w + 2 * m.d * (v - m.v0);
  if (disc < 0) return null;
  return (-m.w + Math.sqrt(disc)) / m.d;
}

/**
 * Where the ball's centre is when it first touches a pin, following the path:
 * the first pin whose centre comes within a ball-plus-pin radius of it. That
 * instant is when the pins start to move (the pin anchor of plan 7.6).
 */
export function pinContactFeet(path: PathModel): number | null {
  return firstPinContact((v) => pathU(path, v));
}

/** Feet at which a ball whose lane u at v feet is `uAt(v)` first touches a pin, or null. */
export function firstPinContact(uAt: (v: number) => number): number | null {
  const reach = CONTACT_IN / 12;
  let bestV: number | null = null;
  for (const pin of Object.values(PIN_POSITIONS)) {
    // The rack is symmetric, so a pin's board reads the same in lane u.
    for (let v = pin.feet - reach; v <= pin.feet; v += 0.01) {
      const dx = (uAt(v) - pin.board) * BOARD_FT;
      if (Math.hypot(dx, pin.feet - v) <= reach) {
        if (bestV === null || v < bestV) bestV = v;
        break;
      }
    }
  }
  return bestV;
}

export interface MetricInput {
  path: PathModel;
  hand: Handedness;
  /** Feet of the sightings used in the fit (not airborne). */
  seen: number[];
  /** Feet of the touchdown, when the touchdown frame was found. */
  touchdown: number | null;
  motion: { v0: number; w: number; d: number };
  /** Seconds of the first and last sighting. */
  tFirst: number;
  tLast: number;
  /** The distance scale came from the foul line or the arrows, and the pin anchor was found. */
  speedMeasured: boolean;
  /**
   * Average speed between the two sharp events, the touchdown and the first
   * frame the rack moves (plan 7.6), when both were seen, ft/s. It does not
   * lean on the far distance scale, so it is preferred to the fit.
   */
  anchoredSpeed?: number;
  /**
   * Lane u under the ball where it sits right above the foul line in the
   * picture, followed back from its first sighting (`release.ts`). When
   * given, it is the laydown, measured.
   */
  overFoulLineU?: number;
  /**
   * The sightings the path was fitted to. With them the laydown and the
   * arrows are read off the sightings around them, not off the whole path.
   */
  points?: PathPoint[];
  /** When the rack was first seen to move, seconds: the ball has met the pins by then. */
  rackMovesAt?: number;
}

/** Weighted straight line y = a + b x through the points, or null with fewer than two distinct x. */
function line(xs: number[], ys: number[], ws: number[]): { a: number; b: number } | null {
  const sw = ws.reduce((s, w) => s + w, 0);
  if (!(sw > 0)) return null;
  const mx = xs.reduce((s, x, i) => s + ws[i] * x, 0) / sw;
  const my = ys.reduce((s, y, i) => s + ws[i] * y, 0) / sw;
  const den = xs.reduce((s, x, i) => s + ws[i] * (x - mx) ** 2, 0);
  if (!(den > 0)) return null;
  const b = xs.reduce((s, x, i) => s + ws[i] * (x - mx) * (ys[i] - my), 0) / den;
  return { a: my - b * mx, b };
}

/**
 * The ball's board where it first meets a pin, from its last sightings alone
 * (from 54 ft on), in lane u, or null when there are too few. Each of board
 * and distance is a straight line against time through those sightings: next
 * to the rack a pixel is about a foot, so a sighting's own distance jumps
 * about, but a line through several of them holds. The ball meets the pin
 * when that line reaches `contactV`, or when the rack is first seen to move,
 * whichever is sooner; sightings after either are the ball among the pins and
 * are not used.
 */
export function boardAtPins(pts: PathPoint[], contactV: number, rackMovesAt?: number): number | null {
  // Which sightings are from 54 ft to contact is judged by the line through
  // them, not by each sighting's own distance, which jumps about.
  const near = pts.filter((p) => p.t !== undefined && p.w > 0 && p.v >= PINS_FROM_FT - 4 && (rackMovesAt === undefined || p.t < rackMovesAt));
  if (near.length < 4) return null;
  const all = line(near.map((p) => p.t!), near.map((p) => p.v), near.map((p) => p.w));
  if (!all || !(all.b > 0)) return null;
  const late = near.filter((p) => {
    const v = all.a + all.b * p.t!;
    return v >= PINS_FROM_FT && v <= contactV + 0.2;
  });
  if (late.length < 4) return null;
  const ts = late.map((p) => p.t!);
  const ws = late.map((p) => p.w);
  if (Math.max(...ts) - Math.min(...ts) < 0.03) return null;
  const vt = line(ts, late.map((p) => p.v), ws);
  const ut = line(ts, late.map((p) => p.u), ws);
  if (!vt || !ut) return null;
  let tc = vt.b > 0 ? (contactV - vt.a) / vt.b : Math.max(...ts);
  if (rackMovesAt !== undefined) tc = Math.min(tc, rackMovesAt);
  // Never run the line on past the rack's first movement or far beyond the last sighting.
  tc = Math.min(tc, Math.max(...ts) + 0.1);
  return ut.a + ut.b * tc;
}

/** The board at the pins is read off the sightings from here on, feet. */
export const PINS_FROM_FT = 54;

/** Feet of sightings a local reading takes in, either side of where it reads (from the first sighting on, for the laydown). */
export const LOCAL_SPAN_FT = 10;

/**
 * The board at `at` feet from the sightings between `lo` and `hi` feet alone:
 * a weighted straight line through them, with far outliers weighed down. Null
 * with fewer than `minCount` sightings there or less than `minSpan` feet of
 * them.
 *
 * The whole path has one bend, and a shot that curves gently from the foul
 * line and then turns hard near the pins pulls its straight start away from
 * the sightings (shot-02: 0.7 board at the foul line). Over 10 ft every shot
 * is straight enough for a line.
 */
export function localU(pts: PathPoint[], lo: number, hi: number, at: number, minCount = 6, minSpan = 4): number | null {
  const near = pts.filter((p) => p.v >= lo && p.v <= hi && p.w > 0);
  if (near.length < minCount) return null;
  const vs = near.map((p) => p.v);
  if (Math.max(...vs) - Math.min(...vs) < minSpan) return null;
  let wts = near.map((p) => p.w);
  let u0 = 0;
  let a = 0;
  for (let it = 0; it < 5; it++) {
    const sw = wts.reduce((s, w) => s + w, 0);
    const mv = near.reduce((s, p, i) => s + wts[i] * p.v, 0) / sw;
    const mu = near.reduce((s, p, i) => s + wts[i] * p.u, 0) / sw;
    const den = near.reduce((s, p, i) => s + wts[i] * (p.v - mv) ** 2, 0);
    a = den > 0 ? near.reduce((s, p, i) => s + wts[i] * (p.v - mv) * (p.u - mu), 0) / den : 0;
    u0 = mu - a * mv;
    const r = near.map((p) => p.u - (u0 + a * p.v));
    // The spread from the median residual, so one wild sighting does not set it.
    const abs = r.map(Math.abs).sort((x, y) => x - y);
    const sigma = Math.max(0.15, 1.4826 * abs[abs.length >> 1]);
    wts = near.map((p, i) => p.w * (Math.abs(r[i]) <= 2 * sigma ? 1 : ((2 * sigma) / Math.abs(r[i])) ** 2));
  }
  return u0 + a * at;
}

const M = (value: number | null, state: MetricState): Metric => (value === null || !Number.isFinite(value) ? { value: null, state: "missing" } : { value, state });

/** The metrics and their states (plan 7.5, R11), in handed boards, feet, degrees and mph. */
export function metrics(inp: MetricInput): TrackMetrics {
  const { path, hand, seen } = inp;
  const from = Math.min(...seen);
  const to = Math.max(...seen);
  const board = (v: number) => handedBoard(pathU(path, v), hand);
  const near = (v: number, d: number) => seen.some((s) => Math.abs(s - v) <= d);
  const skidCount = seen.filter((v) => v <= path.s).length;
  // The laydown and the arrows are read off the sightings around them where
  // there are enough; the whole path's board is the fallback.
  const pts = inp.points ?? [];
  const local = (lo: number, hi: number, at: number) => {
    const u = localU(pts, lo, hi, at);
    return u === null ? board(at) : handedBoard(u, hand);
  };
  const board0 = from <= 6 ? local(from, from + LOCAL_SPAN_FT, 0) : board(0);
  const board15 = local(15 - LOCAL_SPAN_FT / 2, 15 + LOCAL_SPAN_FT / 2, 15);

  // The laydown is the board over the foul line (0 ft), wherever the ball
  // comes down: one distance for every shot, so shots compare. The touchdown
  // is seen within 6 ft of it, so the line through the first 10 ft of
  // sightings runs back a few feet at most. Where the ball lands is reported
  // beside it.
  const laydown =
    inp.overFoulLineU !== undefined
      ? M(handedBoard(inp.overFoulLineU, hand), "measured")
      : inp.touchdown !== null ? M(board0, "measured") : from <= 30 ? M(board0, "estimated") : M(null, "missing");
  const touchdown = inp.touchdown !== null ? M(board(inp.touchdown), "measured") : M(null, "missing");
  const touchdownFeet = inp.touchdown !== null ? M(inp.touchdown, "measured") : M(null, "missing");
  const arrows = near(15, 3) ? M(board15, "measured") : from <= 30 && skidCount >= 6 ? M(board15, "estimated") : M(null, "missing");

  // Breakpoint: the point furthest toward the bowler's own gutter (lowest handed board).
  let bpV: number | null = null;
  let bpB = Infinity;
  const lo = Math.max(0, from);
  const hi = Math.min(60, to + 5);
  for (let v = lo; v <= hi; v += 0.25) {
    const b = board(v);
    if (b < bpB) {
      bpB = b;
      bpV = v;
    }
  }
  let bpState: MetricState = "missing";
  if (bpV !== null && bpV > lo + 0.5 && bpV < hi - 0.5) {
    const before = seen.some((s) => s < bpV! && s >= bpV! - 5);
    const after = seen.some((s) => s > bpV! && s <= bpV! + 5);
    bpState = before && after && path.kind === "hook" ? "measured" : bpV >= from && bpV <= to ? "estimated" : "missing";
  }
  const breakpoint = bpState === "missing" ? M(null, "missing") : M(bpB, bpState);
  const breakpointFeet = bpState === "missing" ? M(null, "missing") : M(bpV, bpState);

  const pinState: MetricState = to >= 57 ? "measured" : to >= 52 ? "estimated" : "missing";
  // The board at the pins is read off the last sightings alone, like the
  // laydown: a ball turns hardest in its last feet (shot-01: a board a foot),
  // and the whole path, one bend and then straight, runs under it. Their
  // distance is taken from when they were seen (the fitted distance against
  // time): next to the rack a pixel is a foot, so a sighting's own distance
  // jumps about, and its time does not.
  //
  // It is read where the ball first meets a pin (the owner's reading of
  // shot-06: about 18, a high pocket, where 60 ft read 19.5), and only from
  // sightings before then: after it the ball is deflected by the pins.
  const m = inp.motion;
  // Where it meets a pin depends on its board there: two rounds settle it.
  let contactV = 60;
  let lastU: number | null = null;
  for (let round = 0; round < 3; round++) {
    lastU = boardAtPins(pts, contactV, inp.rackMovesAt);
    const at = lastU ?? pathU(path, contactV);
    contactV = firstPinContact(() => at) ?? 60;
  }
  lastU = boardAtPins(pts, contactV, inp.rackMovesAt);
  const board60 = lastU === null ? board(contactV) : handedBoard(lastU, hand);
  const pins = pinState === "missing" ? M(null, "missing") : M(board60, pinState);
  const entry = (Math.atan(Math.abs(board(60) - board(54)) * BOARD_FT / 6) * 180) / Math.PI;
  const entryAngle = pinState === "missing" ? M(null, "missing") : M(entry, pinState);
  const skidSpan = seen.filter((v) => v <= path.s);
  const launch = (Math.atan(Math.abs(path.a) * BOARD_FT) * 180) / Math.PI;
  const launchAngle =
    skidSpan.length >= 2 && Math.max(...skidSpan) - Math.min(...skidSpan) >= 10 ? M(launch, "measured") : M(launch, from <= 30 ? "estimated" : "missing");

  const vAt = (t: number) => m.v0 + m.w * t + 0.5 * m.d * t * t;
  // Two readings: the slope of the fitted distance against time over the
  // visible range, and the two sharp events. Measured only when they agree
  // within 1.5 mph; otherwise the slope, as estimated.
  const slope = ((vAt(inp.tLast) - vAt(inp.tFirst)) / (inp.tLast - inp.tFirst)) * FTS_TO_MPH;
  const anchored = inp.anchoredSpeed !== undefined ? inp.anchoredSpeed * FTS_TO_MPH : null;
  const agree = anchored !== null && Math.abs(anchored - slope) <= 1.5;
  const avg = agree ? anchored : slope;
  const spState: MetricState = inp.speedMeasured && agree ? "measured" : "estimated";
  const sane = (x: number) => x >= 8 && x <= 26;
  const speed = sane(avg) ? M(avg, spState) : M(null, "missing");
  const t60 = timeAtFeet(m, 60);
  const endSpeed = t60 !== null ? (m.w + m.d * t60) * FTS_TO_MPH : NaN;
  const speedAtPins = to >= 52 && sane(endSpeed) ? M(endSpeed, spState) : M(null, "missing");
  return { laydown, touchdown, touchdownFeet, arrows, breakpoint, breakpointFeet, pins, entryAngle, launchAngle, speed, speedAtPins };
}
