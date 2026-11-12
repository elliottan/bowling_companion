import type { Handedness } from "../../types/bowling";
import { associate } from "./associate";
import { laneRoi, medianBackground, steady, type Roi } from "./background";
import { findCandidates, refineCircle, type Candidate, type CircleFit } from "./ballDetect";
import { calibrationReport, type CalibrationReport } from "./calibrationCheck";
import { snapEdge, snapMarks, type MarkSnap } from "./edgeSnap";
import { apply, downAt, lineDistance } from "./homography";
import type { Point } from "./types";
import { median, sample } from "./image";
import { BALL_DIAMETER_IN, contactPoint, expectedRadiusPx, homographyFromMarks, imageToLane } from "./laneModel";
import { FTS_TO_MPH, fitMotion, fitPath, metrics, pathU, pinContactFeet, timeAtFeet, type MotionPoint } from "./pathFit";
import { register, type FrameGeometry, type FrameSource, type RegisterOptions } from "./registration";
import type { BallSighting, DistanceSource, GrayFrame, LaneMarks, TrackError, TrackFailure, TrackResult } from "./types";

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
  /** The bowler's rough marks on the calibration frame; snapped here. */
  marks: LaneMarks;
  hand: Handedness;
  distance?: DistanceSource;
  first?: number;
  last?: number;
  /** Distance of the far marked line: the deck end, or 62.6 when marked at the 7 and 10 pin bases. */
  farFeet?: number;
  /**
   * Lines already snapped on another frame and carried here (plan 6.3, a line
   * hidden on the chosen frame): kept as given, not snapped again.
   */
  carried?: (keyof LaneMarks)[];
  /** Registration tuning (band, slack), for clips whose camera moves more. */
  register?: RegisterOptions;
  /** Half-width of the calibration snap, pixels. */
  snapBand?: number;
  onProgress?: (stage: string, fraction: number) => void;
}

export interface TraceDebug {
  snap: MarkSnap;
  geometry: FrameGeometry[];
  first: number;
  roi: Roi | null;
  background: GrayFrame | null;
  candidates: Candidate[];
  associated: Candidate[];
  circles: Map<number, CircleFit>;
  pinEnergy: { frame: number; energy: number }[];
  /** Per sighting, pixels between each predicted edge and its re-snap at the ball's row (null: covered). */
  edgeOffsets: { frame: number; left: number | null; right: number | null }[];
  /** The two speed readings, mph: the event anchors and the fitted slope. */
  speeds?: { anchored: number | null; slope: number };
  calibration: CalibrationReport | null;
  calibH: LaneMarks;
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
  const snap = snapMarks(calibFrame, input.marks, input.snapBand ?? 4);
  for (const k of input.carried ?? []) {
    snap.marks[k] = input.marks[k];
    snap.support[k] = 1;
  }
  const debug: TraceDebug = {
    snap, geometry: [], first, roi: null, background: null, candidates: [], associated: [],
    circles: new Map(), pinEnergy: [], edgeOffsets: [], calibration: null, calibH: snap.marks
  };
  if (snap.support.left < 0.3 || snap.support.right < 0.3) {
    return { result: fail("lane-not-found", `the ${snap.support.left < 0.3 ? "left" : "right"} lane edge could not be followed`), debug };
  }
  const marks = snap.marks;
  const H0 = homographyFromMarks(marks, input.farFeet);

  progress("registration", 0);
  const geometry = register(source, input.calibFrame, marks, first, last, { ...input.register, farFeet: input.farFeet });
  debug.geometry = geometry;
  const usable = geometry.filter((g) => g && g.ok);
  if (usable.length < Math.max(MIN_SIGHTINGS, 0.3 * geometry.length)) {
    return { result: fail("too-shaky", `${usable.length} of ${geometry.length} frames could be steadied`), debug };
  }

  progress("background", 0.3);
  const roi = laneRoi(H0, calibFrame.width, calibFrame.height);
  debug.roi = roi;
  const bgFrames = usable.filter((_, k) => k % 4 === 0).map((g) => steady(source.frame(g.index), g.S, roi));
  const bg = medianBackground(bgFrames);
  debug.background = bg;

  progress("ball", 0.45);
  const cands: Candidate[] = [];
  for (const g of usable) {
    const f = source.frame(g.index);
    cands.push(...findCandidates(steady(f, g.S, roi), bg, roi, g.S, g.H, g.index));
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
    // The board is the ball's place between the two edges as measured in this
    // frame near its row: the registration only predicts where the edges are.
    // A short stretch of each is re-snapped around the prediction; a covered
    // stretch keeps the prediction and the sighting counts for less.
    const local = localEdges(f, g, c, input.farFeet);
    debug.edgeOffsets.push({ frame: c0.frame, left: local.left, right: local.right });
    const gl = { ...g, H: local.H };
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
    const below = imageToLane(gl.H, { x: cp.contact.x, y: cp.contact.y + 0.5 });
    sv.push(Math.abs(below.v - cp.v));
    sightings.push({
      frame: c0.frame, t: f.t, cx: fit.cx, cy: fit.cy, r: fit.r, contact: cp.contact, u: cp.u, v: cp.v, weight: fit.weight * (local.left === null || local.right === null ? 0.5 : 1),
      airborne: false, rExpected, reflection, radiusU: radiusLane.u, radiusV: radiusLane.v
    });
  }
  if (sightings.length < MIN_SIGHTINGS) return { result: fail("ball-not-found", `${sightings.length} circles fitted`), debug };

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
  const seen = sightings.filter((s) => !s.airborne);
  const svOf = new Map(sightings.map((s, k) => [s.frame, sv[k]]));
  const vs = seen.map((s) => s.v);
  if (seen.length < MIN_SIGHTINGS || Math.max(...vs) - Math.min(...vs) < 10) {
    return { result: fail("too-little-seen", `${seen.length} sightings over ${(Math.max(...vs) - Math.min(...vs)).toFixed(1)} ft`), debug };
  }

  progress("path", 0.85);
  const fit = fitPath(seen.map((s) => ({ v: s.v, u: s.u, w: s.weight, sv: svOf.get(s.frame) })));
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
    path: fit.path, hand, seen: vs, touchdown, motion, tFirst, tLast,
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

/**
 * The first frame in which the rack changes sharply (plan 7.6): the pins
 * start to move. The rack is sampled on a grid of points standing on the deck
 * up to pin height, the ball and its reflection are masked out, and each
 * frame is compared with the rack's median before the ball got near.
 */
function localEdges(f: GrayFrame, g: FrameGeometry, c: Point, farFeet?: number): { H: FrameGeometry["H"]; left: number | null; right: number | null } {
  const marks = { ...g.marks };
  const out: { left: number | null; right: number | null } = { left: null, right: null };
  const interior = apply(g.H, { x: 20, y: imageToLane(g.H, c).v });
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
    out[k] = Math.abs(lineDistance(r.line, p));
    marks[k] = r.segment;
  }
  try {
    return { H: homographyFromMarks(marks, farFeet), ...out };
  } catch {
    return { H: g.H, left: null, right: null };
  }
}

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
