import { describe, expect, it } from "vitest";
import { associate, polyfit } from "./associate";
import { laneRoi, medianBackground, steady } from "./background";
import { findCandidates, refineCircle } from "./ballDetect";
import { calibrationReport, checkArrows, checkPins } from "./calibrationCheck";
import { fitLine, robustLine, snapEdge } from "./edgeSnap";
import { apply, intersect, multiply, segmentLine } from "./homography";
import { makeFrame, warp } from "./image";
import { BALL_RADIUS_FT, laneToWorld } from "./laneModel";
import { fitMotion, fitPath, metrics, nelderMead, pathU, pinContactFeet, timeAtFeet } from "./pathFit";
import { globalShift, register } from "./registration";
import { project, timeAt, truthAt } from "./synthetic";
import { standardShot, syntheticSource } from "./syntheticSource";
import type { GrayFrame, Mat3 } from "./types";

describe("edgeSnap", () => {
  it("finds a sub-pixel edge with 40% of the line covered", () => {
    // A slanted step at x = 40.3 + 0.1 y, lane (bright) to the right.
    const f = makeFrame(100, 120);
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 100; x++) {
        const edge = 40.3 + 0.1 * y;
        f.data[y * 100 + x] = 60 + 120 * Math.min(1, Math.max(0, x - edge + 0.5));
        if (y < 48 && x > 30 && x < 60) f.data[y * 100 + x] = 20 + ((x * 7 + y * 3) % 30);
      }
    }
    const r = snapEdge(f, { a: { x: 41, y: 2 }, b: { x: 52, y: 118 } }, { band: 6, interior: { x: 90, y: 60 }, sign: "rising" });
    expect(r.ok).toBe(true);
    for (const y of [60, 100]) expect(intersect(r.line, [0, 1, -y])!.x).toBeCloseTo(40.3 + 0.1 * y, 1);
    const flat = snapEdge(makeFrame(50, 50, 0, 90), { a: { x: 10, y: 5 }, b: { x: 12, y: 45 } });
    expect(flat.ok).toBe(false);
    const falling = snapEdge(f, { a: { x: 41, y: 60 }, b: { x: 52, y: 118 } }, { band: 6, interior: { x: 0, y: 60 }, sign: "falling" });
    expect(falling.ok).toBe(true);
  });

  it("fits robust lines", () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ x: i, y: 2 * i + 1 }));
    pts.push({ x: 5, y: 80 }, { x: 9, y: -40 });
    const r = robustLine(pts, 0.5)!;
    expect(r.inliers.length).toBe(30);
    expect(robustLine([{ x: 1, y: 1 }], 1)).toBeNull();
    const l = fitLine([{ x: 0, y: 3 }, { x: 10, y: 3 }]);
    expect(Math.abs(l[1])).toBeCloseTo(1);
  });
});

describe("registration", () => {
  it("measures a shift of the picture", () => {
    const spec = standardShot({ width: 180, height: 320 });
    const a = syntheticSource(spec).frame(3);
    const M: Mat3 = [1, 0, -3.4, 0, 1, 2.2, 0, 0, 1];
    const b = warp(a, M, 0, 0, a.width, a.height);
    const fill: GrayFrame = { ...b, data: b.data.map((v) => (Number.isFinite(v) ? v : 128)) };
    const s = globalShift(a, fill);
    expect(s.x).toBeCloseTo(3.4, 0);
    expect(s.y).toBeCloseTo(-2.2, 0);
  });

  // Plan 7.3: the far corners within 0.3 pixel, with the body in the picture.
  it("carries the far corners through drift and jitter", () => {
    const spec = standardShot({ width: 240, height: 427, duration: 1.2, fill: 0.3, body: true });
    const src = syntheticSource(spec);
    const last = src.count - 1;
    const geo = register(src, last, truthMarks(spec, last), 0, last);
    for (const i of [0, 10, 25]) {
      expect(geo[i].ok).toBe(true);
      const t = truthMarks(spec, i);
      const truth = intersect(segmentLine(t.left), segmentLine(t.deck))!;
      const got = intersect(segmentLine(geo[i].marks.left), segmentLine(geo[i].marks.deck))!;
      expect(Math.hypot(got.x - truth.x, got.y - truth.y)).toBeLessThan(0.3);
    }
  });
});

