import { describe, it, expect } from "vitest";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, LANE_FEET,
  boardToX, feetToY, xToBoard, yToFeet,
  buildLinePath, POCKET_BOARD, DEFAULT_BREAKPOINT_FEET
} from "./laneGeometry";
import type { LineSpec } from "../types/bowling";

describe("board ↔ x", () => {
  it("right-hander: board 1 is the right edge, board 39 the left", () => {
    expect(boardToX(1, "right")).toBeCloseTo(PLANE_W, 5);
    expect(boardToX(LANE_BOARDS, "right")).toBeCloseTo(0, 5);
    expect(boardToX(20, "right")).toBeCloseTo(PLANE_W * (1 - 19 / 38), 5);
  });

  it("left-hander mirrors the right-hander", () => {
    expect(boardToX(1, "left")).toBeCloseTo(0, 5);
    expect(boardToX(LANE_BOARDS, "left")).toBeCloseTo(PLANE_W, 5);
  });

  it("clamps out-of-range boards onto the lane", () => {
    expect(boardToX(50, "right")).toBeCloseTo(boardToX(LANE_BOARDS, "right"), 5);
    expect(boardToX(0, "right")).toBeCloseTo(boardToX(1, "right"), 5);
  });

  it("xToBoard inverts boardToX", () => {
    for (const b of [1, 10, 17.5, 20, 39]) {
      expect(xToBoard(boardToX(b, "right"), "right")).toBeCloseTo(b, 4);
      expect(xToBoard(boardToX(b, "left"), "left")).toBeCloseTo(b, 4);
    }
  });
});

describe("feet ↔ y", () => {
  it("foul line (0 ft) is the bottom, head pin (60 ft) the top", () => {
    expect(feetToY(0)).toBeCloseTo(PLANE_L, 5);
    expect(feetToY(LANE_FEET)).toBeCloseTo(0, 5);
    expect(feetToY(30)).toBeCloseTo(PLANE_L / 2, 5);
  });

  it("yToFeet inverts feetToY", () => {
    for (const ft of [0, 15, 42, 60]) {
      expect(yToFeet(feetToY(ft))).toBeCloseTo(ft, 4);
    }
  });
});

describe("buildLinePath", () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it("returns null without a foul board or target", () => {
    expect(buildLinePath({ target: 10 }, "right")).toBeNull();      // no laydown/stance
    expect(buildLinePath({ laydown: 18 }, "right")).toBeNull();     // no target
    expect(buildLinePath(undefined, "right")).toBeNull();
  });

  it("uses laydown, falling back to stance", () => {
    const a = buildLinePath({ laydown: 18, target: 10 }, "right");
    const b = buildLinePath({ stance: 18, target: 10 }, "right");
    expect(a!.points.laydown).toEqual(b!.points.laydown);
  });

  it("with a breakpoint, bends quadratically through it into the pocket", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 6, breakpoint_distance: 42 };
    const r = buildLinePath(line, "right")!;
    expect(r.points.breakpoint).not.toBeNull();
    const p = r.points;
    const expected =
      `M ${round2(p.laydown.x)} ${round2(p.laydown.y)} ` +
      `L ${round2(p.target.x)} ${round2(p.target.y)} ` +
      `Q ${round2(p.breakpoint!.x)} ${round2(p.breakpoint!.y)} ` +
      `${round2(p.pocket.x)} ${round2(p.pocket.y)}`;
    expect(r.d).toBe(expected);
  });

  it("without a breakpoint, draws straight to the pocket", () => {
    const r = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    expect(r.points.breakpoint).toBeNull();
    expect(r.d.startsWith("M ")).toBe(true);
    expect(r.d).toContain(" L ");
    expect(r.d).not.toContain(" Q ");
  });

  it("defaults the breakpoint distance to 42 ft", () => {
    const r = buildLinePath({ laydown: 18, target: 10, breakpoint: 6 }, "right")!;
    expect(yToFeet(r.points.breakpoint!.y)).toBeCloseTo(DEFAULT_BREAKPOINT_FEET, 4);
  });

  it("mirrors the pocket for a left-hander", () => {
    const rRight = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    const rLeft = buildLinePath({ laydown: 18, target: 10 }, "left")!;
    expect(rRight.points.pocket.x).toBeCloseTo(PLANE_W - rLeft.points.pocket.x, 4);
  });
});
