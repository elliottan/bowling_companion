import { snapEdge } from "./edgeSnap";
import { apply, intersect, lineDistance, multiply, segmentLine, similarityFrom, similarityParts, invert } from "./homography";
import { downsample } from "./image";
import { homographyFromMarks, markCorners } from "./laneModel";
import type { GrayFrame, LaneMarks, Mat3, Point, Segment } from "./types";

/**
 * Carry the calibration from the marked frame to every other frame (plan 7.3).
 *
 * Assumption, stated because everything here rests on it: the person filming
 * turns and zooms the camera but does not walk. Between two frames the picture
 * then changes by close to a similarity (shift, rotation, scale), and the lane
 * is found again in each frame by re-snapping its two edges and the deck end
 * in a narrow band around where the last frame put them. The two far corners
 * (each edge meeting the deck end) give the similarity exactly; they are used
 * because the bowler never covers them after the release and they sit where
 * precision matters most.
 */

export interface FrameSource {
  count: number;
  frame(i: number): GrayFrame;
}

export interface FrameGeometry {
  index: number;
  ok: boolean;
  reason?: "lane-lost" | "jump";
  /** Calibration frame pixels to this frame's pixels. */
  S: Mat3;
  /** The lane lines as found in this frame (the foul line carried by S). */
  marks: LaneMarks;
  /** Lane (u, v) to this frame's pixels. */
  H: Mat3;
  support: { left: number; right: number; deck: number };
  /** Lines that kept their prediction in this frame. */
  predicted?: (keyof LaneMarks)[];
}

export interface RegisterOptions {
  /** Search band either side of the predicted line, pixels. */
  band?: number;
  /** R4: the largest change between consecutive frames, a fraction of the picture. */
  maxJump?: number;
  /** Below this fraction of steps agreeing, an edge is lost in that frame. */
  minSupport?: number;
  /** How far a re-snapped line may land from its prediction, pixels. */
  slack?: number;
  /** Distance of the far marked line, feet (the deck end unless marked at the back row). */
  farFeet?: number;
}

function sad(a: GrayFrame, b: GrayFrame, dx: number, dy: number, x0: number, x1: number, y0: number, y1: number, stride: number): number {
  let s = 0;
  let n = 0;
  for (let y = y0; y < y1; y += stride) {
    const yb = y + dy;
    if (yb < 0 || yb >= b.height) continue;
    for (let x = x0; x < x1; x += stride) {
      const xb = x + dx;
      if (xb < 0 || xb >= b.width) continue;
      s += Math.abs(a.data[y * a.width + x] - b.data[yb * b.width + xb]);
      n++;
    }
  }
  return n ? s / n : Infinity;
}

function bestShift(a: GrayFrame, b: GrayFrame, cx: number, cy: number, r: number, box: [number, number, number, number], stride: number) {
  let best = { dx: cx, dy: cy, e: Infinity };
  const grid = new Map<string, number>();
  for (let dy = cy - r; dy <= cy + r; dy++) {
    for (let dx = cx - r; dx <= cx + r; dx++) {
      const e = sad(a, b, dx, dy, box[0], box[1], box[2], box[3], stride);
      grid.set(`${dx},${dy}`, e);
      if (e < best.e) best = { dx, dy, e };
    }
  }
  return { ...best, grid };
}

/**
 * The shift of the picture from `a` to `b`, by block matching the top third
 * (the ceiling and the masking units: static, textured, and above the bowler),
 * coarse at a quarter of the resolution and then at full resolution, with a
 * parabola for the sub-pixel part (plan 7.1).
 */
export function globalShift(a: GrayFrame, b: GrayFrame, range = 40): Point {
  const qa = downsample(a, 4);
  const qb = downsample(b, 4);
  const qbox: [number, number, number, number] = [Math.round(qa.width * 0.1), Math.round(qa.width * 0.9), 2, Math.round(qa.height / 3)];
  const coarse = bestShift(qa, qb, 0, 0, Math.ceil(range / 4), qbox, 1);
  const box: [number, number, number, number] = [Math.round(a.width * 0.1), Math.round(a.width * 0.9), 8, Math.round(a.height / 3)];
  const fine = bestShift(a, b, coarse.dx * 4, coarse.dy * 4, 4, box, 3);
  const e = (dx: number, dy: number) => fine.grid.get(`${dx},${dy}`) ?? fine.e;
  const sub = (l: number, m: number, r: number) => {
    const den = l - 2 * m + r;
    return den > 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
  };
  return {
    x: fine.dx + sub(e(fine.dx - 1, fine.dy), fine.e, e(fine.dx + 1, fine.dy)),
    y: fine.dy + sub(e(fine.dx, fine.dy - 1), fine.e, e(fine.dx, fine.dy + 1))
  };
}

function mapSegment(M: Mat3, s: Segment): Segment {
  return { a: apply(M, s.a), b: apply(M, s.b) };
}

function shiftSegment(s: Segment, d: Point): Segment {
  return { a: { x: s.a.x + d.x, y: s.a.y + d.y }, b: { x: s.b.x + d.x, y: s.b.y + d.y } };
}

