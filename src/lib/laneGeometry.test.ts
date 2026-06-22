import { describe, it, expect } from "vitest";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, DRAW_FRONT_FEET, DRAW_BACK_FEET,
  boardToX, feetToY, xToBoard, yToFeet,
  buildLinePath, DEFAULT_BREAKPOINT_FEET
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

  it("with a breakpoint, the quadratic passes through the breakpoint at its midpoint", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 6, breakpoint_distance: 42 };
    const r = buildLinePath(line, "right")!;
    expect(r.points.breakpoint).not.toBeNull();
    const bp = r.points.breakpoint!;
    // Skid is straight laydown→target, then a single quadratic to the pocket.
    expect(r.d).toContain(`M ${round2(r.points.laydown.x)} ${round2(r.points.laydown.y)} L ${round2(r.points.target.x)} ${round2(r.points.target.y)} Q `);
    const m = r.d.match(/Q ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)$/)!;
    const [cx, cy, ex, ey] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    // Quadratic midpoint B(0.5) must equal the breakpoint point (so the dot is on the curve).
    const midX = 0.25 * r.points.target.x + 0.5 * cx + 0.25 * ex;
    const midY = 0.25 * r.points.target.y + 0.5 * cy + 0.25 * ey;
    expect(midX).toBeCloseTo(bp.x, 1);
    expect(midY).toBeCloseTo(bp.y, 1);
    // Curve ends at the pocket.
    expect(ex).toBeCloseTo(r.points.pocket.x, 5);
    expect(ey).toBeCloseTo(r.points.pocket.y, 5);
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
    // Point coords are rounded to 2dp, so allow ~0.1 ft of round-trip slack.
    expect(yToFeet(r.points.breakpoint!.y)).toBeCloseTo(DEFAULT_BREAKPOINT_FEET, 1);
  });

  it("mirrors the pocket for a left-hander", () => {
    const rRight = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    const rLeft = buildLinePath({ laydown: 18, target: 10 }, "left")!;
    expect(rRight.points.pocket.x).toBeCloseTo(PLANE_W - rLeft.points.pocket.x, 4);
  });
});
