/**
 * "Show me the exact frame": wherever a board reading of the automatic trace
 * differs from the hand-calibrated trace's by more than half a board, the
 * color video frame the reading was taken on, one picture per trace, with the
 * lane as that trace maps it on that frame, board ticks, the ball as the
 * tracer saw it, and a cross where the reading is.
 *
 * Driven by `review-auto.ts`, which runs both traces.
 */
import { join } from "node:path";
import { apply, downAt, intersect, lineThrough, mapLine } from "../../src/lib/shotTrack/homography";
import { CONTACT_IN, handedBoard, imageToLane, laneU } from "../../src/lib/shotTrack/laneModel";
import { LANE_BOARDS } from "../../src/lib/laneGeometry";
import type { TraceOutput } from "../../src/lib/shotTrack/pipeline";
import { uAtColumn } from "../../src/lib/shotTrack/release";
import type { BallSighting, Mat3, Metric, TrackResult } from "../../src/lib/shotTrack/types";
import type { Handedness } from "../../src/types/bowling";
import { loadColorFrame } from "./clip";
import { fromRgb, line as rawLine, text, type Canvas, type Color } from "./draw";
import { boxOf, enlarge, jpg, MAX_W, ring, thin } from "./review-lib";
import type { Truth } from "./truth";

export const READINGS = ["laydown", "touchdown", "arrows", "breakpoint", "pins"] as const;
export type ReadingName = (typeof READINGS)[number];

/** Boards apart that count as differing. */
export const DIFFERS = 0.5;
/** Where the board at the pins is read: the head pin's contact row. */
const PIN_V = 60 - CONTACT_IN / 12;
/** The least size of a board in the enlarged picture, pixels, where the width cap allows. */
const BOARD_PX = 8;
/** The least enlargement, so a 25 board crop is readable and the 1 px drawing stays thin against the picture. */
const MIN_K = 3;
/** And a crop narrower than this is enlarged until it is about this wide, pixels. */
const MIN_W = 720;

const EDGE: Color = [60, 255, 80];
const FOUL: Color = [255, 130, 0];
const TICK: Color = [0, 230, 230];
const BALL: Color = [255, 230, 0];
const CROSS: Color = [255, 0, 220];
const WHITE: Color = [255, 255, 255];

interface Ok { result: TrackResult; debug: TraceOutput["debug"] }

/** The frame one trace took one reading on. */
interface Pick {
  frame: number;
  /** The ball as the tracer saw it on that frame (a sighting's circle, or a followed disc), frame pixels. */
  disc: { cx: number; cy: number; r: number } | null;
  /** The ball's position on the lane as sighted on that frame, handed boards and feet. */
  ball: { board: number; feet: number } | null;
  metric: Metric;
  /** Where the reading is taken: its distance, feet. */
  feet: number;
  notes: string[];
}

export interface FrameSide {
  value: number | null;
  state: string;
  frame: number | null;
  timeSeconds: number | null;
  picture: string | null;
  width: number | null;
  height: number | null;
  ball: { board: number; feet: number } | null;
  /** How far the frame's mapping puts the ball's own sighted board from the reading, boards (ball minus reading). */
  ballMinusReading: number | null;
  note: string;
}

export interface FrameCase {
  reading: ReadingName;
  auto: FrameSide;
  hand: FrameSide;
  difference: number | null;
  /** Why it is listed: "differs" or "one trace has no reading". */
  why: string;
}

const isOk = (o: TraceOutput): o is TraceOutput & { result: TrackResult } => o.result.ok;

/** Lane u under the foul line's point straight below a disc's centre, as release.ts reads it. */
function footU(H: Mat3, cx: number): number {
  const foul = mapLine(H, [0, 1, 0]);
  const y = -(foul[0] * cx + foul[2]) / foul[1];
  return imageToLane(H, { x: cx, y }).u;
}

/** Lane u where the line from a disc's center straight down in the lane meets the foul line, as `atFoulLineTime` reads it. */
function footDownU(H: Mat3, d: { cx: number; cy: number }): number {
  const c = { x: d.cx, y: d.cy };
  const dn = downAt(H, c);
  const p = intersect(lineThrough(c, { x: c.x + dn.x, y: c.y + dn.y }), mapLine(H, [0, 1, 0]));
  return p ? imageToLane(H, p).u : NaN;
}

