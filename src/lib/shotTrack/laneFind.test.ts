import { beforeAll, describe, expect, it } from "vitest";
import { apply, horizon, invert, lineDistance, type Line3 } from "./homography";
import { makeFrame } from "./image";
import {
  buildFan,
  columnLine,
  columnProfile,
  estimateRoll,
  findFoulLine,
  findFoulLines,
  findLane,
  findPinRow,
  houghLines,
  laneAttempts,
  laneCandidates,
  lanePairs,
  lanesOnFrame,
  laneRows,
  laneWidth,
  markLinesOf,
  modeOf,
  pinBases,
  pinRows,
  prepare,
  rankLanes,
  rayThrough,
  refineVanishingPoint,
  rowEnergy,
  snapLaneEdge,
  steadyProfiles,
  vanishingPoint,
  CAMERA_FT,
  type Fan,
  type FrameLanes,
  type HoughLine,
  type LaneFound
} from "./laneFind";
import { behindCamera, renderFrame, truthAt, type SyntheticShot } from "./synthetic";
import type { GrayFrame, Mat3, Point } from "./types";

/**
 * The lane finder (plan, PR 8). The stages are tried on their own, on tiny
 * hand-built pictures and profiles where the answer is known by construction,
 * and together on a synthetic house rendered from a pinhole camera, where the
 * truth is the exact lane-to-picture homography. Rendering and finding cost
 * a second or two a frame set, so each house is rendered and read once and
 * shared.
 */

const SLOW = 60_000;

/** A fan of `rows` fan rows whose row j has across-ray gradient E[j] in every column (so `rowEnergy` is E). */
function energyFan(E: number[], y0 = 10): Fan {
  const cols = 4;
  const G = new Float32Array(cols * E.length);
  E.forEach((e, j) => G.fill(e, j * cols, (j + 1) * cols));
  return { vp: { x: 0, y: -5 }, yRef: 99, roll: 0, x0: 0, cols, y0, rows: E.length, F: new Float32Array(cols * E.length), G };
}

/** Lines through `p` at the given normal angles, as the Hough transform reports them. */
function linesThrough(p: Point, thetas: number[], votes = 100): HoughLine[] {
  return thetas.map((theta) => {
    const rho = p.x * Math.cos(theta) + p.y * Math.sin(theta);
    return { theta, rho, votes, line: [Math.cos(theta), Math.sin(theta), -rho] as Line3 };
  });
}

/** A profile with a peak of height `v` (and half of it either side, so it is a lobe) at each of the given columns. */
function lobes(n: number, peaks: [number, number][]): Float32Array {
  const g = new Float32Array(n);
  for (const [at, v] of peaks) {
    g[at - 1] = v / 2;
    g[at] = v;
    g[at + 1] = v / 2;
  }
  return g;
}

/** Just enough of a `FrameLanes` for the stages that read profiles (a picture 960 wide, lane at the near row). */
function fakeLanes(grad: Float32Array, o: { candidates?: FrameLanes["candidates"]; vp?: Point; x0?: number } = {}): FrameLanes {
  const vp = o.vp ?? { x: 480, y: 0 };
  const fan = { vp, yRef: 719, roll: 0, x0: o.x0 ?? 0, cols: grad.length, y0: 0, rows: 0, F: new Float32Array(0), G: new Float32Array(0) };
  return { vp, far: 100, near: 719, candidates: o.candidates ?? [], fan, profile: { grad, level: new Float32Array(grad.length) } };
}

describe("houghLines", () => {
  /** A diagonal step, antialiased so its gradient points across it: dark left of x = 20 + 0.5 y, bright right of it (or the reverse). */
  const diag = (bright: boolean) => {
    const f = makeFrame(120, 100);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 120; x++) {
        const v = 40 + 160 * Math.min(1, Math.max(0, x - 20 - 0.5 * y + 0.5));
        f.data[y * 120 + x] = bright ? v : 240 - v;
      }
    }
    return f;
  };

  it("finds a straight edge, whichever side is brighter, strongest first", () => {
    for (const bright of [true, false]) {
      const lines = houghLines(diag(bright));
      expect(lines.length).toBeGreaterThan(0);
      for (let i = 1; i < lines.length; i++) expect(lines[i].votes).toBeLessThanOrEqual(lines[i - 1].votes);
      // Every point of the edge is within a pixel and a half of the best line.
      for (const y of [10, 40, 80]) expect(Math.abs(lineDistance(lines[0].line, { x: 20 + 0.5 * y, y }))).toBeLessThan(1.5);
    }
  });

  it("finds a vertical edge whose normal is at angle 0 or pi (the angle wraps)", () => {
    for (const leftBright of [false, true]) {
      const f = makeFrame(80, 60);
      for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) f.data[y * 80 + x] = x < 30 === leftBright ? 200 : 40;
      const best = houghLines(f)[0];
      expect(Math.abs(lineDistance(best.line, { x: 29.5, y: 30 }))).toBeLessThan(1.5);
      expect(Math.abs(lineDistance(best.line, { x: 29.5, y: 5 }))).toBeLessThan(1.5);
    }
  });

  it("keeps the number asked for, skips rows above fromY and finds nothing on a flat picture", () => {
    expect(houghLines(makeFrame(60, 60, 0, 100))).toEqual([]);
    expect(houghLines(diag(true), { max: 1 })).toHaveLength(1);
    // The step only exists in the top rows; voting from row 60 down sees none of it.
    const top = makeFrame(80, 100);
    for (let y = 0; y < 30; y++) for (let x = 40; x < 80; x++) top.data[y * 80 + x] = 200;
    expect(houghLines(top, { minMagnitude: 6 }).length).toBeGreaterThan(0);
    expect(houghLines(top, { fromY: 60 })).toEqual([]);
    // A coarser angle grid and a higher gradient floor still find the strong edge.
    expect(houghLines(diag(true), { angles: 90, spread: 0.05, minMagnitude: 20 }).length).toBeGreaterThan(0);
  });
});

