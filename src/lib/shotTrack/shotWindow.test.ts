import { describe, expect, it } from "vitest";
import { apply } from "./homography";
import { DECK_END_FT } from "./laneModel";
import type { FrameLane } from "./laneTrack";
import { READ_BUDGET } from "./marking";
import { LEAD_SECONDS, type ShotFound } from "./shotStart";
import {
  END_MARGIN,
  EDGE_GRID,
  END_FTS,
  END_SLACK,
  HAND_FAST,
  FIRST_SECONDS,
  firstPart,
  FOUL_LEAD,
  ACROSS,
  ballRun,
  FIRST_SEEN_FT,
  LINE_NEAR_FT,
  OUT_OF_HAND_FT,
  pickWindow,
  windowOutside,
  windowStart,
  runFeet,
  runInFrame,
  runVerdict,
  shotFrames,
  shotWindow,
  SLOWEST_FTS,
  splitRead,
  type ShotWindow
} from "./shotWindow";
import type { Mat3 } from "./types";

// A lane seen from behind in a 960 by 720 frame: lane (u, v) to pixels, with perspective.
const H: Mat3 = [9, 4, 120, 0, -5, 600, 0, 0.02, 1];
const FRAME = { width: 960, height: 720 };

const shot = (over: Partial<ShotFound> = {}): ShotFound => ({ start: 11.6, release: 12, pinHit: null, confidence: 0.8, run: [], ...over });

/** A ball at `fts` feet a second, on the foul line at `foul` seconds, as the first look sees it: picture fractions at 15 a second. */
function runOf(fts: number, foul: number, band: { top: number; bottom: number } | null = null) {
  const top = band?.top ?? 0;
  const tall = (band?.bottom ?? 1) - top;
  return Array.from({ length: 5 }, (_, i) => {
    const t = foul + 0.1 + i / 15;
    const p = apply(H, { x: 20, y: fts * (t - foul) });
    return { t, x: p.x / FRAME.width, y: top + (p.y / FRAME.height) * tall };
  });
}

