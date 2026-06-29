import { describe, it, expect } from "vitest";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, DRAW_FRONT_FEET, DRAW_BACK_FEET, POCKET_BOARD,
  boardToX, feetToY, xToBoard, yToFeet,
  buildLinePath, arrowFeet, skidBoardAt, DEFAULT_BREAKPOINT_FEET
} from "./laneGeometry";
import type { Handedness, LineSpec } from "../types/bowling";

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

/** Sample the drawn path in lane space: board (cross-lane) × feet (down-lane). */
function sampleBoards(d: string, hand: Handedness, n = 80): Array<{ board: number; feet: number }> {
  return samplePath(d, n).map((p) => ({ board: xToBoard(p.x, hand), feet: yToFeet(p.y) }));
}
/** Board the focal (laydown→target) line reaches at a down-lane distance. */
const focalBoardAt = (l: LineSpec, feet: number) =>
  skidBoardAt((l.laydown ?? l.stance)!, l.target!, feet);

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

  it("is linear across the whole extent — no deck knee (ADR-020)", () => {
    // The midpoint of any two feet maps to the midpoint of their y's. A non-linear
    // mapping (the old 60 ft knee) would fail this and kink straight lines.
    for (const [a, b] of [[0, 60], [40, 62.6], [DRAW_FRONT_FEET, DRAW_BACK_FEET]]) {
      expect(feetToY((a + b) / 2)).toBeCloseTo((feetToY(a) + feetToY(b)) / 2, 5);
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

  it("with a breakpoint: the drawn path passes through every peg", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 6, breakpoint_distance: 42 };
    const r = buildLinePath(line, "right")!;
    expect(r.points.hookStart).toBeNull(); // v3 dropped the hook-start peg
    const pts = sampleBoards(r.d, "right");
    const nearest = (feet: number) =>
      pts.reduce((a, p) => (Math.abs(p.feet - feet) < Math.abs(a.feet - feet) ? p : a), pts[0]);
    expect(pts[0].feet).toBeCloseTo(0, 0); // starts at the laydown (foul line)
    expect(pts[0].board).toBeCloseTo(18, 0);
    expect(nearest(arrowFeet(10)).board).toBeCloseTo(10, 0); // through the target on the arrows
    expect(nearest(42).board).toBeCloseTo(6, 0);             // through the breakpoint at its distance
    expect(nearest(60).board).toBeCloseTo(POCKET_BOARD, 0);  // ends at the final (pocket default)
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

  it("final_distance sets the final point's depth", () => {
    const r = buildLinePath({ laydown: 18, target: 10, final_distance: 62.6 }, "right")!;
    expect(yToFeet(r.points.final.y)).toBeCloseTo(62.6, 1);
  });

  it("spareCurve ignores a stored breakpoint (legacy dormant data)", () => {
    const line: LineSpec = { laydown: 18, target: 10, breakpoint: 6, breakpoint_distance: 42 };
    const r = buildLinePath(line, "right", true)!;
    expect(r.points.breakpoint).toBeNull(); // no breakpoint peg/marker
    expect(r.d).not.toContain(" C ");       // not the breakpoint cubic
  });

  // Mid down-lane sample of a drawn path, in lane boards.
  const midBoard = (d: string, hand: Handedness) => {
    const pts = sampleBoards(d, hand);
    return pts.reduce((a, p) => (Math.abs(p.feet - 45) < Math.abs(a.feet - 45) ? p : a), pts[0]).board;
  };

  it("spare curve responds to the laydown (tangent to the skid, not a fixed bow)", () => {
    // Same target + final, different laydown → the hook leaves the target along the
    // skid heading, so the whole curve shifts. (The old fixed-bow model did not.)
    const a = buildLinePath({ laydown: 5, target: 4, final_board: 3, final_distance: 62.6 }, "right", true)!;
    const b = buildLinePath({ laydown: 8, target: 4, final_board: 3, final_distance: 62.6 }, "right", true)!;
    expect(Math.abs(midBoard(a.d, "right") - midBoard(b.d, "right"))).toBeGreaterThan(1);
  });

  it("focal guide is a single straight segment (renders straight, ADR-020)", () => {
    const r = buildLinePath({ laydown: 31, target: 22.5, final_board: 3, final_distance: 62.6 }, "right", true)!;
    expect(r.focal!.match(/L/g)!.length).toBe(1); // one segment → no kink
  });

  it("spare skid stays on the focal until the hook starts (~38 ft)", () => {
    const line: LineSpec = { laydown: 31, target: 22.5, final_board: 3, final_distance: 62.6 };
    const pts = sampleBoards(buildLinePath(line, "right", true)!.d, "right");
    const at = (ft: number) => pts.reduce((a, p) => (Math.abs(p.feet - ft) < Math.abs(a.feet - ft) ? p : a), pts[0]);
    expect(at(30).board).toBeCloseTo(focalBoardAt(line, 30), 0); // still dead-straight on the focal
  });

  it("reachable spare: never right of the focal (RH), unimodal turn, ends at the pin", () => {
    const line: LineSpec = { laydown: 31, target: 22.5, final_board: 3, final_distance: 62.6 };
    const r = buildLinePath(line, "right", true)!;
    const pts = sampleBoards(r.d, "right");
    for (const { board, feet } of pts) {
      expect(board).toBeGreaterThanOrEqual(focalBoardAt(line, feet) - 0.3); // on/left of focal
    }
    // one turning point: board falls to an apex (going out) then only rises (hooking back)
    const apex = pts.reduce((m, p, i) => (p.board < pts[m].board ? i : m), 0);
    for (let i = 1; i <= apex; i++) expect(pts[i].board).toBeLessThanOrEqual(pts[i - 1].board + 0.3);
    for (let i = apex + 1; i < pts.length; i++) expect(pts[i].board).toBeGreaterThanOrEqual(pts[i - 1].board - 0.3);
    expect(pts[pts.length - 1].board).toBeCloseTo(3, 0); // rolls into the pin
    expect(r.miss).toBe(false);
  });

  it("unreachable spare (pin right of the focal) rides the focal off the back + flags a miss", () => {
    // laydown 2 / target 5: the straight focal lands ~board 18, well hook-side
    // (left, RH) of the board-3 pin — no leftward hook can get back out there.
    const line: LineSpec = { laydown: 2, target: 5, final_board: 3, final_distance: 62.6 };
    const r = buildLinePath(line, "right", true)!;
    expect(r.d).not.toContain(" C ");
    const pts = sampleBoards(r.d, "right");
    for (const { board, feet } of pts) expect(board).toBeCloseTo(focalBoardAt(line, feet), 0); // on the focal
    expect(pts[pts.length - 1].feet).toBeGreaterThan(62); // exits off the back, not stopping at the pin
    expect(r.miss).toBe(true);
  });
});

// ADR-015 — the ball rides the focal line on the skid, peels off to the hook side
// only, and never crosses back. These hold for the *drawn curve*, not just the
// pegs: hook side = higher board (RH) / lower board (LH).
describe("buildLinePath — focal & monotonicity invariants (ADR-015)", () => {
  const TOL = 0.15; // boards — the curve is clamped strictly to the hook side of the focal

  it("RH: the drawn curve never crosses to the anti-hook side of the focal line", () => {
    // Legal knots (breakpoint 11 is hook-side of focal@42 ≈ 10.25) but the old two-
    // cubic construction bowed ~1.2 boards right of the focal between target and apex.
    const line: LineSpec = { laydown: 26, target: 20, breakpoint: 11, breakpoint_distance: 42, final_board: 17.5 };
    for (const { board, feet } of sampleBoards(buildLinePath(line, "right")!.d, "right")) {
      expect(board).toBeGreaterThanOrEqual(focalBoardAt(line, feet) - TOL);
    }
  });

  it("LH mirror: the drawn curve never crosses to the anti-hook side of the focal line", () => {
    const line: LineSpec = { laydown: 14, target: 20, breakpoint: 29, breakpoint_distance: 42, final_board: 22.5 };
    for (const { board, feet } of sampleBoards(buildLinePath(line, "left")!.d, "left")) {
      expect(board).toBeLessThanOrEqual(focalBoardAt(line, feet) + TOL);
    }
  });

  it("RH: board is unimodal — falls to the apex then rises, never reversing back", () => {
    const line: LineSpec = { laydown: 22, target: 14, breakpoint: 7, breakpoint_distance: 44, final_board: 17.5 };
    const pts = sampleBoards(buildLinePath(line, "right")!.d, "right");
    const apex = pts.reduce((m, p, i) => (p.board < pts[m].board ? i : m), 0);
    for (let i = 1; i <= apex; i++) expect(pts[i].board).toBeLessThanOrEqual(pts[i - 1].board + TOL);
    for (let i = apex + 1; i < pts.length; i++) expect(pts[i].board).toBeGreaterThanOrEqual(pts[i - 1].board - TOL);
  });
});