describe("vanishingPoint", () => {
  const P = { x: 100, y: 50 };
  const thetas = [0.2, 0.6, 1.0, 1.4, 2.0, 2.6];

  it("is the point the lines run through, with a stray line outvoted", () => {
    const stray = linesThrough({ x: 400, y: 300 }, [0.1], 10);
    const r = vanishingPoint([...linesThrough(P, thetas), ...stray], 2)!;
    expect(r.point.x).toBeCloseTo(P.x, 1);
    expect(r.point.y).toBeCloseTo(P.y, 1);
    expect(r.support).toHaveLength(thetas.length);
  });

  it("is null with fewer than two lines or when the accept test refuses every crossing", () => {
    expect(vanishingPoint([], 2)).toBeNull();
    expect(vanishingPoint(linesThrough(P, [0.3]), 2)).toBeNull();
    expect(vanishingPoint(linesThrough(P, thetas), 2, (p) => p.x < 0)).toBeNull();
  });

  it("gives the best crossing back when no line is within the tolerance, or the lines carry no weight", () => {
    const none = vanishingPoint(linesThrough(P, thetas.slice(0, 3)), 0)!;
    expect(Math.hypot(none.point.x - P.x, none.point.y - P.y)).toBeLessThan(1e-6);
    const light = vanishingPoint(linesThrough(P, thetas, 1e-6), 2)!;
    expect(Math.hypot(light.point.x - P.x, light.point.y - P.y)).toBeLessThan(1e-3);
    expect(light.support.length).toBeGreaterThanOrEqual(2);
  });
});

describe("estimateRoll", () => {
  it("is the vote-weighted median slope of the nearly level lines", () => {
    const level = (slope: number, votes: number): HoughLine => {
      const theta = Math.PI / 2 + Math.atan(slope);
      return { theta, rho: 0, votes, line: [Math.cos(theta), Math.sin(theta), 0] };
    };
    expect(estimateRoll([level(0.01, 1), level(0.03, 10), level(0.05, 1)])).toBeCloseTo(0.03, 6);
    // The weight, not the count, decides.
    expect(estimateRoll([level(0.01, 5), level(0.02, 5), level(0.07, 100)])).toBeCloseTo(0.07, 6);
  });

  it("is zero with no level lines, however many steep ones", () => {
    expect(estimateRoll([])).toBe(0);
    expect(estimateRoll(linesThrough({ x: 5, y: 5 }, [0.1, 0.5, 2.8]))).toBe(0);
  });
});

describe("prepare", () => {
  it("halves the picture and smooths it, or only smooths it at factor 1", () => {
    const f = makeFrame(40, 20, 0, 90);
    expect(prepare(f)).toMatchObject({ width: 20, height: 10 });
    expect(prepare(f, 1)).toMatchObject({ width: 40, height: 20 });
    expect(prepare(f).data[55]).toBeCloseTo(90, 3);
  });
});

describe("the fan and its columns", () => {
  it("makes every line through the vanishing point a column", () => {
    // Vertical stripes that converge on (50, -10): the fan stands them upright.
    const vp = { x: 50, y: -10 };
    const f = makeFrame(100, 80);
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 100; x++) {
        const col = vp.x + ((x - vp.x) * (79 - vp.y)) / (y - vp.y);
        f.data[y * 100 + x] = Math.floor(col / 10) % 2 ? 200 : 50;
      }
    }
    const fan = buildFan(f, vp);
    expect(fan).toMatchObject({ cols: 300, x0: -100, y0: 0, rows: 80, yRef: 79 });
    const j = 40;
    const at = (i: number) => fan.F[j * fan.cols + i];
    // Column (picture x at the bottom row) 55 is inside stripe 5 (200) wherever the row.
    for (const jj of [40, 60, 75]) expect(fan.F[jj * fan.cols + (55 - fan.x0)]).toBeCloseTo(200, 3);
    for (const jj of [40, 60, 75]) expect(fan.F[jj * fan.cols + (45 - fan.x0)]).toBeCloseTo(50, 3);
    // Outside the picture reads NaN, and the gradient is NaN at the fan's ends.
    expect(at(0)).toBeNaN();
    expect(fan.G[j * fan.cols]).toBeNaN();
    expect(Number.isFinite(fan.G[j * fan.cols + (50 - fan.x0)])).toBe(true);
  });

  it("is empty when the vanishing point is at or below the bottom of the picture", () => {
    const fan = buildFan(makeFrame(60, 40, 0, 100), { x: 30, y: 45 });
    expect(fan.rows).toBe(0);
    expect(rowEnergy(fan)).toHaveLength(0);
  });

  it("names a column by its picture line, level or rolled", () => {
    const fan = buildFan(makeFrame(100, 80, 0, 100), { x: 50, y: -10 }, 0.04);
    for (const x of [10, 55, 90]) {
      const l = columnLine(fan, x);
      expect(lineDistance(l, fan.vp)).toBeCloseTo(0, 6);
      expect(lineDistance(l, { x, y: fan.yRef + 0.04 * (x - 50) })).toBeCloseTo(0, 6);
    }
  });

  it("rowEnergy is the mean absolute gradient of each row and ignores NaN", () => {
    const fan = energyFan([1, 3, 0]);
    fan.G.fill(NaN, 8, 12);
    fan.G[4] = -5;
    const E = rowEnergy(fan);
    expect(Array.from(E).map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 3.5, 0]);
  });
});

describe("laneRows", () => {
  const far = 5;

  it("puts the far end at the busiest rows and the near end at the sharpest fall of structure", () => {
    const E = Array.from({ length: 100 }, (_, j) => (j === far ? 10 : j < 70 ? 4 : 0.1));
    const r = laneRows(energyFan(E));
    expect(r.far).toBe(10 + far);
    expect(Math.abs(r.near - (10 + 70))).toBeLessThanOrEqual(4);
  });

  it("falls back to the lowest row still at half the typical structure when nothing falls sharply", () => {
    // 5 across the lane, then a slow ramp down to a plain 1.5: no step sharp enough.
    const E = Array.from({ length: 100 }, (_, j) => (j === far ? 10 : j < 50 ? 5 : Math.max(1.5, 5 - 0.0875 * (j - 50))));
    const r = laneRows(energyFan(E));
    expect(r.far).toBe(10 + far);
    expect(r.near - 10).toBeGreaterThan(70);
    expect(r.near - 10).toBeLessThan(85);
  });
});

