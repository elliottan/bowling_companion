import { DECK_END_FT, imageToLane, LEFT_U, RIGHT_U } from "./laneModel";
import { keptFps, thinFrames } from "./marking";
import type { FrameLane } from "./laneTrack";
import { COARSE_FPS, LEAD_SECONDS, type Band, type RunPoint, type ShotFound } from "./shotStart";
import { lineSpeed } from "./speeds";

/**
 * The stretch of a video the tracer reads (Settings, Labs; the owner,
 * 2026-11-15: "Detect the moment the ball is right on the foul line, until it
 * hits the pins (exits the pin deck). That is the minimal time required. Crop
 * out everything outside of that."):
 *
 * 1. The first look (`shotStart.ts`) finds the ball's run up the lane, a few
 *    frames at 15 a second over its first few feet, in picture fractions.
 * 2. The read's first part (`firstPart`) runs from a little before the run to
 *    `FIRST_SECONDS` after it, and the lane is found on it.
 * 3. The run, put through the found lane, is in feet against time: the straight
 *    line through it says when the ball crossed the foul line and how fast it
 *    went (`runFeet`, `shotWindow`). It leaves the deck by the time that speed,
 *    less what a ball loses down the lane, covers `DECK_END_FT`.
 * 4. The rest is read to there, and the frames before the foul line are
 *    dropped: the tracer gets the shot and only the shot.
 *
 * Without a speed (the run is not on the found lane, or it gives no believable
 * speed) the end is the pins seen hit in the first look, where that is
 * believable, else the time the slowest ball (`SLOWEST_FTS`) takes to the deck
 * end.
 *
 * What the tracer needs at either end, from `pipeline.ts`: the laydown is read
 * by following the ball back from its first sighting to the frame it sits on
 * the foul line (`release.ts`), on that frame's own lane, which is blended
 * from the lanes found on the frames either side of it (`laneTrack`), so a
 * found lane before the crossing as well as after (`FOUL_LEAD`); the empty
 * lane is the median of the read's own frames, in which the ball is at any
 * spot for a few frames only, so no frames before the release are needed
 * for it; the board at the pins and the pins' movement are read in the
 * frames up to and just after the ball meets the head pin, inside the deck.
 * Pure.
 */

/** The read's first part, seconds after its start: the run and a second more, the lane found on it. */
export const FIRST_SECONDS = 1.6;
/**
 * Kept before the ball crosses the foul line, seconds: the frames the laydown
 * is followed back over, and a found lane before the crossing (the lane is
 * looked for every `LANE_EVERY`, 0.15 s, and each frame's lane is blended
 * from those within about 0.25 s, `laneTrack`). The crossing is put early
 * rather than late (the run's points are the ball's middle, a little above
 * the lane while it is in the hand, so they read a little further down it
 * than the ball is), but the first look's run is coarse: on shot-05 it put
 * the crossing 0.1 s late. At 0.2 s the crossing frame's lane came from
 * found lanes after it only, and the laydown read 18.9 on shot-05 and 18.7 on
 * IMG_1996 against 18.6 and 18.4 read from any earlier start (2026-11-17,
 * `app-read.ts`); from 0.33 s on the reading no longer moved.
 */
export const FOUL_LEAD = 0.4;
/**
 * The read's frame budget (`keptFps`) counts the window from this long before
 * the crossing: the rest of the lead is a few frames read over it (12 at 60 a
 * second), so a long shot is not read at half the rate for them.
 */
export const COUNTED_LEAD = 0.2;

/** Where the read's frame budget starts counting (`COUNTED_LEAD`): the window's start where the crossing is not known. */
export function budgetFrom(w: ShotWindow, start: number): number {
  return w.foul !== null ? Math.max(start, w.foul - COUNTED_LEAD) : start;
}
/** Kept after it leaves the deck, seconds: the coarse run's own uncertainty. */
export const END_MARGIN = 0.25;
/**
 * The run's speed is measured over its first feet; a ball loses 5 to 15% of it
 * by the pins, and the first look's blobs are coarse: on IMG_1996 (shot-05's
 * original) the run read 31 ft/s over 7.7 to 12.8 ft where the tracer read
 * the launch at 24.5. The deck end is reached by `DECK_END_FT` over the speed,
 * this much longer.
 */
