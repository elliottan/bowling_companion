import { describe, expect, it } from "vitest";
import { BALL_RADIUS_FT, expectedRadiusPx, laneToWorld } from "./laneModel";
import {
  PIN_HIT_FT,
  ballDistance,
  behindCamera,
  frameCount,
  project,
  renderFrame,
  rng,
  timeAt,
  truthAt,
  type SyntheticShot
} from "./synthetic";

const cam = behindCamera({ width: 180, height: 320, fill: 0.3 });
const spec: SyntheticShot = {
  camera: cam,
  fps: 30,
  duration: 3.5,
  hand: "right",
  path: { u0: 28, a: -0.2, s: 35, L: 15, k: 0.04 },
  releaseT: 0.2,
  releaseV: -0.5,
  speedMph: 17,
  decel: -1.5,
  touchdownV: 1,
  loft: 0.25,
  noise: 0,
  seed: 5
};

describe("synthetic renderer", () => {
  it("times the ball consistently and counts frames", () => {
    expect(frameCount(spec)).toBe(105);
    expect(ballDistance(spec, 0.1)).toBeNull();
    const t = timeAt(spec, 30);
    expect(ballDistance(spec, t)).toBeCloseTo(30, 6);
    expect(timeAt({ ...spec, decel: 0 }, 30)).toBeCloseTo(0.2 + 30.5 / (17 * 5280 / 3600), 6);
    expect(ballDistance(spec, 10)).toBeNull();
    expect(rng(3)()).toBe(rng(3)());
  });

  it("puts the ball where the camera model says", () => {
    const i = 30;
    const truth = truthAt(spec, i);
    const f = renderFrame(spec, i);
    const b = truth.ball!;
    const w = laneToWorld(b.u, b.v);
    const c = project(truth.camera, [w.x, w.y, BALL_RADIUS_FT + b.height])!;
    const r = expectedRadiusPx(truth.H, b.u, b.v);
    // Dark pixels in a box around the projected centre: their centroid is the centre.
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = Math.floor(c.y - 2 * r); y <= c.y + 0.6 * r; y++) {
      for (let x = Math.floor(c.x - 2 * r); x <= c.x + 2 * r; x++) {
        if (f.data[y * f.width + x] < 60) {
          sx += x;
          sy += y;
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(0.5 * Math.PI * r * r);
    expect(Math.abs(sx / n - c.x)).toBeLessThan(0.5);
    expect(sy / n - c.y).toBeLessThan(0.5);
  });

  it("takes the pins away once the ball reaches them", () => {
    expect(truthAt(spec, 2).pinsStanding).toBe(true);
    const late = Math.ceil(timeAt(spec, PIN_HIT_FT) * spec.fps) + 1;
    expect(truthAt(spec, late).pinsStanding).toBe(false);
    expect(truthAt(spec, 104).ball).toBeNull();
  });

  it("draws the occluder, the distractor, drift, jitter and noise", () => {
    const busy: SyntheticShot = {
      ...spec,
      noise: 3,
      jitter: 0.001,
      drift: { yaw: 0.01, pitch: 0.005, roll: 0.01, zoom: 0.02 },
      body: { u: 30, v: -2, radius: 0.5, height: 5.5 },
      distractor: true
    };
    const a = renderFrame(busy, 20);
    const b = renderFrame(spec, 20);
    let diff = 0;
    for (let k = 0; k < a.data.length; k++) diff += Math.abs(a.data[k] - b.data[k]);
    expect(diff / a.data.length).toBeGreaterThan(2);
    expect(truthAt(busy, 20).camera.focal).toBeGreaterThan(cam.focal);
  });
});