describe("columnProfile", () => {
  it("takes the median down each column between the rows asked for", () => {
    const cols = 6;
    const fan = energyFan([1, 1, 1, 1, 9, 1, 1, 1, 1, 1]);
    for (let j = 0; j < 10; j++) for (let i = 0; i < cols - 2; i++) fan.F[j * 4 + i] = 100 + i;
    const p = columnProfile(fan, 10, 19);
    expect(p.grad[0]).toBe(1);
    expect(p.level[1]).toBe(101);
    expect(p.grad).toHaveLength(4);
  });

  it("is NaN where fewer than 0.6 of the rows are inside the picture, and when fewer than 3 rows are asked for", () => {
    const fan = energyFan(Array(10).fill(2));
    for (let j = 0; j < 7; j++) fan.G[j * 4 + 1] = NaN;
    const p = columnProfile(fan, 10, 19);
    expect(p.grad[1]).toBeNaN();
    expect(p.level[1]).toBeNaN();
    expect(p.grad[0]).toBe(2);
    const few = columnProfile(fan, 12, 13);
    expect(Array.from(few.grad).every(Number.isNaN)).toBe(true);
  });
});

describe("laneCandidates", () => {
  /** Quiet columns, a rising lobe at 100 and a falling one at 200. */
  const lane = (l = 20, r = -20) => lobes(300, [[100, l], [200, r]]);

  it("finds the quiet stretch between a rising and a falling edge, in picture columns", () => {
    const c = laneCandidates({ grad: lane(), level: new Float32Array(300) }, -50, 50);
    expect(c).toHaveLength(1);
    expect(c[0].left).toBeCloseTo(50, 3);
    expect(c[0].right).toBeCloseTo(150, 3);
    expect(c[0].leftEdge).toBe(20);
    expect(c[0].rightEdge).toBe(-20);
  });

  it("takes the first edge out from the lane, then its sub-column peak", () => {
    const g = lobes(300, [[100, 20], [200, -20]]);
    g[100] = 20;
    g[99] = 12;
    g[101] = 4;
    const c = laneCandidates({ grad: g, level: g }, 0, 50)[0];
    expect(c.left).toBeGreaterThan(99.3);
    expect(c.left).toBeLessThan(100);
  });

  it("wants the lane wider than minWidth, the edges the right way round and finite, and a profile with something in it", () => {
    const p = (g: Float32Array) => ({ grad: g, level: g });
    expect(laneCandidates(p(lane()), 0, 200)).toEqual([]);
    // Falling on the left and rising on the right is a dark stripe, not a lane.
    expect(laneCandidates(p(lane(-20, 20)), 0, 50)).toEqual([]);
    expect(laneCandidates(p(new Float32Array(300).fill(NaN)), 0, 10)).toEqual([]);
    // A hole in the data where the edge should be: no edge found.
    const hole = lane();
    hole[101] = NaN;
    expect(laneCandidates(p(hole), 0, 50)).toEqual([]);
  });
});

describe("laneWidth, lanePairs and rankLanes on built profiles", () => {
  const cand = (left: number, right: number) => ({ left, right, leftEdge: 10, rightEdge: -10 });

  it("laneWidth is the commonest width, weighted by width, so a narrow cap does not win", () => {
    const frames = [
      fakeLanes(new Float32Array(0), { candidates: [cand(0, 100), cand(0, 33), cand(0, 33)] }),
      fakeLanes(new Float32Array(0), { candidates: [cand(0, 102), cand(0, 33), cand(0, 34)] }),
      fakeLanes(new Float32Array(0), { candidates: [cand(0, 98)] })
    ];
    expect(laneWidth(frames)).toBeCloseTo(100, 6);
    expect(laneWidth([])).toBeNull();
    expect(laneWidth([fakeLanes(new Float32Array(0))])).toBeNull();
  });

  it("lanePairs wants a rising edge and a falling one a lane width on, within 6%", () => {
    const g = lobes(1000, [[380, 10], [580, -10], [640, 10], [840, -9], [900, 0.5]]);
    const pairs = lanePairs(fakeLanes(g), 200);
    expect(pairs.map((p) => [Math.round(p.left), Math.round(p.right)])).toEqual([[380, 580], [640, 840]]);
    // 7% too wide (width 214 against 200): out. A weak ripple (0.5) is no edge.
    expect(lanePairs(fakeLanes(g), 214)).toEqual([]);
    expect(lanePairs(fakeLanes(g), 190)).toHaveLength(2);
    // A lone lobe, or one whose neighbour has the other sign, is no peak.
    const spiky = new Float32Array(1000);
    spiky[380] = 10;
    expect(lanePairs(fakeLanes(spiky), 200)).toEqual([]);
  });

  it("rankLanes takes the pair nearest the picture's center, and none off-center", () => {
    const g = lobes(1000, [[380, 10], [580, -10], [640, 10], [840, -10]]);
    const both = fakeLanes(g, { candidates: [cand(380, 580), cand(640, 840)] });
    const [pick] = rankLanes([both], 960);
    expect(pick.index).toBe(0);
    expect(pick.candidate.left).toBeCloseTo(380, 3);
    expect(pick.candidate.right).toBeCloseTo(580, 3);
    expect(pick.width).toBe(200);
    expect(pick.left).toEqual(columnLine(both.fan, pick.candidate.left));
    // A frame whose only pair is a lane and a half off-center is not ranked.
    const off = fakeLanes(lobes(1000, [[640, 10], [840, -10]]), { candidates: [cand(380, 580)] });
    expect(rankLanes([off], 960)).toEqual([]);
  });

  it("rankLanes orders frames by their weaker edge, skips null frames and needs a width", () => {
    const strong = fakeLanes(lobes(1000, [[380, 20], [580, -20]]), { candidates: [cand(380, 580)] });
    const weak = fakeLanes(lobes(1000, [[382, 6], [582, -9]]), { candidates: [cand(382, 582)] });
    const ranked = rankLanes([weak, null, strong], 960);
    expect(ranked.map((p) => p.index)).toEqual([2, 0]);
    expect(rankLanes([null, null], 960)).toEqual([]);
    expect(rankLanes([fakeLanes(new Float32Array(1000))], 960)).toEqual([]);
  });

  it("rankLanes scores a pair nearer the middle above an equal one further out", () => {
    const g = lobes(1000, [[380, 10], [580, -10], [400, 10], [600, -10]]);
    const f = fakeLanes(g, { candidates: [cand(380, 580)] });
    // Both pairs are within the limit; the one centerd on 480 (380 to 580) wins over 400 to 600.
    const [pick] = rankLanes([f], 960);
    expect(pick.candidate.left).toBeCloseTo(380, 3);
  });
});

