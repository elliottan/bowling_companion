import { describe, it, expect } from "vitest";
import { solveLine, skidBoardAt, arrowFeet } from "./laneGeometry";
import type { LineSpec } from "../types/bowling";

// Hook side for a right-hander is the higher board (ball curves left toward the
// pocket). The skid wall = laydown→target line extrapolated to the breakpoint
// distance; the breakpoint must be on/left of it.
const wallAt = (l: LineSpec) =>
  skidBoardAt(l.laydown!, l.target!, l.breakpoint_distance ?? 42);

describe("solveLine — skid wall (RH)", () => {
  it("held breakpoint stays where dragged; an untouched capable peg yields to satisfy the wall", () => {
    // breakpoint 5 sits right of the wall (~5.7). Holding it (nothing else moved)
    // → it stays at 5 and the least-recent capable peg (laydown) rotates in-lane.
    const line: LineSpec = { laydown: 18, target: 14, breakpoint: 5, breakpoint_distance: 46 };
    const out = solveLine(line, "breakpoint", ["breakpoint"], "right");
    expect(out.breakpoint).toBe(5);                  // held wins
    expect(out.laydown).toBeGreaterThanOrEqual(1);   // stayed on the lane
    expect(out.laydown).toBeLessThanOrEqual(39);
    expect(out.breakpoint!).toBeGreaterThanOrEqual(wallAt(out) - 0.05); // wall now satisfied
  });

  it("move target, then breakpoint → laydown yields (oldest capable peg)", () => {
    const line: LineSpec = { laydown: 18, target: 14, breakpoint: 5, breakpoint_distance: 46 };
    // recency: breakpoint just dragged, target before it; laydown never touched.
    const out = solveLine(line, "breakpoint", ["breakpoint", "target"], "right");
    expect(out.breakpoint).toBe(5);  // held, preserved
    expect(out.target).toBe(14);     // recently moved, preserved
    expect(out.laydown).not.toBe(18); // laydown rotated to make room
    expect(out.breakpoint!).toBeGreaterThanOrEqual(wallAt(out) - 0.05);
  });

  it("move laydown, then breakpoint → target yields", () => {
    const line: LineSpec = { laydown: 18, target: 14, breakpoint: 5, breakpoint_distance: 46 };
    const out = solveLine(line, "breakpoint", ["breakpoint", "laydown"], "right");
    expect(out.breakpoint).toBe(5);
    expect(out.laydown).toBe(18);
    expect(out.target).not.toBe(14);
    expect(out.breakpoint!).toBeGreaterThanOrEqual(wallAt(out) - 0.05);
  });
});

describe("solveLine — apex (breakpoint is the rightmost)", () => {
  it("a breakpoint left of the aim clamps onto the aim, so it stays the rightmost (RH)", () => {
    // the reported bug: target 9 (skid heads right), breakpoint 28 (far left) →
    // the curve would bulge right of the breakpoint. The breakpoint must be
    // on/right of min(laydown, target) = 9.
    const line: LineSpec = { laydown: 18, target: 9, breakpoint: 28, breakpoint_distance: 38, final_board: 28 };
    const out = solveLine(line, "breakpoint", ["breakpoint"], "right");
    expect(out.breakpoint!).toBeLessThanOrEqual(Math.min(out.laydown!, out.target!) + 0.01);
  });

  it("LH mirror: a breakpoint right of the aim clamps onto it", () => {
    const line: LineSpec = { laydown: 22, target: 31, breakpoint: 12, breakpoint_distance: 38, final_board: 12 };
    const out = solveLine(line, "breakpoint", ["breakpoint"], "left");
    expect(out.breakpoint!).toBeGreaterThanOrEqual(Math.max(out.laydown!, out.target!) - 0.01);
  });
});

describe("solveLine — roll direction (RH)", () => {
  it("default pocket final yields left when the breakpoint passes it", () => {
    // breakpoint board 22 is left of the pocket (17.5); pocket unreachable → final moves.
    const line: LineSpec = { laydown: 20, target: 22, breakpoint: 22, breakpoint_distance: 42 };
    const out = solveLine(line, "breakpoint", ["breakpoint"], "right");
    expect(out.final_board!).toBeGreaterThanOrEqual(out.breakpoint! - 0.01);
  });

  it("pinned final yields to feasibility when the breakpoint crosses left of it", () => {
    // user pinned final at 10; breakpoint dragged to 14 (left of final) → final yields.
    const line: LineSpec = { laydown: 18, target: 16, breakpoint: 14, breakpoint_distance: 42, final_board: 10 };
    const out = solveLine(line, "breakpoint", ["breakpoint", "final"], "right");
    expect(out.breakpoint).toBe(14); // held wins
    expect(out.final_board!).toBeGreaterThanOrEqual(14 - 0.01);
  });
});

describe("solveLine — target is a derived aim", () => {
  it("an untouched target re-aims onto the laydown→breakpoint line when laydown moves", () => {
    // the reported impossible line: dragging laydown left with target pinned at
    // the gutter (1) kinks the skid. Target should instead ride the
    // laydown→breakpoint line so the skid points straight at the breakpoint.
    const line: LineSpec = { laydown: 21, target: 1, breakpoint: 1, breakpoint_distance: 42, final_board: 37 };
    const out = solveLine(line, "laydown", ["laydown"], "right"); // target NOT in recency
    expect(out.target).not.toBe(1);
    // target sits between the laydown and breakpoint…
    expect(out.target!).toBeGreaterThan(out.breakpoint!);
    expect(out.target!).toBeLessThan(out.laydown!);
    // …and on the skid line, so the skid extrapolates to ~the breakpoint.
    expect(skidBoardAt(out.laydown!, out.target!, out.breakpoint_distance!)).toBeCloseTo(out.breakpoint!, 0);
  });

  it("a target the user has dragged stays put (pinned), even when laydown moves", () => {
    const line: LineSpec = { laydown: 21, target: 1, breakpoint: 1, breakpoint_distance: 42, final_board: 37 };
    const out = solveLine(line, "laydown", ["laydown", "target"], "right"); // target IS in recency
    expect(out.target).toBe(1);
  });
});

describe("solveLine — clamping & order", () => {
  it("keeps boards on the lane and the distance below the pocket", () => {
    const line: LineSpec = { laydown: 45, target: 14, breakpoint: 5, breakpoint_distance: 80 };
    const out = solveLine(line, "laydown", ["laydown"], "right");
    expect(out.laydown).toBeLessThanOrEqual(39);
    expect(out.breakpoint_distance).toBeLessThanOrEqual(59);
    expect(out.breakpoint_distance).toBeGreaterThan(arrowFeet(out.target!));
  });

  it("left-hander mirrors: breakpoint must be on/right (lower board) of the wall", () => {
    // LH skid heads left (target 26 left of laydown 22 for a lefty); breakpoint
    // 34 violates on the wrong side → held clamps to the wall.
    const line: LineSpec = { laydown: 22, target: 26, breakpoint: 34, breakpoint_distance: 46 };
    const out = solveLine(line, "breakpoint", ["breakpoint"], "left");
    expect(out.breakpoint!).toBeLessThanOrEqual(wallAt(out) + 0.05);
  });
});