function truthMarks(spec: ReturnType<typeof standardShot>, i: number) {
  const H = truthAt(spec, i).H;
  const at = (u: number, v: number) => apply(H, { x: u, y: v });
  return {
    left: { a: at(0.5, 0), b: at(0.5, 62.849) },
    right: { a: at(39.5, 0), b: at(39.5, 62.849) },
    foul: { a: at(0.5, 0), b: at(39.5, 0) },
    deck: { a: at(0.5, 62.849), b: at(39.5, 62.849) }
  };
}

describe("ballDetect", () => {
  const spec = { ...standardShot({ width: 240, height: 427, fill: 0.3, body: true, fps: 15 }), jitter: 0, drift: undefined };
  const src = syntheticSource(spec);
  const H = truthAt(spec, 0).H;
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const roi = laneRoi(H, 240, 427);
  const bg = medianBackground(Array.from({ length: src.count }, (_, i) => steady(src.frame(i), I, roi)));

  it("finds the ball, and not the body or the ball on the next lane", () => {
    const i = Math.round(timeAt(spec, 25) * spec.fps);
    const f = src.frame(i);
    const c = findCandidates(steady(f, I, roi), bg, roi, I, H, i);
    const truth = truthAt(spec, i).ball!;
    expect(c.length).toBe(1);
    expect(Math.abs(c[0].u - truth.u)).toBeLessThan(1);
    expect(Math.abs(c[0].v - truth.v)).toBeLessThan(1.5);
  });

  it("fits the circle's centre within 0.3 pixel", () => {
    const i = Math.round(timeAt(spec, 30) * spec.fps);
    const truth = truthAt(spec, i);
    const w = laneToWorld(truth.ball!.u, truth.ball!.v);
    const c = project(truth.camera, [w.x, w.y, BALL_RADIUS_FT])!;
    const fit = refineCircle(src.frame(i), H, { x: c.x + 1.5, y: c.y - 1 }, 0.98 * truth.camera.focal * BALL_RADIUS_FT / Math.hypot(w.x - truth.camera.x, w.y - truth.camera.y, BALL_RADIUS_FT - truth.camera.z))!;
    expect(Math.hypot(fit.cx - c.x, fit.cy - c.y)).toBeLessThan(0.3);
    expect(fit.weight).toBeGreaterThan(0.5);
    expect(refineCircle(makeFrame(60, 60, 0, 100), H, { x: 30, y: 30 }, 8)).toBeNull();
  });

  it("checks the calibration against the pins and the arrows", () => {
    const clear = { ...spec, body: undefined };
    const f = syntheticSource(clear).frame(0);
    const pins = checkPins(f, H);
    const arrows = checkArrows(f, H);
    expect(pins.length).toBe(3);
    expect(arrows.length).toBeGreaterThan(4);
    for (const e of [...pins, ...arrows]) expect(Math.abs(e.error)).toBeLessThan(0.35);
    // A mapping two boards off is caught.
    const off = multiply(H, [1, 0, 2, 0, 1, 0, 0, 0, 1]);
    const report = calibrationReport(f, off, f, off);
    expect(report.warn).toBe(true);
    expect(calibrationReport(null, null, null, null).pinError).toBeNull();
  });
});

describe("associate", () => {
  it("keeps the one ball and drops the rest", () => {
    const cands = [];
    for (let i = 0; i < 60; i++) {
      const t = i / 30;
      cands.push({ frame: i, t, v: 2 + 24 * t, u: 25 + 0.1 * (2 + 24 * t) });
      if (i % 3 === 0) cands.push({ frame: i, t, v: 40 - 5 * t, u: 5 });
      if (i % 4 === 0) cands.push({ frame: i, t, v: 10 + 24 * t, u: 34 });
    }
    const got = associate(cands);
    expect(got.length).toBe(60);
    expect(got.every((c) => c.u > 24)).toBe(true);
    expect(polyfit([0, 1, 2], [1, 3, 7], 2)[2]).toBeCloseTo(1);
  });
});