describe("steadyProfiles", () => {
  /** A profile with an edge at column `edge` and, if asked, a spike; the camera's vanishing point at `vpx`. */
  const frame = (spike: number | null, vpx = 480, edge = 100): FrameLanes => {
    const g = new Float32Array(300).fill(0.1);
    g[edge] = 12;
    if (spike !== null) g[spike] = 60;
    return fakeLanes(g, { vp: { x: vpx, y: 0 } });
  };

  it("outvotes a one-frame spike and keeps the edge every frame shows", () => {
    const per = [frame(null), frame(200), frame(null)];
    steadyProfiles(per);
    for (const r of per) {
      expect(r.profile.grad[200]).toBeLessThan(1);
      expect(r.profile.grad[100]).toBeCloseTo(12, 3);
    }
  });

  it("carries each column to the same ray when the camera turns (the vanishing point moves)", () => {
    // The same ray is column 100 when the vanishing point is at 480, 110 when it is at 490 and 90 at 470.
    const per = [frame(null, 480, 100), frame(null, 490, 110), frame(null, 470, 90)];
    steadyProfiles(per);
    expect(per[0].profile.grad[100]).toBeCloseTo(12, 3);
    expect(per[1].profile.grad[110]).toBeCloseTo(12, 3);
    expect(per[2].profile.grad[90]).toBeCloseTo(12, 3);
    // Had the columns been compared as they are, the edge would be outvoted by the quiet frames.
    expect(per[0].profile.grad[110]).toBeLessThan(1);
  });

  it("skips frames with no lanes, and leaves a column unknown with fewer than two votes", () => {
    const per: (FrameLanes | null)[] = [null, frame(null), null];
    steadyProfiles(per);
    expect(Array.from(per[1]!.profile.grad).every(Number.isNaN)).toBe(true);
    // The reach limits who votes: with a reach of 0 a frame is its own only voter.
    const lone = [frame(200)];
    steadyProfiles(lone, 0);
    expect(Array.from(lone[0].profile.grad).every(Number.isNaN)).toBe(true);
    // A column that falls outside the neighbour's profile (a turn of the camera) is not counted.
    const edge = [frame(null, 480), frame(null, 800)];
    steadyProfiles(edge);
    expect(edge[0].profile.grad.some(Number.isNaN)).toBe(true);
  });
});

describe("rayThrough", () => {
  it("is the line through the vanishing point nearest the points", () => {
    const vp = { x: 10, y: 10 };
    const l = rayThrough(vp, [{ x: 110, y: 60.2 }, { x: 210, y: 109.8 }, { x: 310, y: 160 }])!;
    expect(Math.abs(lineDistance(l, vp))).toBeCloseTo(0, 9);
    expect(Math.abs(lineDistance(l, { x: 310, y: 160 }))).toBeLessThan(0.3);
    expect(Math.hypot(l[0], l[1])).toBeCloseTo(1, 9);
    expect(rayThrough(vp, [])).toBeNull();
  });
});

describe("snapLaneEdge", () => {
  /** Dark left of x = 59.5 + 0.1 y, lane colour right of it, as a 200 x 100 picture. */
  const edgeFrame = (slope = 0.1) => {
    const f = makeFrame(200, 100);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 200; x++) f.data[y * 200 + x] = x > 59.5 + slope * y ? 200 : 90;
    return f;
  };
  const vp = { x: 10, y: -500 };
  const rough: Line3 = [1, -0.1, -60];

  it("snaps to the edge and returns the ray through the vanishing point", () => {
    const s = snapLaneEdge(edgeFrame(), rough, vp, { x: 150, y: 50 }, 5, 95)!;
    expect(s).not.toBeNull();
    expect(Math.abs(lineDistance(s.line, vp))).toBeLessThan(1e-6);
    for (const y of [10, 50, 90]) {
      const x = -(s.line[1] * y + s.line[2]) / s.line[0];
      expect(Math.abs(x - (59.5 + 0.1 * y))).toBeLessThan(0.5);
    }
    expect(s.support).toBeGreaterThan(0.8);
    expect(s.rms).toBeLessThan(0.3);
    expect(s.points.length).toBeGreaterThan(10);
    expect(Math.abs(lineDistance(s.free, { x: 64.5, y: 50 }))).toBeLessThan(0.5);
  });

  it("takes its band, share, minimum and reach from the options", () => {
    const s = snapLaneEdge(edgeFrame(), rough, vp, { x: 150, y: 50 }, 5, 95, { band: 8, share: 0.5, min: 20, toLine: 2 })!;
    expect(s.points.length).toBeGreaterThan(10);
    // A reach of two pixels steps out from the edge's gradient to where it turns back: outward (leftward) of it.
    const plain = snapLaneEdge(edgeFrame(), rough, vp, { x: 150, y: 50 }, 5, 95)!;
    const at = (l: Line3) => -(l[1] * 50 + l[2]) / l[0];
    expect(at(s.line)).toBeLessThan(at(plain.line) - 0.5);
    expect(at(s.line)).toBeGreaterThan(64.5 - 2.2);
  });

  it("is null where there is no edge", () => {
    expect(snapLaneEdge(makeFrame(200, 100, 0, 120), rough, vp, { x: 150, y: 50 }, 5, 95)).toBeNull();
  });
});

