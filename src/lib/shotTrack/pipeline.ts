import type { Handedness } from "../../types/bowling";
import { associate } from "./associate";
import { laneRoi, medianBackground, steady, type Background, type Roi } from "./background";
import { gridFrames, readStep } from "./framePick";
import { carryFace, findCandidates, refineCircle, type Candidate, type CircleFit } from "./ballDetect";
import { calibrationReport, type CalibrationReport } from "./calibrationCheck";
import { fitCalibration, focalFromPlane, type CalibrationFit, type CalMark } from "./calibrate";
import { snapEdge, snapMarks, type MarkSnap } from "./edgeSnap";
import { apply, downAt, invert, multiply, normalize } from "./homography";
import type { Point } from "./types";
import { median } from "./image";
import { CONTACT_IN, DECK_END_FT, LEFT_U, RIGHT_U, contactPoint, expectedRadiusPx, imageToLane, laneU } from "./laneModel";
import { FTS_TO_MPH, fitMotion, fitPath, handedMetrics, pathU, pinContactFeet, timeAtFeet, withoutIslands, type MotionPoint, type ReadOff } from "./pathFit";
import { bodyAtRelease, decideHand, driftCue, hookCue, pinsCue, releaseCue, type HandCue, type HandFound } from "./handFind";
import { laneTrack, type FrameLane, type LaneTrack, type LaneTrackOptions } from "./laneTrack";
import { atFoulLineTime, followForward, overFoulLine, uAtColumn, type FollowPrediction, type OverFoulLine, type ReleaseFrame } from "./release";
import { followNear, nearSeeds } from "./nearFollow";
import { firstPinMove, pinScores, pinsInReach, type PinFrame } from "./pinMove";
import { alignTo, finishRegister, laneMarksOf, passFrames, PlanePass, planeSlots, RegisterPass, type FrameGeometry, type FrameSource, type Matches, type PlaneOptions, type RegisterOptions } from "./registration";
import type { BallSighting, DistanceSource, GrayFrame, LaneMarks, Mat3, Metric, PathModel, TrackError, TrackFailure, TrackMetrics, TrackResult } from "./types";

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
  /**
   * Or the lane as found on many frames of the clip (`findLanes`), each on its
   * own frame: every frame then takes its lane from the found frames near it,
   * carried by registration over a few frames only (`laneTrack`), and
   * `calibFrame` is only the frame the pictures are registered to.
   */
  lanes?: FrameLane[];
  /** With `lanes`: how the found lanes are blended. */
  laneTrack?: LaneTrackOptions;
  /** The app's handedness setting: the boards are counted from this hand's gutter, unless `handFromVideo` and the video says otherwise. */
  hand: Handedness;
  /** Read the bowler's hand from the video (`handFind.ts`), `hand` kept only where it cannot tell. */
  handFromVideo?: boolean;
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
  /** The lane mapping on the calibration frame as traced (the fit's, or the found lanes' blend there). */
  H0: Mat3 | null;
  /** With `lanes`: the found lanes kept, and those dropped as disagreeing with the rest. */
  lanes?: Omit<LaneTrack, "H">;
  geometry: FrameGeometry[];
  first: number;
  roi: Roi | null;
  background: GrayFrame | null;
  /** Per frame, calibration pixels to that frame's as used for differencing (after the second alignment). */
  steady: Map<number, Mat3>;
  candidates: Candidate[];
  associated: Candidate[];
  circles: Map<number, CircleFit>;
  /** Per frame near the pins, the largest share of a reachable pin's points that changed (`pinScores`). */
  pinEnergy: { frame: number; energy: number }[];
  /**
   * Per sighting, where each gutter edge re-snapped near the ball's row sits
   * against the fitted edge, boards (null: covered or not found).
   */
  edgeOffsets: { frame: number; left: number | null; right: number | null }[];
  /** The two speed readings, mph: the event anchors and the fitted slope. */
  speeds?: { anchored: number | null; slope: number };
  calibration: CalibrationReport | null;
  /** The ball followed back to where it sits right above the foul line (the laydown), when it could be. */
  release?: OverFoulLine | null;
  /** The ball followed by its darkness from its last sighting to the last frame before it touches a pin. */
  toPins?: ReleaseFrame[];
  /** Where the board at the pins was read from the follow: the frame it is read on, lane u, and the frames the line through the boards used. */
  pinsRead?: { frame: number; u: number; frames: number[] };
  /** The ball followed by its darkness over the near lane, when the empty lane did not show it (`followNear`). */
  nearFollow?: Candidate[];
  /** Seen over the near lane only (`NEAR_FROM_FT`, `NEAR_SPAN_FT`): the far readings are left missing. */
  nearOnly?: boolean;
  /** The bowler's hand as the video shows it (`handFind.ts`), whether or not it was used. */
  hand?: HandFound;
}

export interface TraceOutput {
  result: TrackResult | TrackError;
  debug: TraceDebug;
}

const fail = (failure: TrackFailure, detail: string): TrackError => ({ ok: false, failure, detail });

/** Fewer sightings than this, or a visible stretch shorter than 10 ft, is too little to draw a line (plan 7.7). */
export const MIN_SIGHTINGS = 8;
/** A visible stretch this long, feet, is enough to read the whole lane by. */
export const MIN_SPAN_FT = 10;
/**
 * Shorter than `MIN_SPAN_FT`, a stretch that starts within this many feet of
 * the foul line and runs at least `NEAR_SPAN_FT` still gives the near
 * readings (laydown, touchdown, the arrows as estimated); the far ones are
 * left missing rather than the whole trace refused (shot-04: the bowler hides
 * the ball from 12 ft on).
 */