export const END_SLACK = 1.4;
/**
 * The most speed the end is reckoned at, ft/s (17.7 mph, a common launch
 * speed). The first look's speed is rough and mostly too fast (the ball in
 * the hand reads ahead of itself): two looks at IMG_1996 read 36 and 43 ft/s
 * where the tracer read 25, and the ends 0.2 s apart moved the readings. A
 * faster ball is read a little longer than it needs; a slower one by its own
 * speed.
 */
export const END_FTS = 26;
/**
 * The run's points from this far down the lane are out of the bowler's hand:
 * nearer, the ball is still carried a foot or so above the lane, and through
 * the lane it reads further than it is (IMG_1996: 3 ft in a fifteenth of a
 * second, 45 ft/s). They are used alone when there are enough of them.
 */
export const OUT_OF_HAND_FT = 2;
/** The slowest ball read without a speed: 10 mph, 14.7 ft/s (4.3 s to the deck end). */
export const SLOWEST_FTS = 10 * (5280 / 3600);
/** The fastest believable ball, ft/s: 27 mph. */
export const FASTEST_FTS = 27 * (5280 / 3600);
/** The pins seen hit count only this long after the release, seconds: a 27 mph to an 8 mph ball. */
const PINS_FROM = 60 / FASTEST_FTS;
const PINS_TO = 60 / (8 * (5280 / 3600));

/**
 * The window's edges are put on a grid of this many a second, from the
 * video's start: the first look's slots (`COARSE_FPS`). The tracer's readings
 * move with the first frame it is given (IMG_1996, the same frames but one at
 * the start: laydown 27.1 and 19.9), and the run the edges come from is seen
 * a frame later on one look than another; on the grid, both give one edge.
 */
export const EDGE_GRID = COARSE_FPS;
/** A frame time stored to the millisecond can be this much under the slot it is on. */
const EDGE_EARLY = 0.002;

/** The read's first part: from `LEAD_SECONDS` before the run (on the grid, `EDGE_GRID`) to `FIRST_SECONDS` later, inside the video. */
export function firstPart(found: ShotFound, duration: number): { from: number; to: number } {
  const from = Math.max(0, Math.round((found.release - LEAD_SECONDS) * EDGE_GRID) / EDGE_GRID);
  return { from, to: Math.min(Number.isFinite(duration) ? duration : Infinity, from + FIRST_SECONDS) };
}

/**
 * The run's points in a read frame's pixels: the frame is `frame` pixels, the
 * picture's rows in `band` (fractions of its height, null for all) scaled to
 * it. The run is in fractions of the whole picture.
 */
export function runInFrame(run: readonly RunPoint[], band: Band | null, frame: { width: number; height: number }): { t: number; x: number; y: number }[] {
  const top = band?.top ?? 0;
  const tall = (band?.bottom ?? 1) - top;
  return run.map((p) => ({ t: p.t, x: p.x * frame.width, y: ((p.y - top) / tall) * frame.height }));
}

/**
 * The run in lane feet: each point through the found lane nearest it in time
 * (`lanes` on frames whose times are `times`). The run's points are the
 * ball's middle, not the spot under it; a few tenths of a foot further on, the
 * same for every point near the foul line.
 */
export function runFeet(points: readonly { t: number; x: number; y: number }[], lanes: readonly FrameLane[], times: readonly number[]): { t: number; u: number; v: number }[] {
  if (!lanes.length) return [];
  return points.map((p) => {
    const lane = lanes.reduce((best, l) => (Math.abs(times[l.frame] - p.t) < Math.abs(times[best.frame] - p.t) ? l : best));
    const q = imageToLane(lane.H, { x: p.x, y: p.y });
    return { t: p.t, u: q.u, v: q.v };
  });
}

