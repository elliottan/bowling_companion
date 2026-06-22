import { describe, it, expect } from "vitest";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, DRAW_FRONT_FEET, DRAW_BACK_FEET, POCKET_BOARD,
  boardToX, feetToY, xToBoard, yToFeet,
  buildLinePath, skidBoard, DEFAULT_BREAKPOINT_FEET
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
  it("maps the front of the drawing extent to the bottom, the back to the top", () => {
    expect(feetToY(DRAW_FRONT_FEET)).toBeCloseTo(PLANE_L, 5);
    expect(feetToY(DRAW_BACK_FEET)).toBeCloseTo(0, 5);
    // The foul line (0 ft) sits a little above the very bottom (approach below it).
    expect(feetToY(0)).toBeLessThan(PLANE_L);
    expect(feetToY(0)).toBeGreaterThan(PLANE_L * 0.9);
  });

  it("yToFeet inverts feetToY", () => {
    for (const ft of [DRAW_FRONT_FEET, 0, 15, 42, 60, DRAW_BACK_FEET]) {
      expect(yToFeet(feetToY(ft))).toBeCloseTo(ft, 4);
    }
  });
});

describe("buildLinePath", () => {
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

  it("with a breakpoint: skid → cubic hook → straight roll, breakpoint is a path vertex", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 6, breakpoint_distance: 42, hook_start_distance: 30 };
    const r = buildLinePath(line, "right")!;
    expect(r.points.hookStart).not.toBeNull();
    expect(r.points.breakpoint).not.toBeNull();
    // straight skid to hook-start, cubic to the breakpoint, straight roll to final.
    const m = r.d.match(/^M [\d.-]+ [\d.-]+ L ([\d.-]+) ([\d.-]+) C [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)$/)!;
    expect(m).not.toBeNull();
    // hook-start, breakpoint and final coordinates appear as explicit vertices.
    expect(Number(m[1])).toBeCloseTo(r.points.hookStart!.x, 2);
    expect(Number(m[3])).toBeCloseTo(r.points.breakpoint!.x, 2);
    expect(Number(m[4])).toBeCloseTo(r.points.breakpoint!.y, 2);
    expect(Number(m[5])).toBeCloseTo(r.points.final.x, 2);
  });

  it("places the hook-start on the skid line at its distance", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 6, hook_start_distance: 30 };
    const r = buildLinePath(line, "right")!;
    const hs = r.points.hookStart!;
    expect(yToFeet(hs.y)).toBeCloseTo(30, 1);
    // board equals the skid-line extrapolation at 30 ft
    const expectedX = boardToX(skidBoard(18, 10, 30), "right");
    expect(hs.x).toBeCloseTo(expectedX, 1);
  });

  it("final defaults to the pocket and is overridable", () => {
    const def = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    expect(def.points.final.x).toBeCloseTo(boardToX(POCKET_BOARD, "right"), 2);
    const gutter = buildLinePath({ laydown: 18, target: 10, final_board: 3 }, "right")!;
    expect(gutter.points.final.x).toBeCloseTo(boardToX(3, "right"), 2);
  });

  it("without a breakpoint, draws straight to the final point", () => {
    const r = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    expect(r.points.breakpoint).toBeNull();
    expect(r.points.hookStart).toBeNull();
    expect(r.d).not.toContain(" C ");
    expect(r.d.match(/ L /g)!.length).toBe(2); // target, then final
  });

  it("defaults the breakpoint distance to 42 ft", () => {
    const r = buildLinePath({ laydown: 18, target: 10, breakpoint: 6 }, "right")!;
    expect(yToFeet(r.points.breakpoint!.y)).toBeCloseTo(DEFAULT_BREAKPOINT_FEET, 1);
  });

  it("mirrors the final point for a left-hander", () => {
    const rRight = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    const rLeft = buildLinePath({ laydown: 18, target: 10 }, "left")!;
    expect(rRight.points.final.x).toBeCloseTo(PLANE_W - rLeft.points.final.x, 4);
  });
});