describe("pins on a built picture", () => {
  /**
   * Pins 5 px wide standing on a glossy deck: bright body above a darker seam
   * (the base) and a bright reflection below it, over a dark house. Pin i
   * stands at x = 20 + 8 i with its base at row `base(i)`.
   */
  const pinFrame = (n: number, base: (i: number) => number) => {
    const f = makeFrame(120, 110, 0, 60);
    for (let i = 0; i < n; i++) {
      const x = 20 + 8 * i;
      const b = base(i);
      for (let dx = -2; dx <= 2; dx++) {
        for (let y = b - 20; y < b; y++) f.data[y * 120 + x + dx] = 230;
        f.data[b * 120 + x + dx] = 120;
        for (let y = b + 1; y <= b + 14; y++) f.data[y * 120 + x + dx] = 200;
      }
    }
    return f;
  };

  it("pinBases finds the seam under each pin, to a fraction of a row", () => {
    const bases = pinBases(pinFrame(6, () => 60), 60, 10);
    expect(bases).toHaveLength(6);
    for (const [i, b] of bases.entries()) {
      expect(b.x).toBe(20 + 8 * i);
      expect(Math.abs(b.y - 60)).toBeLessThan(0.3);
    }
  });

  it("pinBases finds nothing in a plain picture, with no reflection, or when the window falls off the bottom", () => {
    expect(pinBases(makeFrame(120, 110, 0, 60), 60, 10)).toEqual([]);
    expect(pinBases(pinFrame(6, () => 60), 108, 10)).toEqual([]);
    // Without the mirror image the seam is not a seam.
    const f = pinFrame(6, () => 60);
    for (let y = 61; y < 75; y++) f.data.fill(60, y * 120, (y + 1) * 120);
    expect(pinBases(f, 60, 10)).toEqual([]);
    // A pin as wide as its gaps (no brighter than the pixels beside it) is no pin.
    const wide = makeFrame(120, 110, 0, 230);
    expect(pinBases(wide, 60, 10)).toEqual([]);
  });

  it("pinRows is the level line through the bases, and findPinRow its best", () => {
    const f = pinFrame(6, () => 60);
    const rows = pinRows(f, 60, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].bases).toHaveLength(6);
    expect(rows[0].support).toBe(1);
    expect(Math.abs(lineDistance(rows[0].line, { x: 50, y: 60 }))).toBeLessThan(0.5);
    expect(findPinRow(f, 60, 10)!.line).toEqual(rows[0].line);
    expect(findPinRow(makeFrame(120, 110, 0, 60), 60, 10)).toBeNull();
  });

  it("pinRows lifts the line to the back row when the front pins' bases sit lower", () => {
    // Pins 1 and 4 and 5 stand a row or two nearer the camera (lower in the picture).
    const rows = pinRows(pinFrame(7, (i) => (i % 3 === 0 ? 62 : 60)), 60, 10);
    expect(rows).toHaveLength(1);
    expect(Math.abs(lineDistance(rows[0].line, { x: 50, y: 60 }))).toBeLessThan(1);
    expect(Math.abs(lineDistance(rows[0].line, { x: 50, y: 62 }))).toBeGreaterThan(1);
  });

  it("pinRows does not take a steep line of bases (a pin's own column) for the row across the house", () => {
    const steep = pinRows(pinFrame(7, (i) => 56 + 4 * i), 60, 10);
    expect(steep).toEqual([]);
  });

  it("pinRows needs four bases on a line", () => {
    expect(pinRows(pinFrame(3, () => 60), 60, 10)).toEqual([]);
  });
});

describe("findFoulLines on a built picture", () => {
  const left: Line3 = [1, 0, -20];
  const right: Line3 = [1, 0, -180];
  /** Lane colour above row `a`, a `mid` band down to row `b`, then the approach. */
  const approach = (a: number, mid: number, b: number, approachGrey: number, hideRight = false) => {
    const f = makeFrame(200, 200, 0, 200);
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        if (hideRight && x > 100) continue;
        if (y >= b) f.data[y * 200 + x] = approachGrey;
        else if (y >= a) f.data[y * 200 + x] = mid;
      }
    }
    return f;
  };
  const rowOf = (l: Line3, x: number) => -(l[0] * x + l[2]) / l[1];

  it("finds the row where the lane ends from both sides, level", () => {
    const f = approach(150, 200, 150, 100);
    const fl = findFoulLines(f, left, right, 150, 100, 0);
    expect(fl[0].points).toHaveLength(2);
    expect(Math.abs(rowOf(fl[0].line, 100) - 149.5)).toBeLessThan(1);
    expect(fl[0].strength).toBeGreaterThan(20);
    expect(findFoulLine(f, left, right, 150, 100, 0)).toEqual(fl[0]);
  });

  it("prefers, among pairs nearly as strong as the strongest, the one furthest up the lane", () => {
    // A step of 50 at row 140 and a stronger one of 70 at row 150 (71% of it): the upper wins.
    const f = approach(140, 150, 150, 80);
    const fl = findFoulLines(f, left, right, 150, 100, 0);
    expect(Math.abs(rowOf(fl[0].line, 100) - 139.5)).toBeLessThan(1);
    expect(fl.some((l) => l.points.length === 2 && Math.abs(rowOf(l.line, 100) - 149.5) < 1)).toBe(true);
    expect(fl[0].points).toHaveLength(2);
    // Then each side alone, strongest first, at half strength.
    const singles = fl.filter((l) => l.points.length === 1);
    expect(singles.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < singles.length; i++) expect(singles[i].strength).toBeLessThanOrEqual(singles[i - 1].strength);
    expect(singles[0].strength).toBeLessThan(fl[0].strength + 1);
  });

  it("keeps the stronger pair first when the upper one is much weaker", () => {
    const f = approach(140, 190, 150, 80);
    const fl = findFoulLines(f, left, right, 150, 100, 0);
    expect(Math.abs(rowOf(fl[0].line, 100) - 149.5)).toBeLessThan(1);
  });

  it("gives that side's rows alone when the other is hidden", () => {
    const f = approach(150, 200, 150, 100, true);
    const fl = findFoulLines(f, left, right, 150, 100, 0);
    expect(fl.length).toBeGreaterThan(0);
    expect(fl.every((l) => l.points.length === 1)).toBe(true);
    expect(Math.abs(fl[0].points[0].y - 149.5)).toBeLessThan(1);
    expect(Math.abs(fl[0].line[0])).toBeLessThan(0.02);
  });

  it("drops pairs whose line is not at the slope asked for", () => {
    const fl = findFoulLines(approach(150, 200, 150, 100), left, right, 150, 100, 0.08);
    expect(fl.every((l) => l.points.length === 1)).toBe(true);
  });

  it("has nothing to read in a span too short to look in", () => {
    // The source returns null here although it is typed as a list: either is "none".
    expect(findFoulLines(approach(150, 200, 150, 100), left, right, 150, 10, 0)).toHaveLength(0);
    expect(findFoulLines(makeFrame(200, 200, 0, 120), left, right, 150, 100, 0)).toEqual([]);
  });

  it("reads strips that run partly outside the picture", () => {
    // The lane's edges lean out of the picture below row 190: only part of each strip has data.
    const f = approach(150, 200, 150, 100);
    const fl = findFoulLines(f, [1, 0, 10], [1, 0, -190], 195, 100, 0);
    expect(Array.isArray(fl)).toBe(true);
  });
});