export interface ShotWindow {
  /** When the ball crossed the foul line, seconds, when the run gave it. */
  foul: number | null;
  /** When the read ends: the ball has left the deck. */
  end: number;
  /** What the end came from: the ball found in the read's frames (`ballFind.ts`), a run of the first look's at a ball's speed, the pins seen hit, or the slowest ball. */
  by: "seen" | "speed" | "pins" | "slowest";
  /** The run's speed, ft/s, when it gave one. */
  speed: number | null;
}

/** A point is on a line through a run when within this many feet of it, and a tenth of its distance more (far down the lane a pixel is a foot). */
export const LINE_NEAR_FT = 2;
/**
 * The run's points from this far behind the foul line to the pins count: the
 * ball in the hand on the last steps reads 6 ft behind it (IMG_1996), the
 * bowler's approach 10 ft and more.
 */
const ON_LANE = { from: -8, to: 62 };

/** A point of a run through the lane: seconds, feet from the foul line and, when known, boards across. */
type Feet = { t: number; v: number; u?: number };

/**
 * Boards across a run's points must be inside: the lane and a ball's width
 * over either gutter. A ball on the next lane (IMG_1996, a run at the
 * picture's left edge, 4 to 15 ft at 39 ft/s) is boards outside it.
 */
export const ACROSS = { from: LEFT_U - 5, to: RIGHT_U + 5 };

/** Three points or more over 3 ft or more. */
const enough = (ps: readonly Feet[]) => ps.length >= 3 && Math.max(...ps.map((p) => p.v)) - Math.min(...ps.map((p) => p.v)) >= 3;
/**
 * A speed a ball can have, ft/s: points still in the hand read fast (IMG_1996:
 * 42 to 48 ft/s where the tracer read 25), so up to `HAND_FAST` over the
 * fastest ball.
 */
export const HAND_FAST = 1.3;
const ballSpeed = (s: number | null): s is number => s !== null && s >= SLOWEST_FTS * 0.8 && s <= FASTEST_FTS * HAND_FAST;
/**
 * A run that starts further than this down the lane only votes (`ballRun`):
 * the first look sees the ball first in its first feet, and a run first seen
 * 22 ft out at 2 s on IMG_1996, a second and a half before the ball, won a
 * look the ball's own run was missing from.
 */
export const FIRST_SEEN_FT = 12;
/**
 * A run with a point further than this behind the foul line or past the pins
 * is not on the lane at all (a thing above it, the masking units, reads
 * hundreds of feet through the lane), and is not the ball's.
 */
const OFF_LANE = { from: -20, to: 62 };

/** The straight line (feet against seconds) through points: its speed and when it crossed the foul line. */
function lineOf(ps: readonly Feet[]): { speed: number; foul: number; at: (t: number) => number } | null {
  const speed = lineSpeed(ps);
  if (!ballSpeed(speed)) return null;
  const mt = ps.reduce((a, p) => a + p.t, 0) / ps.length;
  const mv = ps.reduce((a, p) => a + p.v, 0) / ps.length;
  return { speed, foul: mt - mv / speed, at: (t) => mv + speed * (t - mt) };
}

/**
 * Why a run in feet is or is not the ball's (`ballRun` keeps the "ball"
 * ones): off the lane (a point far behind the foul line or past the pins),
 * on the next lane, too few points or feet, not every step up the lane,
 * first seen too far out, never past the foul line (`PAST_LINE_FT`), or too slow or
 * too fast for a ball (a speed outside what `ballRun` takes, or none).
 */
export type RunVerdict = "ball" | "off-lane" | "next-lane" | "too-short" | "not-up-lane" | "starts-far" | "short-of-line" | "too-slow" | "too-fast";

/**
 * A run of the ball's goes past the foul line by this much, feet: the ball
 * is let go at the foul line and from there goes only up the lane, so a run
 * that stays behind it is the bowler, whatever its pace. How far behind the
 * line a run starts does not tell: the ball at the bottom of the swing read
 * 6.3 ft behind it on shot-03, the ball in the pushaway, two seconds before
 * the shot, 7 ft on IMG_1996. That is told by the frames after a crossing
 * (`ballFind.ts`, `readShot.ts`).
 */
export const PAST_LINE_FT = 1;