describe("pathFit", () => {
  const shape = { u0: 24, a: 0.2, s: 36, L: 16, k: -0.025 };
  const pts = Array.from({ length: 80 }, (_, i) => {
    const v = 1 + i * 0.73;
    return { v, u: pathU({ kind: "hook", ...shape }, v) + 0.05 * Math.sin(i * 1.3), w: 1, sv: 0.1 };
  });

  it("recovers a hook and reads its metrics in handed boards", () => {
    const fit = fitPath(pts);
    expect(fit.path.kind).toBe("hook");
    expect(fit.rms).toBeLessThan(0.1);
    const m = metrics({
      path: fit.path, hand: "right", seen: pts.map((p) => p.v), touchdown: 1,
      motion: { v0: -10, w: 25, d: -1 }, tFirst: 0.5, tLast: 2.8, speedMeasured: true, anchoredSpeed: 23.6
    });
    expect(m.arrows.state).toBe("measured");
    expect(m.arrows.value!).toBeCloseTo(40 - pathU(fit.path, 15), 5);
    expect(m.breakpoint.state).toBe("measured");
    expect(m.pins.state).toBe("measured");
    expect(m.launchAngle.state).toBe("measured");
    expect(m.speed.state).toBe("measured");
    // The two readings must agree within 1.5 mph to count as measured.
    const off = metrics({
      path: fit.path, hand: "right", seen: pts.map((p) => p.v), touchdown: 1,
      motion: { v0: -10, w: 25, d: -1 }, tFirst: 0.5, tLast: 2.8, speedMeasured: true, anchoredSpeed: 30
    });
    expect(off.speed.state).toBe("estimated");
    expect(off.speed.value!).toBeCloseTo(23.35 * (3600 / 5280), 1);
    expect(pinContactFeet(fit.path)).toBeGreaterThan(59);
  });

  it("marks what it could not see as estimated or missing", () => {
    const mid = pts.filter((p) => p.v > 20 && p.v < 50);
    const fit = fitPath(mid);
    const m = metrics({
      path: fit.path, hand: "left", seen: mid.map((p) => p.v), touchdown: null,
      motion: { v0: 0, w: 50, d: 0 }, tFirst: 0, tLast: 1, speedMeasured: false
    });
    expect(m.laydown.state).toBe("estimated");
    expect(m.laydownFeet.state).toBe("missing");
    expect(m.pins.state).toBe("missing");
    expect(m.speed.state).toBe("missing");
    // First sighting by 30 ft with the skid seen: the arrows are estimated.
    expect(m.arrows.state).toBe("estimated");
  });

  it("falls back to a smoothing spline when the shape does not fit", () => {
    const zig = pts.map((p, i) => ({ ...p, u: 20 + (i % 20 < 10 ? 3 : -3) }));
    const fit = fitPath(zig);
    expect(fit.path.kind).toBe("spline");
    expect(Number.isFinite(pathU(fit.path, 70))).toBe(true);
    expect(Number.isFinite(pathU(fit.path, -5))).toBe(true);
  });

  it("fits distance against time with the ball only slowing", () => {
    const m = fitMotion(Array.from({ length: 40 }, (_, i) => ({ t: i / 20, v: 2 + 25 * (i / 20) + 0.4 * (i / 20) ** 2, w: 1 })));
    expect(m.d).toBeLessThanOrEqual(0);
    expect(timeAtFeet({ v0: 0, w: 20, d: 0 }, 40)).toBeCloseTo(2);
    expect(timeAtFeet({ v0: 0, w: 0, d: 0 }, 40)).toBeNull();
    expect(timeAtFeet({ v0: 0, w: 10, d: -10 }, 40)).toBeNull();
    expect(nelderMead((x) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2, [0, 0], [1, 1]).x[0]).toBeCloseTo(3, 3);
  });
});
