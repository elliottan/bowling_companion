import type { Handedness } from "../../types/bowling";
import { associate } from "./associate";
import { laneRoi, medianBackground, steady, type Roi } from "./background";
import { findCandidates, refineCircle, type Candidate, type CircleFit } from "./ballDetect";
import { calibrationReport, type CalibrationReport } from "./calibrationCheck";
import { fitCalibration, focalFromPlane, type CalibrationFit, type CalMark } from "./calibrate";
import { snapEdge, snapMarks, type MarkSnap } from "./edgeSnap";
import { apply, downAt, invert, multiply, normalize } from "./homography";
import type { Point } from "./types";
import { median, sample } from "./image";
import { BALL_DIAMETER_IN, DECK_END_FT, LEFT_U, RIGHT_U, contactPoint, expectedRadiusPx, imageToLane } from "./laneModel";
import { FTS_TO_MPH, fitMotion, fitPath, metrics, pathU, pinContactFeet, timeAtFeet, withoutIslands, type MotionPoint } from "./pathFit";
import { alignTo, laneMarksOf, register, registerPlane, type FrameGeometry, type FrameSource, type RegisterOptions } from "./registration";
import type { BallSighting, DistanceSource, GrayFrame, LaneMarks, Mat3, TrackError, TrackFailure, TrackResult } from "./types";

/**
 * The tracer, stage by stage (plan 5.3): snap the marks, carry them to every
 * frame, find the empty lane, find ball candidates, keep the one physical
 * ball, fit each sighting's circle, fit the path and the distance against
 * time, and read the metrics off them. Pure: frames in, a track out.
 *
 * Boards come from the two lane edges alone. Distances and speed need the
 * cross-lane references (the foul line or the arrows): a bad foul line costs
 * feet, never boards (plan 6.3).
 */

export interface TraceInput {
  source: FrameSource;
  calibFrame: number;
  /**
   * The lane's markings placed on the picture (arrows, pin bases, points on
   * the edges, the foul line, the pin row), each on the calibration frame or
   * on the frame it names: the calibration is the least squares fit to all of
   * them, with every mark's residual reported.
   */
  calMarks?: (CalMark & { frame?: number })[];
  /** Or the plan's four rough lines on the calibration frame, snapped here (the far one at `farFeet`). */
  marks?: LaneMarks;
  hand: Handedness;
  distance?: DistanceSource;
  first?: number;
  last?: number;
  /** With `marks`: distance of the far marked line, the deck end unless given. */
  farFeet?: number;
  /** Registration tuning, for clips whose camera moves more. */
  register?: RegisterOptions;
  /** Half-width of the calibration snap, pixels. */
  snapBand?: number;
  onProgress?: (stage: string, fraction: number) => void;
}

export interface TraceDebug {
  snap: MarkSnap | null;
  /** The calibration's least squares fit, with each mark's residual. */
  fit: CalibrationFit | null;
  /** The marks as fitted, in the calibration frame's pixels (marks from other frames carried). */
  fitMarks: CalMark[];
  geometry: FrameGeometry[];
  first: number;
  roi: Roi | null;
  background: GrayFrame | null;
  /** Per frame, calibration pixels to that frame's as used for differencing (after the second alignment). */
  steady: Map<number, Mat3>;
  candidates: Candidate[];
  associated: Candidate[];
  circles: Map<number, CircleFit>;
  pinEnergy: { frame: number; energy: number }[];
  /**
   * Per sighting, where each gutter edge re-snapped near the ball's row sits
   * against the fitted edge, boards (null: covered or not found).
   */
  edgeOffsets: { frame: number; left: number | null; right: number | null }[];
  /** The two speed readings, mph: the event anchors and the fitted slope. */
  speeds?: { anchored: number | null; slope: number };
  calibration: CalibrationReport | null;
}

export interface TraceOutput {
  result: TrackResult | TrackError;
  debug: TraceDebug;
}

const fail = (failure: TrackFailure, detail: string): TrackError => ({ ok: false, failure, detail });

/** Fewer sightings than this, or a visible stretch shorter than 10 ft, is too little to draw a line (plan 7.7). */
export const MIN_SIGHTINGS = 8;

