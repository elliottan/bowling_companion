import { describe, expect, it } from "vitest";
import { fitCalibration } from "./calibrate";
import { apply } from "./homography";
import { LEFT_U, RIGHT_U, BACK_ROW_FT } from "./laneModel";
import {
  defaultMarkLines,
  droppedBetween,
  frameTimes,
  isNewFrame,
  latestStart,
  lumaOf,
  MARK_LINES,
  median,
  MIN_RATE,
  needsTrim,
  pathInPicture,
  playbackRateFor,
  READ_AT_LEAST,
  READ_SECONDS,
  readProgress,
  readWindow,
  resampleGray,
  rotateGray,
  scaledSize,
  slowerRate,
  toCalMarks,
  toGray,
  TRIM_ABOVE,
  type MarkLines
} from "./marking";
import type { Mat3 } from "./types";

// A lane seen from behind: lane (u, v) to pixels, with perspective.
const H: Mat3 = [9, 4, 120, 0, -5, 600, 0, 0.02, 1];

describe("the lines a bowler drags onto a frame", () => {
  it("guesses a lane shape inside the picture", () => {
    const m = defaultMarkLines(800, 600);
    for (const k of MARK_LINES) for (const p of m[k]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(800);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(600);
    }
    // The foul line is below the pin row, and the lane narrows toward it.
    expect(m.foul[0].y).toBeGreaterThan(m.pinrow[0].y);
    expect(m.foul[1].x - m.foul[0].x).toBeGreaterThan(m.pinrow[1].x - m.pinrow[0].x);
  });

  it("gives back the lane mapping when placed on the lane's lines", () => {
    const at = (u: number, v: number) => apply(H, { x: u, y: v });
    const lines: MarkLines = {
      left: [at(LEFT_U, 50), at(LEFT_U, 5)],
      right: [at(RIGHT_U, 55), at(RIGHT_U, 2)],
      foul: [at(4, 0), at(36, 0)],
      pinrow: [at(6, BACK_ROW_FT), at(34, BACK_ROW_FT)]
    };
    const marks = toCalMarks(lines);
    expect(marks.map((m) => m.label)).toEqual(MARK_LINES);
    const fit = fitCalibration(marks);
    for (const [u, v] of [[20, 15], [3, 40], [37, 58]]) {
      const p = apply(fit.H, { x: u, y: v });
      const q = at(u, v);
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(0.01);
    }
  });
});