describe("modeOf", () => {
  it("is where most values lie, whatever the outliers", () => {
    expect(modeOf([10, 10.1, 9.9, 30, 50], 0.6)).toBeCloseTo(10, 1);
    expect(modeOf([25], 0.6)).toBe(25);
    // Two clusters: the larger wins.
    expect(modeOf([12, 12.2, 31, 31.1, 30.9, 31.2], 0.6)).toBeCloseTo(31.05, 1);
  });
});

/** A rendered house and everything the finder says about it, shared by the tests below. */
interface House {
  spec: SyntheticShot;
  frames: GrayFrame[];
  H: Mat3;
  /** Lane point (u boards, v feet) of a picture point, by the truth. */
  lane: (p: Point) => Point;
}

function house(spec: SyntheticShot): House {
  const frames = [0, 5, 10].map((i) => renderFrame(spec, i));
  const H = truthAt(spec, 0).H;
  const Hi = invert(H);
  return { spec, frames, H, lane: (p) => apply(Hi, p) };
}

/** The marks' picture lines, by the truth: a line through two lane points. */
const vpOf = (H: Mat3): Point => ({ x: H[1] / H[7], y: H[4] / H[7] });
const onLineAtY = (l: Line3, y: number): Point => ({ x: -(l[1] * y + l[2]) / l[0], y });
const onLineAtX = (l: Line3, x: number): Point => ({ x, y: -(l[0] * x + l[2]) / l[1] });

/** The boards and feet that `found.H` puts at the lane's corners, in the truth's lane. */
function cornerError(h: House, H: Mat3): { boards: number; feet: number } {
  let boards = 0;
  let feet = 0;
  for (const u of [0.5, 39.5]) {
    for (const v of [0, 30, 60]) {
      const p = h.lane(apply(H, { x: u, y: v }));
      boards = Math.max(boards, Math.abs(p.x - u));
      feet = Math.max(feet, Math.abs(p.y - v));
    }
  }
  return { boards, feet };
}

const mainSpec: SyntheticShot = {
  camera: behindCamera({ width: 960, height: 720, fill: 0.12, back: 25, side: 0.5, heightFt: 5, roll: -0.03 }),
  fps: 30, duration: 0.5, hand: "right", path: { u0: 24, a: 0.2, s: 36, L: 16, k: -0.025 },
  releaseT: 10, releaseV: -0.3, speedMph: 17, decel: -1.2, touchdownV: 1.2, loft: 0.15, noise: 2, seed: 3, pinMirror: true
};