export function trace(input: TraceInput): TraceOutput {
  const { source, hand } = input;
  const first = input.first ?? 0;
  const last = input.last ?? source.count - 1;
  const progress = input.onProgress ?? (() => {});
  const calibFrame = source.frame(input.calibFrame);
  const debug: TraceDebug = {
    snap: null, fit: null, fitMarks: [], geometry: [], first, roi: null, background: null, steady: new Map(), candidates: [], associated: [],
    circles: new Map(), pinEnergy: [], edgeOffsets: [], calibration: null
  };
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  progress("registration", 0);
  // The picture's transforms first: they carry marks made on other frames.
  const pictures = register(source, input.calibFrame, I, first, last, input.register);
  let marks: CalMark[];
  const carry = (geo: FrameGeometry[]) =>
    input.calMarks!.map((m) => {
      const g = m.frame === undefined || m.frame === input.calibFrame ? null : geo[m.frame - first];
      if (!g) return m;
      const back = invert(g.S);
      return m.kind === "point" ? { ...m, at: apply(back, m.at) } : { ...m, at: m.at.map((p) => apply(back, p)) };
    });
  if (input.calMarks) {
    marks = carry(pictures);
  } else if (input.marks) {
    const snap = snapMarks(calibFrame, input.marks, input.snapBand ?? 4);
    debug.snap = snap;
    if (snap.support.left < 0.3 || snap.support.right < 0.3) {
      return { result: fail("lane-not-found", `the ${snap.support.left < 0.3 ? "left" : "right"} lane edge could not be followed`), debug };
    }
    const m = snap.marks;
    const line = (label: string, axis: "u" | "v", value: number, s: { a: Point; b: Point }): CalMark => ({ kind: "line", label, axis, value, at: [s.a, s.b] });
    marks = [line("left", "u", LEFT_U, m.left), line("right", "u", RIGHT_U, m.right), line("foul", "v", 0, m.foul), line("deck", "v", input.farFeet ?? DECK_END_FT, m.deck)];
  } else {
    return { result: fail("lane-not-found", "no marks"), debug };
  }
  debug.fitMarks = marks;
  let fitted: CalibrationFit;
  try {
    fitted = fitCalibration(marks);
  } catch (e) {
    return { result: fail("lane-not-found", (e as Error).message), debug };
  }
  debug.fit = fitted;
  // A mark more than a board from where the fit puts it says the marks
  // disagree: one is misplaced, or on something that is not what it was
  // called. Refused rather than traced.
  if (fitted.worstBoards > 1) {
    return { result: fail("calibration-off", `a mark sits ${fitted.worstBoards.toFixed(2)} boards from the fit`), debug };
  }
  // The lane's plane, frame by frame (parallax from a camera that travels);
  // marks made on other frames are carried again by it and the fit redone.
  let H0 = fitted.H;
  // The lens's focal length from the lane mapping, where it gives one: a
  // turn's fit at the bottom of the picture depends on it, and the picture's
  // own small turns fix it poorly.
  const focal = focalFromPlane(H0, calibFrame.width, calibFrame.height) ?? undefined;
  const geometry = registerPlane(source, input.calibFrame, H0, pictures, first, { focal });
  if (input.calMarks && input.calMarks.some((m) => m.frame !== undefined && m.frame !== input.calibFrame)) {
    marks = carry(geometry);
    debug.fitMarks = marks;
    try {
      fitted = fitCalibration(marks);
    } catch (e) {
      return { result: fail("lane-not-found", (e as Error).message), debug };
    }
    debug.fit = fitted;
    if (fitted.worstBoards > 1) {
      return { result: fail("calibration-off", `a mark sits ${fitted.worstBoards.toFixed(2)} boards from the fit`), debug };
    }
    H0 = fitted.H;
  }
  for (const g of geometry) {
    if (!g) continue;
    g.H = normalize(multiply(g.S, H0));
    g.marks = laneMarksOf(g.H);
  }
  debug.geometry = geometry;
  const usable = geometry.filter((g) => g && g.ok);
  if (usable.length < Math.max(MIN_SIGHTINGS, 0.3 * geometry.length)) {
    return { result: fail("too-shaky", `${usable.length} of ${geometry.length} frames could be steadied`), debug };
  }

  progress("background", 0.3);
  const roi = laneRoi(H0, calibFrame.width, calibFrame.height);
  debug.roi = roi;
  // The empty lane, then each frame registered on the floor's own plane
  // steadied onto it once more: that registration is good to a pixel or two
  // at the far end, and over the rack
  // (bright pins beside dark gaps) a pixel or two is the whole difference
  // between seeing the ball and seeing the pins' outlines. Each frame's
  // steadied picture is aligned to the empty lane by its own textured
  // patches (`alignTo`); the lane's mapping is not changed by it.
  const bgFrames0 = usable.filter((_, k) => k % 4 === 0).map((g) => steady(source.frame(g.index), g.S, roi));
  const bg0 = medianBackground(bgFrames0);
  const toRoi: Mat3 = [1, 0, roi.x0, 0, 1, roi.y0, 0, 0, 1];
  const fromRoi: Mat3 = [1, 0, -roi.x0, 0, 1, -roi.y0, 0, 0, 1];
  const steadyS = debug.steady;
  for (const g of usable) {
    // Only frames registered on the floor's own homography: a turn is exact
    // for the camera it models, and aligning those adds only noise.
    const R = g.plane ? alignTo(bg0, steady(source.frame(g.index), g.S, roi)) : null;
    steadyS.set(g.index, R ? normalize(multiply(g.S, multiply(toRoi, multiply(R, fromRoi)))) : g.S);
  }
  const bgFrames = usable.filter((_, k) => k % 4 === 0).map((g) => steady(source.frame(g.index), steadyS.get(g.index)!, roi));
  const bg = medianBackground(bgFrames);
  debug.background = bg;

  progress("ball", 0.45);
  const cands: Candidate[] = [];
  for (const g of usable) {
    const f = source.frame(g.index);
    const Sg = steadyS.get(g.index)!;
    cands.push(...findCandidates(steady(f, Sg, roi), bg, roi, Sg, g.H, g.index));
  }
  debug.candidates = cands;
  // A candidate that does not move is background (a reflection, a mark the
  // median missed): one that has company at the same lane spot in two or
  // more frames 0.04 to 0.15 s away, where a rolling ball would have moved a
  // foot or more, is dropped.
  const moving = cands.filter((c) => cands.filter((o) => {
    const dt = Math.abs(o.t - c.t);
    return dt >= 0.04 && dt <= 0.15 && Math.abs(o.v - c.v) < 0.3 && Math.abs(o.u - c.u) < 0.5;
  }).length < 2);
  const chosen = associate(moving);
  debug.associated = chosen;
  if (chosen.length < MIN_SIGHTINGS) return { result: fail("ball-not-found", `${chosen.length} sightings`), debug };

  progress("circles", 0.7);
  const geoOf = (i: number) => geometry[i - first];
  const sightings: BallSighting[] = [];
  const sv: number[] = [];
  for (const c0 of chosen) {
    const g = geoOf(c0.frame);
    const f = source.frame(c0.frame);
    const fit = refineCircle(f, g.H, { x: c0.x, y: c0.y }, c0.r);
    if (!fit) continue;
    debug.circles.set(c0.frame, fit);
    // The contact point (plan 6.4, revised after the sample clips). A glossy
    // ball mirrors the bright lane on its underside, so the dark disc is cut
    // off at the bottom and its fitted radius runs small. The point under the
    // ball is the midpoint of the ball's centre and its mirror image's centre
    // (mirror symmetry in the lane), which needs no radius at all. When the
    // mirror image is not found: the centre plus the radius the lane's width
    // predicts there, along "down", never the dark disc's own radius.
    const c = { x: fit.cx, y: fit.cy };
    // The gutter edges near the ball's row are re-snapped in this frame: not
    // to define the boards (the marks' fit does that) but to track the
    // registration. Their offsets from the fitted edges are corrected for
    // below, once every sighting's are known; a covered stretch counts the
    // sighting for less.
    const local = localEdges(f, g, c);
    debug.edgeOffsets.push({ frame: c0.frame, left: local.left, right: local.right });
    const gl = g;
    let cp = contactPoint(gl.H, c, fit.r);
    const rExpected = expectedRadiusPx(gl.H, cp.u, cp.v);
    cp = contactPoint(gl.H, c, rExpected);
    const radiusLane = { u: cp.u, v: cp.v };
    // Ball size check (plan 6.5): the fitted radius must be near the lane's prediction.
    if (Math.abs(fit.r / rExpected - 1) > 0.35) continue;
    const down = downAt(gl.H, c);
    const refl = refineCircle(f, gl.H, { x: c.x + 2 * rExpected * down.x, y: c.y + 2 * rExpected * down.y }, rExpected, true);
    let reflection: Point | undefined;
    if (refl && refl.weight >= 0.35) {
      const dx = refl.cx - c.x;
      const dy = refl.cy - c.y;
      const along = dx * down.x + dy * down.y;
      const across = Math.abs(dx * down.y - dy * down.x);
      if (along >= 1.6 * rExpected && along <= 4 * rExpected && across < 0.35 * rExpected) {
        reflection = { x: refl.cx, y: refl.cy };
        const mid = { x: (c.x + refl.cx) / 2, y: (c.y + refl.cy) / 2 };
        const lane = imageToLane(gl.H, mid);
        cp = { contact: mid, u: lane.u, v: lane.v };
      }
    }
    // Past the deck end the ball is in the pit, off the lane's plane.
    if (cp.v > DECK_END_FT) continue;
    const below = imageToLane(gl.H, { x: cp.contact.x, y: cp.contact.y + 0.5 });
    sv.push(Math.abs(below.v - cp.v));
    sightings.push({
      frame: c0.frame, t: f.t, cx: fit.cx, cy: fit.cy, r: fit.r, contact: cp.contact, u: cp.u, v: cp.v, weight: fit.weight * (local.left === null || local.right === null ? 0.5 : 1),
      airborne: false, rExpected, reflection, radiusU: radiusLane.u, radiusV: radiusLane.v
    });
  }
  if (sightings.length < MIN_SIGHTINGS) return { result: fail("ball-not-found", `${sightings.length} circles fitted`), debug };
  trackEdges(sightings, debug.edgeOffsets);

  // The ball in the air (plan 7.4). On the lane the ball's centre and its
  // mirror image's are two expected radii apart; in the air, further. The
  // touchdown is the first sighting where they close to that and stay so.
  const sep = (s: BallSighting) =>
    s.reflection && s.rExpected ? Math.hypot(s.reflection.x - s.cx, s.reflection.y - s.cy) / (2 * s.rExpected) : null;
  const onLane = (s: BallSighting) => {
    const k = sep(s);
    return k !== null && (k - 1) * 2 * s.rExpected! < 0.08 * 2 * s.rExpected! + 0.7;
  };
  // Sightings whose mirror image was found are judged by it. The first one
  // that is on the lane, with the next two not contradicting it, is the
  // touchdown by reflection; those before it that were judged are airborne.
  const touch = sightings.findIndex((s, i) => onLane(s) && sightings.slice(i + 1, i + 3).every((n) => sep(n) === null || onLane(n)));
  const judgedUpTo = touch < 0 ? sightings.length : touch;
  for (let i = 0; i < judgedUpTo; i++) if (sep(sightings[i]) !== null && sightings[i].v < 10) sightings[i].airborne = true;
  // The rest before it, with no mirror image found (on the approach, or a dull
  // lane), by the fallback of plan 7.4 step 5: mapped through the contact
  // rule, a ball above the lane appears too far down-lane, so it runs ahead of
  // the distance-against-time fit of the rolling ball.
  const rolling = sightings.filter((s) => s.v >= 8);
  const base = rolling.length >= 6 ? rolling : sightings;
  const m0 = fitMotion(base.map((s) => ({ t: s.t, v: s.v, w: s.weight })));
  const resid = base.map((s) => s.v - (m0.v0 + m0.w * s.t + 0.5 * m0.d * s.t * s.t));
  const sigma = Math.max(0.25, 1.4826 * median(resid.map(Math.abs)));
  for (let i = 0; i < judgedUpTo; i++) {
    const s = sightings[i];
    if (sep(s) !== null) continue;
    const r = s.v - (m0.v0 + m0.w * s.t + 0.5 * m0.d * s.t * s.t);
    if (s.v < 8 && r > Math.max(0.75, 3 * sigma)) s.airborne = true;
    else break;
  }
  const seen = withoutIslands(sightings.filter((s) => !s.airborne));
  const svOf = new Map(sightings.map((s, k) => [s.frame, sv[k]]));
  const vs = seen.map((s) => s.v);
  if (seen.length < MIN_SIGHTINGS || Math.max(...vs) - Math.min(...vs) < 10) {
    return { result: fail("too-little-seen", `${seen.length} sightings over ${(Math.max(...vs) - Math.min(...vs)).toFixed(1)} ft`), debug };
  }

  progress("path", 0.85);
  const pathPts = seen.map((s) => ({ v: s.v, u: s.u, w: s.weight, sv: svOf.get(s.frame), t: s.t }));
  const fit = fitPath(pathPts);
  const touchdown = seen[0].v <= 6 ? seen[0].v : null;

  // Speed: distance against time, anchored at the pins (plan 7.6).
  const motionPts: MotionPoint[] = seen.map((s) => ({ t: s.t, v: s.v, w: s.weight / (1 + (svOf.get(s.frame) ?? 0) ** 2) }));
  let motion = fitMotion(motionPts);
  const contactV = pinContactFeet(fit.path);
  let pinFrame: number | null = null;
  let anchoredSpeed: number | undefined;
  if (contactV !== null) {
    const farT = seen.filter((s) => s.v > 50).map((s) => s.t);
    const found = findPinFrame(source, geometry, motion, fit.path, debug, farT.length ? Math.max(...farT) : -Infinity);
    if (found !== null) {
      pinFrame = found.frame;
      if (touchdown !== null && found.t > seen[0].t) anchoredSpeed = (contactV - seen[0].v) / (found.t - seen[0].t);
      const total = motionPts.reduce((s, p) => s + p.w, 0);
      motion = fitMotion([...motionPts, { t: found.t, v: contactV, w: 0.25 * total }]);
    }
  }

  // The calibration check (plan 6.5): pins in a frame before the ball nears
  // them, arrows on the calibration frame.
  const tPins = timeAtFeet(motion, 35);
  const before = usable.filter((g) => tPins !== null && source.frame(g.index).t <= tPins);
  const pinGeo = before.length ? before[before.length - 1] : null;
  debug.calibration = calibrationReport(
    pinGeo ? source.frame(pinGeo.index) : null, pinGeo?.H ?? null,
    calibFrame, H0
  );

  const tFirst = seen[0].t;
  const tLast = seen[seen.length - 1].t;
  const distance = input.distance ?? "foul";
  const met = metrics({
    path: fit.path, hand, seen: vs, points: pathPts, touchdown, motion, tFirst, tLast,
    // Measured only from the two sharp events; where the bowler hides the
    // touchdown or the rack, the fit's speed is shown as estimated.
    speedMeasured: distance !== "default" && anchoredSpeed !== undefined,
    anchoredSpeed
  });
  const vAt = (t: number) => motion.v0 + motion.w * t + 0.5 * motion.d * t * t;
  debug.speeds = {
    anchored: anchoredSpeed !== undefined ? anchoredSpeed * FTS_TO_MPH : null,
    slope: ((vAt(tLast) - vAt(tFirst)) / (tLast - tFirst)) * FTS_TO_MPH
  };
  progress("done", 1);
  return {
    result: {
      ok: true, hand, sightings, path: fit.path, from: Math.min(...vs), to: Math.max(...vs), rms: fit.rms,
      metrics: met, motion, touchdownFrame: touchdown !== null ? seen[0].frame : null, pinFrame
    },
    debug
  };
}

