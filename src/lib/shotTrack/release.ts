import { ARC_MIN, ARC_REACH, arcFit } from "./ballDetect";
import { sample } from "./image";
import { downAt, intersect, lineThrough, mapLine } from "./homography";
import { imageToLane } from "./laneModel";
import type { GrayFrame, Mat3, Point } from "./types";
import * as fdlibm from "./detMath";

/**
 * The laydown as the owner reads it (2026-11-13): the board under the ball's
 * centre in the frame where the ball sits right above the foul line in the
 * picture, in the hand or in the air, not where it lands.
 *
 * The ball is not a sighting before it lands (the hand and the body are on
 * it), so it is followed back from its first sighting by its own darkness: a
 * disc darker than the lane round its lower half and sides (the hand is over
 * its top). Each step back it may move a few radii and grow a little (it is
 * nearer the camera). It is read in the last frame it sits on the foul line
 * in the picture before it goes out over the lane: followed back from its
 * first sighting, where its bottom first comes down onto the foul line's row,
 * on the foul line straight below its centre (the owner, 2026-11-13, after
 * trying the first frame on the line: shot-06 about 18, frame 33.4). A ball
 * carried over the line never reaches the row (shot-02, shot-03, shot-05: 14
 * to 21 pixels short); it is read where it comes lowest.
 */

export interface ReleaseFrame {
  frame: number;
  /** Disc centre and radius in that frame's pixels. */
  cx: number;
  cy: number;
  r: number;
  /** How much darker the disc is than the lane round it, grey levels. */
  contrast: number;
}

export interface OverFoulLine {
  /** The ball as followed back, latest first. */
  track: ReleaseFrame[];
  /** Fractional frame at which the ball's bottom is last on the foul line's row, or comes closest to it. */
  at: number;
  /** The ball's bottom reached the foul line's row (rather than only coming closest to it). */
  reached: boolean;
  /** Picture point on the foul line straight below the ball's centre then. */
  point: Point;
  /** Lane u there. */
  u: number;
  /**
   * How it was read: `time` when the ball's crossing of the foul line was
   * timed from its touchdown and speed (`atFoulLineTime`), `image` when read
   * where its bottom meets the foul line's row or comes lowest.
   */
  by?: "time" | "image";
  /** With `time`: the reading the picture alone gives, for a cross-check. */
  image?: { at: number; u: number; reached: boolean };
}

/** Mean of the picture over a set of offsets around (x, y); NaN when any falls outside. */
function meanAt(f: GrayFrame, x: number, y: number, offs: Int16Array, reach = Infinity): number {
  let s = 0;
  const n = offs.length / 2;
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi - reach >= 0 && yi - reach >= 0 && xi + reach < f.width && yi + reach < f.height) {
    // Every offset within `reach` of the middle, and all of those inside the picture.
    const d = f.data;
    const w = f.width;
    const at = yi * w + xi;
    for (let k = 0; k < offs.length; k += 2) s += d[at + offs[k + 1] * w + offs[k]];
    return s / n;
  }
  for (let k = 0; k < offs.length; k += 2) {
    const px = xi + offs[k];
    const py = yi + offs[k + 1];
    if (px < 0 || py < 0 || px >= f.width || py >= f.height) return NaN;
    s += f.data[py * f.width + px];
  }
  return s / n;
}

const offsetCache = new Map<string, { inner: Int16Array; ring: Int16Array; reach: number }>();

/**
 * Pixel offsets inside 0.8 r, and in the ring 1.2 r to 1.6 r below and beside
 * the centre (not the top third), for r to a tenth of a pixel: kept by that
 * tenth, so they are made from it (made from the first r asked for, every
 * radius within the tenth took that radius's offsets, and a reading depended
 * on what had been asked before).
 */
function offsets(radius: number): { inner: Int16Array; ring: Int16Array; reach: number } {
  const key = radius.toFixed(1);
  const known = offsetCache.get(key);
  if (known) return known;
  const r = Number(key);
  const inner: number[] = [];
  const ring: number[] = [];
  const R = Math.ceil(1.6 * r);
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) {
      const d = Math.hypot(i, j);
      if (d <= 0.8 * r) inner.push(i, j);
      else if (d >= 1.2 * r && d <= 1.6 * r && j > -0.5 * d) ring.push(i, j);
    }
  }
  // How far any offset reaches from the middle, pixels.
  const out = { inner: Int16Array.from(inner), ring: Int16Array.from(ring), reach: R };
  offsetCache.set(key, out);
  return out;
}

