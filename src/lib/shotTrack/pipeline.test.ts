import { describe, expect, it } from "vitest";
import { gridFrames, LANE_EVERY, readStep } from "./framePick";
import { DRAW_GAP_FT, drawnTo, lostAfter, ownInset, ownRadius, predictCenter, PREDICT_FRAMES, reacquireBall, REACQUIRE_BELOW_FT, REACQUIRE_GAP_FT, trace } from "./pipeline";
import { makeFrame } from "./image";
import { BALL_DIAMETER_BOARDS, CONTACT_IN } from "./laneModel";
import type { FrameGeometry } from "./registration";
import { multiply, normalize } from "./homography";
import { PIN_HIT_FT, timeAt, truthAt } from "./synthetic";
import { roughMarks, standardShot, syntheticSource, truthBoard, truthBoardAtPins, truthSpeedMph } from "./syntheticSource";
import type { BallSighting, GrayFrame, Mat3, TrackResult } from "./types";

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

describe("ownInset and ownRadius", () => {
  it("is the median of how far inside the lane's size the ball's clean rims sit, in pixels", () => {
    expect(ownInset([0.6, 0.65, 0.69, 0.64])).toBeCloseTo(0.645, 9);
    // A pixel's blur, not a share of the ball: the same inset at 20 px and at 6 px.
    expect(ownRadius(20, 0.6)).toBeCloseTo(19.4, 9);
    expect(ownRadius(6.6, 0.6)).toBeCloseTo(6.0, 9);
  });

  it("is no inset with fewer than three, and never draws the ball under half the lane's size", () => {
    expect(ownInset([])).toBe(0);
    expect(ownInset([0.5, 0.6])).toBe(0);
    expect(ownRadius(4, 3)).toBe(2);
    // A ball measured larger than the lane predicts (1856: -0.2 px) is drawn larger.
    expect(ownRadius(10, -0.2)).toBeCloseTo(10.2, 9);
  });
});

describe("drawnTo", () => {
  it("draws to the last sighting when the board at the pins stands, else to the end of the first stretch seen", () => {
    const vs = [1, 5, 10, 20, 26, 52, 55, 58];
    expect(drawnTo(vs, true)).toBe(58);
    expect(drawnTo(vs, false)).toBe(26);
    expect(drawnTo([1, 1 + DRAW_GAP_FT, 1 + 2 * DRAW_GAP_FT], false)).toBe(1 + 2 * DRAW_GAP_FT);
  });
});

describe("lostAfter", () => {
  const at = (frame: number, v: number) => ({ frame, v }) as BallSighting;
  it("is the sighting before the first jump down the lane of the gap or more, else the last", () => {
    const run = [at(1, 2), at(2, 3), at(3, 4)];
    expect(lostAfter(run)).toBe(run[2]);
    const jumped = [...run, at(60, 4 + REACQUIRE_GAP_FT), at(61, 50)];
    expect(lostAfter(jumped)).toBe(run[2]);
    expect(lostAfter([...run, at(9, 4 + REACQUIRE_GAP_FT - 0.1)])!.frame).toBe(9);
    expect(lostAfter([])).toBeUndefined();
  });
});

describe("reacquireBall", () => {
  // A plain lane, 4 px a board and 6 px a foot, the ball at 22 ft a second on
  // board 30 (u 10), the bowler across the lane from 26 to 50 ft.
  const H: Mat3 = [4, 0, 20, 0, -6, 400, 0, 0, 1];
  const R = (BALL_DIAMETER_BOARDS / 2) * 4;
  const vAt = (t: number) => 20 + 22 * t;
  const frames = new Map<number, GrayFrame>();
  const frame = (i: number) => {
    const known = frames.get(i);
    if (known) return known;
    const f = makeFrame(200, 420, i / 60, 200);
    const v = vAt(i / 60);
    const cx = 20 + 4 * 10;
    const cy = 400 - 6 * v - R;
    if (v <= 60) for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) if (y >= 0 && Math.hypot(x - cx, y - cy) <= R) f.data[y * 200 + x] = 40;
    for (let y = 100; y <= 244; y++) for (let x = 0; x < 200; x++) f.data[y * 200 + x] = 10;
    frames.set(i, f);
    return f;
  };
  const source = { count: 120, frame };
  const geometry = Array.from({ length: 120 }, (_, index) => ({ index, ok: true, H }) as unknown as FrameGeometry);
  const seen = Array.from({ length: 16 }, (_, i): BallSighting => ({
    frame: i, t: i / 60, cx: 0, cy: 0, r: R, contact: { x: 0, y: 0 }, u: 10, v: vAt(i / 60), weight: 1, airborne: false
  }));
  const motion = { v0: 20, w: 22, d: 0 };

  it("finds the ball past the bowler as sightings, at its own size, with their uncertainty", () => {
    const { late, sv } = reacquireBall(source, geometry, 0, seen, motion, 0);
    expect(late.length).toBeGreaterThanOrEqual(10);
    for (const s of late) {
      expect(s.reacquired).toBe(true);
      expect(s.airborne).toBe(false);
      expect(s.frame).toBeGreaterThan(15);
      expect(Math.abs(s.u - 10)).toBeLessThan(0.6);
      expect(Math.abs(s.v - vAt(s.t))).toBeLessThan(0.8);
      expect(sv.get(s.frame)!).toBeGreaterThan(0);
    }
  }, 60_000);

  it("ends the track found again where it first reaches the head pin's contact row", () => {
    const { late } = reacquireBall(source, geometry, 0, seen, motion, 0);
    const row = 60 - CONTACT_IN / 12;
    expect(late.filter((s) => s.v >= row).length).toBeLessThanOrEqual(1);
    expect(late.slice(0, -1).every((s) => s.v < row)).toBe(true);
  }, 60_000);

  it("looks from where the ball was lost when a few far blobs were taken for it past the gap", () => {
    // Seen to 25 ft, then three blobs at 52 to 53 ft (IMG_2986: the ball and its mirror image at the rack, placed short).
    const blobs = [90, 92, 94].map((frame, k): BallSighting => ({ ...seen[0], frame, t: frame / 60, v: 52 + 0.5 * k }));
    const { late, after } = reacquireBall(source, geometry, 0, [...seen, ...blobs], motion, 0);
    expect(after).toBe(seen[seen.length - 1]);
    expect(late.length).toBeGreaterThanOrEqual(10);
    expect(late[0].frame).toBeGreaterThan(15);
    for (const s of late) expect(Math.abs(s.v - vAt(s.t))).toBeLessThan(0.8);
  }, 60_000);

  it("does not look when the ball was seen far enough, or its pace is not a ball's", () => {
    const far = seen.map((s) => ({ ...s, v: s.v + REACQUIRE_BELOW_FT }));
    expect(reacquireBall(source, geometry, 0, far, motion, 0).late).toEqual([]);
    expect(reacquireBall(source, geometry, 0, seen, { v0: 0, w: 2, d: 0 }, 0).late).toEqual([]);
    expect(reacquireBall(source, geometry, 0, [], motion, 0).late).toEqual([]);
  });
});