/**
 * The board at the pins as `pipeline.ts` read it by following the ball past
 * its last sighting (`debug.pinsRead`: the frame it is read on, the last
 * before the ball touches a pin, and the frames the line through the boards
 * used), or null when the reading came from the fitted sightings instead.
 */
function followedPins(run: Ok, hand: Handedness): { u: number; frame: number; frames: number[] } | null {
  const read = run.debug.pinsRead;
  const target = run.result.metrics.pins.value;
  if (!read || target === null || Math.abs(handedBoard(read.u, hand) - target) > 1e-6) return null;
  return read;
}

function pick(name: ReadingName, run: Ok, hand: Handedness, otherFeet: number | null, who: string): Pick | null {
  const { result, debug } = run;
  const m = result.metrics;
  const sights = result.sightings.filter((s) => !s.airborne);
  if (!sights.length) return null;
  const nearest = (feet: number) => sights.reduce((b, s) => (Math.abs(s.v - feet) < Math.abs(b.v - feet) ? s : b), sights[0]);
  const geo = (i: number) => debug.geometry[i - debug.first]?.H ?? null;
  const asSighted = (s: BallSighting) => ({ board: handedBoard(s.u, hand), feet: s.v });
  const notes: string[] = [];
  const metric: Metric = m[name];
  const missing = metric.value === null;
  if (missing) notes.push(`${who} has no ${name} reading; the frame shown is only where the other trace's reading sits`);

  if (name === "laydown") {
    const rel = debug.release;
    if (rel) {
      const frame = Math.round(rel.at);
      const entry = rel.track.find((d) => d.frame === frame) ?? rel.track.reduce((b, d) => (Math.abs(d.frame - rel.at) < Math.abs(b.frame - rel.at) ? d : b), rel.track[0]);
      const H = geo(entry.frame);
      if (rel.by === "time") {
        notes.push(`read where the ball's timing (its first distance on the lane over its speed) puts it on the foul line, fractional frame ${rel.at.toFixed(2)}, shown on frame ${entry.frame}`);
        if (rel.image) notes.push(`cross-check: the picture alone (where the ball's bottom ${rel.image.reached ? "meets the foul line's row" : "comes lowest"}) gives frame ${rel.image.at.toFixed(2)} and board ${handedBoard(rel.image.u, hand).toFixed(2)}`);
      } else {
        notes.push(
          `read from the release follow-back: the ball's bottom ${rel.reached ? "was last on the foul line's row" : "never reached the foul line's row, so it is read where it comes lowest"} at fractional frame ${rel.at.toFixed(2)}, shown on frame ${entry.frame}`
        );
      }
      notes.push("the ball is not a sighting here (hand and body over it): the circle is the disc followed back by its darkness, and its lane position is the foul line point straight below its center in the lane (at right angles to the horizon)");
      return { frame: entry.frame, disc: entry, ball: H ? { board: handedBoard(rel.by === "time" ? footDownU(H, entry) : footU(H, entry.cx), hand), feet: 0 } : null, metric, feet: 0, notes };
    }
    const s = sights[0];
    notes.push("the laydown did not come from the release follow-back (it could not be followed): it is the fitted path run back to 0 ft, and the frame shown is the first sighting, which is the touchdown, not the laydown");
    return { frame: s.frame, disc: s, ball: asSighted(s), metric, feet: 0, notes };
  }

  if (name === "touchdown") {
    const feet = m.touchdownFeet.value ?? otherFeet ?? sights[0].v;
    const s = result.touchdownFrame !== null ? (sights.find((x) => x.frame === result.touchdownFrame) ?? sights[0]) : nearest(feet);
    notes.push(result.touchdownFrame !== null ? `result.touchdownFrame ${result.touchdownFrame}: the first sighting on the lane, at ${s.v.toFixed(1)} ft` : "no touchdown frame in this trace");
    notes.push(`the reading is the fitted path's board at ${feet.toFixed(1)} ft; the ball's own sighted board on this frame is shown beside it`);
    return { frame: s.frame, disc: s, ball: asSighted(s), metric, feet, notes };
  }

  if (name === "arrows" || name === "breakpoint") {
    const feet = name === "arrows" ? 15 : (m.breakpointFeet.value ?? otherFeet ?? 45);
    const s = nearest(feet);
    notes.push(`the sighting nearest ${feet.toFixed(1)} ft is on frame ${s.frame}, at ${s.v.toFixed(1)} ft (${Math.abs(s.v - feet).toFixed(1)} ft from ${feet.toFixed(1)})`);
    if (name === "arrows") notes.push("the reading is a straight line through the sightings between 10 and 20 ft, taken at 15 ft; the ball's own sighted board on this frame is shown beside it");
    else notes.push("the breakpoint is the fitted path's furthest point toward the bowler's own gutter");
    return { frame: s.frame, disc: s, ball: asSighted(s), metric, feet, notes };
  }

  // pins
  const last = sights[sights.length - 1];
  const f = followedPins(run, hand);
  if (f) {
    const seenAt = result.sightings.find((x) => x.frame === f.frame);
    const d = debug.toPins?.find((x) => x.frame === f.frame) ?? seenAt ?? debug.toPins?.[debug.toPins.length - 1] ?? last;
    const H = geo(d.frame);
    notes.push(
      debug.toPins?.length
        ? `read by following the ball's face past its last sighting (read frame ${last.frame}, ${last.v.toFixed(1)} ft) to read frame ${f.frame}, the last before a pin moves, a line through the boards of read frames ${f.frames.join(", ")} on the head pin's row taken at read frame ${f.frame}`
        : `read on read frame ${f.frame}, the last before a pin moves: a line through the boards of the sightings on read frames ${f.frames.join(", ")} on the head pin's row taken there`
    );
    notes.push(result.pinFrame !== null ? `result.pinFrame ${result.pinFrame} (the rack first seen moving) is ${result.pinFrame - f.frame} frame(s) after the frame shown` : "result.pinFrame is not set (the rack was never seen to move, the bowler's arm is over it)");
    return { frame: d.frame, disc: d, ball: H ? { board: handedBoard(uAtColumn(H, d.cx, PIN_V), hand), feet: PIN_V } : null, metric, feet: PIN_V, notes };
  }
  const short = 60 - last.v;
  notes.push(`the last sighting is on frame ${last.frame}, at ${last.v.toFixed(1)} ft`);
  if (short > 0.5) notes.push(`the reading comes from the fitted path / last sightings beyond the last sighting: the ball was last sighted ${short.toFixed(1)} ft short of the pins (60 ft)`);
  else notes.push("the last sighting is within half a foot of the pins");
  notes.push(result.pinFrame !== null ? `result.pinFrame ${result.pinFrame} (the rack first seen moving) is ${result.pinFrame - last.frame} frame(s) after the frame shown` : "result.pinFrame is not set (the rack was never seen to move)");
  return { frame: last.frame, disc: last, ball: asSighted(last), metric, feet: PIN_V, notes };
}