/** Each gutter edge re-snapped on a short stretch around the ball's row, as lane u against the fitted edge. */
function localEdges(f: GrayFrame, g: FrameGeometry, c: Point): { left: number | null; right: number | null } {
  const out: { left: number | null; right: number | null } = { left: null, right: null };
  const v = imageToLane(g.H, c).v;
  const interior = apply(g.H, { x: 20, y: v });
  for (const k of ["left", "right"] as const) {
    const sgm = g.marks[k];
    const dx = sgm.b.x - sgm.a.x;
    const dy = sgm.b.y - sgm.a.y;
    if (Math.abs(dy) < 1e-6) continue;
    const t = (c.y - sgm.a.y) / dy;
    const p = { x: sgm.a.x + t * dx, y: c.y };
    const len = Math.hypot(dx, dy);
    const half = 45 / len;
    const stretch = { a: { x: p.x - half * dx, y: p.y - half * dy }, b: { x: p.x + half * dx, y: p.y + half * dy } };
    const r = snapEdge(f, stretch, { band: 3, interior, sign: "rising", minSupport: 0.4 });
    if (!r.ok) continue;
    // Where the re-snapped edge crosses the ball's row, in lane u, against the fitted edge.
    const l = r.line;
    if (Math.abs(l[0]) < 1e-9) continue;
    const x = -(l[1] * c.y + l[2]) / l[0];
    out[k] = imageToLane(g.H, { x, y: c.y }).u - (k === "left" ? LEFT_U : RIGHT_U);
  }
  return out;
}

