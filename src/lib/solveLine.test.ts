import { describe, it, expect } from "vitest";
import { solveLine, buildLinePath, skidBoardAt, arrowFeet, xToBoard, yToFeet } from "./laneGeometry";
import type { Handedness, LineSpec } from "../types/bowling";

// Board the focal (laydown→target) line reaches at a down-lane distance.
const focalAt = (l: LineSpec, d: number) => skidBoardAt((l.laydown ?? l.stance)!, l.target!, d);

/** Sample the solved line's drawn curve (polyline) in board × feet space. */
function curve(l: LineSpec, hand: Handedness): Array<{ board: number; feet: number }> {
  const d = buildLinePath(l, hand)!.d;
  const nums = d.match(/-?[\d.]+/g)!.map(Number);
  const cmds = d.match(/[ML]/g)!;
  const pts: Array<{ board: number; feet: number }> = [];
  let i = 0;
  for (let c = 0; c < cmds.length; c++) pts.push({ board: xToBoard(nums[i++], hand), feet: yToFeet(nums[i++]) });
  return pts;
}

// The user owns the laydown and target (always free). The breakpoint and final are
// dependent — they re-clamp minimally onto the focal/apex to stay drawable, never
// cascading onto the laydown/target and never jumping to the gutter (ADR-015).
describe("solveLine — dependent re-clamp (RH)", () => {
  it("leaves the laydown and target exactly where the user set them", () => {
    const line: LineSpec = { laydown: 26, target: 20, breakpoint: 4, breakpoint_distance: 42, final_board: 9 };
    const out = solveLine(line, "right");
    expect(out.laydown).toBe(26);
    expect(out.target).toBe(20);
  });

  it("a breakpoint dragged anti-hook (right) of the focal clamps onto the focal line", () => {
    // focal@42 ≈ 10.25; breakpoint 4 sits right of it → slides up ONTO the focal.
    const line: LineSpec = { laydown: 26, target: 20, breakpoint: 4, breakpoint_distance: 42 };
    const out = solveLine(line, "right");
    expect(out.breakpoint!).toBeCloseTo(focalAt(out, 42), 1);
    expect(out.breakpoint!).toBeGreaterThan(4); // moved hook-side, minimally
  });

  it("moving the laydown re-clamps the breakpoint onto the focal, not to the gutter", () => {
    const before: LineSpec = { laydown: 20, target: 14, breakpoint: 8, breakpoint_distance: 42, final_board: 17.5 };
    const after = solveLine({ ...before, laydown: 10 }, "right"); // laydown swung hook-ward
    expect(after.laydown).toBe(10);                              // free
    expect(after.target).toBe(14);                              // free
    expect(after.breakpoint!).toBeCloseTo(focalAt(after, 42), 1); // slid onto the focal
    expect(after.breakpoint!).toBeLessThan(39);                  // NOT slammed to the gutter
  });

  it("won't let the apex be dragged hook-side of the aim on an out-and-back skid", () => {
    const line: LineSpec = { laydown: 20, target: 12, breakpoint: 25, breakpoint_distance: 40 };
    const out = solveLine(line, "right");
    expect(out.breakpoint!).toBeLessThanOrEqual(out.target! + 0.01);
  });

  it("pulls the final hook-side of the breakpoint (it hooks after the apex)", () => {
    const line: LineSpec = { laydown: 20, target: 16, breakpoint: 14, breakpoint_distance: 42, final_board: 9 };
    const out = solveLine(line, "right");
    expect(out.final_board!).toBeGreaterThanOrEqual(out.breakpoint! - 0.01);
  });

  it("clamps the breakpoint distance between the arrows and the pocket", () => {
    const out = solveLine({ laydown: 18, target: 14, breakpoint: 6, breakpoint_distance: 80 }, "right");
    expect(out.breakpoint_distance!).toBeLessThanOrEqual(59);
    expect(out.breakpoint_distance!).toBeGreaterThan(arrowFeet(out.target!));
  });

  it("lets the laydown loft off the lane", () => {
    const out = solveLine({ laydown: 45, target: 14, breakpoint: 6, breakpoint_distance: 42 }, "right");
    expect(out.laydown).toBe(45);
  });
});