export function runVerdict(r: readonly Feet[]): RunVerdict {
  if (r.some((p) => p.v < OFF_LANE.from || p.v > OFF_LANE.to)) return "off-lane";
  // The bowler's lane, not the next one.
  if (r.some((p) => p.u !== undefined && p.v >= ON_LANE.from && (p.u < ACROSS.from || p.u > ACROSS.to))) return "next-lane";
  const own = r.filter((p) => p.v >= ON_LANE.from && p.v <= ON_LANE.to);
  // The ball only goes up the lane, and the first look sees it first near the foul line.
  if (!enough(own)) return "too-short";
  if (own.some((p, i) => i > 0 && p.v <= own[i - 1].v)) return "not-up-lane";
  if (own[0].v > FIRST_SEEN_FT) return "starts-far";
  if (own[own.length - 1].v < PAST_LINE_FT) return "short-of-line";
  const speed = lineSpeed(own);
  if (!ballSpeed(speed)) return speed !== null && speed > FASTEST_FTS * HAND_FAST ? "too-fast" : "too-slow";
  return "ball";
}

/**
 * The ball's run up the lane among the first look's runs, each in feet
 * (`runFeet`): every run of three points or more over 3 ft that goes up the
 * lane at a ball's speed, all of it on the lane and every step up it, puts a
 * straight line through its points, and the
 * line of a run seen crossing the foul line (from the hand out onto the
 * lane: nothing else does), then the one most of all the runs' points lie on
 * (`LINE_NEAR_FT`), then the one over more feet, is the ball's. A run seen
 * crossing gives the crossing between its points either side of the line. The ball is often seen in
 * pieces (IMG_1996: 3.5 to 3.9 s near the foul line, then 4.3 to 4.6 s 35 ft
 * on), and the pieces vote together. The bowler's approach is behind the foul
 * line and slow, and gives no line. Its speed and foul line crossing are then
 * from all the points on it, those still in the hand left out where enough
 * are past it (`OUT_OF_HAND_FT`). Null when no run is the ball's.
 */
export function ballRun(runs: readonly (readonly Feet[])[]): { speed: number; foul: number; points: number } | null {
  const all = new Map<string, Feet>();
  for (const r of runs) for (const p of r) if (p.v >= ON_LANE.from && p.v <= ON_LANE.to) all.set(`${p.t}/${p.v}`, p);
  const points = [...all.values()];
  let best: { on: Feet[]; own: Feet[]; key: number[] } | null = null;
  for (const r of runs) {
    if (runVerdict(r) !== "ball") continue;
    const own = r.filter((p) => p.v >= ON_LANE.from && p.v <= ON_LANE.to);
    const line = lineOf(own)!;
    const on = points.filter((p) => Math.abs(p.v - line.at(p.t)) <= LINE_NEAR_FT + 0.1 * Math.max(0, line.at(p.t)));
    const vs = on.map((p) => p.v);
    const span = Math.max(...vs) - Math.min(...vs);
    const crosses = own[0].v < 0 && own[own.length - 1].v > 0;
    const key = [crosses ? 1 : 0, on.length, span];
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && (key[1] > best.key[1] || (key[1] === best.key[1] && key[2] > best.key[2])))) best = { on, own, key };
  }
  if (!best) return null;
  const out = best.on.filter((p) => p.v >= OUT_OF_HAND_FT);
  const use = enough(out) ? out : best.on;
  const line = lineOf(use);
  if (!line) return null;
  // Seen crossing: when, between the points either side of the line. The
  // line's own crossing leans on its speed, which the points in the hand make
  // rough (two looks at IMG_1996 read 3.587 and 3.684 s that way).
  const k = best.key[0] ? best.own.findIndex((p) => p.v > 0) : -1;
  const foul = k > 0 ? best.own[k - 1].t + ((best.own[k].t - best.own[k - 1].t) * -best.own[k - 1].v) / (best.own[k].v - best.own[k - 1].v) : line.foul;
  return { speed: line.speed, foul, points: use.length };
}

