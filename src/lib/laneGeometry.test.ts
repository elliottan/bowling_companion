import { describe, it, expect } from "vitest";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, DRAW_FRONT_FEET, DRAW_BACK_FEET, POCKET_BOARD,
  boardToX, feetToY, xToBoard, yToFeet,
  buildLinePath, solveLine, arrowFeet, skidBoardAt, projectBreakpoint
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

  it("with a breakpoint: the drawn path runs laydown → arrows → pocket (ADR-022)", () => {
    const line: LineSpec = { laydown: 20, target: 15, breakpoint: 8, breakpoint_distance: 42 };
    const r = buildLinePath(line, "right")!;
    expect(r.points.hookStart).toBeNull();
    const pts = sampleBoards(r.d, "right");
    const nearest = (feet: number) =>
      pts.reduce((a, p) => (Math.abs(p.feet - feet) < Math.abs(a.feet - feet) ? p : a), pts[0]);
    expect(pts[0].feet).toBeCloseTo(0, 0); // starts at the laydown (foul line)
    expect(pts[0].board).toBeCloseTo(20, 0);
    expect(nearest(arrowFeet(15)).board).toBeCloseTo(15, 0); // through the target on the arrows
    expect(nearest(60).board).toBeCloseTo(POCKET_BOARD, 0);  // ends at the final (pocket default)
  });

  it("the breakpoint marker IS the strict rightmost point of the path (RH)", () => {
    // The strike breakpoint is derived: the furthest-out point of the spare curve.
    const line: LineSpec = { laydown: 20, target: 15, breakpoint: 8, breakpoint_distance: 46 };
    const r = buildLinePath(line, "right")!;
    const maxX = Math.max(...samplePath(r.d).map((p) => p.x));
    expect(maxX).toBeCloseTo(r.points.breakpoint!.x, 1); // rightmost == breakpoint, by construction
  });

  it("for a left-hander the breakpoint marker is the strict extreme point", () => {
    const line: LineSpec = { laydown: 20, target: 24, breakpoint: 32, breakpoint_distance: 46 };
    const r = buildLinePath(line, "left")!;
    const maxX = Math.max(...samplePath(r.d).map((p) => p.x));
    expect(maxX).toBeCloseTo(r.points.breakpoint!.x, 1);
  });

  it("strike line reaches the final smoothly — one quadratic, no kink (ADR-024)", () => {
    const line: LineSpec = { laydown: 20, target: 15, breakpoint: 8, breakpoint_distance: 42, final_board: 17.5 };
    const pts = sampleBoards(buildLinePath(line, "right")!.d, "right");
    // No corner: the per-step board change never jumps (a kink shows as a spike in
    // the second difference). The one-quadratic strike (ADR-023/024) is C1-smooth.
    let maxJump = 0;
    for (let i = 2; i < pts.length; i++) {
      const d1 = pts[i - 1].board - pts[i - 2].board;
      const d2 = pts[i].board - pts[i - 1].board;
      maxJump = Math.max(maxJump, Math.abs(d2 - d1));
    }
    expect(maxJump).toBeLessThan(0.5);
    expect(pts[pts.length - 1].board).toBeCloseTo(17.5, 0); // ends at the final
  });

  it("final defaults to the pocket and is overridable", () => {
    const def = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    expect(def.points.final.x).toBeCloseTo(boardToX(POCKET_BOARD, "right"), 2);
    const gutter = buildLinePath({ laydown: 18, target: 10, final_board: 3 }, "right")!;
    expect(gutter.points.final.x).toBeCloseTo(boardToX(3, "right"), 2);
  });

  it("auto-hooks to the final even without a breakpoint set (ADR-024)", () => {
    // Every non-spare line curves now; the breakpoint is derived (the furthest-out
    // point of the strike quadratic). Straight is only the degenerate case below.
    const r = buildLinePath({ laydown: 18, target: 10 }, "right")!;
    expect(r.points.breakpoint).not.toBeNull();
    const maxX = Math.max(...samplePath(r.d).map((p) => p.x));
    expect(maxX).toBeCloseTo(r.points.breakpoint!.x, 1); // marker == drawn rightmost point
    // The apex sits out past the final (a real hook, not a straight line).
    expect(xToBoard(r.points.breakpoint!.x, "right")).toBeLessThan(POCKET_BOARD);
  });

  it("draws straight when the final sits on the focal (degenerate hook)", () => {
    // final on the extended laydown→target line → no hook needed, rides it straight.
    const focalAt60 = skidBoardAt(18, 10, 60);
    const r = buildLinePath({ laydown: 18, target: 10, final_board: focalAt60 }, "right")!;
    expect(r.d.match(/ L /g)!.length).toBe(1); // one straight segment
  });

  it("breakpoint_distance drives the apex depth (the 1-DOF rail, ADR-024)", () => {
    const base: LineSpec = { laydown: 20, target: 15, breakpoint: 8, final_board: 17.5 };
    const shallow = buildLinePath({ ...base, breakpoint_distance: 34 }, "right")!;
    const deep = buildLinePath({ ...base, breakpoint_distance: 48 }, "right")!;
    expect(yToFeet(deep.points.breakpoint!.y)).toBeGreaterThan(yToFeet(shallow.points.breakpoint!.y));
  });

  it("solveLine writes the derived apex back so stored == drawn (ADR-024)", () => {
    const solved = solveLine({ laydown: 20, target: 15, breakpoint: 8, breakpoint_distance: 42, final_board: 17.5 }, "right");
    const r = buildLinePath(solved, "right")!;
    expect(solved.breakpoint).toBeCloseTo(xToBoard(r.points.breakpoint!.x, "right"), 1);
    expect(solved.breakpoint_distance).toBeCloseTo(yToFeet(r.points.breakpoint!.y), 1);
  });

  it("projectBreakpoint returns a reachable apex near a requested point", () => {
    const line: LineSpec = { laydown: 20, target: 15, breakpoint: 8, breakpoint_distance: 42, final_board: 17.5 };
    const a = projectBreakpoint(line, "right", 6, 44);
    const drawn = buildLinePath({ ...line, hook_start_distance: a.hook_start_distance, hook_length: a.hook_length }, "right")!;
    expect(a.board).toBeCloseTo(xToBoard(drawn.points.breakpoint!.x, "right"), 1);
    expect(a.feet).toBeCloseTo(yToFeet(drawn.points.breakpoint!.y), 1);
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
    const a = buildLinePath({ laydown: 18, target: 10, breakpoint: 6 }, "right", true)!;
    const b = buildLinePath({ laydown: 18, target: 10 }, "right", true)!;
    // shape identical with/without a stored breakpoint…
    expect(a.d).toBe(b.d);
    // …but the spare now derives its own marker (ADR-026)
    expect(a.points.breakpoint).not.toBeNull();
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

  it("spare hook timing is per-line: a later hook start keeps the skid straight longer (ADR-024)", () => {
    const base: LineSpec = { laydown: 31, target: 22.5, final_board: 3, final_distance: 62.6 };
    const at = (l: LineSpec, ft: number) => {
      const pts = sampleBoards(buildLinePath(l, "right", true)!.d, "right");
      return pts.reduce((a, p) => (Math.abs(p.feet - ft) < Math.abs(a.feet - ft) ? p : a), pts[0]);
    };
    // At 48 ft the default line (hook from ~38 ft) has recovered well off the focal,
    // while a line whose hook only starts at 48 ft is still dead-straight on it.
    const late = at({ ...base, hook_start_distance: 48 }, 48);
    expect(late.board).toBeCloseTo(focalBoardAt(base, 48), 0);      // still on the focal
    expect(at({ ...base }, 48).board).toBeGreaterThan(late.board + 1); // default has hooked
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

  it("laydown == target: breakpoint sits at/past the target, never at the foul line (ADR-025)", () => {
    // The whole skid rides one board — the apex tie must break to the DEEPEST point.
    const r = buildLinePath({ laydown: 5, target: 5, breakpoint: 5, final_board: 16 }, "right")!;
    const bp = r.points.breakpoint!;
    expect(xToBoard(bp.x, "right")).toBeCloseTo(5, 1);
    expect(yToFeet(bp.y)).toBeGreaterThanOrEqual(arrowFeet(5) - 0.1); // ≥ target depth (12 ft)
  });

  it("LH mirror: laydown == target puts the breakpoint at/past the target", () => {
    const r = buildLinePath({ laydown: 35, target: 35, breakpoint: 35, final_board: 24 }, "left")!;
    const bp = r.points.breakpoint!;
    expect(xToBoard(bp.x, "left")).toBeCloseTo(35, 1);
    expect(yToFeet(bp.y)).toBeGreaterThanOrEqual(arrowFeet(35) - 0.1);
  });

  it("unreachable final on a one-board focal: breakpoint at the deep end, not the laydown", () => {
    // final gutter-side of the vertical focal → rides the focal straight; the
    // on-focal tie must break to the deep end.
    const r = buildLinePath({ laydown: 5, target: 5, breakpoint: 5, final_board: 3 }, "right")!;
    expect(yToFeet(r.points.breakpoint!.y)).toBeGreaterThan(50);
  });

  it("LH mirror: unreachable final on a one-board focal breaks the tie to the deep end", () => {
    // For a left-hander the gutter side is the HIGH boards: final_board 38 sits
    // gutter-side of the vertical board-35 focal → rides the focal straight.
    const r = buildLinePath({ laydown: 35, target: 35, breakpoint: 35, final_board: 38 }, "left")!;
    const bp = r.points.breakpoint!;
    expect(xToBoard(bp.x, "left")).toBeCloseTo(35, 1);
    expect(yToFeet(bp.y)).toBeGreaterThan(50);
  });

  it("rail extends to a sharp late hook — the apex can approach the gutter (ADR-025)", () => {
    // Screenshot config: old control-cap stranded the apex at board ~8.2.
    const line: LineSpec = { laydown: 19, target: 14, breakpoint: 8, final_board: 17 };
    const a = projectBreakpoint(line, "right", 1, 50); // finger at the gutter
    expect(a.board).toBeLessThan(4);
    expect(a.board).toBeGreaterThanOrEqual(1); // never off the lane
  });

  it("at the sharp end of the rail: stored == drawn, on-lane, and still no kink", () => {
    const base: LineSpec = { laydown: 19, target: 14, breakpoint: 8, final_board: 17 };
    const a = projectBreakpoint(base, "right", 1, 50);
    const solved = solveLine({ ...base, hook_start_distance: a.hook_start_distance, hook_length: a.hook_length }, "right");
    const r = buildLinePath(solved, "right")!;
    expect(solved.breakpoint!).toBeCloseTo(xToBoard(r.points.breakpoint!.x, "right"), 1);
    expect(solved.breakpoint_distance!).toBeCloseTo(yToFeet(r.points.breakpoint!.y), 1);
    const pts = sampleBoards(r.d, "right");
    for (const p of pts) expect(p.board).toBeGreaterThanOrEqual(0.9); // on the lane
    let maxJump = 0; // C1 at the ride→hook junction: no second-difference spike
    for (let i = 2; i < pts.length; i++) {
      const d1 = pts[i - 1].board - pts[i - 2].board;
      const d2 = pts[i].board - pts[i - 1].board;
      maxJump = Math.max(maxJump, Math.abs(d2 - d1));
    }
    expect(maxJump).toBeLessThan(0.5);
  });

  it("LH mirror: sharp end of the rail stays on-lane with stored == drawn", () => {
    const base: LineSpec = { laydown: 21, target: 26, breakpoint: 32, final_board: 23 };
    const a = projectBreakpoint(base, "left", 39, 50); // finger at the LH gutter
    expect(a.board).toBeGreaterThan(36);
    expect(a.board).toBeLessThanOrEqual(39);
    const solved = solveLine({ ...base, hook_start_distance: a.hook_start_distance, hook_length: a.hook_length }, "left");
    const r = buildLinePath(solved, "left")!;
    expect(solved.breakpoint!).toBeCloseTo(xToBoard(r.points.breakpoint!.x, "left"), 1);
    expect(solved.breakpoint_distance!).toBeCloseTo(yToFeet(r.points.breakpoint!.y), 1);
    for (const p of sampleBoards(r.d, "left")) expect(p.board).toBeLessThanOrEqual(39.1);
  });

  it("deep breakpoint on a one-board focal slides the peel down the board (ADR-025)", () => {
    // laydown == target: dragging the breakpoint deeper must move the on-board
    // peel deeper (the rail stays meaningful on the degenerate line).
    const base: LineSpec = { laydown: 5, target: 5, breakpoint: 5, final_board: 16 };
    const shallow = buildLinePath({ ...base, breakpoint_distance: 20 }, "right")!;
    const deep = buildLinePath({ ...base, breakpoint_distance: 50 }, "right")!;
    expect(yToFeet(deep.points.breakpoint!.y)).toBeGreaterThan(yToFeet(shallow.points.breakpoint!.y) + 10);
    expect(xToBoard(deep.points.breakpoint!.x, "right")).toBeCloseTo(5, 1);
  });

  it("lofted laydown: breakpoint marker and stored board stay on the lane (ADR-026)", () => {
    // Laydown may loft up to 20 boards off-lane; the raw furthest-out point IS
    // the laydown, which put the marker off the visible plane (x > PLANE_W).
    const line: LineSpec = { laydown: -2, target: 1, breakpoint: 5, final_board: 17 };
    const r = buildLinePath(line, "right")!;
    expect(r.points.breakpoint!.x).toBeLessThanOrEqual(PLANE_W + 0.01);
    expect(r.points.breakpoint!.x).toBeGreaterThanOrEqual(-0.01);
    const solved = solveLine(line, "right");
    expect(solved.breakpoint!).toBeGreaterThanOrEqual(1);
    expect(solved.breakpoint!).toBeLessThanOrEqual(39);
  });

  it("strike hook timing is per-line, like the spare (ADR-026)", () => {
    const base: LineSpec = { laydown: 20, target: 15, breakpoint: 8, final_board: 17.5 };
    const early = buildLinePath({ ...base, hook_start_distance: 25, hook_length: 20 }, "right")!;
    const late = buildLinePath({ ...base, hook_start_distance: 48, hook_length: 6 }, "right")!;
    expect(yToFeet(late.points.breakpoint!.y)).toBeGreaterThan(yToFeet(early.points.breakpoint!.y) + 10);
  });

  it("legacy strike line (breakpoint_distance only) renders with its apex depth honored (ADR-026)", () => {
    const r = buildLinePath({ laydown: 20, target: 15, breakpoint: 8, breakpoint_distance: 46, final_board: 17.5 }, "right")!;
    expect(Math.abs(yToFeet(r.points.breakpoint!.y) - 46)).toBeLessThan(1.5);
  });

  it("solveLine migrates breakpoint_distance to hook timing, stably (ADR-026)", () => {
    const solved = solveLine({ laydown: 20, target: 15, breakpoint: 8, breakpoint_distance: 46, final_board: 17.5 }, "right");
    expect(solved.hook_start_distance).not.toBeUndefined();
    expect(Math.abs(solved.breakpoint_distance! - 46)).toBeLessThan(1.5); // depth preserved
    const again = solveLine(solved, "right"); // idempotent: no drift on re-solve
    expect(again.hook_start_distance!).toBeCloseTo(solved.hook_start_distance!, 1);
    expect(again.breakpoint_distance!).toBeCloseTo(solved.breakpoint_distance!, 1);
  });

  it("projectBreakpoint solves hook timing so the apex lands near the finger (ADR-026)", () => {
    const line: LineSpec = { laydown: 19, target: 14, breakpoint: 8, final_board: 17 };
    const a = projectBreakpoint(line, "right", 6, 30); // finger: early mid-lane hook
    const r = buildLinePath({ ...line, hook_start_distance: a.hook_start_distance, hook_length: a.hook_length }, "right")!;
    expect(xToBoard(r.points.breakpoint!.x, "right")).toBeCloseTo(a.board, 1); // returned == drawn
    expect(yToFeet(r.points.breakpoint!.y)).toBeCloseTo(a.feet, 1);
    expect(Math.abs(a.feet - 30)).toBeLessThan(6); // magnetic: depth tracks the finger
  });

  it("spare derives a breakpoint marker; a straight seeded aim puts it at the hook start (ADR-026)", () => {
    // 10-pin style seed: laydown == target == board 3, pin at board 5. The skid
    // ties along board 3; deepest tie = the hook start.
    const r = buildLinePath({ laydown: 3, target: 3, final_board: 5, final_distance: 60, hook_start_distance: 40, hook_length: 12 }, "right", true)!;
    expect(r.points.breakpoint).not.toBeNull();
    expect(xToBoard(r.points.breakpoint!.x, "right")).toBeCloseTo(3, 1);
    expect(yToFeet(r.points.breakpoint!.y)).toBeCloseTo(40, 0);
  });

  it("default strike timing: skid holds the focal to mid-lane, apex in the hook zone (ADR-026)", () => {
    const r = buildLinePath({ laydown: 20, target: 15, breakpoint: 8 }, "right")!;
    const pts = sampleBoards(r.d, "right");
    const at30 = pts.reduce((a, p) => (Math.abs(p.feet - 30) < Math.abs(a.feet - 30) ? p : a), pts[0]);
    expect(Math.abs(at30.board - skidBoardAt(20, 15, 30))).toBeLessThan(0.75); // still skidding at 30 ft
    expect(yToFeet(r.points.breakpoint!.y)).toBeGreaterThan(35); // hook starts late (default 38 ft)
  });

  it("magnetic drag round-trips on a big cross where the lane cap binds (ADR-026)", () => {
    // The dE clamp aliases requested lengths; the cap bisection must search with
    // the effective length or the returned params don't reproduce the drawn apex
    // (regression: 33 ft divergence at the first probe point).
    const line: LineSpec = { laydown: 30, target: 10, breakpoint: 8, final_board: 17.5 };
    for (const [b, f] of [[21.61, 54.35], [5, 45], [12, 55], [1, 50]] as const) {
      const a = projectBreakpoint(line, "right", b, f);
      const r = buildLinePath({ ...line, hook_start_distance: a.hook_start_distance, hook_length: a.hook_length }, "right")!;
      expect(xToBoard(r.points.breakpoint!.x, "right")).toBeCloseTo(a.board, 1);
      expect(yToFeet(r.points.breakpoint!.y)).toBeCloseTo(a.feet, 1);
    }
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

  it("inside aims (focal heads hook-side) still never cross right of the focal", () => {
    // Both are physically impossible lines (the focal already runs off the hook
    // edge, so the breakpoint/final can't be reached) — the ball must ride the
    // focal off the lane, never bulging to the anti-hook (gutter) side. RH.
    for (const line of [
      { laydown: 1, target: 10, breakpoint: 29.35, breakpoint_distance: 42, final_board: 39 },
      { laydown: 2.5, target: 21.5, breakpoint: 39, breakpoint_distance: 45, final_board: 39 },
    ] as LineSpec[]) {
      const solved = solveLine(line, "right");
      for (const { board, feet } of sampleBoards(buildLinePath(solved, "right")!.d, "right")) {
        // Never anti-hook (right) of the focal while the focal is still on the lane.
        // Past the edge the ball is already guttering — it rides the lane edge, not
        // the off-lane focal extension.
        if (focalBoardAt(solved, feet) <= 39)
          expect(board).toBeGreaterThanOrEqual(focalBoardAt(solved, feet) - TOL);
      }
    }
  });

  it("a guttering aim draws a smooth straight line; pegs stay on the lane", () => {
    // Steep inside aim: the focal runs off the hook edge, so the ball can't reach
    // the final — it rides the focal STRAIGHT (smooth, no corner) and may run off
    // the lane (guttering). The final/breakpoint pegs stay on the lane so their
    // handles are reachable.
    const solved = solveLine({ laydown: 2.5, target: 21.5, breakpoint: 39, breakpoint_distance: 45, final_board: 39 }, "right");
    const r = buildLinePath(solved, "right")!;
    expect(r.d.match(/ L /g)!.length).toBe(1); // one straight segment — smooth, no corner
    expect(xToBoard(r.points.final.x, "right")).toBeLessThanOrEqual(39.001);       // final peg on the lane
    expect(xToBoard(r.points.breakpoint!.x, "right")).toBeLessThanOrEqual(39.001); // breakpoint peg on the lane
  });

  it("RH: board is unimodal — falls to the apex then rises, never reversing back", () => {
    const line: LineSpec = { laydown: 22, target: 14, breakpoint: 7, breakpoint_distance: 44, final_board: 17.5 };
    const pts = sampleBoards(buildLinePath(line, "right")!.d, "right");
    const apex = pts.reduce((m, p, i) => (p.board < pts[m].board ? i : m), 0);
    for (let i = 1; i <= apex; i++) expect(pts[i].board).toBeLessThanOrEqual(pts[i - 1].board + TOL);
    for (let i = apex + 1; i < pts.length; i++) expect(pts[i].board).toBeGreaterThanOrEqual(pts[i - 1].board - TOL);
  });
});