/** The darkest-against-its-surroundings disc near `near`, with a radius from `radii`, within `reach` pixels across and `reachY` (default `reach`) up and down. */
export function findDisc(f: GrayFrame, near: Point, radii: number[], reach: number, reachY = reach): { cx: number; cy: number; r: number; contrast: number } | null {
  let best: { cx: number; cy: number; r: number; contrast: number } | null = null;
  for (const r of radii) {
    const o = offsets(r);
    for (let y = Math.round(near.y - reachY); y <= Math.round(near.y + reachY); y++) {
      for (let x = Math.round(near.x - reach); x <= Math.round(near.x + reach); x++) {
        const c = meanAt(f, x, y, o.ring, o.reach) - meanAt(f, x, y, o.inner, o.reach);
        if (Number.isFinite(c) && (!best || c > best.contrast)) best = { cx: x, cy: y, r, contrast: c };
      }
    }
  }
  return best;
}

/**
 * The disc fitted to the ball's own outline: along rays from the rough centre
 * over its lower half and sides (the hand covers its top), where the picture
 * turns from the dark ball to the lighter lane, then a circle through those
 * points with the radius free, twice, dropping points more than 2 pixels off.
 * The darkness match alone keeps the radius it was given, and a ball nearer
 * the camera than that is matched off-centre (the owner, shot-01). The rough
 * disc is kept when too few rays find an edge or the fit strays.
 */
export function fitOutline(f: GrayFrame, d: { cx: number; cy: number; r: number; contrast: number }): { cx: number; cy: number; r: number; contrast: number } {
  let cx = d.cx;
  let cy = d.cy;
  let r = d.r;
  for (let round = 0; round < 3; round++) {
    const pts: { x: number; y: number }[] = [];
    for (let deg = -30; deg <= 210; deg += 6) {
      const a = (deg * Math.PI) / 180;
      const dx = fdlibm.cos(a);
      const dy = fdlibm.sin(a);
      let best = 0;
      let at = -1;
      for (let t = 0.6 * r; t <= 1.6 * r; t += 0.5) {
        const inner = sample(f, cx + dx * (t - 1), cy + dy * (t - 1));
        const outer = sample(f, cx + dx * (t + 1), cy + dy * (t + 1));
        const g = outer - inner;
        if (Number.isFinite(g) && g > best) {
          best = g;
          at = t;
        }
      }
      if (at > 0 && best >= 12) pts.push({ x: cx + dx * at, y: cy + dy * at });
    }
    let use = pts;
    let fit: { cx: number; cy: number; r: number } | null = null;
    for (let pass = 0; pass < 2; pass++) {
      if (use.length < 10) break;
      fit = circleThrough(use);
      if (!fit) break;
      const f0 = fit;
      use = use.filter((p) => Math.abs(Math.hypot(p.x - f0.cx, p.y - f0.cy) - f0.r) <= 2);
    }
    if (!fit || fit.r < 0.75 * d.r || fit.r > 1.6 * d.r || Math.hypot(fit.cx - d.cx, fit.cy - d.cy) > d.r) break;
    cx = fit.cx;
    cy = fit.cy;
    r = fit.r;
  }
  return { cx, cy, r, contrast: d.contrast };
}

/** Least-squares circle through points (Kasa), or null when they do not fix one. */
function circleThrough(pts: { x: number; y: number }[]): { cx: number; cy: number; r: number } | null {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const b1 = 0.5 * (suuu + suvv);
  const b2 = 0.5 * (svvv + svuu);
  const uc = (b1 * svv - b2 * suv) / det;
  const vc = (suu * b2 - suv * b1) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return Number.isFinite(r) ? { cx: mx + uc, cy: my + vc, r } : null;
}