describe("solveLine — the solved line is always drawable", () => {
  const TOL = 0.15; // the curve is clamped strictly to the hook side of the focal
  const cases: Array<[string, LineSpec, Handedness]> = [
    ["RH out-and-back", { laydown: 22, target: 12, breakpoint: 4, breakpoint_distance: 42, final_board: 30 }, "right"],
    ["RH cross-lane aim", { laydown: 4, target: 20, breakpoint: 10, breakpoint_distance: 38, final_board: 17.5 }, "right"],
    ["RH steep skid", { laydown: 35, target: 18, breakpoint: 3, breakpoint_distance: 44, final_board: 17.5 }, "right"],
    ["LH out-and-back", { laydown: 18, target: 28, breakpoint: 36, breakpoint_distance: 42, final_board: 10 }, "left"],
  ];
  for (const [name, line, hand] of cases) {
    it(`${name}: drawn curve is monotone and never crosses the focal`, () => {
      const out = solveLine(line, hand);
      const dir = hand === "right" ? 1 : -1;
      const pts = curve(out, hand);
      const ld = (out.laydown ?? out.stance)!;
      // The focal is a wall only on a true out-and-back skid.
      if (dir * (ld - out.target!) > 0)
        for (const { board, feet } of pts) expect(dir * (board - focalAt(out, feet))).toBeGreaterThanOrEqual(-TOL);
      // Unimodal: one apex, then no reversal back toward the anti-hook side.
      const apex = pts.reduce((m, p, i) => (dir * p.board < dir * pts[m].board ? i : m), 0);
      for (let i = 1; i <= apex; i++) expect(dir * pts[i].board).toBeLessThanOrEqual(dir * pts[i - 1].board + TOL);
      for (let i = apex + 1; i < pts.length; i++) expect(dir * pts[i].board).toBeGreaterThanOrEqual(dir * pts[i - 1].board - TOL);
    });
  }
});

describe("solveLine — left-hander mirror", () => {
  it("clamps the breakpoint onto the hook (lower-board) side of the focal", () => {
    const line: LineSpec = { laydown: 14, target: 20, breakpoint: 36, breakpoint_distance: 42 };
    const out = solveLine(line, "left");
    expect(out.breakpoint!).toBeLessThanOrEqual(focalAt(out, 42) + 0.1);
  });
});

// The whole line is one smooth curve — the skid eases into the hook with no corner
// anywhere. A hard corner at any peg would spike the turn between two consecutive
// sampled segments, so the max turn angle over the path bounds the worst corner.
const maxTurnDeg = (l: LineSpec, hand: Handedness) => {
  const d = buildLinePath(solveLine(l, hand), hand)!.d;
  const n = d.match(/-?[\d.]+/g)!.map(Number);
  const p = (i: number) => [n[i * 2], n[i * 2 + 1]];
  let worst = 0;
  for (let i = 2; i < n.length / 2; i++) {
    const u = [p(i - 1)[0] - p(i - 2)[0], p(i - 1)[1] - p(i - 2)[1]];
    const w = [p(i)[0] - p(i - 1)[0], p(i)[1] - p(i - 1)[1]];
    const c = (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w));
    worst = Math.max(worst, (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  return worst;
};

describe("solveLine — the hook leaves the arrows tangent (no corner) for realistic aims", () => {
  for (const [name, line, hand] of [
    ["default", { laydown: 18, target: 10, breakpoint: 7, breakpoint_distance: 42 }, "right"],
    ["normal swing", { laydown: 20, target: 10, breakpoint: 6, breakpoint_distance: 42, final_board: 17.5 }, "right"],
    ["steep", { laydown: 23, target: 9, breakpoint: 5, breakpoint_distance: 43, final_board: 17.5 }, "right"],
    ["LH", { laydown: 22, target: 28, breakpoint: 34, breakpoint_distance: 42 }, "left"],
  ] as Array<[string, LineSpec, Handedness]>) {
    it(`${name}: no sharp angle change anywhere on the line`, () => {
      expect(maxTurnDeg(line, hand)).toBeLessThan(8);
    });
  }
});
