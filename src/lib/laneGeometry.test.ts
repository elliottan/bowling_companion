import { describe, it, expect } from "vitest";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, DRAW_FRONT_FEET, DRAW_BACK_FEET, POCKET_BOARD,
  boardToX, feetToY, xToBoard, yToFeet,
  buildLinePath, arrowFeet, skidBoardAt, DEFAULT_BREAKPOINT_FEET
} from "./laneGeometry";
import type { LineSpec } from "../types/bowling";

/** Sample N points along an SVG path string built of M / L / C commands. */
function samplePath(d: string, n = 200): Array<{ x: number; y: number }> {
  const nums = d.match(/-?[\d.]+/g)!.map(Number);
  const cmds = d.match(/[MLC]/g)!;
  const segs: Array<(t: number) => { x: number; y: number }> = [];
  let i = 0;
  let cur = { x: nums[0], y: nums[1] };
  i = 2;
  for (let c = 1; c < cmds.length; c++) {
    const p0 = cur;
    if (cmds[c] === "L") {
      const p1 = { x: nums[i++], y: nums[i++] };
      segs.push((t) => ({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t }));
      cur = p1;
    } else {
      const c1 = { x: nums[i++], y: nums[i++] };
      const c2 = { x: nums[i++], y: nums[i++] };
      const p1 = { x: nums[i++], y: nums[i++] };
      segs.push((t) => {
        const u = 1 - t;
        return {
          x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
          y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
        };
      });
      cur = p1;
    }
  }
  const out: Array<{ x: number; y: number }> = [];
  for (const seg of segs) for (let k = 0; k <= n; k++) out.push(seg(k / n));
  return out;
}

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

describe("arrow chevron", () => {
  it("is deepest at the centre board and steps back toward the gutters", () => {
    expect(arrowFeet(20)).toBeGreaterThan(arrowFeet(5));
    expect(arrowFeet(20)).toBeGreaterThan(arrowFeet(35));
    expect(arrowFeet(15)).toBeCloseTo(arrowFeet(25), 5); // symmetric about 20
  });

  it("skidBoardAt extrapolates the laydown→target line past the arrows", () => {
    // at the target distance it returns the target board
    expect(skidBoardAt(18, 10, arrowFeet(10))).toBeCloseTo(10, 5);
    // at the foul line it returns the laydown
    expect(skidBoardAt(18, 10, 0)).toBeCloseTo(18, 5);
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

  it("with a breakpoint: straight skid then two cubics through the apex", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 6, breakpoint_distance: 42 };
    const r = buildLinePath(line, "right")!;
    expect(r.points.hookStart).toBeNull(); // v3 dropped the hook-start peg
    // M ld L target C .. breakpoint C .. final
    const m = r.d.match(/^M [\d.-]+ [\d.-]+ L ([\d.-]+) ([\d.-]+) C [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ ([\d.-]+) ([\d.-]+) C [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ ([\d.-]+) ([\d.-]+)$/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(r.points.target.x, 2);
    expect(Number(m![3])).toBeCloseTo(r.points.breakpoint!.x, 2);
    expect(Number(m![5])).toBeCloseTo(r.points.final.x, 2);
  });

  it("the breakpoint is the strict rightmost point of the path (RH)", () => {
    // skid heads right (target 10 right of laydown 18), breakpoint on the wall.
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 5, breakpoint_distance: 46 };
    const r = buildLinePath(line, "right")!;
    const maxX = Math.max(...samplePath(r.d).map((p) => p.x));
    // rightmost x of the whole path equals the breakpoint x — no overshoot.
    expect(maxX).toBeCloseTo(r.points.breakpoint!.x, 1);
  });

  it("for a left-hander the breakpoint is the strict leftmost point", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 5, breakpoint_distance: 46 };
    const r = buildLinePath(line, "left")!;
    const minX = Math.min(...samplePath(r.d).map((p) => p.x));
    expect(minX).toBeCloseTo(r.points.breakpoint!.x, 1);
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