/**
 * Follows the ball back from its first sighting (frame `first`, disc
 * `start`) through earlier frames until its bottom is below the foul line's
 * row in the picture, and reads where it was right above the line. `frame(i)`
 * gives a frame and `H(i)` its lane mapping. Null when the ball cannot be
 * followed (its contrast fades to under a third of the start's) or never
 * reaches the line within `maxBack` frames.
 */
export function overFoulLine(
  frame: (i: number) => GrayFrame | null,
  H: (i: number) => Mat3 | null,
  first: number,
  start: { cx: number; cy: number; r: number },
  maxBack = 30
): OverFoulLine | null {
  const below = (i: number, p: { cx: number; cy: number; r: number }) => {
    const h = H(i);
    if (!h) return null;
    const foul = mapLine(h, [0, 1, 0]);
    // The foul line's row straight below the ball's centre.
    const fy = -(foul[0] * p.cx + foul[2]) / foul[1];
    return { fy, gap: p.cy + p.r - fy };
  };
  const f0 = frame(first);
  if (!f0) return null;
  const rough0 = findDisc(f0, { x: start.cx, y: start.cy }, [start.r], Math.max(2, 0.3 * start.r));
  if (!rough0) return null;
  const d0 = fitOutline(f0, rough0);
  const track: ReleaseFrame[] = [{ frame: first, ...d0 }];
  const first0 = below(first, d0);
  if (!first0) return null;
  const gaps: number[] = [first0.gap];
  const read = (i: number, cx: number, at: number, reached: boolean): OverFoulLine => {
    const h = H(i)!;
    const foul = mapLine(h, [0, 1, 0]);
    const point = { x: cx, y: -(foul[0] * cx + foul[2]) / foul[1] };
    return { track, at, reached, point, u: imageToLane(h, point).u };
  };
  for (let i = first - 1; i >= Math.max(0, first - maxBack); i--) {
    const f = frame(i);
    const last = track[track.length - 1];
    if (!f || !H(i)) break;
    const rough = findDisc(f, { x: last.cx, y: last.cy }, [last.r, last.r * 1.04, last.r * 1.08], Math.max(4, 0.9 * last.r));
    if (!rough || rough.contrast < d0.contrast / 3) break;
    const d = fitOutline(f, rough);
    const now = below(i, d)!;
    track.push({ frame: i, ...d });
    gaps.push(now.gap);
    const k = gaps.length - 1;
    // The last frame the ball sits on the line (the owner, 2026-11-13: shot-06
    // about 18): followed back from the lane, where its bottom first comes
    // down onto the foul line's row, between two frames.
    if (gaps[k - 1] <= 0 && now.gap > 0) {
      const s = now.gap / (now.gap - gaps[k - 1]);
      return read(i, d.cx + s * (track[k - 1].cx - d.cx), i + s, true);
    }
    // Two frames in a row higher in the picture than the one before them:
    // that one was where the ball came lowest. Going further back the ball is
    // up in the swing.
    if (k >= 3 && gaps[k] < gaps[k - 1] && gaps[k - 1] < gaps[k - 2] && gaps[k - 2] >= gaps[k - 3]) {
      const j = k - 2;
      const [a, b, c] = [gaps[j + 1], gaps[j], gaps[j - 1]];
      const den = a - 2 * b + c;
      const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
      // off > 0 leans to the earlier frame (j + 1 in the track), < 0 to the later one.
      const cx = off >= 0 ? track[j].cx + off * (track[j + 1].cx - track[j].cx) : track[j].cx - off * (track[j - 1].cx - track[j].cx);
      return read(track[j].frame, cx, track[j].frame - off, false);
    }
  }
  return null;
}

/** Where the ball should be on frame `i`, from the lane and its motion: its center's row and its radius, pixels, and "down" there when known; `cx` is where it was on the frame before. */
export type FollowPrediction = (i: number, cx: number) => { cy: number; r: number; down?: Point } | null;

