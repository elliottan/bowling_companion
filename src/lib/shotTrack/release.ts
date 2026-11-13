import { sample } from "./image";
import { mapLine } from "./homography";
import { imageToLane } from "./laneModel";
import type { GrayFrame, Mat3, Point } from "./types";

/**
 * The laydown as the owner reads it (2026-11-13): the board under the ball's
 * centre in the frame where the ball sits right above the foul line in the
 * picture, in the hand or in the air, not where it lands.
 *
 * The ball is not a sighting before it lands (the hand and the body are on
 * it), so it is followed back from its first sighting by its own darkness: a
 * disc darker than the lane round its lower half and sides (the hand is over
 * its top). Each step back it may move a few radii and grow a little (it is
 * nearer the camera). It is read in the first frame in which it sits on the
 * foul line in the picture: where it comes lowest, at the bottom of the swing
 * by the slide foot, on the foul line straight below its centre. On shot-01
 * its bottom stays on the line's row from frame 72 to 77 as it goes out; the
 * owner reads frame 72 (24 or 25), not 76 (2026-11-13). A ball carried over
 * the line never reaches the row (shot-02, shot-03, shot-05: 14 to 21 pixels
 * short) and is read the same way.
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
  /** Fractional frame at which the ball comes lowest in the picture beside the foul line. */
  at: number;
  /** The ball's bottom is at or below the foul line's row then (rather than short of it). */
  reached: boolean;
  /** Picture point on the foul line straight below the ball's centre then. */
  point: Point;
  /** Lane u there. */
  u: number;
}

/** Mean of the picture over a set of offsets around (x, y); NaN when any falls outside. */
function meanAt(f: GrayFrame, x: number, y: number, offs: Int16Array): number {
  let s = 0;
  const n = offs.length / 2;
  const xi = Math.round(x);
  const yi = Math.round(y);
  for (let k = 0; k < offs.length; k += 2) {
    const px = xi + offs[k];
    const py = yi + offs[k + 1];
    if (px < 0 || py < 0 || px >= f.width || py >= f.height) return NaN;
    s += f.data[py * f.width + px];
  }
  return s / n;
}

const offsetCache = new Map<string, { inner: Int16Array; ring: Int16Array }>();

/** Pixel offsets inside 0.8 r, and in the ring 1.2 r to 1.6 r below and beside the centre (not the top third). */
function offsets(r: number): { inner: Int16Array; ring: Int16Array } {
  const key = r.toFixed(1);
  const known = offsetCache.get(key);
  if (known) return known;
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
  const out = { inner: Int16Array.from(inner), ring: Int16Array.from(ring) };
  offsetCache.set(key, out);
  return out;
}

/** The darkest-against-its-surroundings disc near `near`, with a radius from `radii`. */
export function findDisc(f: GrayFrame, near: Point, radii: number[], reach: number): { cx: number; cy: number; r: number; contrast: number } | null {
  let best: { cx: number; cy: number; r: number; contrast: number } | null = null;
  for (const r of radii) {
    const o = offsets(r);
    for (let y = Math.round(near.y - reach); y <= Math.round(near.y + reach); y++) {
      for (let x = Math.round(near.x - reach); x <= Math.round(near.x + reach); x++) {
        const c = meanAt(f, x, y, o.ring) - meanAt(f, x, y, o.inner);
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
      const dx = Math.cos(a);
      const dy = Math.sin(a);
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
      return read(track[j].frame, cx, track[j].frame - off, gaps[j] >= 0);
    }
  }
  return null;
}