/** The reading's lane u: the cross is placed at it. */
function renderPick(color: Canvas, H: Mat3, p: Pick, hand: Handedness): Canvas {
  const W = color.width;
  const Hh = color.height;
  const readU = p.metric.value !== null ? laneU(p.metric.value, hand) : null;
  const ballU = p.ball ? laneU(p.ball.board, hand) : null;
  const us = [readU, ballU].filter((x): x is number => x !== null);
  const uc = us.length ? us : [20];
  const u0 = Math.max(-2, Math.min(...uc) - 12);
  const u1 = Math.min(42, Math.max(...uc) + 12);
  const v0 = p.feet < 1 ? -4 : p.feet - 5;
  const v1 = p.feet + 2.5;
  const extra: { x: number; y: number }[] = [];
  if (p.disc) {
    const { cx, cy, r } = p.disc;
    extra.push({ x: cx - 1.4 * r, y: cy - 1.4 * r }, { x: cx + 1.4 * r, y: cy + 1.4 * r });
  }
  const box = boxOf(H, [[u0, v0], [u1, v0], [u0, v1], [u1, v1]], W, Hh, 6, extra);
  const boardPx = Math.hypot(...(([a, b]) => [a.x - b.x, a.y - b.y] as [number, number])([apply(H, { x: 20, y: p.feet }), apply(H, { x: 21, y: p.feet })]));
  const k = Math.min(Math.max(MIN_K, BOARD_PX / Math.max(boardPx, 0.1), MIN_W / box.w), MAX_W / box.w);
  const c = enlarge(color, box.x, box.y, box.w, box.h, k);
  const P = (q: { x: number; y: number }) => ({ x: (q.x - box.x + 0.5) * k - 0.5, y: (q.y - box.y + 0.5) * k - 0.5 });
  const at = (u: number, v: number) => P(apply(H, { x: u, y: v }));
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, col: Color, dash?: number) => thin(c, a.x, a.y, b.x, b.y, col, dash);

  // The lane as this trace maps it on this frame.
  seg(at(0.5, v0), at(0.5, v1), EDGE);
  seg(at(39.5, v0), at(39.5, v1), EDGE);
  if (v0 <= 0.5 && v1 >= -0.5) seg(at(-2, 0), at(42, 0), FOUL);

  // The reading's row, with a tick every 5 boards counted the bowler's way, a small one every board.
  seg(at(0.5, p.feet), at(39.5, p.feet), TICK, 3);
  for (let b = 1; b <= LANE_BOARDS; b++) {
    const u = laneU(b, hand);
    if (u < u0 || u > u1) continue;
    const major = b % 5 === 0;
    const h = major ? 0.35 : 0.1;
    seg(at(u, p.feet - h), at(u, p.feet + h), TICK);
    if (major) {
      const lab = String(b);
      const q = at(u, p.feet - h);
      text(c, Math.round(q.x - (lab.length * 8 - 2) / 2), Math.round(q.y + 3), lab, WHITE, 2);
    }
  }

  // The ball as the tracer saw it: an outline only.
  if (p.disc) {
    const q = P({ x: p.disc.cx, y: p.disc.cy });
    ring(c, q.x, q.y, p.disc.r * k, BALL);
  }

  // The cross at the reading.
  if (readU !== null && p.metric.value !== null) {
    const q = at(readU, p.feet);
    const s = 10;
    // An x, so its arms are not lost along the tick row.
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      rawLine(c, q.x - s + dx, q.y - s + dy, q.x + s + dx, q.y + s + dy, [0, 0, 0], { alpha: 0.5 });
      rawLine(c, q.x - s + dx, q.y + s + dy, q.x + s + dx, q.y - s + dy, [0, 0, 0], { alpha: 0.5 });
    }
    rawLine(c, q.x - s, q.y - s, q.x + s, q.y + s, CROSS);
    rawLine(c, q.x - s, q.y + s, q.x + s, q.y - s, CROSS);
    const lab = p.metric.value.toFixed(1);
    text(c, Math.round(Math.max(2, Math.min(c.width - lab.length * 12 - 2, q.x - (lab.length * 12 - 3) / 2))), Math.round(Math.min(c.height - 18, q.y + 24)), lab, CROSS, 3);
  }
  return c;
}

