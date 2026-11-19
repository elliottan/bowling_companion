import { describe, expect, it } from "vitest";
import { gridFrames, LANE_EVERY, readStep } from "./framePick";
import { predictCenter, PREDICT_FRAMES, trace } from "./pipeline";
import { multiply, normalize } from "./homography";
import { PIN_HIT_FT, timeAt, truthAt } from "./synthetic";
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
  // Traced again with the other hand set, reading the hand from the video.
  const auto = trace({ source: src, calibFrame: calib, marks: roughMarks(spec, calib), hand: c.hand === "right" ? "left" : "right", handFromVideo: true }).result as TrackResult;

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

  it("reads the pins on the last frame before a pin moves", () => {
    // The rendered rack falls on the first frame the ball reaches PIN_HIT_FT.
    const hit = Math.ceil(timeAt(spec, PIN_HIT_FT) * spec.fps);
    expect(r.pinFrame).toBe(hit);
    expect(out.debug.pinsRead!.frame).toBe(hit - 1);
  });

  it("reads the speed within 0.3 mph, anchored at the pins", () => {
    expect(r.pinFrame).not.toBeNull();
    expect(r.metrics.speed.state).toBe("measured");
    expect(Math.abs(r.metrics.speed.value! - truthSpeedMph(spec, r.from, r.to))).toBeLessThan(0.3);
  });

  it("reads the bowler's hand from the video, whatever the setting says", () => {
    expect(auto.hand).toBe(c.hand);
    expect(auto.handFound!.by).toBe("video");
    expect(auto.handFound!.cues.map((x) => x.name)).toEqual(expect.arrayContaining(["drift", "hook", "pins"]));
    expect(auto.metrics.laydown.value).toBeCloseTo(r.metrics.laydown.value!, 6);
    expect(auto.metrics.breakpoint.value).toBeCloseTo(r.metrics.breakpoint.value!, 6);
    expect(auto.metrics.pins.value).toBeCloseTo(r.metrics.pins.value!, 6);
    // Without being asked, the setting's hand stands and nothing is said of the video's.
    expect(r.hand).toBe(c.hand);
    expect(r.handFound).toBeUndefined();
    expect(out.debug.hand!.hand).toBe(c.hand);
  });

  it("passes its own calibration check", () => {
    expect(out.debug.calibration!.warn).toBe(false);
    expect(out.debug.calibration!.pins.length).toBeGreaterThan(0);
  });
});