export const NEAR_FROM_FT = 8;
/** A circle fit is clean when its radius was free and this share of its rays found the rim on it (`refineCircle`'s weight). */
export const CLEAN_WEIGHT = 0.8;
/** A clean sighting's face is carried to frames at most this many after it... */
export const CARRY_FRAMES = 6;
/** ...and looked for within this share of a radius of where the fit put the ball. */
export const CARRY_REACH = 0.4;
/** A fixed-radius circle with fewer than this share of its rays on the rim is cast again from where the ball is expected (`predictCenter`). */
export const WEAK_RIM = 0.35;

/**
 * Where the ball's center is expected on `frame`: a straight line in the
 * picture through the last circles placed within `PREDICT_FRAMES` before it
 * (three at least), run on to it. Null with fewer.
 */
export function predictCenter(placed: { frame: number; x: number; y: number }[], frame: number): Point | null {
  const near = placed.filter((p) => p.frame < frame && frame - p.frame <= PREDICT_FRAMES).slice(-4);
  if (near.length < 3) return null;
  const fs = near.map((p) => p.frame);
  return { x: lineAt(fs, near.map((p) => p.x), frame), y: lineAt(fs, near.map((p) => p.y), frame) };
}

/** How far back the circles `predictCenter` runs on from may be, frames. */
export const PREDICT_FRAMES = 8;

/** The pins are watched for the first one to move from when the ball is this many feet short of where it meets one. */
export const PIN_LEAD_FT = 1.5;
export const NEAR_SPAN_FT = 5;

export function trace(input: TraceInput): TraceOutput {
  const steps = traceSteps(input);
  let next = steps.next();
  while (!next.done) next = steps.next(next.value.map((job) => runTraceJob(job, input.source, input.onProgress)));
  return next.value;
}

/**
 * The tracer's work that runs frame by frame, or pass by pass, as jobs: each
 * a pure function of what it carries and the frames it names
 * (`runTraceJob`), so the jobs of one batch can run side by side in workers
 * and give what one thread gives, bit for bit.
 */
export type TraceJob =
  /** One direction of the picture's registration (`RegisterPass`), over `frames` in order. */
  | { kind: "register"; calibFrame: number; frames: number[]; opts: RegisterOptions }
  /** One direction of the floor's registration (`PlanePass`): each of `geos` in order. */
  | { kind: "plane"; calibFrame: number; H0: Mat3; geos: FrameGeometry[]; opts: PlaneOptions }
  /** A frame's lane region steadied onto the calibration frame (`steady`). */
  | { kind: "steady"; index: number; S: Mat3; roi: Roi }
  /** The per-pixel median and spread of steadied frames (`medianBackground`); any band of rows on its own gives the same. */
  | { kind: "median"; frames: GrayFrame[] }
  /**
   * A frame steadied onto the empty lane (`align` in `traceSteps`), and with
   * `bg` its ball candidates on it (`findCandidates`). `picture` is the
   * frame's region already steadied by `S`, when at hand.
   */
  | { kind: "align"; index: number; S: Mat3; H: Mat3; plane: boolean; roi: Roi; bg0: GrayFrame; bg?: Background; picture?: GrayFrame }
  /** Everything after the candidates (`traceTail`): the ball's sightings, path and readings. */
  | { kind: "tail"; state: TailState };

/** What an `align` job gives: the frame's transform onto the empty lane, the frame steadied by it, and its candidates when asked. */
export interface Aligned {
  S: Mat3;
  steadied: GrayFrame;
  candidates?: Candidate[];
}

/** What the tracer has by the time it has every frame's candidates: `traceTail` reads the ball from it. */
export interface TailState {
  hand: Handedness;
  handFromVideo?: boolean;
  distance?: DistanceSource;
  first: number;
  last: number;
  calibFrame: number;
  H0: Mat3;
  geometry: FrameGeometry[];
  cands: Candidate[];
  debug: TraceDebug;
}

/** One job of `traceSteps`, run on `source`'s frames. */
export function runTraceJob(job: TraceJob, source: FrameSource, onProgress?: (stage: string, fraction: number) => void): unknown {
  switch (job.kind) {
    case "register":
    case "plane": {
      const pass = passOf(job);
      for (const i of pass.frames) pass.feed(source.frame(i));
      return pass.result();
    }
    case "steady":
      return steady(source.frame(job.index), job.S, job.roi);
    case "median":
      return medianBackground(job.frames);
    case "align":
      return alignFrame(job, source);
    case "tail":
      return traceTail(job.state, source, onProgress ?? (() => {}));
  }
}

/**
 * A `register` or `plane` job as a pass fed a frame at a time: `frames` is
 * the order it wants them in (the calibration frame first), so a worker can
 * be sent them one by one rather than all at once.
 */
export function passOf(job: Extract<TraceJob, { kind: "register" | "plane" }>): { frames: number[]; feed: (f: GrayFrame) => void; result: () => unknown } {
  const frames = [job.calibFrame, ...(job.kind === "register" ? job.frames : job.geos.map((g) => g.index))];
  const out: unknown[] = [];
  let reg: RegisterPass | null = null;
  let plane: PlanePass | null = null;
  let k = 0;
  return {
    frames,
    feed(f) {
      if (k === 0) {
        if (job.kind === "register") reg = new RegisterPass(f, job.opts);
        else plane = new PlanePass(f, job.H0, job.opts);
      } else if (job.kind === "register") out.push(reg!.step(frames[k], f));
      else out.push(plane!.step(job.geos[k - 1], f));
      k++;
    },
    result: () => (job.kind === "register" ? ({ matches: out as Matches[], patches: reg!.patchCount } satisfies RegisterPassResult) : out)
  };
}