/**
 * The laydown by time (the owner, 2026-11-16: bowlers finish at different
 * distances from the foul line, so where the ball comes lowest in the picture
 * need not be over the line): the ball is followed back from its first
 * sighting on the lane (frame `first`, disc `start`) by its darkness, as
 * `overFoulLine` does, to the fractional frame `at` at which its timing puts
 * it on the foul line (its touchdown distance over its speed, before the
 * touchdown), and read there: its center between the two frames either side,
 * and the lane u where the line from that center straight down in the lane
 * ("down", `downAt`) meets the foul line. Null when the ball is lost before
 * `at` or `at` is not before `first`.
 */
export function atFoulLineTime(
  frame: (i: number) => GrayFrame | null,
  H: (i: number) => Mat3 | null,
  first: number,
  start: { cx: number; cy: number; r: number },
  at: number
): OverFoulLine | null {
  if (!(at < first) || at < first - 60) return null;
  const f0 = frame(first);
  if (!f0) return null;
  const rough0 = findDisc(f0, { x: start.cx, y: start.cy }, [start.r], Math.max(2, 0.3 * start.r));
  if (!rough0) return null;
  const track: ReleaseFrame[] = [{ frame: first, ...fitOutline(f0, rough0) }];
  const lo = Math.floor(at);
  for (let i = first - 1; i >= lo; i--) {
    const f = frame(i);
    const last = track[track.length - 1];
    if (!f || !H(i)) return null;
    const rough = findDisc(f, { x: last.cx, y: last.cy }, [last.r, last.r * 1.04, last.r * 1.08], Math.max(4, 0.9 * last.r));
    if (!rough || rough.contrast < rough0.contrast / 3) return null;
    track.push({ frame: i, ...fitOutline(f, rough) });
  }
  const a = track[track.length - 1];
  const b = track.length >= 2 ? track[track.length - 2] : a;
  const s = at - lo;
  const c = { x: a.cx + s * (b.cx - a.cx), y: a.cy + s * (b.cy - a.cy) };
  const h = H(lo)!;
  const d = downAt(h, c);
  const point = intersect(lineThrough(c, { x: c.x + d.x, y: c.y + d.y }), mapLine(h, [0, 1, 0]));
  if (!point) return null;
  return { track, at, reached: true, point, u: imageToLane(h, point).u, by: "time" };
}

/**
 * The ball followed forward by its darkness from a sighting (`start`, in
 * frame `from`) to frame `to`, while it stays at least `minContrast` of its
 * first darkness against what is round it. In front of the rack the pins hide
 * parts of it and its circle slides onto its mirror image, so only its centre
 * across the picture is to be trusted (the owner, shot-01: the board at the
 * pins is read just before the ball meets them).
 *
 * With `predict`, the circle is held to the ball's own size and row (2026-11-16:
 * left free, the outline fit grew the circle frame after frame among the
 * pins, to twice the ball on shot-01 and 1.3 times on shot-02, and slid it
 * down onto the mirror image and sideways onto a pin, so the board read off
 * it fell by two while the ball hooked on), and it is found by the ball's own
 * face rather than its darkness against what is round it: in front of the
 * rack that is a white pin on one side and the dark gap between pins on the
 * other, and the darkness match leaned a pixel or more toward the pin. The
 * picture inside 0.8 of a radius on the starting frame is matched (zero-mean
 * correlation, to a quarter pixel) along the column within 0.6 radii and
 * within a sixth of a radius of the row predicted (from the row before); the follow stops when the
 * best match correlates under `MATCH_MIN` (the ball hidden, or among the
 * falling pins).
 */
export function followForward(
  frame: (i: number) => GrayFrame | null,
  from: number,
  start: { cx: number; cy: number; r: number },
  to: number,
  minContrast = 0.6,
  predict?: FollowPrediction
): ReleaseFrame[] {
  const f0 = frame(from);
  if (!f0) return [];
  const rough0 = findDisc(f0, { x: start.cx, y: start.cy }, [0.95, 1, 1.05].map((k) => k * start.r), Math.max(2, 0.3 * start.r));
  if (!rough0) return [];
  if (predict) return followFace(frame, f0, from, start, to, rough0.contrast, predict);
  let d = fitOutline(f0, rough0);
  const out: ReleaseFrame[] = [];
  for (let i = from + 1; i <= to; i++) {
    const f = frame(i);
    if (!f) break;
    const next = findDisc(f, { x: d.cx, y: d.cy }, [0.96, 0.98, 1].map((k) => k * d.r), Math.max(3, 0.6 * d.r));
    if (!next || next.contrast < minContrast * rough0.contrast) break;
    d = fitOutline(f, next);
    out.push({ frame: i, ...d });
  }
  return out;
}

