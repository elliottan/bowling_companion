import { describe, expect, it } from "vitest";
import { apply } from "./homography";
import {
  BALL_DIAMETER_BOARDS,
  BALL_RADIUS_FT,
  DECK_END_FT,
  contactPoint,
  expectedRadiusPx,
  handedBoard,
  homographyFromMarks,
  hookSlope,
  hookU,
  imageToLane,
  laneToImage,
  laneToWorld,
  laneU,
  markCorners,
  worldToLane
} from "./laneModel";
import { behindCamera, laneHomography, lookAt, marksFor, project, type Camera } from "./synthetic";

describe("laneModel", () => {
  it("flips to the handed board for each hand and back", () => {
    expect(handedBoard(1, "right")).toBe(39);
    expect(handedBoard(39, "right")).toBe(1);
    expect(handedBoard(10, "left")).toBe(10);
    expect(handedBoard(20, "right")).toBe(20);
    for (const hand of ["right", "left"] as const) expect(laneU(handedBoard(12.3, hand), hand)).toBeCloseTo(12.3);
  });

  it("knows the real dimensions", () => {
    expect(DECK_END_FT).toBeCloseTo(62.849, 3);
    expect(BALL_DIAMETER_BOARDS).toBeCloseTo(7.99, 2);
    const w = laneToWorld(39.5, 10);
    expect(w.x).toBeCloseTo(41.5 / 2 / 12);
    expect(worldToLane(w.x, w.y).u).toBeCloseTo(39.5);
  });

  it("draws a hook that is continuous with a continuous slope", () => {
    const p = { u0: 30, a: -0.2, s: 35, L: 15, k: 0.03 };
    for (const v of [p.s, p.s + p.L]) {
      expect(hookU(p, v - 1e-6)).toBeCloseTo(hookU(p, v + 1e-6), 4);
      expect(hookSlope(p, v - 1e-6)).toBeCloseTo(hookSlope(p, v + 1e-6), 4);
    }
    expect(hookSlope(p, 10)).toBe(-0.2);
    expect(hookU(p, 60) - hookU(p, 55)).toBeCloseTo(5 * hookSlope(p, 58), 6);
  });

  it("solves the lane from the four marked lines", () => {
    const cam = behindCamera({ width: 1080, height: 1920, fill: 0.085, side: 2 });
    const H = homographyFromMarks(marksFor(cam));
    const T = laneHomography(cam);
    for (const [u, v] of [[20, 15], [5, 60], [35, 2]]) {
      const a = laneToImage(H, u, v);
      const b = apply(T, { x: u, y: v });
      expect(a.x).toBeCloseTo(b.x, 4);
      expect(a.y).toBeCloseTo(b.y, 4);
      const back = imageToLane(H, a);
      expect(back.u).toBeCloseTo(u, 6);
      expect(back.v).toBeCloseTo(v, 6);
    }
    const parallel = { a: { x: 0, y: 0 }, b: { x: 0, y: 10 } };
    const m = { ...marksFor(cam), left: parallel, right: { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } }, foul: parallel };
    expect(markCorners(m)).toBeNull();
    expect(() => homographyFromMarks(m)).toThrow();
  });

  it("puts the ball's contact point on its board with the camera two lanes to the side", () => {
    // The ball's centre is 4.25 in above the lane: mapping it directly would put
    // the ball too far down-lane and across. The contact point rule must not.
    for (const side of [0, 11, -11]) {
      const cam: Camera = behindCamera({ width: 1080, height: 1920, fill: 0.085, side, heightFt: 5.5 });
      const H = laneHomography(cam);
      for (const [u, v] of [[10, 5], [20, 15], [30, 40], [8, 58]]) {
        const w = laneToWorld(u, v);
        const c = project(cam, [w.x, w.y, BALL_RADIUS_FT])!;
        // A fitted circle's radius is the sphere's apparent size: focal * R / distance.
        const r = (cam.focal * BALL_RADIUS_FT) / Math.hypot(w.x - cam.x, w.y - cam.y, BALL_RADIUS_FT - cam.z);
        expect(Math.abs(expectedRadiusPx(H, u, v) / r - 1)).toBeLessThan(0.1);
        const got = contactPoint(H, c, r);
        expect(Math.abs(got.u - u)).toBeLessThan(0.1);
        expect(Math.abs(got.v - v)).toBeLessThan(0.25);
        const naive = imageToLane(H, c);
        expect(Math.abs(naive.v - v)).toBeGreaterThan(Math.abs(got.v - v));
      }
    }
  });

  it("looks at a target", () => {
    const a = lookAt([0, 0, 0], [1, 1, 0]);
    expect(a.yaw).toBeCloseTo(Math.PI / 4);
    expect(a.pitch).toBeCloseTo(0);
  });
});