describe("reading a video", () => {
  it("looks for frames at the rate asked, from a start, up to a limit", () => {
    expect(frameTimes(0, 1, 4, 100)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(frameTimes(10, 11, 4, 100)).toEqual([10, 10.25, 10.5, 10.75]);
    expect(frameTimes(0, 10, 30, 5)).toHaveLength(5);
    expect(frameTimes(3, 3, 30, 5)).toEqual([]);
    expect(frameTimes(0, Number.NaN, 30, 5)).toEqual([]);
    expect(frameTimes(0, 1, 0, 5)).toEqual([]);
  });

  it("trims only a video longer than the reader holds", () => {
    expect(needsTrim(TRIM_ABOVE)).toBe(false);
    expect(needsTrim(TRIM_ABOVE + 0.1)).toBe(true);
    expect(needsTrim(4.65)).toBe(false);
    // A recording that does not know its length is read from the start.
    expect(needsTrim(Infinity)).toBe(false);
    expect(needsTrim(Number.NaN)).toBe(false);
  });

  it("reads a stretch from the start chosen, inside the video", () => {
    expect(readWindow(4.65, 0)).toEqual({ from: 0, to: 4.65 });
    expect(readWindow(30, 10)).toEqual({ from: 10, to: 10 + READ_SECONDS });
    expect(readWindow(30, -2)).toEqual({ from: 0, to: READ_SECONDS });
    expect(readWindow(30, Number.NaN)).toEqual({ from: 0, to: READ_SECONDS });
    // A start in the last seconds is pulled back to leave a release's worth.
    expect(readWindow(14.65, 14)).toEqual({ from: 14.65 - READ_AT_LEAST, to: 14.65 });
    expect(readWindow(2, 1)).toEqual({ from: 0, to: 2 });
    expect(readWindow(Number.NaN, 1)).toEqual({ from: 0, to: 0 });
    expect(latestStart(14.65)).toBeCloseTo(14.65 - READ_AT_LEAST, 9);
    expect(latestStart(1)).toBe(0);
  });

  it("says how far a read has got by frames or by time, whichever is further", () => {
    // 60 fps: 120 of 240 frames two seconds into an eight second stretch.
    expect(readProgress(120, 12, 10, 18, 240)).toBe(0.5);
    // 24 fps: time is ahead of the frames.
    expect(readProgress(48, 12, 10, 18, 240)).toBe(0.25);
    expect(readProgress(300, 20, 10, 18, 240)).toBe(1);
    expect(readProgress(0, 5, 10, 18, 240)).toBe(0);
    expect(readProgress(3, 0, 0, 0, 240)).toBe(1);
  });

  it("keeps a frame once, and a 120 fps clip at 60", () => {
    expect(isNewFrame(undefined, 0)).toBe(true);
    expect(isNewFrame(1, 1)).toBe(false);
    expect(isNewFrame(1, 1 + 1 / 60)).toBe(true);
    expect(isNewFrame(1, 1 + 1 / 120)).toBe(false);
    expect(isNewFrame(1, 0.5)).toBe(false);
  });

  it("slows playback when a frame goes by unkept, or the frames take long", () => {
    expect(droppedBetween(1 / 60, Infinity)).toBe(false);
    expect(droppedBetween(1 / 60, 1 / 60)).toBe(false);
    expect(droppedBetween(2 / 60, 1 / 60)).toBe(true);
    expect(droppedBetween(2 / 30, 1 / 30)).toBe(true);
    expect(slowerRate(0.5)).toBe(0.375);
    expect(slowerRate(MIN_RATE)).toBe(MIN_RATE);
    expect(playbackRateFor(1)).toBe(1);
    expect(playbackRateFor(1000)).toBe(MIN_RATE);
    expect(playbackRateFor(0.7 * (1000 / 60) * 2)).toBeCloseTo(0.5, 9);
    expect(playbackRateFor(Number.NaN)).toBe(1);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it("scales a picture down and never up", () => {
    expect(scaledSize(1920, 1080, 960 * 540)).toEqual({ width: 960, height: 540 });
    expect(scaledSize(640, 480, 960 * 540)).toEqual({ width: 640, height: 480 });
  });

  it("turns colour into grey in video range", () => {
    const g = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), 3, 1);
    expect(Array.from(g)).toEqual([235, 16, 81]);
  });

  it("reads grey from a frame copied out red first or blue first, at its stride", () => {
    // One row of two pixels, padded to 12 bytes a row, after 2 bytes of something else.
    const rgba = new Uint8Array([9, 9, 255, 0, 0, 255, 0, 0, 255, 255, 7, 7, 9, 9, 0, 0, 0, 0, 255, 255, 255, 255, 7, 7]);
    expect(Array.from(lumaOf(rgba, 2, 2, 12, 2, false))).toEqual([81, 41, 16, 235]);
    expect(Array.from(lumaOf(rgba, 2, 2, 12, 2, true))).toEqual([41, 81, 16, 235]);
  });

  it("scales a luma plane by the average of the area each pixel covers", () => {
    // 4 by 2, from byte 1, 5 bytes a row, to 2 by 1: each the mean of a 2 by 2 block.
    const plane = new Uint8Array([0, 10, 20, 30, 40, 0, 50, 60, 70, 80, 0]);
    expect(Array.from(resampleGray(plane, 4, 2, 5, 1, 2, 1))).toEqual([35, 55]);
    // The same size is the same picture.
    expect(Array.from(resampleGray(plane, 4, 2, 5, 1, 4, 2))).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    // Three to two: the middle pixel is shared, half to each.
    expect(Array.from(resampleGray(new Uint8Array([30, 60, 90]), 3, 1, 3, 0, 2, 1))).toEqual([40, 80]);
    // A flat picture stays flat at any scale.
    const flat = new Uint8Array(1080 * 806).fill(123);
    const small = resampleGray(flat, 1080, 806, 1080, 0, 962, 718);
    expect(small.length).toBe(962 * 718);
    expect(small.every((v) => v === 123)).toBe(true);
    expect(Array.from(resampleGray(new Uint8Array([200]), 1, 1, 1, 0, 1, 1))).toEqual([200]);
  });

  it("turns a picture a quarter, a half or three quarters clockwise", () => {
    // 1 2 3
    // 4 5 6
    const g = new Uint8ClampedArray([1, 2, 3, 4, 5, 6]);
    expect(rotateGray(g, 3, 2, 0)).toBe(g);
    expect(Array.from(rotateGray(g, 3, 2, 90))).toEqual([4, 1, 5, 2, 6, 3]);
    expect(Array.from(rotateGray(g, 3, 2, 180))).toEqual([6, 5, 4, 3, 2, 1]);
    expect(Array.from(rotateGray(g, 3, 2, 270))).toEqual([3, 6, 2, 5, 1, 4]);
    expect(Array.from(rotateGray(g, 3, 2, -90))).toEqual([3, 6, 2, 5, 1, 4]);
  });
});

describe("drawing the path back", () => {
  it("puts a point a foot along the path, through the lane mapping", () => {
    const pts = pathInPicture(H, { kind: "hook", u0: 20, a: 0, s: 60, L: 2, k: 0 }, 0, 70);
    expect(pts).toHaveLength(61);
    const q = apply(H, { x: 20, y: 30 });
    expect(pts[30].x).toBeCloseTo(q.x, 6);
    expect(pts[30].y).toBeCloseTo(q.y, 6);
  });
});