function farCorners(m: LaneMarks): [Point, Point] | null {
  const D = segmentLine(m.deck);
  const l = intersect(segmentLine(m.left), D);
  const r = intersect(segmentLine(m.right), D);
  return l && r ? [l, r] : null;
}

/** The lane in one frame, found again from a prediction of its lines. */
export function relocate(
  f: GrayFrame,
  index: number,
  calib: LaneMarks,
  predicted: LaneMarks,
  opts: RegisterOptions = {}
): FrameGeometry {
  const band = opts.band ?? 4;
  const minSupport = opts.minSupport ?? 0.15;
  const c = markCorners(predicted);
  const interior = c ? { x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4, y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4 } : predicted.foul.a;
  // An edge must land within `slack` pixels of where the picture's shift put
  // it. When the bowler covers most of one edge, that edge keeps its
  // prediction (shift only) and the frame stays usable through the other.
  const slack = opts.slack ?? 2;
  const follow = (seg: Segment, sign: "rising" | "auto" = "rising") => {
    const r = snapEdge(f, seg, { band, interior, sign, minSupport });
    const off = Math.max(Math.abs(lineDistance(r.line, seg.a)), Math.abs(lineDistance(r.line, seg.b)));
    return r.ok && off <= slack ? r : { ...r, ok: false, segment: seg };
  };
  const left = follow(predicted.left);
  const right = follow(predicted.right);
  // Pins stand on the far line and flying pins cross it, so when its snap
  // fails it keeps its prediction (the shift from the last good frame).
  let deck = follow(predicted.deck, "auto");
  if (!deck.ok) deck = { ...deck, segment: predicted.deck };
  const support = { left: left.support, right: right.support, deck: deck.support };
  const marks: LaneMarks = { left: left.segment, right: right.segment, deck: deck.segment, foul: predicted.foul };
  const far0 = farCorners(calib);
  const far1 = farCorners(marks);
  if ((!left.ok && !right.ok) || !far0 || !far1) {
    return { index, ok: false, reason: "lane-lost", S: predictionOf(calib, predicted), marks: predicted, H: homographyFromMarks(predicted, opts.farFeet), support };
  }
  const S = similarityFrom(far0[0], far0[1], far1[0], far1[1]);
  marks.foul = mapSegment(S, calib.foul);
  const kept = (["left", "right", "deck"] as const).filter((k) => !({ left, right, deck })[k].ok);
  return { index, ok: true, S, marks, H: homographyFromMarks(marks, opts.farFeet), support, predicted: kept.length ? [...kept] : undefined };
}

/** The similarity implied by a prediction, from its far corners. */
function predictionOf(calib: LaneMarks, predicted: LaneMarks): Mat3 {
  const a = farCorners(calib)!;
  const b = farCorners(predicted)!;
  return similarityFrom(a[0], a[1], b[0], b[1]);
}

function jumped(prev: Mat3, next: Mat3, w: number, h: number, maxJump: number): boolean {
  const d = similarityParts(multiply(next, invert(prev)));
  const size = Math.max(w, h);
  return Math.hypot(d.tx, d.ty) > maxJump * size || Math.abs(d.scale - 1) > maxJump || Math.abs(d.angle) > maxJump;
}

/**
 * Geometry for every frame in [first, last]. Walks outward from the
 * calibration frame, predicting each frame from the last good one plus the
 * picture's shift. A frame whose edges cannot be followed, or whose change from
 * the last good frame is beyond R4, is marked unusable: its sighting is
 * dropped and the track has a gap there.
 */
export function register(
  source: FrameSource,
  calibFrame: number,
  calib: LaneMarks,
  first: number,
  last: number,
  opts: RegisterOptions = {}
): FrameGeometry[] {
  const maxJump = opts.maxJump ?? 0.05;
  const out: FrameGeometry[] = [];
  const base = relocate(source.frame(calibFrame), calibFrame, calib, calib, opts);
  const start: FrameGeometry = { ...base, ok: true, reason: undefined, S: [1, 0, 0, 0, 1, 0, 0, 0, 1], marks: calib, H: homographyFromMarks(calib, opts.farFeet) };
  out[calibFrame - first] = start;
  for (const dir of [1, -1]) {
    let good = start;
    let drift: Point = { x: 0, y: 0 };
    for (let i = calibFrame + dir; i >= first && i <= last; i += dir) {
      const f = source.frame(i);
      const g = globalShift(source.frame(i - dir), f);
      drift = { x: drift.x + g.x, y: drift.y + g.y };
      const w = f.width;
      const h = f.height;
      const tooFast = Math.hypot(g.x, g.y) > maxJump * Math.max(w, h);
      const predicted: LaneMarks = {
        left: shiftSegment(good.marks.left, drift),
        right: shiftSegment(good.marks.right, drift),
        deck: shiftSegment(good.marks.deck, drift),
        foul: shiftSegment(good.marks.foul, drift)
      };
      let geo = relocate(f, i, calib, predicted, opts);
      if (geo.ok && (tooFast || jumped(good.S, geo.S, w, h, maxJump))) geo = { ...geo, ok: false, reason: "jump" };
      out[i - first] = geo;
      if (geo.ok) {
        good = geo;
        drift = { x: 0, y: 0 };
      }
    }
  }
  return out;
}