/**
 * The tracking correction. Each gutter edge sits a steady amount from the
 * fitted edge (that is the gutter, not the registration: its median over the
 * clip); what moves from frame to frame about that is the registration's
 * error, common to the whole lane at that row, and is taken off the ball's
 * board. Offsets more than a board from their median are a failed snap and
 * are ignored.
 */
export function trackEdges(sightings: BallSighting[], offsets: { frame: number; left: number | null; right: number | null }[]): void {
  const med = (k: "left" | "right") => {
    const xs = offsets.map((o) => o[k]).filter((x): x is number => x !== null);
    return xs.length >= 3 ? median(xs) : null;
  };
  const m = { left: med("left"), right: med("right") };
  const byFrame = new Map(offsets.map((o) => [o.frame, o]));
  for (const s of sightings) {
    const o = byFrame.get(s.frame);
    const dev: number[] = [];
    for (const k of ["left", "right"] as const) {
      const x = o?.[k];
      const mk = m[k];
      if (x !== null && x !== undefined && mk !== null && Math.abs(x - mk) <= 1) dev.push(x - mk);
    }
    if (!dev.length) continue;
    s.u -= dev.reduce((a, b) => a + b, 0) / dev.length;
  }
}

/**
 * The first frame in which the rack changes sharply (plan 7.6): the pins
 * start to move. The rack is sampled on a grid of points standing on the deck
 * up to pin height, the ball and its reflection are masked out, and each
 * frame is compared with the rack's median before the ball got near.
 */