/** What a `register` job gives: the pass's matches, and how many patches each frame was matched by. */
export interface RegisterPassResult {
  matches: Matches[];
  patches: number;
}

/**
 * A frame steadied onto the empty lane `bg0`: its transform, and its picture
 * through it (the picture it was aligned on, when the alignment left the
 * transform as it was); with `bg`, its ball candidates.
 */
export function alignFrame(job: Extract<TraceJob, { kind: "align" }>, source: FrameSource): Aligned {
  const { roi } = job;
  const toRoi: Mat3 = [1, 0, roi.x0, 0, 1, roi.y0, 0, 0, 1];
  const fromRoi: Mat3 = [1, 0, -roi.x0, 0, 1, -roi.y0, 0, 0, 1];
  const frame = source.frame(job.index);
  const picture = job.picture ?? steady(frame, job.S, roi);
  let out: Aligned = { S: job.S, steadied: picture };
  // Only frames registered on the floor's own homography: a turn is exact
  // for the camera it models, and aligning those adds only noise.
  if (job.plane) {
    const R = alignTo(job.bg0, picture);
    if (R) {
      const S = normalize(multiply(job.S, multiply(toRoi, multiply(R, fromRoi))));
      out = { S, steadied: steady(frame, S, roi) };
    }
  }
  if (job.bg) out.candidates = findCandidates(out.steadied, job.bg, roi, out.S, job.H, job.index);
  return out;
}

/**
 * The tracer as batches of jobs (`TraceJob`): each `yield` hands out jobs
 * that do not depend on one another and takes their results back in the same
 * order. `trace` runs them one after another; a pool of workers can run each
 * batch side by side.
 */