/** The face match must correlate at least this well for the follow to go on. */
export const MATCH_MIN = 0.6;

/** `followForward` with a prediction: the ball's face matched along its predicted row. */
function followFace(
  frame: (i: number) => GrayFrame | null,
  f0: GrayFrame,
  from: number,
  start: { cx: number; cy: number; r: number },
  to: number,
  contrast: number,
  predict: FollowPrediction
): ReleaseFrame[] {
  const offs: [number, number][] = [];
  const R = 0.8 * start.r;
  for (let j = -Math.floor(R); j <= R; j++) for (let i = -Math.floor(R); i <= R; i++) if (Math.hypot(i, j) <= R) offs.push([i, j]);
  const face = offs.map(([i, j]) => sample(f0, start.cx + i, start.cy + j));
  if (offs.length < 9 || face.some((v) => !Number.isFinite(v))) return [];
  const fm = face.reduce((a, b) => a + b, 0) / face.length;
  const fz = face.map((v) => v - fm);
  const fn = Math.sqrt(fz.reduce((a, b) => a + b * b, 0)) || 1;
  const ncc = (f: GrayFrame, x: number, y: number): number => {
    let m = 0;
    const vals = new Array<number>(offs.length);
    for (let k = 0; k < offs.length; k++) {
      const v = sample(f, x + offs[k][0], y + offs[k][1]);
      if (!Number.isFinite(v)) return -1;
      vals[k] = v;
      m += v;
    }
    m /= offs.length;
    let sxy = 0;
    let syy = 0;
    for (let k = 0; k < offs.length; k++) {
      const z = vals[k] - m;
      sxy += z * fz[k];
      syy += z * z;
    }
    return syy > 0 ? sxy / (fn * Math.sqrt(syy)) : -1;
  };
  const out: ReleaseFrame[] = [];
  let cx = start.cx;
  // The row is predicted as a change from where the ball was: how far the
  // last frame's row sat from its prediction is carried on (the prediction's
  // own row can be a pixel or two out where a foot down the lane is one).
  const p0 = predict(from, cx);
  let off = p0 ? start.cy - p0.cy : 0;
  for (let i = from + 1; i <= to; i++) {
    const f = frame(i);
    const p = f ? predict(i, cx) : null;
    if (!f || !p) break;
    const yc = p.cy + off;
    let best = { x: cx, y: yc, c: -Infinity };
    const rx = Math.max(3, 0.6 * p.r);
    const ry = Math.max(1, p.r / 6);
    for (let y = yc - ry; y <= yc + ry + 1e-9; y += 0.25) {
      for (let x = cx - rx; x <= cx + rx + 1e-9; x += 0.25) {
        const c = ncc(f, x, y);
        if (c > best.c) best = { x, y, c };
      }
    }
    if (best.c < MATCH_MIN) break;
    // The face's match carries any offset of the circle it started from;
    // the rim, where it shows, puts the center on the ball itself
    // (`arcFit`, its size known), all the way round: on the dry pin deck its
    // lower rim shows, and against the pit often only that and a side do.
    const a = arcFit(f, p.down ?? { x: 0, y: 1 }, { x: best.x, y: best.y }, p.r, ARC_REACH * p.r, true);
    const at = a && a.support >= ARC_MIN ? { x: a.cx, y: a.cy } : best;
    cx = at.x;
    off = at.y - p.cy;
    out.push({ frame: i, cx: at.x, cy: at.y, r: p.r, contrast: contrast * best.c });
  }
  return out;
}

/** Lane u at the picture column `x` on the lane line `v` feet (board lines run nearly upright at the far end). */
export function uAtColumn(H: Mat3, x: number, v: number): number {
  const l = mapLine(H, [0, 1, -v]);
  const y = -(l[0] * x + l[2]) / l[1];
  return imageToLane(H, { x, y }).u;
}