describe("the shot window", () => {
  it("reads a first part from a little before the run, inside the video", () => {
    expect(firstPart(shot(), 30)).toEqual({ from: 12 - LEAD_SECONDS, to: 12 - LEAD_SECONDS + FIRST_SECONDS });
    expect(firstPart(shot({ release: 0.1 }), 30)).toEqual({ from: 0, to: FIRST_SECONDS });
    expect(firstPart(shot(), 12.5)).toEqual({ from: 12 - LEAD_SECONDS, to: 12.5 });
    expect(firstPart(shot(), Number.NaN).to).toBeCloseTo(12 - LEAD_SECONDS + FIRST_SECONDS, 9);
    // A run seen a frame later starts the read at the same slot.
    expect(firstPart(shot({ release: 12 + 1 / 120 }), 30).from).toBe(firstPart(shot(), 30).from);
  });

  it("puts the first look's run into a read frame's pixels, band and all", () => {
    const run = [{ t: 1, x: 0.5, y: 0.51 }];
    expect(runInFrame(run, null, FRAME)).toEqual([{ t: 1, x: 480, y: 0.51 * 720 }]);
    const [p] = runInFrame(run, { top: 0.3, bottom: 0.72 }, FRAME);
    expect(p.x).toBe(480);
    expect(p.y).toBeCloseTo(360, 9);
  });

  it("finds when the ball crossed the foul line and when it leaves the deck, from its speed", () => {
    const band = { top: 0.3, bottom: 0.72 };
    const lanes: FrameLane[] = [{ frame: 0, H }];
    const feet = runFeet(runInFrame(runOf(20, 12.1, band), band, FRAME), lanes, [12]);
    expect(feet[0].u).toBeCloseTo(20, 6);
    expect(feet[0].v).toBeCloseTo(2, 6);
    const w = shotWindow(feet, shot(), 30);
    expect(w.by).toBe("speed");
    expect(w.speed).toBeCloseTo(20, 6);
    expect(w.foul).toBeCloseTo(12.1, 6);
    // The end on the grid, at or after the time the speed gives.
    const by = 12.1 + (DECK_END_FT / 20) * END_SLACK + END_MARGIN;
    expect(w.end).toBeGreaterThanOrEqual(by);
    expect(w.end - by).toBeLessThan(1 / EDGE_GRID);
    expect(w.end * EDGE_GRID).toBeCloseTo(Math.round(w.end * EDGE_GRID), 9);
    // Never past the video's end.
    expect(shotWindow(feet, shot(), 14).end).toBe(14);
  });

  it("leaves out the points still in the hand when enough are out on the lane", () => {
    // In the hand the ball reads far too fast; out on the lane, 25 ft/s.
    const feet = [{ t: 12.0, v: -2 }, { t: 12.067, v: 1 }, { t: 12.2, v: 2.5 }, { t: 12.3, v: 5 }, { t: 12.4, v: 7.5 }];
    const w = shotWindow(feet, shot(), 30);
    expect(w.speed).toBeCloseTo(25, 9);
    // Seen crossing: the crossing between -2 at 12.0 and 1 at 12.067.
    expect(w.foul).toBeCloseTo(12.0 + 0.067 * (2 / 3), 9);
    // Too few out of the hand: all of them on the lane are used.
    const near = [{ t: 12.0, v: -2 }, { t: 12.067, v: 1 }, { t: 12.2, v: 2.5 }, { t: 12.3, v: 5 }];
    expect(shotWindow(near, shot(), 30).by).toBe("speed");
    expect(OUT_OF_HAND_FT).toBeGreaterThan(0);
  });

  it("takes the window from whichever run is the ball's on the lane, not the bowler's approach", () => {
    // The approach, 13 ft behind the foul line at walking pace, is the run the first look chose.
    const approach = [{ t: 11.7, v: -13 }, { t: 11.8, v: -12.4 }, { t: 11.9, v: -11.8 }, { t: 12.0, v: -11 }];
    const ball = [{ t: 12.2, v: 2.5 }, { t: 12.3, v: 5 }, { t: 12.4, v: 7.5 }];
    const w = pickWindow([approach, ball], shot(), 30);
    expect(w.by).toBe("speed");
    expect(w.foul).toBeCloseTo(12.1, 9);
    expect(pickWindow([approach], shot(), 30).by).toBe("slowest");
    expect(pickWindow([], shot(), 30).by).toBe("slowest");
  });

  it("puts the pieces the ball was seen in together, and the line most of them are on wins", () => {
    // Near the foul line, then 35 ft on; a stray run elsewhere at a ball's pace.
    const near = [{ t: 12.2, v: 2.5 }, { t: 12.3, v: 5 }, { t: 12.4, v: 7.5 }];
    const far = [{ t: 13.5, v: 35 }, { t: 13.6, v: 37.5 }, { t: 13.7, v: 40 }];
    const stray = [{ t: 12.2, v: 20 }, { t: 12.3, v: 23 }, { t: 12.4, v: 26 }];
    const ball = ballRun([stray, near, far])!;
    expect(ball.points).toBe(6);
    expect(ball.speed).toBeCloseTo(25, 6);
    expect(ball.foul).toBeCloseTo(12.1, 6);
    // A piece repeated (a run and its own first part) is one set of points.
    expect(ballRun([near, near.slice(0, 3)])!.points).toBe(3);
    expect(ballRun([[{ t: 1, v: 1 }]])).toBeNull();
    // A run seen crossing the foul line beats one out on the lane with more points on its line.
    const crossing = [{ t: 12.0, v: -5 }, { t: 12.1, v: 0.5 }, { t: 12.2, v: 4.5 }];
    const reflection = [{ t: 11.0, v: 5 }, { t: 11.1, v: 7.5 }, { t: 11.2, v: 10 }, { t: 11.3, v: 12.5 }];
    // Crossing between its points either side of the line: -5 at 12.0 and 0.5 at 12.1.
    expect(ballRun([reflection, crossing])!.foul).toBeCloseTo(12.0 + 0.1 * (5 / 5.5), 9);
    // A run first seen far down the lane only votes: alone, it is not the ball's.
    const far2 = [{ t: 13.5, v: 21 }, { t: 13.6, v: 23.5 }, { t: 13.7, v: 26 }];
    expect(ballRun([far2])).toBeNull();
    expect(FIRST_SEEN_FT).toBeLessThan(21);
    // A ball on the next lane, boards outside this one, is not the ball.
    const next = [{ t: 12.2, v: 2.5, u: -12 }, { t: 12.3, v: 5, u: -12 }, { t: 12.4, v: 7.5, u: -11 }];
    expect(ballRun([next])).toBeNull();
    expect(ballRun([next.map((p) => ({ ...p, u: 20 }))])).not.toBeNull();
    expect(ACROSS.to).toBeGreaterThan(39);
    expect(LINE_NEAR_FT).toBeGreaterThan(0);
  });

  it("reads the window on its own when the ball is not where the first part is", () => {
    const part = { from: 11.6, to: 13.2 };
    const at = (foul: number | null): ShotWindow => ({ foul, end: 15, by: foul === null ? "slowest" : "speed", speed: null });
    expect(windowOutside(at(12.1), part)).toBe(false);
    expect(windowStart(at(12.1))).toBeCloseTo(Math.floor((12.1 - FOUL_LEAD) * EDGE_GRID) / EDGE_GRID, 9);
    // The first look chose the approach, long before the ball: the ball crosses after the part.
    expect(windowOutside(at(13.5), part)).toBe(true);
    // Or a run after the ball: the window starts before the part.
    expect(windowOutside(at(11.7), part)).toBe(true);
    expect(windowOutside(at(null), part)).toBe(false);
    expect(windowStart(at(null))).toBe(-Infinity);
  });

  it("takes each run point through the lane found nearest it in time", () => {
    const moved: Mat3 = [9, 4, 150, 0, -5, 600, 0, 0.02, 1];
    const lanes: FrameLane[] = [
      { frame: 0, H },
      { frame: 1, H: moved }
    ];
    const p = apply(moved, { x: 20, y: 5 });
    const [near1] = runFeet([{ t: 1.9, ...p }], lanes, [1, 2]);
    expect(near1.u).toBeCloseTo(20, 6);
    const [near0] = runFeet([{ t: 1.1, ...p }], lanes, [1, 2]);
    expect(near0.u).not.toBeCloseTo(20, 1);
    expect(runFeet([{ t: 1, ...p }], [], [1])).toEqual([]);
  });

  it("ends at the pins seen hit when the run gives no speed, or after the slowest ball", () => {
    // No lane: the pins, when they were hit a believable time after the release.
    expect(shotWindow([], shot({ pinHit: 14.6 }), 30)).toEqual({ foul: null, end: 14.6 + END_MARGIN + 0.15, by: "pins", speed: null });
    // Hit too soon to be this ball (the bowler walking in front): the slowest ball.
    const slowest = shotWindow([], shot({ pinHit: 12.5 }), 30);
    expect(slowest.by).toBe("slowest");
    expect(slowest.end).toBeCloseTo(12 + DECK_END_FT / SLOWEST_FTS + END_MARGIN, 9);
    expect(shotWindow([], shot(), 13).end).toBe(13);
    // Too few points, too short a stretch, or no believable speed: no speed.
    const two = [{ t: 12.2, v: 2 }, { t: 12.3, v: 4.5 }];
    expect(shotWindow(two, shot(), 30).by).toBe("slowest");
    const short = [{ t: 12.2, v: 2 }, { t: 12.25, v: 3 }, { t: 12.3, v: 4 }];
    expect(shotWindow(short, shot(), 30).by).toBe("slowest");
    const walk = [{ t: 12.2, v: 1 }, { t: 12.7, v: 3 }, { t: 13.2, v: 5 }];
    expect(shotWindow(walk, shot(), 30).by).toBe("slowest");
    // Fast, as points in the hand read: the foul line from it, the end at the fastest ball.
    const quick = [{ t: 12.2, v: 4.5 }, { t: 12.3, v: 9 }, { t: 12.4, v: 13.5 }];
    const fast = shotWindow(quick, shot(), 30);
    expect(fast.speed).toBeCloseTo(45, 9);
    expect(fast.foul).toBeCloseTo(12.1, 9);
    // The end at no more than END_FTS: a fast reading and a faster one end alike.
    expect(fast.end).toBeGreaterThanOrEqual(12.1 + (DECK_END_FT / END_FTS) * END_SLACK + END_MARGIN);
    const slower = shotWindow(quick.map((p, i) => ({ ...p, v: p.v - i * 0.3 })), shot(), 30);
    expect(slower.speed).toBeLessThan(fast.speed!);
    expect(Math.abs(slower.end - fast.end)).toBeLessThanOrEqual(1 / EDGE_GRID + 1e-9);
    expect(shotWindow(quick.map((p) => ({ ...p, v: p.v * 2 })), shot(), 30).by).toBe("slowest");
    // The ball behind the foul line, in the hand, is left out of the speed.
    const behind = [{ t: 12, v: -10 }, { t: 12.2, v: 2.5 }, { t: 12.3, v: 5 }, { t: 12.4, v: 7.5 }];
    expect(shotWindow(behind, shot(), 30).speed).toBeCloseTo(25, 9);
    // A run with a point past the pins or far behind the foul line is not on the lane.
    expect(shotWindow([...behind, { t: 14, v: 70 }], shot(), 30).by).toBe("slowest");
    expect(shotWindow([{ t: 11.9, v: -25 }, ...behind], shot(), 30).by).toBe("slowest");
    // Nor one that steps back down the lane.
    expect(shotWindow([{ t: 12.2, v: 2.5 }, { t: 12.3, v: 9 }, { t: 12.35, v: 6 }, { t: 12.4, v: 10 }], shot(), 30).by).toBe("slowest");
    expect(HAND_FAST).toBeGreaterThan(1);
  });

  it("gives the tracer the frames from just before the foul line to the end", () => {
    const times = [11.8, 11.9, 12.0, 12.1, 13, 14, 14.5];
    const w: ShotWindow = { foul: 12.1, end: 14, by: "speed", speed: 25 };
    expect(FOUL_LEAD).toBeGreaterThan(0.1);
    expect(shotFrames(times, w).map((i) => times[i])).toEqual([11.9, 12.0, 12.1, 13, 14]);
    // No foul line known: from the read's start.
    expect(shotFrames(times, { ...w, foul: null })).toEqual([0, 1, 2, 3, 4, 5]);
  });

  describe("reading the rest", () => {
    const step = 1 / 60;
    // The first part at 60 from 11.6 to 13.2 s.
    const times = Array.from({ length: 96 }, (_, i) => 11.6 + i * step);
    const frame = 960 * 720;

    it("keeps the first part's frames from the foul line on, and reads on to the end at 60 when it fits", () => {
      const w: ShotWindow = { foul: 12.1, end: 15, by: "speed", speed: 25 };
      const split = splitRead(times, step, 60, 13.2, w, frame);
      expect(split.fps).toBe(60);
      // The slot of the grid at or before the foul line's lead.
      expect(times[split.keep[0]]).toBeCloseTo(Math.floor((12.1 - FOUL_LEAD) * EDGE_GRID) / EDGE_GRID, 9);
      expect(split.keep[split.keep.length - 1]).toBe(95);
      expect(split.rest).toEqual({ from: 13.2, to: 15 });
    });

    it("reads a slow shot at a lower rate rather than cutting its end", () => {
      // 10 mph: 5.4 s from the foul line to the end does not fit at 60.
      const w: ShotWindow = { foul: 12.1, end: 17.5, by: "speed", speed: 14.7 };
      const split = splitRead(times, step, 60, 13.2, w, frame);
      expect(split.fps).toBe(30);
      const kept = split.keep.map((i) => times[i]);
      expect(kept.slice(1).every((t, i) => Math.abs(t - kept[i] - 2 * step) < 1e-9)).toBe(true);
      expect(split.rest).toEqual({ from: 13.2, to: 17.5 });
      // The whole window at that rate fits the budget.
      expect((17.5 - kept[0]) * split.fps * frame).toBeLessThanOrEqual(READ_BUDGET);
    });

    it("reads nothing more when the window ends inside the first part", () => {
      const w: ShotWindow = { foul: 11.9, end: 13, by: "speed", speed: 27 };
      const split = splitRead(times, step, 60, 13.2, w, frame);
      expect(split.rest).toBeNull();
      expect(times[split.keep[split.keep.length - 1]]).toBeLessThanOrEqual(13);
    });

    it("reads the rest even when no frame of the first part is in the window", () => {
      const w: ShotWindow = { foul: 14, end: 16, by: "speed", speed: 25 };
      const split = splitRead(times, step, 60, 13.2, w, frame);
      expect(split.keep).toEqual([]);
      expect(split.fps).toBe(60);
      expect(split.rest).toEqual({ from: 13.2, to: 16 });
    });
  });

  it("says why each run is or is not the ball's", () => {
    // A ball at 25 ft/s from 2 ft behind the foul line, a point every fifteenth of a second.
    const at = (fts: number, from = -2, n = 6, u = 20) => Array.from({ length: n }, (_, i) => ({ t: i / 15, v: from + (fts * i) / 15, u }));
    expect(runVerdict(at(25))).toBe("ball");
    expect(runVerdict([...at(25), { t: 0.5, v: 300 }])).toBe("off-lane");
    expect(runVerdict(at(25, -2, 6, 52))).toBe("next-lane");
    expect(runVerdict(at(25, -2, 2))).toBe("too-short");
    expect(runVerdict(at(25).reverse())).toBe("not-up-lane");
    expect(runVerdict(at(25, 20))).toBe("starts-far");
    expect(runVerdict(at(8, -2, 9))).toBe("too-slow");
    expect(runVerdict(at(60))).toBe("too-fast");
  });
});
