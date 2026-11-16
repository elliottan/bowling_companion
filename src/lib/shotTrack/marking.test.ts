import { describe, expect, it } from "vitest";
import { apply } from "./homography";
import {
  bandRows,
  claimFrame,
  FrameSlots,
  frameTimes,
  GRID_EARLY,
  gridSlot,
  keptFps,
  lumaOf,
  median,
  MIN_RATE,
  missingRuns,
  pathInPicture,
  planeCrop,
  playbackRateFor,
  READ_BUDGET,
  READ_FPS,
  READ_RATES,
  readProgress,
  resampleGray,
  rotateGray,
  scaledSize,
  SCAN_FASTEST,
  SCAN_START_RATE,
  scanRate,
  slowerRate,
  sourceStep,
  thinFrames,
  toGray,
  USUAL_RATES
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

  it("keeps the whole window at the highest rate that fits the memory, never cutting it short", () => {
    const frame = 960 * 720;
    // Four seconds at 60 is the budget exactly; a little longer goes to 30.
    expect(keptFps(4, frame)).toBe(60);
    expect(keptFps(4.1, frame)).toBe(30);
    expect(keptFps(10, frame)).toBe(20);
    expect(keptFps(16, frame)).toBe(15);
    // Longer than any rate fits: as many frames as fit, over the whole of it.
    expect(keptFps(40, frame)).toBeCloseTo(240 / 40, 9);
    expect(keptFps(40, frame) * 40).toBeLessThanOrEqual(READ_BUDGET / frame + 1e-9);
    // A smaller frame holds more seconds at 60.
    expect(keptFps(6, frame / 2)).toBe(60);
    expect(keptFps(0, frame)).toBe(READ_FPS);
    expect(keptFps(Number.NaN, frame)).toBe(READ_FPS);
    // A budget of ten frames: even the lowest rate does not fit a second.
    expect(keptFps(1, 0, 10)).toBe(10);
    expect(READ_RATES[0]).toBe(READ_FPS);
  });

  it("takes the first look's frames on a grid from the video's start, not from the last frame taken", () => {
    const take = (shown: number[]) => {
      let next = 0;
      return shown.filter((t) => {
        const after = gridSlot(t, next, 15);
        if (after === null) return false;
        next = after;
        return true;
      });
    };
    // A 60 fps video, every frame shown: every 4th, on the slots.
    const all = Array.from({ length: 61 }, (_, i) => i / 60);
    expect(take(all).map((t) => Math.round(t * 60))).toEqual(Array.from({ length: 16 }, (_, i) => 4 * i));
    // One passed over: the frame just after it, and the grid carries on as before.
    const holed = take(all.filter((t) => Math.round(t * 60) !== 8)).map((t) => Math.round(t * 60));
    expect(holed.slice(0, 5)).toEqual([0, 4, 9, 12, 16]);
    // A 120 fps video: the frame on the slot, not the one before it.
    expect(gridSlot(7 / 120, 1, 15)).toBeNull();
    expect(gridSlot(8 / 120, 1, 15)).toBe(2);
    // Its time stored to the millisecond, a little under the slot, still is.
    expect(gridSlot(0.066, 1, 15)).toBe(2);
    expect(GRID_EARLY).toBeLessThan(1 / 240);
  });

  it("says how far a read has got by the time reached", () => {
    expect(readProgress(12, 10, 18)).toBe(0.25);
    expect(readProgress(20, 10, 18)).toBe(1);
    expect(readProgress(5, 10, 18)).toBe(0);
    expect(readProgress(0, 0, 0)).toBe(1);
  });

  it("learns the video's own step from the frames shown, and snaps it to a usual rate", () => {
    // A WebM at 120 fps stores milliseconds: 8, 8, 9.
    expect(sourceStep([0.008, 0.008, 0.009, 0.008])).toBeCloseTo(1 / 120, 12);
    // A frame passed over (a double step) is left out.
    expect(sourceStep([1 / 60, 2 / 60, 1 / 60])).toBeCloseTo(1 / 60, 12);
    expect(sourceStep([1 / 30, 1 / 30])).toBeCloseTo(1 / 30, 12);
    // No usual rate near: the mean as it is.
    expect(sourceStep([0.07, 0.07])).toBeCloseTo(0.07, 12);
    // Steps of 9 ms (111 fps as measured) are a 120 fps video's.
    expect(sourceStep([0.009, 0.009, 0.009])).toBeCloseTo(1 / 120, 12);
    // Repeats (no time between) and too few steps say nothing.
    expect(sourceStep([0, 0, 1 / 60])).toBeNull();
    expect(sourceStep([1 / 60])).toBeNull();
    expect(USUAL_RATES).toContain(120);
    // Three steps of 8 ms are 125 fps as measured: 120, the nearest usual rate.
    expect(sourceStep([0.008, 0.008, 0.008])).toBeCloseTo(1 / 120, 12);
    // Between 48 and 50, the nearer.
    expect(sourceStep([0.0205, 0.0205])).toBeCloseTo(1 / 48, 12);
  });

  it("plays the first look slowly enough for every frame to be seen", () => {
    expect(scanRate(1 / 120)).toBeCloseTo(0.45, 12);
    expect(scanRate(1 / 60)).toBeCloseTo(0.9, 12);
    expect(scanRate(1 / 30)).toBeCloseTo(1.8, 12);
    expect(scanRate(1 / 24)).toBe(SCAN_FASTEST);
    expect(scanRate(1 / 1000)).toBeCloseTo(SCAN_START_RATE / 2, 12);
    expect(scanRate(null)).toBe(SCAN_START_RATE);
    expect(scanRate(0)).toBe(SCAN_START_RATE);
  });

  it("keeps every other frame of a 120 fps video at 60, from the first at the start", () => {
    const src = 1 / 120;
    const slots = new FrameSlots(1, 2, 60, src);
    expect(slots.m).toBe(2);
    expect(slots.step).toBeCloseTo(1 / 60, 12);
    const kept: number[] = [];
    for (let n = 110; n < 250; n++) if (slots.offer(n * src)) kept.push(n);
    // From frame 120 (1 s) to the last before 2 s, every other one.
    expect(kept[0]).toBe(120);
    expect(kept[kept.length - 1]).toBe(238);
    expect(kept).toHaveLength(60);
    expect(kept.every((n) => n % 2 === 0)).toBe(true);
    expect(slots.missing).toEqual([]);
    slots.close();
    expect(slots.missing).toEqual([]);
  });

  it("keeps the same frames however many the browser passes over, and lists those it missed", () => {
    const src = 1 / 120;
    const all = Array.from({ length: 140 }, (_, i) => (110 + i) * src);
    const read = (shown: number[]) => {
      const slots = new FrameSlots(1, 2, 60, src);
      const kept = shown.filter((t) => slots.offer(t));
      slots.close();
      return { kept, missing: slots.missing };
    };
    const whole = read(all);
    // Frames 130 to 135 passed over, and 151: 130, 132 and 134 are missing, and
    // 136 is still kept, not 131 or 137 in its place.
    const holed = read(all.filter((t) => {
      const n = Math.round(t / src);
      return !(n >= 130 && n <= 135) && n !== 151;
    }));
    expect(holed.missing.map((t) => Math.round(t / src))).toEqual([130, 132, 134]);
    const got = holed.kept.map((t) => Math.round(t / src));
    expect(got).toContain(136);
    expect(got).toContain(150);
    expect(got).toContain(152);
    expect(got.every((n) => n % 2 === 0)).toBe(true);
    expect(new Set([...got, 130, 132, 134])).toEqual(new Set(whole.kept.map((t) => Math.round(t / src))));
    // An odd frame passed over leaves the even ones alone; an even one is missing.
    const odd = read(all.filter((t) => Math.round(t / src) !== 141));
    expect(odd.missing).toEqual([]);
    const even = read(all.filter((t) => Math.round(t / src) !== 140));
    expect(even.missing.map((t) => Math.round(t / src))).toEqual([140]);
    // The read stopped early: the rest is missing.
    const cut = read(all.filter((t) => t < 1.5));
    expect(cut.missing.map((t) => Math.round(t / src))).toEqual(Array.from({ length: 30 }, (_, i) => 180 + 2 * i));
  });

  it("keeps the same frames wherever the read starts", () => {
    const src = 1 / 120;
    const keep = (from: number) => {
      const slots = new FrameSlots(from, 2, 60, src);
      return Array.from({ length: 240 }, (_, n) => n).filter((n) => slots.offer(n * src));
    };
    // Starting a frame later skips to the next even frame, not the odd one.
    expect(keep(1)[0]).toBe(120);
    expect(keep(1 + src)[0]).toBe(122);
    expect(keep(1 + src).every((n) => n % 2 === 0)).toBe(true);
  });

  it("carries a read in parts on from the frame the part before kept", () => {
    const src = 1 / 120;
    // The part before kept frame 239 (odd, at 60); this one reads at 30 from 2 s.
    const slots = new FrameSlots(2, 2.5, 30, src, 239 * src);
    expect(slots.m).toBe(4);
    const kept: number[] = [];
    for (let n = 236; n < 320; n++) if (slots.offer(n * src)) kept.push(n);
    expect(kept[0]).toBe(243);
    expect(kept.every((n) => (n - 239) % 4 === 0)).toBe(true);
    expect(kept[kept.length - 1]).toBe(299);
  });

  it("matches a frame shown on a second pass to the missing one it is", () => {
    const src = 1 / 120;
    const wanted = [1, 1 + 2 * src, 1.5];
    expect(claimFrame(wanted, 1 + 2 * src + 0.001, src)).toBe(1);
    expect(claimFrame(wanted, 1 + src, src)).toBe(-1);
    expect(claimFrame(wanted, 1.5, src)).toBe(2);
    expect(claimFrame([], 1, src)).toBe(-1);
    // The nearer of two within reach.
    expect(claimFrame([1, 1 + 0.6 * src], 1 + 0.35 * src, src)).toBe(1);
  });

  it("gathers missing frames into stretches to read again", () => {
    const src = 1 / 120;
    const runs = missingRuns([1, 1.02, 1.04, 2, 2.1, 3], src, 0.25);
    expect(runs.map((r) => r.instants)).toEqual([[1, 1.02, 1.04], [2, 2.1], [3]]);
    expect(runs[0].from).toBeCloseTo(1 - 0.5 * src, 12);
    expect(runs[0].to).toBeCloseTo(1.04 + 0.5 * src, 12);
    expect(missingRuns([], src, 0.25)).toEqual([]);
  });

  it("thins frames kept at 60 to 30 or 20 on the same grid", () => {
    const step = 1 / 60;
    const times = Array.from({ length: 12 }, (_, i) => 3 + i * step).filter((_, i) => i !== 4);
    expect(thinFrames(times, step, 1)).toEqual(times.map((_, i) => i));
    // Every other from the first, by time: the frame at 4 steps is not there.
    expect(thinFrames(times, step, 2).map((i) => Math.round((times[i] - 3) / step))).toEqual([0, 2, 6, 8, 10]);
    expect(thinFrames(times, step, 3).map((i) => Math.round((times[i] - 3) / step))).toEqual([0, 3, 6, 9]);
    // Counted from the video's start, wherever the frames begin: from 3 s plus a frame, the even frames still.
    const late = times.slice(1);
    expect(thinFrames(late, step, 2).map((i) => Math.round((late[i] - 3) / step))).toEqual([2, 6, 8, 10]);
    expect(thinFrames([], step, 2)).toEqual([]);
  });

  it("plays slowly enough for every frame to be handed over and kept", () => {
    // 30 frames shown a second: a 120 fps video at a quarter, 60 at a half, 30 at 1.
    expect(playbackRateFor(0, 1 / 120)).toBeCloseTo(0.25, 12);
    expect(playbackRateFor(0, 1 / 60)).toBeCloseTo(0.5, 12);
    expect(playbackRateFor(0, 1 / 30)).toBe(1);
    expect(playbackRateFor(Number.NaN)).toBeCloseTo(0.5, 12);
    // Frames that take long to keep slow it further, never below the least.
    expect(playbackRateFor(20, 1 / 60, 1 / 60)).toBeCloseTo((0.6 * 1000) / 60 / 20, 12);
    expect(playbackRateFor(1000, 1 / 60, 1 / 60)).toBe(MIN_RATE);
    expect(slowerRate(0.5)).toBe(0.25);
    expect(slowerRate(MIN_RATE)).toBe(MIN_RATE);
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