export function* traceSteps(input: TraceInput): Generator<TraceJob[], TraceOutput, unknown[]> {
  const { source } = input;
  const first = input.first ?? 0;
  const last = input.last ?? source.count - 1;
  const progress = input.onProgress ?? (() => {});
  const calibFrame = source.frame(input.calibFrame);
  const debug: TraceDebug = {
    snap: null, fit: null, fitMarks: [], H0: null, geometry: [], first, roi: null, background: null, steady: new Map(), candidates: [], associated: [],
    circles: new Map(), pinEnergy: [], edgeOffsets: [], calibration: null
  };
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  progress("registration", 0);
  // The picture's transforms first: they carry marks made on other frames.
  // Forward and back from the calibration frame, the two passes side by side.
  // The lens's focal length from the lane found on the calibration frame,
  // where it gives one, as the floor's registration takes it: fitted to the
  // frames that turned most, it changed with which frames the read had
  // (shot-03 read from 0.33 s and from 0.67 s: every frame's lane a little
  // apart, and the far sightings with it).
  const ownLane = !input.calMarks && !input.marks ? input.lanes?.find((l) => l.frame === input.calibFrame && l.H.every(Number.isFinite)) : undefined;
  const laneFocal = ownLane ? focalFromPlane(ownLane.H, calibFrame.width, calibFrame.height) : null;
  const regOpts: RegisterOptions = input.register?.focal === undefined && laneFocal ? { ...input.register, focal: laneFocal } : (input.register ?? {});
  const [ahead, behind] = (yield ([1, -1] as const).map((dir) => ({
    kind: "register" as const, calibFrame: input.calibFrame, frames: passFrames(input.calibFrame, dir, first, last), opts: regOpts
  }))) as RegisterPassResult[];
  const pictures = finishRegister(calibFrame, input.calibFrame, I, first, ahead.matches, behind.matches, ahead.patches, regOpts);
  let marks: CalMark[] = [];
  const carry = (geo: FrameGeometry[]) =>
    input.calMarks!.map((m) => {
      const g = m.frame === undefined || m.frame === input.calibFrame ? null : geo[m.frame - first];
      if (!g) return m;
      const back = invert(g.S);
      return m.kind === "point" ? { ...m, at: apply(back, m.at) } : { ...m, at: m.at.map((p) => apply(back, p)) };
    });
  const lanes = !input.calMarks && !input.marks && input.lanes?.length ? input.lanes.filter((l) => l.frame >= first && l.frame <= last) : null;
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
  } else if (!lanes?.length) {
    return { result: fail("lane-not-found", "no marks"), debug };
  }
  // The picture's transform from one frame's pixels to another's, over a registration.
  const carryOn = (geo: FrameGeometry[]) => (from: number, to: number): Mat3 | null => {
    const a = from === input.calibFrame ? null : geo[from - first];
    const b = to === input.calibFrame ? null : geo[to - first];
    if ((from !== input.calibFrame && !a?.ok) || (to !== input.calibFrame && !b?.ok)) return null;
    return normalize(multiply(b ? b.S : I, a ? invert(a.S) : I));
  };
  let H0: Mat3;
  let fitted: CalibrationFit | null = null;
  if (lanes) {
    // A first lane on the calibration frame from the picture's turns, for the
    // floor's own registration to find the floor by.
    const first0 = laneTrack(lanes, carryOn(pictures), [input.calibFrame], input.laneTrack).H.get(input.calibFrame);
    if (!first0) return { result: fail("lane-not-found", "no found lane could be carried to the calibration frame"), debug };
    H0 = first0;
  } else {
    debug.fitMarks = marks;
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
    H0 = fitted.H;
  }
  // The lane's plane, frame by frame (parallax from a camera that travels);
  // marks made on other frames are carried again by it and the fit redone.
  // The lens's focal length from the lane mapping, where it gives one: a
  // turn's fit at the bottom of the picture depends on it, and the picture's
  // own small turns fix it poorly.
  const focal = focalFromPlane(H0, calibFrame.width, calibFrame.height) ?? undefined;
  const geometry: FrameGeometry[] = pictures.map((g) => ({ ...g }));
  {
    // Forward and back again, side by side (`registerPlane`).
    const slots = ([1, -1] as const).map((dir) => planeSlots(input.calibFrame, dir, first, pictures));
    const passes = (yield slots.map((ks) => ({
      kind: "plane" as const, calibFrame: input.calibFrame, H0, geos: ks.map((k) => pictures[k]), opts: { focal }
    }))) as FrameGeometry[][];
    slots.forEach((ks, d) => ks.forEach((k, j) => (geometry[k] = passes[d][j])));
  }
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
  // Found lanes: each frame's own, blended from the found frames near it over
  // the floor's registration.
  let perFrame: Map<number, Mat3> | null = null;
  if (lanes) {
    const track = laneTrack(lanes, carryOn(geometry), geometry.filter((g) => g).map((g) => g.index), input.laneTrack);
    perFrame = track.H;
    debug.lanes = { kept: track.kept, dropped: track.dropped, checks: track.checks };
    H0 = perFrame.get(input.calibFrame) ?? H0;
  }
  debug.H0 = H0;
  for (const g of geometry) {
    if (!g) continue;
    g.H = perFrame?.get(g.index) ?? normalize(multiply(g.S, H0));
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
  // Every fourth frame counted from the video's start (`gridFrames`), not
  // from the read's: a read that starts a frame later sampled other frames,
  // and the empty lane and every reading off it moved with them.
  const times = usable.map((g) => source.frame(g.index).t);
  const step = readStep(times);
  const onGrid = new Set(gridFrames(times, 4 * step, step));
  const sampled = usable.filter((_, k) => onGrid.has(k));
  const bgFrames0 = (yield sampled.map((g) => ({ kind: "steady" as const, index: g.index, S: g.S, roi }))) as GrayFrame[];
  const [bg0] = (yield [{ kind: "median" as const, frames: bgFrames0 }]) as Background[];
  const steadyS = debug.steady;
  // The empty lane again from every fourth frame, each steadied (`alignFrame`).
  const alignJob = (g: FrameGeometry, picture?: GrayFrame) => ({ kind: "align" as const, index: g.index, S: g.S, H: g.H, plane: !!g.plane, roi, bg0, picture });
  const sampledAligned = new Map(((yield sampled.map((g, j) => alignJob(g, bgFrames0[j]))) as Aligned[]).map((a, j) => [sampled[j].index, a]));
  const [bg] = (yield [{ kind: "median" as const, frames: sampled.map((g) => sampledAligned.get(g.index)!.steadied) }]) as Background[];
  debug.background = bg;

  progress("ball", 0.45);
  // Every frame steadied onto the empty lane and its candidates found; the
  // frames already steadied keep their transform (taken as is: no `plane`).
  const found = (yield usable.map((g) => {
    const known = sampledAligned.get(g.index);
    return known ? { ...alignJob(g, known.steadied), S: known.S, plane: false, bg } : { ...alignJob(g), bg };
  })) as Aligned[];
  const cands: Candidate[] = [];
  usable.forEach((g, k) => {
    steadyS.set(g.index, found[k].S);
    cands.push(...found[k].candidates!);
  });
  const [out] = (yield [{ kind: "tail" as const, state: { hand: input.hand, handFromVideo: input.handFromVideo, distance: input.distance, first, last, calibFrame: input.calibFrame, H0, geometry, cands, debug } }]) as TraceOutput[];
  return out;
}

/**
 * The tracer from every frame's ball candidates on (`traceSteps`): the one
 * physical ball, each sighting's circle, the path and the distance against
 * time, and the readings off them.
 */