describe("tracing with the lane found on many frames", () => {
  const spec = standardShot({ hand: "right", body: true });
  const src = syntheticSource(spec);
  // The true lane every sixth frame, as the finder would hand it on, and one
  // frame's lane three boards out (a pin row read off a reflection).
  const wrong = { frame: 30, H: normalize(multiply(truthAt(spec, 30).H, [1, 0, 3, 0, 1, 0, 0, 0, 1])) };
  const lanes = [...Array.from({ length: Math.floor(src.count / 6) }, (_, i) => ({ frame: 6 * i, H: truthAt(spec, 6 * i).H, weight: 1 })).filter((l) => l.frame !== 30), wrong];
  const out = trace({ source: src, calibFrame: 60, lanes, hand: "right" });
  const r = out.result as TrackResult;

  it("traces the shot with each frame's own lane, the wrong one dropped", () => {
    expect(r.ok).toBe(true);
    expect(out.debug.lanes!.dropped).toEqual([wrong]);
    expect(out.debug.fit).toBeNull();
    expect(out.debug.H0).not.toBeNull();
    expect(Math.abs(r.metrics.arrows.value! - truthBoard(spec, 15))).toBeLessThan(0.3);
    expect(Math.abs(r.metrics.laydown.value! - truthBoard(spec, 0))).toBeLessThan(0.3);
    expect(Math.abs(r.metrics.pins.value! - truthBoardAtPins(spec))).toBeLessThan(0.3);
  });

  it("says the lane was not found when no found lane is in the frames traced", () => {
    const none = trace({ source: src, calibFrame: 5, first: 0, last: 10, lanes: [{ frame: 80, H: truthAt(spec, 80).H }], hand: "right" });
    expect(!none.result.ok && none.result.failure).toBe("lane-not-found");
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

describe("tracing a shot seen over the near lane only", () => {
  // The ball rubbed out of every frame once it is past 11 ft (the same frame
  // rendered with no ball thrown), as a bowler standing over the lane hides it.
  const spec = { ...standardShot({ hand: "right", fps: 30 }), distractor: false };
  const src = syntheticSource(spec);
  const empty = syntheticSource({ ...spec, releaseT: 99 });
  const hidden = { count: src.count, frame: (i: number) => ((truthAt(spec, i).ball?.v ?? 0) > 11 ? empty.frame(i) : src.frame(i)) };
  const lanes = Array.from({ length: Math.floor(src.count / 6) }, (_, i) => ({ frame: 6 * i, H: truthAt(spec, 6 * i).H, weight: 1 }));
  const out = trace({ source: hidden, calibFrame: 12, lanes, hand: "right" });

  it("reads the near end and leaves the far readings missing rather than refusing the trace", () => {
    const r = out.result as TrackResult;
    expect(r.ok).toBe(true);
    expect(out.debug.nearOnly).toBe(true);
    expect(r.to).toBeLessThan(11.5);
    expect(r.metrics.laydown.state).toBe("measured");
    expect(Math.abs(r.metrics.laydown.value! - truthBoard(spec, 0))).toBeLessThan(0.5);
    expect(r.metrics.arrows.state).toBe("estimated");
    expect(r.metrics.breakpoint.state).toBe("missing");
    expect(r.metrics.pins.state).toBe("missing");
    expect(r.metrics.speed.state).toBe("estimated");
    expect(r.pinFrame).toBeNull();
  });
});

describe("a read that starts earlier or later", () => {
  // The app reads from a little before the foul line, the harness from the
  // clip's start: the same shot, the frames they share the same, must read
  // the same. Each frame's found lane is a little out (as the finder's are,
  // a few tenths of a board), so a lane search or an empty lane that chose
  // other frames for another start would move the readings. The lanes are
  // looked for on the frames the view's `findOn` chooses (`gridFrames`).
  // The ball let go 1.2 s in, so both reads have the same lead before it.
  const spec = { ...standardShot({ hand: "right", body: true, duration: 4.4 }), releaseT: 1.2 };
  const src = syntheticSource(spec);
  const times = Array.from({ length: src.count }, (_, i) => src.frame(i).t);
  const found = (i: number) => {
    const out = 0.3 * Math.sin(1.3 * i);
    return { frame: i, H: normalize(multiply(truthAt(spec, i).H, [1, 0, out, 0, 1, 0, 0, 0, 1])), weight: 1 };
  };
  const readFrom = (start: number) => {
    const count = src.count - start;
    const own = times.slice(start);
    const lanes = gridFrames(own, LANE_EVERY, readStep(own)).map((k) => ({ ...found(start + k), frame: k }));
    const out = trace({ source: { count, frame: (k) => src.frame(start + k) }, calibFrame: 80 - start, lanes, hand: "right" });
    return (out.result as TrackResult).metrics;
  };
  const whole = readFrom(0);
  const late = readFrom(9);

  it("reads the same boards from either start", () => {
    // Lanes chosen every nth frame of each read moved all four by 0.2 board here.
    for (const k of ["laydown", "arrows", "breakpoint", "pins"] as const) {
      expect(whole[k].state).toBe("measured");
      expect(Math.abs(late[k].value! - whole[k].value!)).toBeLessThan(0.02);
    }
    expect(Math.abs(late.breakpointFeet.value! - whole.breakpointFeet.value!)).toBeLessThan(0.1);
  });
});

describe("predictCenter", () => {
  it("runs the last circles' straight line on to the frame asked", () => {
    const placed = [1, 2, 3, 5].map((frame) => ({ frame, x: 100 - 0.6 * frame, y: 50 + 0.1 * frame }));
    const at = predictCenter(placed, 6)!;
    expect(at.x).toBeCloseTo(100 - 3.6, 6);
    expect(at.y).toBeCloseTo(50.6, 6);
  });

  it("says nothing with fewer than three circles near enough before it", () => {
    expect(predictCenter([{ frame: 1, x: 0, y: 0 }, { frame: 2, x: 1, y: 0 }], 3)).toBeNull();
    const old = [1, 2, 3].map((frame) => ({ frame, x: frame, y: 0 }));
    expect(predictCenter(old, 3 + PREDICT_FRAMES + 1)).toBeNull();
    // Only circles before the frame count.
    expect(predictCenter(old, 2)).toBeNull();
  });
});