function findPinFrame(
  source: FrameSource,
  geometry: FrameGeometry[],
  motion: { v0: number; w: number; d: number },
  path: Parameters<typeof pathU>[0],
  debug: TraceDebug,
  notBefore: number
): { frame: number; t: number } | null {
  const vAt = (t: number) => motion.v0 + motion.w * t + 0.5 * motion.d * t * t;
  const rows = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
  const grid: { u: number; v: number; up: number }[] = [];
  for (const v of [60.2, 61.2, 62.2]) for (let u = 1; u <= 39; u += 0.5) for (const up of rows) grid.push({ u, v, up });
  const samples: { frame: number; t: number; v: number; vals: Float32Array }[] = [];
  for (const g of geometry) {
    if (!g || !g.ok) continue;
    const f = source.frame(g.index);
    const vb = vAt(f.t);
    if (vb < 20) continue;
    const r = expectedRadiusPx(g.H, 20, 60);
    const pinH = (15 / BALL_DIAMETER_IN) * 2 * r;
    const bu = pathU(path, Math.min(vb, 62.8));
    const ballContact = apply(g.H, { x: bu, y: Math.min(vb, 62.8) });
    const down = downAt(g.H, ballContact);
    const ballC = { x: ballContact.x - r * down.x, y: ballContact.y - r * down.y };
    const reflC = { x: ballContact.x + r * down.x, y: ballContact.y + r * down.y };
    const vals = new Float32Array(grid.length);
    grid.forEach((p, k) => {
      const base = apply(g.H, { x: p.u, y: p.v });
      const q = { x: base.x - p.up * pinH * down.x, y: base.y - p.up * pinH * down.y };
      const near = Math.hypot(q.x - ballC.x, q.y - ballC.y) < 1.8 * r || Math.hypot(q.x - reflC.x, q.y - reflC.y) < 1.8 * r;
      vals[k] = near ? NaN : sample(f, q.x, q.y);
    });
    samples.push({ frame: g.index, t: f.t, v: vb, vals });
  }
  const refs = samples.filter((s) => s.v < 45);
  if (refs.length < 3) return null;
  const ref = new Float32Array(grid.length);
  for (let k = 0; k < grid.length; k++) ref[k] = median(refs.map((s) => s.vals[k]));
  const energy = (s: (typeof samples)[number]) => {
    let e = 0;
    let n = 0;
    for (let k = 0; k < grid.length; k++) {
      const d = Math.abs(s.vals[k] - ref[k]);
      if (Number.isFinite(d)) {
        e += d;
        n++;
      }
    }
    return n ? e / n : NaN;
  };
  const base = refs.map(energy);
  const mid = median(base);
  const spread = 1.4826 * median(base.map((e) => Math.abs(e - mid)));
  const thr = mid + Math.max(6, 6 * spread);
  for (const s of samples) {
    const e = energy(s);
    debug.pinEnergy.push({ frame: s.frame, energy: e });
  }
  // The pins cannot move while the ball is still seen short of them.
  const hit = samples.find((s, k) => s.v > 50 && s.t > notBefore && debug.pinEnergy[k].energy > thr);
  if (!hit) return null;
  // The pins moved during the interval before this frame: take its middle.
  const k = samples.indexOf(hit);
  const prevT = k > 0 ? samples[k - 1].t : hit.t;
  return { frame: hit.frame, t: (hit.t + prevT) / 2 };
}
