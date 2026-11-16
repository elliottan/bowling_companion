import { DECK_END_FT, imageToLane } from "./laneModel";
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
 * the foul line (`release.ts`), so a few frames before the crossing
 * (`FOUL_LEAD`); the empty lane is the median of the read's own frames, in
 * which the ball is at any spot for a few frames only, so no frames before the
 * release are needed for it; the board at the pins and the pins' movement are
 * read in the frames up to and just after the ball meets the head pin, inside
 * the deck. Pure.
 */

/** The read's first part, seconds after its start: the run and a second more, the lane found on it. */
export const FIRST_SECONDS = 1.6;
/**
 * Kept before the ball crosses the foul line, seconds: the frames the laydown
 * is followed back over. The crossing is put early rather than late (the run's
 * points are the ball's middle, a little above the lane while it is in the
 * hand, so they read a little further down it than the ball is).
 */
export const FOUL_LEAD = 0.2;
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
  /** What the end came from. */
  by: "speed" | "pins" | "slowest";
  /** The run's speed, ft/s, when it gave one. */
  speed: number | null;
}

/**
 * Where the shot is, from the run in feet (`runFeet`; empty when the lane was
 * not found) and the first look. Points off the lane (the approach, past 45
 * ft) are left out, and those still in the hand where enough are past it
 * (`OUT_OF_HAND_FT`); at least three over 3 ft are needed for a speed.
 */
export function shotWindow(feet: readonly { t: number; v: number }[], found: ShotFound, duration: number): ShotWindow {
  const cap = (t: number) => Math.min(Number.isFinite(duration) ? duration : Infinity, t);
  const enough = (ps: readonly { v: number }[]) => ps.length >= 3 && Math.max(...ps.map((p) => p.v)) - Math.min(...ps.map((p) => p.v)) >= 3;
  const out = feet.filter((p) => p.v >= OUT_OF_HAND_FT && p.v <= 45);
  const on = enough(out) ? out : feet.filter((p) => p.v >= -3 && p.v <= 45);
  const speed = enough(on) ? lineSpeed(on) : null;
  // Points still in the hand read fast (IMG_1996: 42 ft/s), so a run up to a
  // third over the fastest ball still says when it crossed the foul line; the
  // end is reckoned at no more than the fastest.
  if (speed !== null && speed >= SLOWEST_FTS * 0.8 && speed <= FASTEST_FTS * 1.3) {
    const mt = on.reduce((a, p) => a + p.t, 0) / on.length;
    const mv = on.reduce((a, p) => a + p.v, 0) / on.length;
    const foul = mt - mv / speed;
    const end = foul + (DECK_END_FT / Math.min(speed, FASTEST_FTS)) * END_SLACK + END_MARGIN;
    return { foul, end: cap(Math.ceil(end * EDGE_GRID) / EDGE_GRID), by: "speed", speed };
  }
  const after = found.pinHit !== null ? found.pinHit - found.release : NaN;
  if (after >= PINS_FROM && after <= PINS_TO) return { foul: null, end: cap(found.pinHit! + END_MARGIN + 0.15), by: "pins", speed: null };
  return { foul: null, end: cap(found.release + DECK_END_FT / SLOWEST_FTS + END_MARGIN), by: "slowest", speed: null };
}

/**
 * The window from whichever of the first look's runs (each in feet,
 * `runFeet`, the chosen run first, then `ShotFound.others`) is the ball's on
 * the found lane: the first that gives a speed and crosses the foul line
 * inside `part` (the stretch read first, which the lane was found on). The
 * bowler's slide is 10 ft or more behind the foul line and gives none. None
 * does: the pins or the slowest ball, from the run chosen (`shotWindow`).
 */
export function pickWindow(runs: readonly (readonly { t: number; v: number }[])[], found: ShotFound, duration: number, part: { from: number; to: number }): ShotWindow {
  for (const feet of runs) {
    const w = shotWindow(feet, found, duration);
    if (w.foul !== null && w.foul >= part.from - FOUL_LEAD && w.foul <= part.to) return w;
  }
  return shotWindow([], found, duration);
}

/**
 * The frames of a read to give the tracer: from `FOUL_LEAD` before the ball
 * crossed the foul line, when that is known, back to the slot before it on
 * the grid (`EDGE_GRID`), to the end.
 */
export function shotFrames(times: readonly number[], w: ShotWindow): number[] {
  const from = w.foul !== null ? Math.floor((w.foul - FOUL_LEAD) * EDGE_GRID) / EDGE_GRID - EDGE_EARLY : -Infinity;
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
  const fps = keptFps(w.end - start, frameBytes);
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