/**
 * Where the shot is, from the first look's runs in feet (`runFeet`, through
 * the lane found on the read's first part; none when it was not found): the
 * ball's run (`ballRun`) says when it crossed the foul line, and at its speed
 * (no more than the fastest ball) when it has left the deck. No run is the
 * ball's: the pins seen hit, when that is believable, else the time the
 * slowest ball takes, from the run the first look chose.
 */
export function pickWindow(runs: readonly (readonly Feet[])[], found: ShotFound, duration: number): ShotWindow {
  const cap = (t: number) => Math.min(Number.isFinite(duration) ? duration : Infinity, t);
  const ball = ballRun(runs);
  if (ball) {
    const end = ball.foul + (DECK_END_FT / Math.min(ball.speed, END_FTS)) * END_SLACK + END_MARGIN;
    return { foul: ball.foul, end: cap(Math.ceil(end * EDGE_GRID) / EDGE_GRID), by: "speed", speed: ball.speed };
  }
  const after = found.pinHit !== null ? found.pinHit - found.release : NaN;
  if (after >= PINS_FROM && after <= PINS_TO) return { foul: null, end: cap(found.pinHit! + END_MARGIN + 0.15), by: "pins", speed: null };
  return { foul: null, end: cap(found.release + DECK_END_FT / SLOWEST_FTS + END_MARGIN), by: "slowest", speed: null };
}

/**
 * The ball found in the read's frames (`ballFind.ts`) is a ball rolling on
 * the lane, its speed the launch speed, not the first look's rough one: it
 * loses 5 to 15% of it by the pins, so it reaches the deck end by
 * `DECK_END_FT` over its speed (no more than `END_FTS`), this much longer.
 */
export const SEEN_SLACK = 1.2;

/** The window from the ball found in the read's frames: its foul line crossing, and the deck end at its speed. */
export function seenWindow(seen: { foul: number; speed: number }, duration: number): ShotWindow {
  const cap = (t: number) => Math.min(Number.isFinite(duration) ? duration : Infinity, t);
  const end = seen.foul + (DECK_END_FT / Math.min(seen.speed, END_FTS)) * SEEN_SLACK + END_MARGIN;
  return { foul: seen.foul, end: cap(Math.ceil(end * EDGE_GRID) / EDGE_GRID), by: "seen", speed: seen.speed };
}

/**
 * A part read sees the ball cross the foul line at `t` when `t` is inside it
 * with this long after it, seconds: the ball is then 8 ft or more up the lane
 * on enough frames to be found (`ballFind.ts`)...
 */
export const SEEN_ROOM = 0.4;
/** ...or this long before it: the ball is then a few feet out on its first frames. */
export const SEEN_EARLY = 0.1;

/** Whether a part read (`from` to `to`) would show the ball crossing the foul line at `t` (`SEEN_ROOM`, `SEEN_EARLY`). */
export function partSees(part: { from: number; to: number }, t: number): boolean {
  return t >= part.from - SEEN_EARLY - 1e-9 && t <= part.to - SEEN_ROOM + 1e-9;
}

/** The parts the video is stepped through when the ball is not where the first look said, seconds apart: each `FIRST_SECONDS` long, so neighbors share `FIRST_SECONDS - STEP_SECONDS - SEEN_ROOM - SEEN_EARLY`, and no crossing falls between two. */
export const STEP_SECONDS = 1.0;

/**
 * The next part to look for the ball in (`readShot.ts`), when none of the
 * parts `read` so far showed it: around the first of `hints` (times the ball
 * may have crossed the foul line, in the order to try them) that no part read
 * would have shown (`partSees`), from `LEAD_SECONDS` before it; else the
 * part of the video stepped through every `STEP_SECONDS` from its start,
 * nearest `near` first, that would show a crossing none read would. Null
 * when every crossing in the video would have been seen.
 */