export function traceTail(state: TailState, source: FrameSource, progress: (stage: string, fraction: number) => void): TraceOutput {
  const { hand, first, last, H0, geometry, cands, debug } = state;
  const calibFrame = source.frame(state.calibFrame);
  const usable = geometry.filter((g) => g && g.ok);
  debug.candidates = cands;
  // A candidate that does not move is background (a reflection, a mark the
  // median missed): one that has company at the same lane spot in two or
  // more frames 0.04 to 0.15 s away, where a rolling ball would have moved a
  // foot or more, is dropped.
  const moving = cands.filter((c) => cands.filter((o) => {
    const dt = Math.abs(o.t - c.t);
    return dt >= 0.04 && dt <= 0.15 && Math.abs(o.v - c.v) < 0.3 && Math.abs(o.u - c.u) < 0.5;
  }).length < 2);
  let chosen = associate(moving);
  // Seen over less than a lane's worth: the empty lane may hold a bowler who
  // never left, with the ball rolling past them unseen. The ball is then
  // followed by its darkness from where the detector saw it come down, and
  // kept when that sees it further.
  // (Over the main group: a stray pair far up the lane is not a stretch seen.)
  const spanOf = (cs: Candidate[]) => {
    const g = withoutIslands(cs);
    return g.length ? Math.max(...g.map((c) => c.v)) - Math.min(...g.map((c) => c.v)) : 0;
  };
  if (spanOf(chosen) < MIN_SPAN_FT) {
    const okFrame = (i: number) => (i >= first && i <= last && geometry[i - first]?.ok ? source.frame(i) : null);
    const okH = (i: number) => (i >= first && i <= last && geometry[i - first]?.ok ? geometry[i - first].H : null);
    let best: Candidate[] = [];
    let followed: Candidate[] = [];
    const lastChosen = chosen[chosen.length - 1];
    for (const seed of nearSeeds(cands).slice(0, 6)) {
      const near = followNear(okFrame, okH, seed, last);
      // Followed on from the detector's own last sighting, the follow carries
      // its run on, and the two are one stretch (2026-11-17, shot-04: seen to
      // 9 ft, the ball plain to the eye to 13.4 ft but its change joined to
      // the bowler's leg; the follow alone, 4 ft, never beat the run).
      const run = seed === lastChosen ? [...chosen, ...near] : near;
      if (run.length >= MIN_SIGHTINGS && spanOf(run) > spanOf(best)) {
        best = run;
        followed = near;
      }
    }
    if (spanOf(best) >= NEAR_SPAN_FT && spanOf(best) > spanOf(chosen)) {
      chosen = best;
      debug.nearFollow = followed;
    }
  }
  debug.associated = chosen;
  if (chosen.length < MIN_SIGHTINGS) return { result: fail("ball-not-found", `${chosen.length} sightings`), debug };

  progress("circles", 0.7);
  const geoOf = (i: number) => geometry[i - first];
  const sightings: BallSighting[] = [];
  const sv: number[] = [];
  // The last sighting whose outline was clean, for carrying its face on.
  let clean: { frame: number; f: GrayFrame; H: Mat3; fit: CircleFit; rExp: number } | null = null;
  const rAt = (H: Mat3, fit: { cx: number; cy: number; r: number }) => {
    const p = contactPoint(H, { x: fit.cx, y: fit.cy }, fit.r);
    return expectedRadiusPx(H, p.u, p.v);
  };
  // Each circle placed so far, for where the next is expected (`predictCenter`).
  const placed: { frame: number; x: number; y: number }[] = [];
  for (const c0 of chosen) {
    const g = geoOf(c0.frame);
    const f = source.frame(c0.frame);
    let fit = refineCircle(f, g.H, { x: c0.x, y: c0.y }, c0.r);
    if (!fit) continue;
    if (!fit.fixed && fit.weight >= CLEAN_WEIGHT) clean = { frame: c0.frame, f, H: g.H, fit, rExp: rAt(g.H, fit) };
    else if (clean && c0.frame - clean.frame <= CARRY_FRAMES) {
      // Too few of its rim's edges on the circle (a leg or a hand over it):
      // placed by its face from the last clean sighting, at that sighting's
      // size scaled as the lane scales it here (`carryFace`).
      const r = (clean.fit.r * rAt(g.H, fit)) / clean.rExp;
      const m = carryFace(clean.f, clean.fit, f, { x: fit.cx, y: fit.cy }, r, CARRY_REACH * r);
      if (m) fit = { ...fit, cx: m.cx, cy: m.cy, r, carried: clean.frame };
    }
    if (fit.fixed && fit.carried === undefined && fit.weight < WEAK_RIM) {
      // Few of its rim's edges on the circle and no face to carry: the rays
      // were cast from the detector's blob, which over the rack takes in a
      // pin's dark neck beside the ball, and the circle slid toward it
      // (2026-11-19, the owner on shot-01 frame 230: a quarter radius right
      // and low). Cast again from where the ball's last placed circles put
      // it, and that fit is kept when its rays find more of the rim and it
      // sits nearer where the ball was expected.
      const at = predictCenter(placed, c0.frame);
      const again = at ? refineCircle(f, g.H, at, fit.r) : null;
      const off = (q: { cx: number; cy: number }) => (at ? Math.hypot(q.cx - at.x, q.cy - at.y) : Infinity);
      if (again && again.weight > fit.weight && off(again) < off(fit)) fit = again;
    }
    placed.push({ frame: c0.frame, x: fit.cx, y: fit.cy });
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
  // A ball does not leave the lane once it lands: a sighting before one judged
  // in the air is in the air too, mirror image found or not (shot-05: frames
  // 139 and 140 had none and were taken as on the lane, 141 and 142 were in
  // the air; the owner saw it still in the air at 139).
  let lastAir = -1;
  sightings.forEach((s, i) => {
    if (s.airborne && s.v < 10) lastAir = i;
  });
  for (let i = 0; i < lastAir; i++) sightings[i].airborne = true;
  let seen = withoutIslands(sightings.filter((s) => !s.airborne));
  const svOf = new Map(sightings.map((s, k) => [s.frame, sv[k]]));
  let vs = seen.map((s) => s.v);
  const seenSpan = Math.max(...vs) - Math.min(...vs);
  const nearOnly = seenSpan < MIN_SPAN_FT && Math.min(...vs) <= NEAR_FROM_FT && seenSpan >= NEAR_SPAN_FT;
  if (seen.length < MIN_SIGHTINGS || (seenSpan < MIN_SPAN_FT && !nearOnly)) {
    return { result: fail("too-little-seen", `${seen.length} sightings over ${seenSpan.toFixed(1)} ft`), debug };
  }
  debug.nearOnly = nearOnly;

  // The laydown as the owner reads it: the ball right above the foul line in
  // the picture, followed back from its first sighting on the lane.
  const firstSeen = sightings.find((s) => !s.airborne) ?? seen[0];
  const okGeo = (i: number) => {
    const g = geometry[i - first];
    return g && g.ok ? g : null;
  };
  const byImage = overFoulLine(
    (i) => (okGeo(i) ? source.frame(i) : null),
    (i) => okGeo(i)?.H ?? null,
    firstSeen.frame,
    { cx: firstSeen.cx, cy: firstSeen.cy, r: firstSeen.r },
    Math.round(0.5 / Math.max(1e-3, (seen[seen.length - 1].t - seen[0].t) / Math.max(1, seen[seen.length - 1].frame - seen[0].frame)))
  );
  // The laydown by time (the owner, 2026-11-16): where the ball comes lowest
  // in the picture depends on where the bowler finishes, so the frame is the
  // one its timing puts it on the foul line: its first distance on the lane
  // over its speed there (the rolling ball's fit, `m0`), back from that
  // sighting. The picture's reading stays as the cross-check, and is used
  // when the ball cannot be followed back that far.
  const speed0 = m0.w + m0.d * firstSeen.t;
  let byTime: OverFoulLine | null = null;
  if (speed0 > 5 && firstSeen.v > 0) {
    const t0 = firstSeen.t - firstSeen.v / speed0;
    let lo = firstSeen.frame - 1;
    while (lo > first && lo > firstSeen.frame - 60 && source.frame(lo).t > t0) lo--;
    const ta = source.frame(lo).t;
    const tb = source.frame(lo + 1).t;
    if (ta <= t0 && tb > ta) {
      byTime = atFoulLineTime(
        (i) => (okGeo(i) ? source.frame(i) : null),
        (i) => okGeo(i)?.H ?? null,
        firstSeen.frame,
        { cx: firstSeen.cx, cy: firstSeen.cy, r: firstSeen.r },
        lo + (t0 - ta) / (tb - ta)
      );
    }
  }
  debug.release = byTime ? { ...byTime, image: byImage ? { at: byImage.at, u: byImage.u, reached: byImage.reached } : undefined } : byImage ? { ...byImage, by: "image" } : null;

  progress("path", 0.85);
  const pathOf = (ss: BallSighting[]) => ss.map((s) => ({ v: s.v, u: s.u, w: s.weight, sv: svOf.get(s.frame), t: s.t }));
  let pathPts = pathOf(seen);
  let fit = fitPath(pathPts);
  const touchdown = seen[0].v <= 6 ? seen[0].v : null;

  // Speed: distance against time, anchored at the pins (plan 7.6).
  const motionOf = (ss: BallSighting[]): MotionPoint[] => ss.map((s) => ({ t: s.t, v: s.v, w: s.weight / (1 + (svOf.get(s.frame) ?? 0) ** 2) }));
  let motionPts = motionOf(seen);
  let motion = fitMotion(motionPts);
  let contactV = pinContactFeet(fit.path);
  let pinFrame: number | null = null;
  let pinT: number | undefined;
  let anchoredSpeed: number | undefined;
  // Seen over the near lane only, the rack's movement cannot be tied to this
  // ball: the speed stays the fitted slope, as estimated.
  if (contactV !== null && !nearOnly) {
    const found = findPinFrame(source, geometry, sightings, motion, fit.path, contactV, debug);
    if (found !== null) {
      pinFrame = found.frame;
      pinT = found.t;
      // The ball among the moving pins is no longer the ball rolling: its
      // sightings from the first pin's move on (shot-01: two, at 59 ft, a
      // board apart) are left out of the path and the speed.
      const before = seen.filter((s) => s.frame < found.frame);
      if (before.length < seen.length && before.length >= MIN_SIGHTINGS) {
        seen = before;
        vs = seen.map((s) => s.v);
        pathPts = pathOf(seen);
        fit = fitPath(pathPts);
        motionPts = motionOf(seen);
        motion = fitMotion(motionPts);
        contactV = pinContactFeet(fit.path) ?? contactV;
      }
      if (touchdown !== null && found.t > seen[0].t) anchoredSpeed = (contactV - seen[0].v) / (found.t - seen[0].t);
      const total = motionPts.reduce((s, p) => s + p.w, 0);
      motion = fitMotion([...motionPts, { t: found.t, v: contactV, w: 0.25 * total }]);
    }
  }

  // The board at the pins as the owner reads it (shot-01): where the ball is
  // on the last frame before it touches a pin. It is followed by its darkness
  // from its last sighting, held to its own size and row (`followForward`
  // with a prediction), and read by its center across the picture on the
  // head pin's contact row (in front of the rack only its column is trusted).
  let pinsU: number | undefined;
  let pinsEstimated = false;
  const vAtT = (t: number) => motion.v0 + motion.w * t + 0.5 * motion.d * t * t;
  const lastSeen = seen[seen.length - 1];
  // How far down the lane the ball is past its last sighting: the fitted
  // motion's advance, from where the last far sightings put it. The fit alone
  // lags there (2026-11-16, shot-01: anchored on the rack first seen moving,
  // five frames after the ball met the head pin, it put the ball 1.2 ft short
  // of where its last sightings were), so it is shifted onto them.
  const far = seen.filter((s) => s.v > 40).slice(-10);
  const lag = far.length >= 3 ? median(far.map((s) => s.v - vAtT(s.t))) : 0;
  const vPast = (t: number) => vAtT(t) + lag;
  const PIN_V = 60 - CONTACT_IN / 12;
  const predict: FollowPrediction = (i, cx) => {
    const g = geometry[i - first];
    if (!g?.ok) return null;
    const v = Math.min(vPast(source.frame(i).t), PIN_V);
    const u = uAtColumn(g.H, cx, v);
    const contact = apply(g.H, { x: u, y: v });
    const r = expectedRadiusPx(g.H, u, v);
    return { cy: contact.y - r * downAt(g.H, contact).y, r };
  };
  // The first frame on which the ball touches a pin: the ball reaching the
  // first pin on its path, or the rack seen moving, whichever is first.
  let touchFrame = pinFrame ?? Infinity;
  // A pin seen to move is the touch itself; the fitted motion only stands in for it.
  const tTouch = contactV !== null && !nearOnly && pinFrame === null ? timeAtFeet({ ...motion, v0: motion.v0 + lag }, contactV) : null;
  if (tTouch !== null) {
    for (let i = lastSeen.frame + 1; i < Math.min(touchFrame, first + geometry.length); i++) {
      if (source.frame(i).t >= tTouch) {
        touchFrame = i;
        break;
      }
    }
  }
  const lastBefore = touchFrame - 1;
  // Read on that frame whenever a pin is seen to move (2026-11-17, the
  // owner: shot-01's last frame before is 233, shot-06's 102). Lost two
  // frames or more before it, the ball is followed to it by its face (shot-01
  // read from 0.2 s before the foul line: five).
  if (pinFrame !== null && lastSeen.v > 50 && lastBefore - lastSeen.frame >= 2 && lastBefore - lastSeen.frame <= 29) {
    // Followed two frames on, for the pictures of the frames after (the
    // owner picks among them when unsure); read only up to `lastBefore`.
    debug.toPins = followForward((i) => (geometry[i - first]?.ok ? source.frame(i) : null), lastSeen.frame, lastSeen, lastBefore + 2, 0.6, predict);
    const track = debug.toPins.filter((d) => d.frame <= lastBefore);
    const reach = track.length ? track[track.length - 1].frame : lastSeen.frame;
    if (reach >= lastBefore - 2) {
      // A straight line through the last four frames' boards, read on the last
      // frame before the ball touches a pin: a hooking ball still turns, and
      // one frame's column is noisy among the pins.
      const near = [{ frame: lastSeen.frame, cx: lastSeen.cx }, ...track].slice(-4);
      const xs = near.map((d) => d.frame);
      const ys = near.map((d) => uAtColumn(geometry[d.frame - first].H, d.cx, PIN_V));
      pinsU = lineAt(xs, ys, lastBefore);
      debug.pinsRead = { frame: lastBefore, u: pinsU, frames: xs };
    }
  } else if (pinFrame !== null && lastSeen.v > 50 && lastBefore - lastSeen.frame >= 0 && lastBefore - lastSeen.frame < 2) {
    // Seen up to that frame: where the ball stands on the lane, a straight
    // line through the sightings of its last four frames read on it (the
    // fitted path, run on from 53 ft, put shot-06's ball two boards from
    // where the frame shows it, square in front of the head pin). Their own
    // points under the ball, not their columns: from a camera to the side a
    // column runs across the boards.
    const near = seen.filter((x) => x.v > 50 && x.frame >= lastBefore - 3);
    const xs = near.map((d) => d.frame);
    const ys = near.map((d) => d.u);
    pinsU = lineAt(xs, ys, lastBefore);
    debug.pinsRead = { frame: lastBefore, u: pinsU, frames: xs };
  } else if (pinFrame === null && Math.max(lastSeen.v, vAtT(lastSeen.t)) > 50) {
    // The rack never seen to move (shot-02: the bowler's arm swings across it
    // as the ball arrives). The ball is followed on until the arm covers it
    // or it reaches the first pin; if by then the fitted motion has it within
    // three feet of the head pin, its last three frames' boards are the
    // estimate. Not run on: the turn left in the last feet is not seen.
    const to = Math.min(lastSeen.frame + 30, lastBefore);
    const track = followForward((i) => (geometry[i - first]?.ok ? source.frame(i) : null), lastSeen.frame, lastSeen, to, 0.6, predict);
    if (track.length >= 3 && vAtT(source.frame(track[track.length - 1].frame).t) >= 57) {
      debug.toPins = track;
      const tail = track.slice(-3);
      pinsU = tail.reduce((a, d) => a + uAtColumn(geometry[d.frame - first].H, d.cx, PIN_V), 0) / tail.length;
      pinsEstimated = true;
      debug.pinsRead = { frame: tail[tail.length - 1].frame, u: pinsU, frames: tail.map((d) => d.frame) };
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
  const distance = state.distance ?? "foul";
  const readOff: ReadOff = {
    path: fit.path, seen: vs, points: pathPts, touchdown, motion, tFirst, tLast, rackMovesAt: pinT,
    overFoulLineU: debug.release?.u,
    pinsU,
    pinsEstimated,
    // Measured only from the two sharp events; where the bowler hides the
    // touchdown or the rack, the fit's speed is shown as estimated.
    speedMeasured: distance !== "default" && anchoredSpeed !== undefined,
    anchoredSpeed
  };
  // Which hand threw it, from the video (`handFind.ts`): the readings in the
  // setting's boards say where the ball went, the release where the body was.
  const inSetting = handedMetrics({ ...readOff, hand });
  const handFound = decideHand(handCues(inSetting, hand, fit.path, Math.max(...vs), releaseBody(state, source, debug.release ?? null)), hand);
  debug.hand = handFound;
  const used = state.handFromVideo ? handFound.hand : hand;
  const met = used === hand ? inSetting : handedMetrics({ ...readOff, hand: used });
  const vAt = (t: number) => motion.v0 + motion.w * t + 0.5 * motion.d * t * t;
  debug.speeds = {
    anchored: anchoredSpeed !== undefined ? anchoredSpeed * FTS_TO_MPH : null,
    slope: ((vAt(tLast) - vAt(tFirst)) / (tLast - tFirst)) * FTS_TO_MPH
  };
  progress("done", 1);
  return {
    result: {
      ok: true, hand: used, sightings, path: fit.path, from: Math.min(...vs), to: Math.max(...vs), rms: fit.rms,
      metrics: met, readOff, handFound: state.handFromVideo ? handFound : undefined, motion, touchdownFrame: touchdown !== null ? seen[0].frame : null, pinFrame
    },
    debug
  };
}

/**
 * The hand cues (`handFind.ts`) from the readings in the setting's boards
 * (`hand`): the laydown and the arrows for the drift, the board at the pins,
 * the fitted path's turn, and the body at the release when it was placed.
 */
export function handCues(m: TrackMetrics, hand: Handedness, path: PathModel, seenTo: number, body: { ballU: number; bodyU: number } | null): HandCue[] {
  const u = (x: Metric) => (x.value === null ? null : laneU(x.value, hand));
  const cues: HandCue[] = [];
  if (body) cues.push(releaseCue(body.ballU, body.bodyU));
  const foul = u(m.laydown);
  const arrows = u(m.arrows);
  if (foul !== null && arrows !== null) cues.push(driftCue(foul, arrows));
  const hook = hookCue(path, seenTo);
  if (hook) cues.push(hook);
  const pins = u(m.pins);
  const pc = pins === null ? null : pinsCue(pins);
  if (pc) cues.push(pc);
  return cues;
}

/** The ball and the bowler's body at the release (`bodyAtRelease`), on the frame the laydown was read on. */
function releaseBody(state: TailState, source: FrameSource, release: OverFoulLine | null): { ballU: number; bodyU: number } | null {
  const { debug, H0 } = state;
  if (!release || !debug.background || !debug.roi) return null;
  const i = Math.round(release.at);
  const S = debug.steady.get(i);
  if (!S || i < state.first || i > state.last) return null;
  const f = steady(source.frame(i), S, debug.roi);
  const bodyU = bodyAtRelease(f, debug.background as Background, debug.roi, H0, release.u);
  return bodyU === null ? null : { ballU: release.u, bodyU };
}

/** The least squares straight line through (xs, ys) at x; one point's own y, or flat when the xs are all one. */
export function lineAt(xs: number[], ys: number[], x: number): number {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, v) => a + (v - mx) ** 2, 0);
  const slope = den > 0 ? xs.reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0) / den : 0;
  return my + slope * (x - mx);
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
 * The first frame on which a pin moves (`firstPinMove`), from when the ball
 * is `PIN_LEAD_FT` short of the pins on: each frame with its lane, the ball
 * where it was sighted or else where the path and the motion put it (masked
 * out of the pins), and only the pins the ball can reach first. The time is
 * the middle of the interval before that frame, in which they moved.
 */
function findPinFrame(
  source: FrameSource,
  geometry: FrameGeometry[],
  sightings: BallSighting[],
  motion: { v0: number; w: number; d: number },
  path: Parameters<typeof pathU>[0],
  contactV: number,
  debug: TraceDebug
): { frame: number; t: number } | null {
  const vAt = (t: number) => motion.v0 + motion.w * t + 0.5 * motion.d * t * t;
  const from = timeAtFeet(motion, contactV - PIN_LEAD_FT);
  if (from === null) return null;
  const byFrame = new Map(sightings.map((s) => [s.frame, s]));
  const frames: PinFrame[] = [];
  for (const g of geometry) {
    if (!g || !g.ok) continue;
    const f = source.frame(g.index);
    const vb = vAt(f.t);
    if (vb < 30) continue;
    const s = byFrame.get(g.index);
    let ball: PinFrame["ball"];
    if (s) ball = { cx: s.cx, cy: s.cy, r: s.r };
    else {
      const v = Math.min(vb, 62.8);
      const u = pathU(path, v);
      const contact = apply(g.H, { x: u, y: v });
      const r = expectedRadiusPx(g.H, u, v);
      const down = downAt(g.H, contact);
      ball = { cx: contact.x - r * down.x, cy: contact.y - r * down.y, r };
    }
    frames.push({ index: g.index, t: f.t, f, H: g.H, ball });
  }
  const hit = firstPinMove(frames, from, pinsInReach((v) => pathU(path, Math.min(v, 62.8))));
  const scores = hit?.scores ?? pinScores(frames);
  frames.forEach((p, k) => debug.pinEnergy.push({ frame: p.index, energy: scores[k] }));
  if (!hit) return null;
  const k = frames.findIndex((p) => p.index === hit.index);
  const prevT = k > 0 ? frames[k - 1].t : hit.t;
  return { frame: hit.index, t: (hit.t + prevT) / 2 };
}
