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
import { apply, mapLine } from "../../src/lib/shotTrack/homography";
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

/**
 * The board at the pins as `pipeline.ts` reads it by following the ball's
 * darkness past its last sighting (the formulas are the pipeline's), or null
 * when the reading came from the fitted sightings instead.
 */
function followedPins(run: Ok, hand: Handedness, lastSeen: BallSighting): { u: number; frames: number[] } | null {
  const { result, debug } = run;
  const track = debug.toPins;
  const target = result.metrics.pins.value;
  if (!track || !track.length || target === null) return null;
  const geo = (i: number) => debug.geometry[i - debug.first]?.H;
  const cols = (d: { frame: number; cx: number }) => {
    const H = geo(d.frame);
    return H ? uAtColumn(H, d.cx, PIN_V) : NaN;
  };
  const same = (u: number) => Number.isFinite(u) && Math.abs(handedBoard(u, hand) - target) < 1e-6;
  if (result.pinFrame !== null) {
    const near = [{ frame: lastSeen.frame, cx: lastSeen.cx }, ...track].slice(-4);
    const xs = near.map((d) => d.frame);
    const ys = near.map(cols);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = den > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den : 0;
    const u = my + slope * (result.pinFrame - 0.5 - mx);
    return same(u) ? { u, frames: xs } : null;
  }
  const tail = track.slice(-3);
  const u = tail.reduce((a, d) => a + cols(d), 0) / tail.length;
  return same(u) ? { u, frames: tail.map((d) => d.frame) } : null;
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
      notes.push(
        `read from the release follow-back: the ball's bottom ${rel.reached ? "was last on the foul line's row" : "never reached the foul line's row, so it is read where it comes lowest"} at fractional frame ${rel.at.toFixed(2)}, shown on frame ${entry.frame}`
      );
      notes.push("the ball is not a sighting here (hand and body over it): the circle is the disc followed back by its darkness, and its lane position is the foul line point straight below its centre");
      return { frame: entry.frame, disc: entry, ball: H ? { board: handedBoard(footU(H, entry.cx), hand), feet: 0 } : null, metric, feet: 0, notes };
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
  const f = followedPins(run, hand, last);
  if (f) {
    const track = debug.toPins!;
    const d = track[track.length - 1];
    const H = geo(d.frame);
    notes.push(`read by following the ball's darkness past its last sighting (frame ${last.frame}, ${last.v.toFixed(1)} ft) through frames ${f.frames.join(", ")} on the head pin's row; the frame shown is the last followed one, ${d.frame}`);
    if (result.pinFrame !== null) notes.push(`result.pinFrame ${result.pinFrame} (the rack first seen moving) is ${result.pinFrame - d.frame} frame(s) after the frame shown; the reading is a line through the last four boards read at ${(result.pinFrame - 0.5).toFixed(1)}, so the cross sits a half frame to a frame ahead of the ball`);
    else notes.push("result.pinFrame is not set (the rack was never seen to move, the bowler's arm is over it)");
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
  const k = Math.max(1, Math.min(BOARD_PX / Math.max(boardPx, 0.1), MAX_W / box.w));
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
    const s = 9;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      rawLine(c, q.x - s + dx, q.y + dy, q.x + s + dx, q.y + dy, [0, 0, 0], { alpha: 0.5 });
      rawLine(c, q.x + dx, q.y - s + dy, q.x + dx, q.y + s + dy, [0, 0, 0], { alpha: 0.5 });
    }
    rawLine(c, q.x - s, q.y, q.x + s, q.y, CROSS);
    rawLine(c, q.x, q.y - s, q.x, q.y + s, CROSS);
    const lab = p.metric.value.toFixed(1);
    text(c, Math.round(Math.min(c.width - lab.length * 12 - 2, q.x + 8)), Math.round(Math.max(2, q.y - 22)), lab, CROSS, 3);
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