export function seekPart(hints: readonly number[], read: readonly { from: number; to: number }[], duration: number, near: number): { from: number; to: number } | null {
  const end = Number.isFinite(duration) ? duration : 0;
  const seen = (t: number) => read.some((p) => partSees(p, t));
  for (const t of hints) {
    if (!Number.isFinite(t) || t < 0 || t > end || seen(t)) continue;
    const from = Math.max(0, Math.round((t - LEAD_SECONDS) * EDGE_GRID) / EDGE_GRID);
    return { from, to: Math.min(end, from + FIRST_SECONDS) };
  }
  const steps: { from: number; to: number }[] = [];
  for (let k = 0; k * STEP_SECONDS < end; k++) {
    const from = Math.min(k * STEP_SECONDS, Math.max(0, end - FIRST_SECONDS));
    if (!steps.some((p) => p.from === from)) steps.push({ from, to: Math.min(end, from + FIRST_SECONDS) });
  }
  const middle = (p: { from: number; to: number }) => (p.from + p.to) / 2;
  steps.sort((a, b) => Math.abs(middle(a) - near) - Math.abs(middle(b) - near) || a.from - b.from);
  // A crossing this part would show (to a twentieth of a second) that no part read would.
  const adds = (p: { from: number; to: number }) => {
    const first = Math.max(0, p.from - SEEN_EARLY);
    for (let k = 0; first + k * 0.05 <= p.to - SEEN_ROOM + 1e-9; k++) if (!seen(first + k * 0.05)) return true;
    return false;
  };
  return steps.find(adds) ?? null;
}

/** `pickWindow` from one run. */
export function shotWindow(feet: readonly Feet[], found: ShotFound, duration: number): ShotWindow {
  return pickWindow([feet], found, duration);
}

/** Where the window starts, seconds: `FOUL_LEAD` before the foul line, back to the grid (`EDGE_GRID`); -Infinity when the foul line was not found. */
export function windowStart(w: ShotWindow): number {
  return w.foul !== null ? Math.floor((w.foul - FOUL_LEAD) * EDGE_GRID) / EDGE_GRID : -Infinity;
}

/**
 * Whether the window is not the first part's to carry on from: the ball
 * crossed the foul line after the part, or the window starts before it (the
 * first look chose a run long before or after the ball's). The window is then
 * read on its own.
 */
export function windowOutside(w: ShotWindow, part: { from: number; to: number }): boolean {
  return w.foul !== null && (windowStart(w) < part.from - EDGE_EARLY || w.foul > part.to);
}

/**
 * The frames of a read to give the tracer: from `FOUL_LEAD` before the ball
 * crossed the foul line, when that is known, back to the slot before it on
 * the grid (`EDGE_GRID`), to the end.
 */
export function shotFrames(times: readonly number[], w: ShotWindow): number[] {
  const from = windowStart(w) - EDGE_EARLY;
  return times.flatMap((t, i) => (t >= from && t <= w.end ? [i] : []));
}

/** How a read in two parts goes on once the first part has said where the shot is (`splitRead`). */
export interface ReadSplit {
  /** The first part's frames to keep, by index: inside the window and on the grid of the rate kept. */
  keep: number[];
  /** The rate the whole window is kept at, frames a second (`keptFps`). */
  fps: number;
  /** What is left to read after the first part, or null when the window ends inside it. */
  rest: { from: number; to: number } | null;
}

/**
 * The read's second part, from the first (its frames' `times`, kept every
 * `step` seconds at `firstFps`, read to `firstTo`) and the window: the frames
 * outside the window let go, and the rest kept at the highest rate that fits
 * the whole window in the read's memory (`frameBytes` a frame), every `k`th
 * frame of the first part with `k` = the first rate over it. A slow shot is
 * read at a lower rate, never cut short. Pure.
 */
export function splitRead(times: readonly number[], step: number, firstFps: number, firstTo: number, w: ShotWindow, frameBytes: number): ReadSplit {
  const inside = shotFrames(times, w);
  const start = inside.length ? times[inside[0]] : firstTo;
  const fps = keptFps(w.end - budgetFrom(w, start), frameBytes);
  const k = Math.max(1, Math.ceil(firstFps / fps - 1e-6));
  const thinned = thinFrames(
    inside.map((i) => times[i]),
    step,
    k
  );
  return {
    keep: thinned.map((j) => inside[j]),
    fps: firstFps / k,
    rest: w.end > firstTo + 1e-6 ? { from: firstTo, to: w.end } : null
  };
}