describe("the stages on a rendered house", () => {
  let h: House;
  let per: (FrameLanes | null)[];
  beforeAll(() => {
    h = house(mainSpec);
    per = h.frames.map((f) => lanesOnFrame(f));
  }, SLOW);

  it("houghLines and vanishingPoint find the point the lane's lines meet in", () => {
    const small = prepare(h.frames[0]);
    const all = houghLines(small, { fromY: small.height * 0.25, max: 60 });
    expect(all.length).toBeGreaterThan(20);
    const lines = all.filter((l) => Math.abs(l.theta - Math.PI / 2) > (20 * Math.PI) / 180);
    const found = vanishingPoint(lines, 3, (p) => p.y < small.height * 0.7 && p.y > -small.height)!;
    expect(found.support.length).toBeGreaterThanOrEqual(4);
    const truth = vpOf(h.H);
    // The halved picture's pixel centers: a pixel i of it covers full pixels 2i and 2i+1.
    expect(Math.abs(found.point.x * 2 + 0.5 - truth.x)).toBeLessThan(8);
    expect(Math.abs(found.point.y * 2 + 0.5 - truth.y)).toBeLessThan(8);
  });

  it("estimateRoll reads the slope of the horizon", () => {
    const small = prepare(h.frames[0]);
    const all = houghLines(small, { fromY: small.height * 0.25, max: 60 });
    const hz = horizon(h.H);
    expect(Math.abs(estimateRoll(all) - -hz[0] / hz[1])).toBeLessThan(0.01);
  });

  it("lanesOnFrame finds the vanishing point, the lane's ends and its edges", () => {
    const r = per[0]!;
    const truth = vpOf(h.H);
    expect(Math.hypot(r.vp.x - truth.x, r.vp.y - truth.y)).toBeLessThan(6);
    // The pin row stands near row 281 and the foul line near row 680; the far end is the racks' structure.
    expect(r.far).toBeGreaterThan(200);
    expect(r.far).toBeLessThan(290);
    expect(r.near).toBeGreaterThan(655);
    expect(r.near).toBeLessThan(715);
    expect(r.candidates.length).toBeGreaterThanOrEqual(1);
    const c = r.candidates[0];
    expect(c.leftEdge).toBeGreaterThan(0);
    expect(c.rightEdge).toBeLessThan(0);
    for (const [col, u] of [[c.left, 0.5], [c.right, 39.5]] as const) {
      const p = h.lane(onLineAtY(columnLine(r.fan, col), 600));
      expect(Math.abs(p.x - u)).toBeLessThan(0.6);
    }
  });

  it("laneWidth and rankLanes agree on one lane width and put the bowler's lane first", () => {
    const ok = per.filter((r): r is FrameLanes => !!r);
    const w = laneWidth(ok)!;
    expect(w).toBeGreaterThan(380);
    expect(w).toBeLessThan(440);
    const ranked = rankLanes(per, h.frames[0].width);
    expect(ranked.length).toBe(3);
    for (const k of ranked) {
      expect(k.width).toBe(w);
      const p = h.lane(onLineAtY(k.left, 600));
      expect(Math.abs(p.x - 0.5)).toBeLessThan(0.6);
      expect(Math.abs(h.lane(onLineAtY(k.right, 600)).x - 39.5)).toBeLessThan(0.6);
    }
    for (let i = 1; i < ranked.length; i++) {
      const s = (k: (typeof ranked)[number]) => Math.min(k.candidate.leftEdge, -k.candidate.rightEdge);
      expect(s(ranked[i - 1])).toBeGreaterThanOrEqual(s(ranked[i]) * 0.7);
    }
    // Frames that say nothing do not spoil it, and keep their index.
    const withHole = rankLanes([null, per[0], null], h.frames[0].width);
    expect(withHole).toHaveLength(1);
    expect(withHole[0].index).toBe(1);
  });

  it("steadyProfiles leaves the lane's edges standing when every frame shows them", () => {
    const copy = per.map((r) => (r ? { ...r, profile: { grad: Float32Array.from(r.profile.grad), level: r.profile.level } } : null));
    steadyProfiles(copy);
    const before = laneCandidates(per[1]!.profile, per[1]!.fan.x0, 0.08 * 960);
    const after = laneCandidates(copy[1]!.profile, copy[1]!.fan.x0, 0.08 * 960);
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(after[0].left - before[0].left)).toBeLessThan(3);
    expect(Math.abs(after[0].right - before[0].right)).toBeLessThan(3);
  });

  it("refineVanishingPoint keeps the point where the many lines of the house agree", () => {
    const r = per[0]!;
    const truth = vpOf(h.H);
    const refined = refineVanishingPoint(h.frames[0], r);
    expect(Math.hypot(refined.vp.x - truth.x, refined.vp.y - truth.y)).toBeLessThan(6);
    // Too few lines snap on a flat picture: the Hough point stands.
    const flat = refineVanishingPoint(makeFrame(960, 720, 0, 128), r);
    expect(flat.lines).toBe(0);
    expect(flat.vp).toBe(r.vp);
  });

  it("pinBases, pinRows and findPinRow find the back row's bases on the standing pins", () => {
    const r = per[0]!;
    const pick = rankLanes(per, 960)[0];
    const wFar = onLineAtY(pick.right, pick.far).x - onLineAtY(pick.left, pick.far).x;
    const pinPx = (wFar * 15) / 41.5;
    const bases = pinBases(h.frames[0], r.far, pinPx);
    expect(bases.length).toBeGreaterThanOrEqual(4);
    // The back pin row, v = 62.6 ft, lies between rows 270 and 290 at this camera.
    const truthRow = (u: number) => apply(h.H, { x: u, y: 62.6 }).y;
    for (const b of bases) expect(Math.abs(b.y - truthRow(h.lane(b).x))).toBeLessThan(6);
    const rows = pinRows(h.frames[0], r.far, pinPx);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].bases.length).toBeGreaterThanOrEqual(4);
    const best = findPinRow(h.frames[0], r.far, pinPx)!;
    expect(best.line).toEqual(rows[0].line);
    const mid = apply(h.H, { x: 20, y: 62.6 });
    expect(Math.abs(lineDistance(best.line, mid))).toBeLessThan(3);
    // A blank picture has no pins.
    expect(findPinRow(makeFrame(960, 720, 0, 120), r.far, pinPx)).toBeNull();
  });

  it("findFoulLines puts the foul line's row at the lane's start", () => {
    const k = rankLanes(per, 960)[0];
    const r = per[k.index]!;
    const fl = findFoulLines(h.frames[k.index], k.left, k.right, r.near, r.near - r.far, -0);
    expect(fl.length).toBeGreaterThan(0);
    const mid = apply(h.H, { x: 20, y: 0 });
    const hz = horizon(h.H);
    const slope = -hz[0] / hz[1];
    const level = findFoulLines(h.frames[k.index], k.left, k.right, r.near, r.near - r.far, slope);
    expect(level.some((l) => l.points.length === 2 && Math.abs(lineDistance(l.line, mid)) < 8)).toBe(true);
    expect(findFoulLine(h.frames[k.index], k.left, k.right, r.near, r.near - r.far, slope)).toEqual(level[0]);
  });
});

