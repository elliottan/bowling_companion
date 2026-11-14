import { describe, expect, it } from "vitest";
import { fitCalibration } from "./calibrate";
import { apply } from "./homography";
import { LEFT_U, RIGHT_U, BACK_ROW_FT } from "./laneModel";
import { defaultMarkLines, frameTimes, MARK_LINES, pathInPicture, scaledSize, toCalMarks, toGray, type MarkLines } from "./marking";
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
  it("reads frames at the rate asked, up to a limit", () => {
    expect(frameTimes(1, 4, 100)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(frameTimes(10, 30, 5)).toHaveLength(5);
    expect(frameTimes(0, 30, 5)).toEqual([]);
    expect(frameTimes(Number.NaN, 30, 5)).toEqual([]);
  });

  it("scales a picture down and never up", () => {
    expect(scaledSize(1920, 1080, 960 * 540)).toEqual({ width: 960, height: 540 });
    expect(scaledSize(640, 480, 960 * 540)).toEqual({ width: 640, height: 480 });
  });

  it("turns colour into grey in video range", () => {
    const g = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), 3, 1);
    expect(Array.from(g)).toEqual([235, 16, 81]);
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