const side = (value: Metric, extra: Partial<FrameSide> = {}): FrameSide => ({
  value: value.value, state: value.state, frame: null, timeSeconds: null, picture: null, width: null, height: null, ball: null, ballMinusReading: null, note: "", ...extra
});

/**
 * The readings that differ between the two traces, with a picture of the frame
 * each was taken on. Writes `<dir>/<reading>-auto.jpg` and `-hand.jpg`.
 */
export function reviewFrames(name: string, t: Truth, auto: TraceOutput, hand: TraceOutput, dir: string, picDir = name): FrameCase[] {
  if (!isOk(auto) || !isOk(hand)) return [];
  const a: Ok = { result: auto.result, debug: auto.debug };
  const h: Ok = { result: hand.result, debug: hand.debug };
  const cases: FrameCase[] = [];
  const colors = new Map<number, Canvas>();
  const colorOf = (i: number) => {
    let c = colors.get(i);
    if (!c) {
      c = fromRgb(loadColorFrame(t.clipPath, i, t.clip.width, t.clip.height), t.clip.width, t.clip.height);
      colors.set(i, c);
    }
    return c;
  };
  for (const reading of READINGS) {
    const va = a.result.metrics[reading];
    const vh = h.result.metrics[reading];
    const both = va.value !== null && vh.value !== null;
    const diff = both ? va.value! - vh.value! : null;
    if (both && Math.abs(diff!) <= DIFFERS) continue;
    if (!both && va.value === null && vh.value === null) continue;
    const feetOf = (r: Ok) => (reading === "touchdown" ? r.result.metrics.touchdownFeet.value : reading === "breakpoint" ? r.result.metrics.breakpointFeet.value : null);
    const one = (who: "auto" | "hand", run: Ok, other: Ok): FrameSide => {
      const p = pick(reading, run, t.cal.hand, feetOf(other), who);
      if (!p) return side(run.result.metrics[reading], { note: "no sighting to show" });
      const H = run.debug.geometry[p.frame - run.debug.first]?.H;
      if (!H) return side(p.metric, { frame: p.frame, note: [...p.notes, "no lane mapping on this frame"].join("; ") });
      const pic = renderPick(colorOf(p.frame), H, p, t.cal.hand);
      const file = `${reading}-${who}.jpg`;
      jpg(pic, join(dir, file));
      return side(p.metric, {
        frame: p.frame,
        timeSeconds: t.clip.times[p.frame],
        picture: `${picDir}/${file}`,
        width: pic.width,
        height: pic.height,
        ball: p.ball,
        ballMinusReading: p.ball && p.metric.value !== null ? p.ball.board - p.metric.value : null,
        note: p.notes.join("; ")
      });
    };
    cases.push({
      reading,
      auto: one("auto", a, h),
      hand: one("hand", h, a),
      difference: diff,
      why: both ? `differs by ${Math.abs(diff!).toFixed(2)} boards` : "one trace has no reading"
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// The frame every automatic reading is taken on, whether or not it differs.
// ---------------------------------------------------------------------------

/** Each picture is kept under about this size. */
const MAX_BYTES = 58 * 1024;
const MARK: Color = [255, 0, 220];

export interface AutoFrame {
  /** The frame's number in the video. */
  frame: number;
  /** Its index in the read the trace ran on. */
  readFrame: number;
  timeSeconds: number;
  picture: string | null;
  width: number | null;
  height: number | null;
  ball: { board: number; feet: number } | null;
  note: string;
}

export interface AutoReading {
  reading: ReadingName;
  value: number | null;
  state: string;
  /** The reading was not seen on its frame: it is a fitted or followed value, and the frame shown is the nearest one. */
  extrapolated: boolean;
  frames: AutoFrame[];
}

export interface AutoFramesOptions {
  /** Read frames for the pins strip, in place of the reading frame and the four before it. */
  pinsFrames?: number[];
  /** The pins strip's file names, 1-based. */
  pinsFile?: (k: number) => string;
}

interface Crop {
  H: Mat3;
  /** Lane points (u, v) the crop must hold. */
  lane: [number, number][];
  /** Discs (frame pixels) the crop must hold. */
  discs: { cx: number; cy: number; r: number }[];
  k: number;
  /** Fixed crop box, to keep a strip of frames on one window. */
  box?: { x: number; y: number; w: number; h: number };
  disc: { cx: number; cy: number; r: number } | null;
  foul: boolean;
  /** A small ring at lane (u, v). */
  ringAt?: { u: number; v: number };
  /** Ticks across a row of lane (v) at board u values, with labels. */
  ticks?: { u: number; v: number; color: Color; label?: string }[];
  /** A faint dashed row at this distance, feet. */
  row?: number;
  label: string[];
}

function fill(c: Canvas, x0: number, y0: number, w: number, h: number): void {
  for (let y = Math.max(0, y0); y < Math.min(c.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(c.width, x0 + w); x++) {
      for (let ch = 0; ch < 3; ch++) c.rgb[(y * c.width + x) * 3 + ch] = Math.round(c.rgb[(y * c.width + x) * 3 + ch] * 0.2);
    }
  }
}

/** The crop picture: thin lines, a 1 px ring on the ball, a label in the corner. */
function renderCrop(color: Canvas, o: Crop): Canvas {
  const { H } = o;
  const box = o.box ?? boxOf(H, o.lane, color.width, color.height, 6, o.discs.flatMap((d) => [{ x: d.cx - 1.5 * d.r, y: d.cy - 1.5 * d.r }, { x: d.cx + 1.5 * d.r, y: d.cy + 1.5 * d.r }]));
  const k = Math.min(o.k, MAX_W / box.w);
  const c = enlarge(color, box.x, box.y, box.w, box.h, k);
  const P = (q: { x: number; y: number }) => ({ x: (q.x - box.x + 0.5) * k - 0.5, y: (q.y - box.y + 0.5) * k - 0.5 });
  const at = (u: number, v: number) => P(apply(H, { x: u, y: v }));
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, col: Color, dash?: number) => thin(c, a.x, a.y, b.x, b.y, col, dash);
  const vs = o.lane.map((p) => p[1]);
  const v0 = Math.min(...vs);
  const v1 = Math.max(...vs);
  seg(at(0.5, v0), at(0.5, v1), EDGE);
  seg(at(39.5, v0), at(39.5, v1), EDGE);
  if (o.foul && v0 <= 0.5 && v1 >= -0.5) seg(at(-2, 0), at(42, 0), FOUL);
  if (o.row !== undefined) seg(at(0.5, o.row), at(39.5, o.row), TICK, 4);
  for (const t of o.ticks ?? []) {
    const a = at(t.u, t.v - 0.4);
    const b = at(t.u, t.v + 0.4);
    seg(a, b, t.color);
    if (t.label) text(c, Math.round(Math.max(2, Math.min(c.width - t.label.length * 8 - 2, a.x - (t.label.length * 8 - 2) / 2))), Math.round(Math.min(c.height - 14, Math.max(a.y, b.y) + 4)), t.label, t.color, 2);
  }
  if (o.disc) {
    const q = P({ x: o.disc.cx, y: o.disc.cy });
    ring(c, q.x, q.y, o.disc.r * k, BALL);
    // The center of the ball's base: one radius along "down" from its center.
    const d = downAt(H, { x: o.disc.cx, y: o.disc.cy });
    const b = P({ x: o.disc.cx + o.disc.r * d.x, y: o.disc.cy + o.disc.r * d.y });
    seg({ x: b.x - 5, y: b.y }, { x: b.x + 5, y: b.y }, BALL);
    seg({ x: b.x, y: b.y - 5 }, { x: b.x, y: b.y + 5 }, BALL);
  }
  if (o.ringAt) {
    const q = at(o.ringAt.u, o.ringAt.v);
    ring(c, q.x, q.y, 6, MARK);
  }
  const w = Math.max(...o.label.map((s) => s.length)) * 8 + 8;
  fill(c, 0, 0, Math.min(c.width, w), o.label.length * 14 + 6);
  o.label.forEach((s, i) => text(c, 4, 4 + i * 14, s, WHITE, 2));
  return c;
}

/**
 * The frames a trace ran on, for drawing over: the read's frame `i` (the
 * index the trace knows it by), its number in the video, its time, and the
 * color picture the trace's gray frame was made from, at the same size.
 */
export interface FrameView {
  hand: Handedness;
  count: number;
  width: number;
  height: number;
  /** The frame's time in the video, seconds. */
  time(i: number): number;
  /** The frame's number in the video (the clip's own count from its first frame). */
  number(i: number): number;
  color(i: number): Canvas;
}

/** A sample clip read whole, as `review-auto.ts` traces it: frame `i` is the clip's frame `i`. */
export function truthView(t: Truth): FrameView {
  return {
    hand: t.cal.hand,
    count: t.clip.count,
    width: t.clip.width,
    height: t.clip.height,
    time: (i) => t.clip.times[i],
    number: (i) => i,
    color: (i) => fromRgb(loadColorFrame(t.clipPath, i, t.clip.width, t.clip.height), t.clip.width, t.clip.height)
  };
}

/** The font has digits and few letters: f is the frame's number in the video, t its time in seconds, b a board. */
const stamp = (v: FrameView, f: number) => `f${v.number(f)} t${v.time(f).toFixed(3)}`;

export function autoFrames(t: FrameView, auto: TraceOutput, dir: string, picDir: string, opts: AutoFramesOptions = {}): AutoReading[] {
  const { pinsFrames, pinsFile = (k: number) => `auto-pins-${k}.jpg` } = opts;
  if (!isOk(auto)) return [];
  const run: Ok = { result: auto.result, debug: auto.debug };
  const { result, debug } = run;
  const hand = t.hand;
  const m = result.metrics;
  const sights = result.sightings;
  const colors = new Map<number, Canvas>();
  const colorOf = (i: number) => {
    let c = colors.get(i);
    if (!c) {
      c = t.color(i);
      colors.set(i, c);
      if (colors.size > 8) colors.delete(colors.keys().next().value as number);
    }
    return c;
  };
  const geo = (i: number) => debug.geometry[i - debug.first]?.H ?? null;
  const out: AutoReading[] = [];
  const save = (file: string, pic: Canvas) => {
    jpg(pic, join(dir, file), MAX_BYTES);
    return `${picDir}/${file}`;
  };
  const span = (us: number[], pad: number): [number, number] => [Math.max(-2, Math.min(...us) - pad), Math.min(42, Math.max(...us) + pad)];

  for (const reading of ["laydown", "touchdown", "arrows", "breakpoint"] as const) {
    const metric = m[reading];
    if (metric.value === null) {
      out.push({ reading, value: null, state: metric.state, extrapolated: false, frames: [] });
      continue;
    }
    const p = pick(reading, run, hand, null, "auto");
    if (!p) continue;
    const H = geo(p.frame);
    if (!H) {
      out.push({ reading, value: metric.value, state: metric.state, extrapolated: false, frames: [{ frame: t.number(p.frame), readFrame: p.frame, timeSeconds: t.time(p.frame), picture: null, width: null, height: null, ball: p.ball, note: "no lane mapping on this frame" }] });
      continue;
    }
    const notes = [...p.notes];
    let extrapolated = false;
    const readU = laneU(metric.value, hand);
    const ballU = p.ball ? laneU(p.ball.board, hand) : readU;
    const [u0, u1] = span([readU, ballU], 7);
    let v = p.feet;
    const ballV = p.ball?.feet ?? p.feet;
    if (reading === "laydown") {
      const rel = debug.release;
      if (!rel) {
        extrapolated = true;
        notes.unshift("EXTRAPOLATED: the ball was not followed to the foul line; the ring is the fitted path run back to 0 ft and the frame shown is the nearest sighting");
      } else if (rel.by === "time") {
        notes.unshift("the frame the ball's timing puts it on the foul line (its first distance on the lane over its speed), whatever its height in the picture");
      } else if (!rel.reached) {
        notes.unshift("the ball never reached the foul line's row on any frame: this is the frame where it comes lowest, and the laydown is read there");
      }
    } else if (reading === "touchdown") {
      v = m.touchdownFeet.value ?? p.feet;
      if (result.touchdownFrame === null) {
        extrapolated = true;
        notes.unshift("EXTRAPOLATED: no first-contact frame; shown on the sighting nearest the touchdown distance");
      }
    } else if (reading === "arrows") {
      v = 15;
      const gap = Math.abs(ballV - 15);
      if (gap > 1 || metric.state !== "measured") {
        extrapolated = true;
        notes.unshift(`ESTIMATED: the ball was seen ${gap.toFixed(1)} ft from the arrows' 15 ft on this frame; the tick is the fitted line's board at 15 ft`);
      }
    } else {
      v = m.breakpointFeet.value ?? p.feet;
      if (Math.abs(ballV - v) > 1 || metric.state !== "measured") {
        extrapolated = true;
        notes.unshift(`ESTIMATED: breakpoint comes from the fitted path; the nearest sighting is ${Math.abs(ballV - v).toFixed(1)} ft from ${v.toFixed(1)} ft`);
      }
    }
    const vlo = Math.min(v, ballV) - (reading === "laydown" ? 3 : 2.5);
    const vhi = Math.max(v, ballV) + (reading === "laydown" ? 3 : 2.5);
    const asRing = reading === "laydown" || reading === "touchdown";
    const pic = renderCrop(colorOf(p.frame), {
      H,
      lane: [[u0, vlo], [u1, vlo], [u0, vhi], [u1, vhi]],
      discs: p.disc ? [p.disc] : [],
      disc: p.disc,
      k: 3,
      foul: reading === "laydown" || reading === "touchdown",
      ringAt: asRing ? { u: readU, v } : undefined,
      ticks: asRing ? [] : [{ u: readU, v, color: MARK, label: metric.value.toFixed(1) }],
      row: asRing ? undefined : v,
      label: [stamp(t, p.frame), `b${metric.value.toFixed(1)}`, ...(p.ball ? [`b${p.ball.board.toFixed(1)} ${p.ball.feet.toFixed(1)} ft`] : [])]
    });
    const file = `auto-${reading}.jpg`;
    out.push({
      reading,
      value: metric.value,
      state: metric.state,
      extrapolated,
      frames: [{ frame: t.number(p.frame), readFrame: p.frame, timeSeconds: t.time(p.frame), picture: save(file, pic), width: pic.width, height: pic.height, ball: p.ball, note: notes.join("; ") }]
    });
  }

  // Pins: the frame the reading is taken on and the four before it.
  const pinsM = m.pins;
  const lastSeen = sights.filter((s) => !s.airborne);
  if (pinsM.value !== null && lastSeen.length) {
    const p = pick("pins", run, hand, null, "auto");
    if (p) {
      const frames: AutoFrame[] = [];
      const readU = laneU(pinsM.value, hand);
      const shown = p.frame;
      const discOf = (f: number): { cx: number; cy: number; r: number; source: string } | null => {
        const s = sights.find((x) => x.frame === f);
        if (s) return { cx: s.cx, cy: s.cy, r: s.r, source: "sighting" };
        const d = debug.toPins?.find((x) => x.frame === f);
        if (d) return { cx: d.cx, cy: d.cy, r: d.r, source: "followed by its face" };
        return null;
      };
      const list = pinsFrames ?? [shown - 4, shown - 3, shown - 2, shown - 1, shown];
      const discs = list.map(discOf);
      const Hs = list.map(geo);
      const Href = Hs[list.indexOf(shown)] ?? Hs[Hs.length - 1] ?? Hs.find((h) => h) ?? null;
      let box: Crop["box"];
      if (Href) {
        const us = [readU, ...list.map((f, i) => (Hs[i] && discs[i] ? laneU(handedBoard(uAtColumn(Hs[i]!, discs[i]!.cx, PIN_V), hand), hand) : readU))];
        const [u0, u1] = span(us, 6);
        box = boxOf(Href, [[u0, PIN_V - 4], [u1, PIN_V - 4], [u0, PIN_V + 1.5], [u1, PIN_V + 1.5]], t.width, t.height, 4, discs.flatMap((d) => (d ? [{ x: d.cx - 1.5 * d.r, y: d.cy - 1.5 * d.r }, { x: d.cx + 1.5 * d.r, y: d.cy + 1.5 * d.r }] : [])));
      }
      list.forEach((f, i) => {
        const H = Hs[i];
        const d = discs[i];
        const when = f === shown ? "reading frame" : f < shown ? `${shown - f} before` : `${f - shown} after`;
        if (f < 0 || f >= t.count || !H) {
          frames.push({ frame: t.number(f), readFrame: f, timeSeconds: f >= 0 && f < t.count ? t.time(f) : NaN, picture: null, width: null, height: null, ball: null, note: `${when}: no lane mapping on this frame` });
          return;
        }
        const board = d ? handedBoard(uAtColumn(H, d.cx, PIN_V), hand) : null;
        const ticks: NonNullable<Crop["ticks"]> = [{ u: readU, v: PIN_V, color: MARK, label: pinsM.value!.toFixed(1) }];
        if (board !== null) ticks.push({ u: laneU(board, hand), v: PIN_V, color: TICK, label: board.toFixed(1) });
        const pic = renderCrop(colorOf(f), {
          H,
          lane: [[0, PIN_V - 4], [40, PIN_V - 4], [0, PIN_V + 1.5], [40, PIN_V + 1.5]],
          discs: d ? [d] : [],
          disc: d,
          box,
          k: 6,
          foul: false,
          ticks,
          row: PIN_V,
          label: [`${stamp(t, f)} ${i + 1}/${list.length}`, `b${pinsM.value!.toFixed(1)}`, ...(board !== null ? [`b${board.toFixed(1)}`] : [])]
        });
        frames.push({
          frame: t.number(f),
          readFrame: f,
          timeSeconds: t.time(f),
          picture: save(pinsFile(i + 1), pic),
          width: pic.width,
          height: pic.height,
          ball: board !== null ? { board, feet: PIN_V } : null,
          note: `${when}; ${d ? `ball ${d.source}, board it reads on the head pin's row ${board!.toFixed(2)}` : "ball not seen on this frame (so no board is read from it)"}${f === shown ? `; ${p.notes.join("; ")}` : ""}`
        });
      });
      const last = lastSeen[lastSeen.length - 1];
      out.push({ reading: "pins", value: pinsM.value, state: pinsM.state, extrapolated: 60 - last.v > 0.5 && !followedPins(run, hand), frames });
    }
  }
  return out;
}