describe("findLane on a rendered house", () => {
  let h: House;
  let found: LaneFound;
  let attempts: ReturnType<typeof laneAttempts>;
  beforeAll(() => {
    h = house(mainSpec);
    attempts = laneAttempts(h.frames);
    found = findLane(h.frames)!;
  }, SLOW);

  it("finds both edges within 0.3 board, the foul line within 0.1 ft and the pin row within 1 ft", () => {
    expect(found).not.toBeNull();
    for (const y of [330, 450, 600, 670]) {
      expect(Math.abs(h.lane(onLineAtY(found.left, y)).x - 0.5)).toBeLessThan(0.3);
      expect(Math.abs(h.lane(onLineAtY(found.right, y)).x - 39.5)).toBeLessThan(0.3);
    }
    for (const x of [300, 450, 580]) expect(Math.abs(h.lane(onLineAtX(found.foul!, x)).y)).toBeLessThan(0.1);
    for (const x of [440, 490, 540]) expect(Math.abs(h.lane(onLineAtX(found.pinRow!, x)).y - 62.6)).toBeLessThan(1);
  });

  it("returns the fit of its marks as the lane's mapping, true to the corners", () => {
    const err = cornerError(h, found.H);
    expect(err.boards).toBeLessThan(0.3);
    expect(err.feet).toBeLessThan(1);
    const truth = vpOf(h.H);
    expect(Math.hypot(found.vp.x - truth.x, found.vp.y - truth.y)).toBeLessThan(6);
  });

  it("puts the camera where it is, 25 ft behind the foul line", () => {
    expect(Math.abs(found.camera - 25)).toBeLessThan(1);
    expect(found.camera).toBeGreaterThanOrEqual(CAMERA_FT[0]);
    expect(found.camera).toBeLessThanOrEqual(CAMERA_FT[1]);
    expect(Math.abs(attempts.camera - 25)).toBeLessThan(1);
  });

  it("reports what it measured: the frame, the share of steps that agreed, the pins and the lines before the fit", () => {
    expect(found.index).toBeGreaterThanOrEqual(0);
    expect(found.index).toBeLessThan(3);
    expect(found.support.left).toBeGreaterThan(0.5);
    expect(found.support.right).toBeGreaterThan(0.5);
    expect(found.marks.map((m) => m.label)).toEqual(["left", "right", "foul", "pinrow"]);
    expect(found.coarse.left).toHaveLength(3);
    expect(found.measured.pinRow).toHaveLength(3);
    expect(found.pinsUsed).toBeGreaterThanOrEqual(2);
    expect(found.pins.length).toBeGreaterThanOrEqual(2);
    for (const p of found.pins) expect(Math.abs(p.error)).toBeLessThan(1.5);
    // The fitted lines are the lines of the lane's own mapping.
    expect(Math.abs(lineDistance(found.left, apply(found.H, { x: 0.5, y: 30 })))).toBeLessThan(1e-6);
    expect(Math.abs(lineDistance(found.foul!, apply(found.H, { x: 20, y: 0 })))).toBeLessThan(1e-6);
  });

  it("laneAttempts calibrates the frames it can, each with a quality", () => {
    expect(attempts.attempts.length).toBeGreaterThanOrEqual(1);
    for (const a of attempts.attempts) {
      expect(a.quality).toBeGreaterThan(0.5);
      expect(Math.abs(a.found.camera - attempts.camera)).toBeLessThan(2);
    }
    // The one findLane keeps is one of them.
    expect(attempts.attempts.some((a) => a.found.index === found.index)).toBe(true);
    // `tries` limits the frames looked at.
    expect(laneAttempts(h.frames, 1).attempts.length).toBeLessThanOrEqual(1);
  });

  it("markLinesOf gives each drawn line's two end points, on the lane's lines", () => {
    const m = markLinesOf(found);
    expect(Object.keys(m).sort()).toEqual(["foul", "left", "pinrow", "right"]);
    for (const [name, u] of [["left", 0.5], ["right", 39.5]] as const) {
      for (const p of m[name]) expect(Math.abs(h.lane(p).x - u)).toBeLessThan(0.3);
      expect(m[name][1].y).toBeGreaterThan(m[name][0].y);
    }
    for (const p of m.foul) expect(Math.abs(h.lane(p).y)).toBeLessThan(0.1);
    for (const p of m.pinrow) expect(Math.abs(h.lane(p).y - 62.6)).toBeLessThan(1);
    // Copies, not the marks' own points.
    expect(m.left[0]).not.toBe((found.marks[0] as { at: Point[] }).at[0]);
  });

  it("markLinesOf says which mark is missing", () => {
    expect(() => markLinesOf({ ...found, marks: found.marks.filter((k) => k.label !== "foul") })).toThrow("no foul mark");
    const asPoint = found.marks.map((k) => (k.label === "left" ? ({ kind: "point", label: "left", u: 0.5, v: 0, at: { x: 0, y: 0 } } as const) : k));
    expect(() => markLinesOf({ ...found, marks: asPoint })).toThrow("no left mark");
  });
});

describe("findLane on another camera", () => {
  it("finds the lane from further back and to the other side, rolled the other way", () => {
    const spec: SyntheticShot = { ...mainSpec, camera: behindCamera({ width: 960, height: 720, fill: 0.11, back: 28, roll: 0.02 }) };
    const h = house(spec);
    const found = findLane(h.frames)!;
    expect(found).not.toBeNull();
    expect(cornerError(h, found.H).boards).toBeLessThan(0.3);
    expect(cornerError(h, found.H).feet).toBeLessThan(1);
    for (const x of [300, 480, 600]) expect(Math.abs(h.lane(onLineAtX(found.foul!, x)).y)).toBeLessThan(0.15);
    expect(Math.abs(found.camera - 28)).toBeLessThan(1);
    // The house's many lines fix the vanishing point better than the Hough lines do.
    const r = lanesOnFrame(h.frames[0])!;
    const refined = refineVanishingPoint(h.frames[0], r);
    expect(refined.lines).toBeGreaterThanOrEqual(4);
    const truth = vpOf(h.H);
    expect(Math.hypot(refined.vp.x - truth.x, refined.vp.y - truth.y)).toBeLessThan(2);
  }, SLOW);
});

describe("when there is no lane to find", () => {
  it("lanesOnFrame, laneAttempts and findLane give nothing on blank pictures", () => {
    const blank = [0, 1, 2].map((t) => makeFrame(320, 240, t, 120));
    expect(lanesOnFrame(blank[0])).toBeNull();
    const a = laneAttempts(blank);
    expect(a.attempts).toEqual([]);
    expect(a.camera).toBeNaN();
    expect(findLane(blank)).toBeNull();
  });

  it("lanesOnFrame gives nothing when the lines meet but there is too little lane below them", () => {
    // Bright lines fanning out from a point two thirds of the way down: they vote for a
    // vanishing point, but the fan below it is too short to hold a lane.
    const f = makeFrame(640, 480);
    const vp = { x: 320, y: 0.65 * 480 };
    for (let y = 0; y < 480; y++) {
      for (let x = 0; x < 640; x++) {
        const dy = y - vp.y;
        f.data[y * 640 + x] = 40;
        if (dy <= 0 || dy > 60) continue;
        const k = ((x - vp.x) / dy) * 50;
        f.data[y * 640 + x] = 40 + 180 * Math.exp(-0.5 * ((k - Math.round(k / 40) * 40) / 1.2) ** 2);
      }
    }
    expect(lanesOnFrame(f)).toBeNull();
  });

  it("findLane gives nothing when the foul line is below the picture", () => {
    const spec: SyntheticShot = { ...mainSpec, camera: behindCamera({ width: 960, height: 720, fill: 0.14, back: 22 }) };
    expect(findLane([0, 5, 10].map((i) => renderFrame(spec, i)))).toBeNull();
  }, SLOW);

  it("findLane gives nothing when no pin stands out from its reflection", () => {
    const spec: SyntheticShot = { ...mainSpec, pinMirror: false };
    expect(findLane([0, 5, 10].map((i) => renderFrame(spec, i)))).toBeNull();
  }, SLOW);
});
