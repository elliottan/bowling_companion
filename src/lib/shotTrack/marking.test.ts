import { describe, expect, it } from "vitest";
import { apply } from "./homography";
import {
  bandRows,
  droppedBetween,
  frameTimes,
  isNewFrame,
  latestStart,
  lumaOf,
  median,
  MIN_RATE,
  pathInPicture,
  planeCrop,
  playbackRateFor,
  READ_AT_LEAST,
  READ_SECONDS,
  readProgress,
  readWindow,
  resampleGray,
  rotateGray,
  scaledSize,
  slowerRate,
  toGray
} from "./marking";
import type { Mat3 } from "./types";

// A lane seen from behind: lane (u, v) to pixels, with perspective.
const H: Mat3 = [9, 4, 120, 0, -5, 600, 0, 0.02, 1];

describe("reading a video", () => {
  it("looks for frames at the rate asked, from a start, up to a limit", () => {
    expect(frameTimes(0, 1, 4, 100)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(frameTimes(10, 11, 4, 100)).toEqual([10, 10.25, 10.5, 10.75]);
    expect(frameTimes(0, 10, 30, 5)).toHaveLength(5);
    expect(frameTimes(3, 3, 30, 5)).toEqual([]);
    expect(frameTimes(0, Number.NaN, 30, 5)).toEqual([]);
    expect(frameTimes(0, 1, 0, 5)).toEqual([]);
  });

  it("keeps the rows of a band, whole and even, or all of them", () => {
    expect(bandRows(1920, null)).toEqual({ y: 0, h: 1920 });
    expect(bandRows(1920, { top: 0.3, bottom: 0.72 })).toEqual({ y: 576, h: 808 });
    expect(bandRows(1921, { top: 0.331, bottom: 0.771 })).toEqual({ y: 634, h: 848 });
    expect(bandRows(100, { top: 0.5, bottom: 0.5 })).toEqual({ y: 0, h: 100 });
    expect(bandRows(100, { top: 1, bottom: 1.2 })).toEqual({ y: 98, h: 2 });
  });

  it("finds a band of the shown rows in a frame's plane, however it is turned", () => {
    const band = { top: 0.25, bottom: 0.75 };
    // Shown as stored: rows.
    expect(planeCrop(band, 1080, 1920, 0)).toEqual({ x: 0, y: 480, w: 1080, h: 960 });
    // Upside down: rows from the bottom.
    expect(planeCrop({ top: 0, bottom: 0.25 }, 1080, 1920, 180)).toEqual({ x: 0, y: 1440, w: 1080, h: 480 });
    // A phone's portrait video, stored 1920 by 1080 and turned a quarter: the plane's columns.
    expect(planeCrop({ top: 0, bottom: 0.25 }, 1920, 1080, 90)).toEqual({ x: 0, y: 0, w: 480, h: 1080 });
    expect(planeCrop({ top: 0, bottom: 0.25 }, 1920, 1080, 270)).toEqual({ x: 1440, y: 0, w: 480, h: 1080 });
    expect(planeCrop({ top: 0, bottom: 0.25 }, 1920, 1080, -90)).toEqual({ x: 1440, y: 0, w: 480, h: 1080 });
  });

  it("crops a turned plane to the same picture as cropping it once turned", () => {
    // 8 by 2 stored, shown turned as 2 by 8; keep the shown rows 2 to 5.
    const plane = Uint8ClampedArray.from({ length: 16 }, (_, i) => i + 1);
    for (const turn of [90, 270]) {
      const shown = rotateGray(plane, 8, 2, turn);
      const c = planeCrop({ top: 0.25, bottom: 0.75 }, 8, 2, turn);
      const cut = new Uint8ClampedArray(c.w * c.h);
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) cut[y * c.w + x] = plane[(y + c.y) * 8 + x + c.x];
      expect(Array.from(rotateGray(cut, c.w, c.h, turn))).toEqual(Array.from(shown.slice(4, 12)));
    }
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
