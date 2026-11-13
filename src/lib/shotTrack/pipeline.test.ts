import { describe, expect, it } from "vitest";
import { trace } from "./pipeline";
import { timeAt } from "./synthetic";
import { roughMarks, standardShot, syntheticSource, truthBoard, truthBoardAtPins, truthSpeedMph } from "./syntheticSource";
import type { TrackResult } from "./types";

/**
 * The headline test (plan 10.1): render a shot, trace it, and the boards at
 * the arrows, the breakpoint and the pins come back within 0.3 board and the
 * speed within 0.3 mph. Small frames keep the suite fast; the full grid
 * (1080p and 720p, 30 and 60 fps, camera positions) runs in the harness,
 * `scripts/shot-tracker/synthetic-grid.ts`.
 */
function truthBreakpoint(spec: ReturnType<typeof standardShot>): { board: number; feet: number } {
  let best = { board: Infinity, feet: 0 };
  for (let v = 0; v <= 60; v += 0.05) {
    const b = truthBoard(spec, v);
    if (b < best.board) best = { board: b, feet: v };
  }
  return best;
}

describe.each([
  { hand: "right" as const, body: true, fps: 30 },
  { hand: "left" as const, body: true, fps: 30 }
])("tracing a synthetic $hand-handed shot at $fps fps (body $body)", (c) => {
  const spec = standardShot(c);
  const src = syntheticSource(spec);
  // Marked on the last frame, after the pins have gone, so the deck end is a
  // clean edge (on real clips it is hidden behind standing pins: see the
  // harness README).
  const calib = src.count - 2;
  const out = trace({ source: src, calibFrame: calib, marks: roughMarks(spec, calib), hand: c.hand });
  const r = out.result as TrackResult;

  it("traces the shot", () => {
    expect(r.ok).toBe(true);
    expect(r.from).toBeLessThan(3);
    expect(r.to).toBeGreaterThan(57);
    expect(r.rms).toBeLessThan(0.3);
  });

  it("reads the boards within 0.3 board", () => {
    const m = r.metrics;
    expect(m.arrows.state).toBe("measured");
    expect(Math.abs(m.arrows.value! - truthBoard(spec, 15))).toBeLessThan(0.3);
    const bp = truthBreakpoint(spec);
    expect(m.breakpoint.state).toBe("measured");
    expect(Math.abs(m.breakpoint.value! - bp.board)).toBeLessThan(0.3);
    expect(Math.abs(m.breakpointFeet.value! - bp.feet)).toBeLessThan(3);
    expect(m.pins.state).toBe("measured");
    expect(Math.abs(m.pins.value! - truthBoardAtPins(spec))).toBeLessThan(0.3);
    expect(m.laydown.state).toBe("measured");
    expect(Math.abs(m.laydown.value! - truthBoard(spec, 0))).toBeLessThan(0.3);
  });

  it("finds the touchdown within a frame", () => {
    const truth = Math.ceil(timeAt(spec, spec.touchdownV) * spec.fps);
    expect(Math.abs(r.touchdownFrame! - truth)).toBeLessThanOrEqual(1);
  });

  it("reads the speed within 0.3 mph, anchored at the pins", () => {
    expect(r.pinFrame).not.toBeNull();
    expect(r.metrics.speed.state).toBe("measured");
    expect(Math.abs(r.metrics.speed.value! - truthSpeedMph(spec, r.from, r.to))).toBeLessThan(0.3);
  });

  it("passes its own calibration check", () => {
    expect(out.debug.calibration!.warn).toBe(false);
    expect(out.debug.calibration!.pins.length).toBeGreaterThan(0);
  });
});

describe("tracing failures", () => {
  it("says the lane was not found when the edges are not there", () => {
    const spec = standardShot({ width: 120, height: 200, duration: 0.5 });
    const src = syntheticSource(spec);
    const blank = { count: src.count, frame: (i: number) => ({ ...src.frame(i), data: new Uint8ClampedArray(120 * 200).fill(128) }) };
    const out = trace({ source: blank, calibFrame: 0, marks: roughMarks(spec, 0), hand: "right" });
    expect(out.result.ok).toBe(false);
    expect(!out.result.ok && out.result.failure).toBe("lane-not-found");
  });

  it("says the ball was not found when no ball is thrown", () => {
    const spec = { ...standardShot({ width: 180, height: 320, duration: 1, fps: 15 }), releaseT: 5, distractor: false };
    const src = syntheticSource(spec);
    const progress: string[] = [];
    const out = trace({ source: src, calibFrame: 2, marks: roughMarks(spec, 2), hand: "right", onProgress: (s) => progress.push(s) });
    expect(!out.result.ok && out.result.failure).toBe("ball-not-found");
    expect(progress).toContain("ball");
  });
});
