import { describe, expect, it } from "vitest";
import { focalFromPlane } from "./calibrate";
import { apply } from "./homography";
import { trace } from "./pipeline";
import { robustHomography, rotation, turnHomography } from "./registration";
import { timeAt, truthAt } from "./synthetic";
import { laneMarkings, standardShot, syntheticSource, truthBoard } from "./syntheticSource";
import type { Mat3, TrackResult } from "./types";

/**
 * The revised calibration and registration (harness README, "Corrections to
 * the plan"): calibrated from the lane's markings only, with one edge, on a
 * dark lane, from the side, and through a 6 degree tilt. The floor's own
 * plane (`registerPlane`) is exercised by the harness on shot-01: the
 * synthetic floor has too little texture to track it (see the README).
 */
function traced(spec: ReturnType<typeof standardShot>, calib?: number) {
  const src = syntheticSource(spec);
  const c = calib ?? src.count - 2;
  const out = trace({ source: src, calibFrame: c, calMarks: laneMarkings(spec, c), hand: spec.hand });
  return { out, r: out.result as TrackResult, src };
}

function expectBoards(spec: ReturnType<typeof standardShot>, r: TrackResult, limit = 0.3) {
  expect(r.ok).toBe(true);
  expect(Math.abs(r.metrics.laydown.value! - truthBoard(spec, r.metrics.laydownFeet.value!))).toBeLessThan(limit);
  expect(Math.abs(r.metrics.arrows.value! - truthBoard(spec, 15))).toBeLessThan(limit);
  expect(r.metrics.pins.value).not.toBeNull();
  expect(Math.abs(r.metrics.pins.value! - truthBoard(spec, 60))).toBeLessThan(limit);
}

describe("calibrated from the lane's markings only", () => {
  it("traces from a lane to the side, with one edge marked", () => {
    const spec = standardShot({ side: 5.4, fill: 0.2 });
    const { out, r } = traced(spec);
    expect(out.debug.fit!.redundancy).toBeGreaterThan(10);
    expect(out.debug.fit!.worstBoards).toBeLessThan(0.5);
    expectBoards(spec, r);
  }, 30000);

  it("maps a dark lane from two lanes to the side within a tenth of a board at both ends", () => {
    // The fit reads only the marks, so the lane's colours cannot matter; the
    // far side's edge, never marked, comes out of it.
    const spec = { ...standardShot({ side: 10.9, fill: 0.2 }), palette: "dark" as const };
    const marks = laneMarkings(spec, 0, 0.2);
    const out = trace({ source: { count: 1, frame: () => syntheticSource(spec).frame(0) }, calibFrame: 0, calMarks: marks, hand: "right" });
    const H = out.debug.fit!.H;
    const truth = truthAt(spec, 0).H;
    for (const [u, v] of [[39.5, 0], [0.5, 0], [39.5, 60], [20, 30]]) {
      const p = apply(H, { x: u, y: v });
      const t = apply(truth, { x: u, y: v });
      const board = Math.hypot(...(([a, b]) => [b.x - a.x, b.y - a.y])([apply(truth, { x: u, y: v }), apply(truth, { x: u + 1, y: v })]));
      expect(Math.hypot(p.x - t.x, p.y - t.y) / board).toBeLessThan(0.1);
    }
  });

  it("refuses marks that disagree by more than a board", () => {
    const spec = standardShot({ width: 180, height: 320, duration: 1, fps: 15 });
    const src = syntheticSource(spec);
    const marks = laneMarkings(spec, 2);
    const p = marks[0] as Extract<(typeof marks)[number], { kind: "point" }>;
    p.at = { x: p.at.x + 20, y: p.at.y };
    const out = trace({ source: src, calibFrame: 2, calMarks: marks, hand: "right" });
    expect(!out.result.ok && out.result.failure).toBe("calibration-off");
  });

  it("says the lane was not found when the marks cannot fix it", () => {
    const spec = standardShot({ width: 180, height: 320, duration: 1, fps: 15 });
    const src = syntheticSource(spec);
    const out = trace({ source: src, calibFrame: 2, calMarks: laneMarkings(spec, 2).slice(0, 3), hand: "right" });
    expect(!out.result.ok && out.result.failure).toBe("lane-not-found");
    expect(trace({ source: src, calibFrame: 2, hand: "right" }).result.ok).toBe(false);
  });
});

describe("registration by the camera's turn", () => {
  it("reads the laydown through a 6 degree tilt between the calibration frame and the touchdown", () => {
    const base = standardShot({ fill: 0.18 });
    const touchFrame = Math.ceil(timeAt(base, base.touchdownV) * base.fps);
    const calib = Math.round(3.4 * base.fps);
    const pitch = ((6 * Math.PI) / 180) / ((calib - touchFrame) / base.fps);
    // Tilting down 6 degrees over the shot: the calibration frame looks lower.
    const spec = { ...base, camera: { ...base.camera, pitch: base.camera.pitch - 0.06 }, drift: { yaw: 0, pitch, roll: 0.002, zoom: 0.005 } };
    const { r, out } = traced(spec, calib);
    const g0 = out.debug.geometry[touchFrame];
    const g1 = out.debug.geometry[calib];
    expect(Math.abs(g1.turn[0] - g0.turn[0])).toBeGreaterThan(0.09);
    expect(r.metrics.laydown.state).toBe("measured");
    expect(Math.abs(r.metrics.laydown.value! - truthBoard(spec, r.metrics.laydownFeet.value!))).toBeLessThan(0.3);
  }, 30000);

  it("builds the turn's homography from a rotation and a zoom", () => {
    const lens = { f: 1000, cx: 100, cy: 50 };
    expect(turnHomography(lens, [0, 0, 0, 0]).map((v) => +v.toFixed(9))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const H = turnHomography(lens, [0, 0.01, 0, Math.log(1.1)]);
    const p = apply(H, { x: 100, y: 50 });
    expect(p.x).toBeCloseTo(100 + 1.1 * 1000 * Math.tan(0.01), 1);
    const R = rotation([0.3, -0.2, 0.1]);
    expect(R[0] * R[0] + R[3] * R[3] + R[6] * R[6]).toBeCloseTo(1, 12);
  });

  it("finds the focal length from the lane mapping", () => {
    const spec = standardShot({});
    const H = truthAt(spec, 0).H;
    const f = focalFromPlane(H, spec.camera.width, spec.camera.height)!;
    expect(Math.abs(f / spec.camera.focal - 1)).toBeLessThan(0.05);
    expect(focalFromPlane([1, 0, 0, 0, 1, 0, 0, 0, 1] as Mat3, 100, 100)).toBeNull();
  });
});

describe("registration on the lane's own plane", () => {
  it("fits a homography robustly and gives up on too few pairs", () => {
    const H: Mat3 = [1.1, 0.05, 3, -0.02, 0.95, -2, 0.0002, 0.0001, 1];
    const P = Array.from({ length: 40 }, (_, k) => ({ x: (k % 8) * 30, y: Math.floor(k / 8) * 40 + (k % 3) }));
    const Q = P.map((p, k) => (k % 5 === 0 ? { x: p.x + 9, y: p.y - 7 } : apply(H, p)));
    const fit = robustHomography(P, Q, 0.5)!;
    expect(fit.inliers.length).toBe(32);
    const p = apply(fit.H, { x: 100, y: 100 });
    const q = apply(H, { x: 100, y: 100 });
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-6);
    expect(robustHomography(P.slice(0, 5), Q.slice(0, 5), 0.5)).toBeNull();
  });
});
