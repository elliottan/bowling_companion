import { apply, downAt, intersect, lineThrough, mapLine } from "./homography";
import { CONTACT_IN, handedBoard, imageToLane, laneU } from "./laneModel";
import type { TraceDebug, TraceOutput } from "./pipeline";
import type { FrameSource } from "./registration";
import { uAtColumn } from "./release";
import type { BallSighting, GrayFrame, Mat3, Metric, Point, TrackResult } from "./types";
import type { Handedness } from "../../types/bowling";

/**
 * Which frame each reading of a trace was taken on, and what the tracer saw
 * on it: the choice the review pictures make (`scripts/shot-tracker/
 * review-frames.ts`) and the result screen's pictures make alike. The frames
 * themselves are kept as small crops with their drawing (`readingShots`),
 * since the tracer's frames are given away to its workers.
 */

export const READINGS = ["laydown", "touchdown", "arrows", "breakpoint", "pins"] as const;
export type ReadingName = (typeof READINGS)[number];

/** Where the board at the pins is read: the head pin's contact row. */
export const PIN_V = 60 - CONTACT_IN / 12;

export interface Ok { result: TrackResult; debug: TraceDebug }

/** The frame one trace took one reading on. */
export interface Pick {
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
export function followedPins(run: Ok, hand: Handedness): { u: number; frame: number; frames: number[] } | null {
  const read = run.debug.pinsRead;
  const target = run.result.metrics.pins.value;
  if (!read || target === null || Math.abs(handedBoard(read.u, hand) - target) > 1e-6) return null;
  return read;
}

export function pickFrame(name: ReadingName, run: Ok, hand: Handedness, otherFeet: number | null, who: string): Pick | null {
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

/** The readings a picture is kept for, in the order the result lists them. */
export type ShotKey = ReadingName | "launchSpeed" | "entrySpeed";

/**
 * One frame as the result screen shows it: a gray crop around the ball, and
 * what the tracer drew on it, in the crop's own pixels (a pixel's centre at
 * its index plus a half, as a canvas draws it).
 */
export interface FramePart {
  /** The frame's index in the frames the tracer was given. */
  frame: number;
  /** Seconds from the start of the clip. */
  t: number;
  /** The crop's size, pixels. */
  width: number;
  height: number;
  /** Row-major luma, `width * height`. */
  gray: Uint8ClampedArray;
  /** The ball as the tracer saw it. */
  disc: { cx: number; cy: number; r: number } | null;
  /** Where the reading is taken: the point under the ball, or, for an estimated reading, where the fitted path is at it. */
  cross: Point | null;
  /** The board's line through the reading (the row's line, for a speed). */
  line: [Point, Point] | null;
  /** How far down the lane the ball was seen on this frame, feet (null when not placed). */
  feet: number | null;
}

/** A reading with the frame or frames it was taken on. */
export interface ReadingShot {
  reading: ShotKey;
  /** The ball was not seen where the reading is taken: it is read off the fitted path, and the picture is the nearest frame the ball was seen on. */
  estimated: boolean;
  /** One frame for a board; for a speed, the first and the last of the stretch it was measured over (one when they are the same). */
  parts: FramePart[];
}

/** The crop is never smaller than this, nor larger, in pixels. */
export const CROP_MIN = 72;
export const CROP_MAX = 240;
/** The crop holds the ball with this much room round it, in radii. */
const BALL_ROOM = 1.6;
/** And at least this many boards across, so the board line has boards round it to read. */
const CROP_BOARDS = 16;
/** The board's line is drawn this many feet each side of the row it is read on. */
const LINE_FEET = 6;

/**
 * The part of a `width` by `height` frame to keep: a box that holds every
 * point of `around` with room (`pad`, 1.25 times the span at the least),
 * between `CROP_MIN` and `CROP_MAX` pixels square, moved to lie inside the
 * frame. Whole pixels. A frame smaller than the box gives the frame's own
 * size on that side.
 */
export function cropBox(around: Point[], width: number, height: number, least: number): { x: number; y: number; w: number; h: number } {
  const xs = around.map((p) => p.x);
  const ys = around.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const side = Math.round(Math.min(CROP_MAX, Math.max(CROP_MIN, least, 1.25 * Math.max(x1 - x0, y1 - y0))));
  const w = Math.min(side, width);
  const h = Math.min(side, height);
  const x = Math.round(Math.min(Math.max(0, (x0 + x1) / 2 - w / 2), width - w));
  const y = Math.round(Math.min(Math.max(0, (y0 + y1) / 2 - h / 2), height - h));
  return { x, y, w, h };
}

/** Pixels per board across the lane at row `v`, in the frame whose mapping is `H`. */
function boardPixels(H: Mat3, v: number): number {
  const a = apply(H, { x: 20, y: v });
  const b = apply(H, { x: 21, y: v });
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The gray crop of `frame` in `box`, as bytes. */
function crop(frame: GrayFrame, box: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(box.w * box.h);
  for (let y = 0; y < box.h; y++) {
    const row = (y + box.y) * frame.width + box.x;
    for (let x = 0; x < box.w; x++) out[y * box.w + x] = frame.data[row + x];
  }
  return out;
}

/** The ball, the cross and the line of one frame, in the frame's pixels; `H` is that frame's lane mapping. */
interface Marks {
  disc: { cx: number; cy: number; r: number } | null;
  cross: Point | null;
  line: [Point, Point] | null;
  feet: number | null;
}

/** The frame cut to the crop that holds its marks, and the marks in the crop's pixels. */
function partOf(frame: GrayFrame, index: number, marks: Marks, H: Mat3 | null, row: number): FramePart {
  const { disc, cross, line } = marks;
  const around: Point[] = [];
  if (disc) around.push({ x: disc.cx - BALL_ROOM * disc.r, y: disc.cy - BALL_ROOM * disc.r }, { x: disc.cx + BALL_ROOM * disc.r, y: disc.cy + BALL_ROOM * disc.r });
  if (cross) around.push(cross);
  if (!around.length) around.push({ x: frame.width / 2, y: frame.height / 2 });
  const box = cropBox(around, frame.width, frame.height, H ? CROP_BOARDS * boardPixels(H, row) : 0);
  const at = (p: Point): Point => ({ x: p.x - box.x + 0.5, y: p.y - box.y + 0.5 });
  return {
    frame: index,
    t: frame.t,
    width: box.w,
    height: box.h,
    gray: crop(frame, box),
    disc: disc ? { cx: disc.cx - box.x + 0.5, cy: disc.cy - box.y + 0.5, r: disc.r } : null,
    cross: cross ? at(cross) : null,
    line: line ? [at(line[0]), at(line[1])] : null,
    feet: marks.feet
  };
}

/**
 * Whether the ball was not seen where `name` is read: its state says so, or it
 * is read off the fitted path (the follow back to the foul line failed, no
 * first contact was seen, the nearest sighting is more than a foot from the
 * reading's distance, the ball was last seen short of the pins).
 */
export function isEstimated(name: ReadingName, run: Ok, p: Pick, hand: Handedness): boolean {
  const { result, debug } = run;
  if (p.metric.state !== "measured") return true;
  const gap = p.ball ? Math.abs(p.ball.feet - p.feet) : Infinity;
  switch (name) {
    case "laydown":
      return !debug.release;
    case "touchdown":
      return result.touchdownFrame === null;
    case "arrows":
    case "breakpoint":
      return gap > 1;
    case "pins": {
      const seen = result.sightings.filter((s) => !s.airborne);
      return 60 - seen[seen.length - 1].v > 0.5 && !followedPins(run, hand);
    }
  }
}

/** The picture of a board reading: its frame, the ball, the cross and the board's line. */
function boardShot(name: ReadingName, run: Ok, source: FrameSource): ReadingShot | null {
  const { result, debug } = run;
  const hand = result.hand;
  const value = result.metrics[name].value;
  if (value === null) return null;
  const p = pickFrame(name, run, hand, null, "app");
  if (!p || p.frame < 0 || p.frame >= source.count) return null;
  const frame = source.frame(p.frame);
  const H = debug.geometry[p.frame - debug.first]?.H ?? null;
  const estimated = isEstimated(name, run, p, hand);
  let cross: Point | null = null;
  let line: [Point, Point] | null = null;
  if (H) {
    const u = laneU(value, hand);
    line = [apply(H, { x: u, y: p.feet - LINE_FEET }), apply(H, { x: u, y: p.feet + LINE_FEET })];
    if (estimated || !p.disc) cross = apply(H, { x: u, y: p.feet });
    else {
      // The point under the ball, one radius straight down the lane from its centre.
      const down = downAt(H, { x: p.disc.cx, y: p.disc.cy });
      cross = { x: p.disc.cx + p.disc.r * down.x, y: p.disc.cy + p.disc.r * down.y };
    }
  }
  return { reading: name, estimated, parts: [partOf(frame, p.frame, { disc: p.disc, cross, line, feet: p.ball?.feet ?? null }, H, p.feet)] };
}

/**
 * The sightings a speed was measured over (`speeds.ts`): launch, those in the
 * first 15 ft; entry, the last 15 ft before the head pin and before the rack
 * moved.
 */
export function speedStretch(key: "launchSpeed" | "entrySpeed", result: TrackResult): BallSighting[] {
  const seen = result.sightings.filter((s) => !s.airborne);
  if (key === "launchSpeed") return seen.filter((s) => s.v >= -1 && s.v <= 15);
  const before = seen.filter((s) => s.v <= 60.5 && (result.pinFrame === null || s.frame < result.pinFrame));
  return before.filter((s) => s.v >= 45);
}

/** The picture of a speed: the first and the last frame of the stretch it was measured over, the ball on each and the row it was at. */
function speedShot(key: "launchSpeed" | "entrySpeed", run: Ok, source: FrameSource): ReadingShot | null {
  const { result, debug } = run;
  const metric = result.metrics[key];
  if (metric.value === null) return null;
  const stretch = speedStretch(key, result);
  if (!stretch.length) return null;
  const ends = stretch[0] === stretch[stretch.length - 1] ? [stretch[0]] : [stretch[0], stretch[stretch.length - 1]];
  const parts = ends.flatMap((s) => {
    if (s.frame < 0 || s.frame >= source.count) return [];
    const H = debug.geometry[s.frame - debug.first]?.H ?? null;
    const line: [Point, Point] | null = H ? [apply(H, { x: 0.5, y: s.v }), apply(H, { x: 39.5, y: s.v })] : null;
    return [partOf(source.frame(s.frame), s.frame, { disc: s, cross: s.contact, line, feet: s.v }, H, s.v)];
  });
  return parts.length ? { reading: key, estimated: metric.state !== "measured", parts } : null;
}

/** Every reading of a traced shot that has a frame behind it, with its frame or frames kept as crops. */
export function readingShots(output: TraceOutput, source: FrameSource): ReadingShot[] {
  if (!output.result.ok) return [];
  const run: Ok = { result: output.result, debug: output.debug };
  const shots: ReadingShot[] = [];
  for (const name of READINGS) {
    const s = boardShot(name, run, source);
    if (s) shots.push(s);
  }
  for (const key of ["launchSpeed", "entrySpeed"] as const) {
    const s = speedShot(key, run, source);
    if (s) shots.push(s);
  }
  return shots;
}

/** How a frame's time is turned into its number in the video. */
export interface Numbering {
  /** The time of every frame the file shows, ascending (`shownTimes` of its sample table), or null where the file's table could not be read. */
  times: readonly number[] | null;
  /** The video's own step between frames, seconds, when it was seen. */
  step: number | null;
}

/**
 * The frame's own number in the video, counted from 0 as the video's frames
 * are listed: the index of the frame shown nearest `t` in the sample table,
 * else `t` over the video's step. Null when neither is known.
 */
export function videoFrameNumber(t: number, numbering: Numbering): number | null {
  const times = numbering.times;
  if (times && times.length) {
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t) ? lo - 1 : lo;
  }
  return numbering.step && numbering.step > 0 ? Math.max(0, Math.round(t / numbering.step)) : null;
}
