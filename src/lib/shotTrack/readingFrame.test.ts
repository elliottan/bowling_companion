import { describe, expect, it } from "vitest";
import { CROP_MAX, CROP_MIN, cropBox, isEstimated, pickFrame, readingShots, speedStretch, videoFrameNumber, type Ok } from "./readingFrame";
import { laneU } from "./laneModel";
import { trace, type TraceDebug, type TraceOutput } from "./pipeline";
import { roughMarks, standardShot, syntheticSource } from "./syntheticSource";
import type { BallSighting, GrayFrame, Mat3, Metric, TrackResult } from "./types";

describe("cropBox", () => {
  it("centers a box on the points, never smaller than the least", () => {
    const b = cropBox([{ x: 100, y: 100 }], 400, 400, 0);
    expect(b).toEqual({ x: 64, y: 64, w: CROP_MIN, h: CROP_MIN });
  });

  it("holds every point with room round them, up to the largest crop", () => {
    const b = cropBox([{ x: 100, y: 100 }, { x: 180, y: 140 }], 600, 600, 0);
    expect(b.w).toBe(100);
    expect(b.x).toBeLessThanOrEqual(100);
    expect(b.x + b.w).toBeGreaterThanOrEqual(180);
    expect(cropBox([{ x: 0, y: 0 }, { x: 500, y: 500 }], 900, 900, 0).w).toBe(CROP_MAX);
  });

  it("takes the least when the points are closer than that", () => {
    expect(cropBox([{ x: 200, y: 200 }], 600, 600, 150).w).toBe(150);
  });

  it("is moved inside the frame, and as large as the frame where the frame is smaller", () => {
    expect(cropBox([{ x: 2, y: 3 }], 400, 400, 0)).toEqual({ x: 0, y: 0, w: CROP_MIN, h: CROP_MIN });
    expect(cropBox([{ x: 399, y: 399 }], 400, 400, 0)).toEqual({ x: 400 - CROP_MIN, y: 400 - CROP_MIN, w: CROP_MIN, h: CROP_MIN });
    expect(cropBox([{ x: 4, y: 3 }], 8, 6, 0)).toEqual({ x: 0, y: 0, w: 8, h: 6 });
  });
});

/** A lane mapping with no perspective: board u at 10 px per board, a foot at 8 px up from y = 600. */
const H: Mat3 = [10, 0, 0, 0, -8, 600, 0, 0, 1];
const W = 400;
const HT = 640;
const frameAt = (i: number): GrayFrame => ({ width: W, height: HT, t: i / 30, data: Uint8ClampedArray.from({ length: W * HT }, (_, k) => (k + i) % 251) });
const source = { count: 100, frame: frameAt };

const seen = (frame: number, v: number, u = 20): BallSighting => ({
  frame, t: frame / 30, cx: 10 * u, cy: 600 - 8 * v - 20, r: 20, contact: { x: 10 * u, y: 600 - 8 * v }, u, v, weight: 1, airborne: false
});
/** A sighting every 3 ft from 1 ft to 58 ft, a frame each. */
const SIGHTINGS = Array.from({ length: 20 }, (_, k) => seen(10 + k, 1 + 3 * k));
const m = (value: number | null, state: Metric["state"] = "measured"): Metric => ({ value, state });

function made(patch: { metrics?: Partial<TrackResult["metrics"]>; sightings?: BallSighting[]; touchdownFrame?: number | null; pinFrame?: number | null; debug?: Partial<TraceDebug> } = {}): TraceOutput {
  const metrics = {
    laydown: m(20), touchdown: m(20), touchdownFeet: m(2), arrows: m(20), breakpoint: m(20), breakpointFeet: m(40), pins: m(20),
    speed: m(15), speedAtPins: m(14), launchSpeed: m(17), entrySpeed: m(14), entryAngle: m(3), launchAngle: m(1), ...patch.metrics
  } as TrackResult["metrics"];
  const result = {
    ok: true, hand: "left", sightings: patch.sightings ?? SIGHTINGS, path: { kind: "hook", u0: 20, a: 0, s: 30, L: 20, k: 0 }, from: 1, to: 58, rms: 0.1, metrics,
    motion: { v0: 0, w: 20, d: 0 }, touchdownFrame: patch.touchdownFrame === undefined ? 10 : patch.touchdownFrame, pinFrame: patch.pinFrame === undefined ? null : patch.pinFrame
  } as TrackResult;
  const geometry = Array.from({ length: 100 }, (_, i) => ({ index: i, ok: true, H }));
  return { result, debug: { geometry, first: 0, ...patch.debug } as unknown as TraceDebug };
}
const shotOf = (out: TraceOutput, key: string) => readingShots(out, source).find((s) => s.reading === key);

describe("readingShots", () => {
  it("keeps one crop for each board reading and two for each speed, in the order the result lists them", () => {
    const shots = readingShots(made(), source);
    expect(shots.map((s) => s.reading)).toEqual(["laydown", "touchdown", "arrows", "breakpoint", "pins", "launchSpeed", "entrySpeed"]);
    expect(shots.map((s) => s.parts.length)).toEqual([1, 1, 1, 1, 1, 2, 2]);
    for (const p of shots.flatMap((s) => s.parts)) {
      expect(p.gray.length).toBe(p.width * p.height);
      expect(p.width).toBeLessThanOrEqual(CROP_MAX);
      expect(p.height).toBeLessThanOrEqual(CROP_MAX);
    }
  });

  it("cuts the crop from the frame the reading was taken on, with the ball and the base in the crop's pixels", () => {
    const arrows = shotOf(made(), "arrows")!;
    // The nearest sighting to 15 ft: 16 ft, the 6th (frame 15).
    const [p] = arrows.parts;
    expect(p.frame).toBe(15);
    expect(p.t).toBeCloseTo(15 / 30, 6);
    const s = SIGHTINGS[5];
    // The crop's pixel (x, y) is the frame's (x + ox, y + oy), and the disc's center is the sighting's (the half pixel is the canvas's).
    const ox = s.cx + 0.5 - p.disc!.cx;
    const oy = s.cy + 0.5 - p.disc!.cy;
    expect(Number.isInteger(Math.round(ox))).toBe(true);
    const src = frameAt(15).data;
    expect(p.gray[3 * p.width + 5]).toBe(src[(3 + Math.round(oy)) * W + 5 + Math.round(ox)]);
    // The base: one radius straight down from the ball's center.
    expect(p.cross!.x).toBeCloseTo(p.disc!.cx, 6);
    expect(p.cross!.y).toBeCloseTo(p.disc!.cy + p.disc!.r, 6);
    expect(p.feet).toBeCloseTo(16, 6);
    // The board's line runs up the lane through the reading's board: the left hand's board 20 is lane u 20.
    const [a, b] = p.line!;
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.x).toBeCloseTo(10 * laneU(20, "left") - Math.round(ox) + 0.5, 6);
    expect(a.y).toBeGreaterThan(b.y);
  });

  it("keeps the crop inside the frame", () => {
    const near = made({ sightings: [seen(10, 1, 0.6), ...SIGHTINGS.slice(1)] });
    const p = shotOf(near, "touchdown")!.parts[0];
    expect(p.width).toBeGreaterThan(0);
    expect(p.disc!.cx).toBeGreaterThan(0);
  });

  it("says a reading is estimated when its state says so, and puts the cross where the fitted path is rather than under the ball", () => {
    const out = made({ metrics: { arrows: m(17, "estimated") } });
    const s = shotOf(out, "arrows")!;
    expect(s.estimated).toBe(true);
    const [p] = s.parts;
    // On the board 17 (the left hand's own) at the reading's 15 ft: x = 170, y = 600 - 120, in the crop's pixels.
    const ox = SIGHTINGS[5].cx + 0.5 - p.disc!.cx;
    const oy = SIGHTINGS[5].cy + 0.5 - p.disc!.cy;
    expect(p.cross!.x).toBeCloseTo(170 - ox + 0.5, 6);
    expect(p.cross!.y).toBeCloseTo(480 - oy + 0.5, 6);
    expect(shotOf(made(), "arrows")!.estimated).toBe(false);
  });

  it("says estimated when the nearest sighting is more than a foot from the reading's distance", () => {
    const gappy = SIGHTINGS.filter((s) => s.v < 8 || s.v > 22);
    expect(shotOf(made({ sightings: gappy }), "arrows")!.estimated).toBe(true);
    expect(shotOf(made({ sightings: gappy }), "breakpoint")!.estimated).toBe(false);
  });

  it("has no picture for a reading with no value", () => {
    const out = made({ metrics: { arrows: m(null, "missing"), entrySpeed: m(null, "missing"), launchSpeed: m(null, "missing") } });
    const keys = readingShots(out, source).map((s) => s.reading);
    expect(keys).toEqual(["laydown", "touchdown", "breakpoint", "pins"]);
  });

  it("has none for a trace that failed, or one that saw no ball", () => {
    expect(readingShots({ result: { ok: false, failure: "ball-not-found", detail: "" }, debug: {} as TraceDebug }, source)).toEqual([]);
    expect(readingShots(made({ sightings: [] }), source)).toEqual([]);
  });

  it("keeps the ball without a cross or a line when the frame has no lane mapping", () => {
    const out = made();
    out.debug.geometry = out.debug.geometry.map((g) => ({ ...g, ok: false, H: null as unknown as Mat3 }));
    const p = shotOf(out, "arrows")!.parts[0];
    expect(p.disc).not.toBeNull();
    expect(p.cross).toBeNull();
    expect(p.line).toBeNull();
    expect(shotOf(out, "arrows")!.estimated).toBe(false);
  });

  it("keeps no picture for a frame the source does not have", () => {
    const short = { count: 12, frame: frameAt };
    const shots = readingShots(made(), short);
    expect(shots.find((s) => s.reading === "arrows")).toBeUndefined();
    expect(shots.find((s) => s.reading === "laydown")).toBeDefined();
  });

  it("shows the first and last frame of the stretch a speed was measured over, each with the row it was at", () => {
    const launch = shotOf(made(), "launchSpeed")!;
    expect(launch.estimated).toBe(false);
    expect(launch.parts.map((p) => p.frame)).toEqual([10, 14]);
    expect(launch.parts.map((p) => p.feet)).toEqual([1, 13]);
    for (const p of launch.parts) {
      const [a, b] = p.line!;
      expect(a.y).toBeCloseTo(b.y, 6);
    }
    const entry = shotOf(made(), "entrySpeed")!;
    expect(entry.parts.map((p) => p.feet)).toEqual([46, 58]);
  });

  it("stops the entry stretch where the rack moved, and says a speed is estimated when it is", () => {
    const entry = shotOf(made({ pinFrame: 26, metrics: { entrySpeed: m(14, "estimated") } }), "entrySpeed")!;
    expect(entry.estimated).toBe(true);
    // Frames 10 + k hold the sightings at 1 + 3k ft: frame 25 is 46 ft; 26 on is after the rack moved.
    expect(entry.parts.map((p) => p.frame)).toEqual([25]);
  });

  it("keeps one frame when the stretch is one frame, and none when there is none", () => {
    const one = made({ sightings: [seen(10, 5), ...SIGHTINGS.filter((s) => s.v > 20)] });
    expect(shotOf(one, "launchSpeed")!.parts).toHaveLength(1);
    expect(shotOf(made({ sightings: SIGHTINGS.filter((s) => s.v > 20), metrics: { launchSpeed: m(17) } }), "launchSpeed")).toBeUndefined();
  });

  it("drops a speed whose frames the source lacks", () => {
    expect(readingShots(made(), { count: 11, frame: frameAt }).find((s) => s.reading === "launchSpeed")?.parts.map((p) => p.frame)).toEqual([10]);
    expect(readingShots(made(), { count: 5, frame: frameAt }).find((s) => s.reading === "launchSpeed")).toBeUndefined();
  });

  it("takes a laydown followed to the foul line on the frame it was followed to, and calls it measured", () => {
    const release = { track: [{ frame: 12, cx: 200, cy: 590, r: 20, contrast: 30 }], at: 12, reached: true, point: { x: 200, y: 600 }, u: 20, by: "image" };
    const s = shotOf(made({ debug: { release } as never }), "laydown")!;
    expect(s.estimated).toBe(false);
    expect(s.parts[0].frame).toBe(12);
    expect(s.parts[0].feet).toBe(0);
  });
});

describe("speedStretch", () => {
  it("takes the launch stretch from the foul line to 15 ft, and the entry stretch the last 15 ft before the rack moved", () => {
    const r = made().result as TrackResult;
    expect(speedStretch("launchSpeed", r).map((s) => s.v)).toEqual([1, 4, 7, 10, 13]);
    expect(speedStretch("entrySpeed", r).map((s) => s.v)).toEqual([46, 49, 52, 55, 58]);
    expect(speedStretch("entrySpeed", { ...r, pinFrame: 28 }).map((s) => s.v)).toEqual([46, 49, 52]);
  });

  it("leaves out a ball still in the air", () => {
    const r = made().result as TrackResult;
    expect(speedStretch("launchSpeed", { ...r, sightings: r.sightings.map((s) => (s.v < 5 ? { ...s, airborne: true } : s)) }).map((s) => s.v)).toEqual([7, 10, 13]);
  });
});

describe("isEstimated", () => {
  const run = (patch?: Parameters<typeof made>[0]): Ok => {
    const o = made(patch);
    return { result: o.result as TrackResult, debug: o.debug };
  };
  const estimated = (name: Parameters<typeof isEstimated>[0], r: Ok) => {
    const p = pickFrame(name, r, "left", null, "test")!;
    return isEstimated(name, r, p, "left");
  };

  it("says a laydown not followed to the foul line, and a touchdown with no first contact, are estimated", () => {
    expect(estimated("laydown", run())).toBe(true);
    expect(estimated("touchdown", run())).toBe(false);
    expect(estimated("touchdown", run({ touchdownFrame: null }))).toBe(true);
  });

  it("says a board at the pins read short of them is estimated unless it was followed to them", () => {
    const short = run({ sightings: SIGHTINGS.filter((s) => s.v < 52) });
    expect(estimated("pins", short)).toBe(true);
    // Followed past its last sighting to the last frame before a pin moved: read on the ball, not the path.
    const followed = run({ debug: { pinsRead: { frame: 29, u: 20, frames: [27, 28, 29] } } });
    expect(estimated("pins", followed)).toBe(false);
    expect(estimated("pins", run())).toBe(true);
  });
});

describe("a traced synthetic shot", () => {
  const spec = standardShot({ hand: "right", body: true, fps: 30 });
  const src = syntheticSource(spec);
  const calib = src.count - 2;
  const out = trace({ source: src, calibFrame: calib, marks: roughMarks(spec, calib), hand: "right" });

  it("comes with the frame behind each reading, cut where the tracer still has it", () => {
    expect(out.shots!.map((s) => s.reading)).toEqual(["laydown", "touchdown", "arrows", "breakpoint", "pins", "launchSpeed", "entrySpeed"]);
    expect(out.shots!.every((s) => !s.estimated)).toBe(true);
    const total = out.shots!.flatMap((s) => s.parts).reduce((a, p) => a + p.gray.length, 0);
    // Seven readings, nine crops: well under a megabyte, the frames of the read being tens of megabytes.
    expect(total).toBeLessThan(600_000);
  });

  it("puts the ball in the middle of its crop, with the cross under it, on the pixels of the frame it was seen on", () => {
    const r = out.result as TrackResult;
    // Where the circle is the sighting's own (the pins' is the follow's).
    for (const s of out.shots!.filter((x) => x.reading !== "pins" && x.reading !== "laydown" && x.reading !== "entrySpeed")) {
      for (const p of s.parts) {
        const sighting = r.sightings.find((x) => x.frame === p.frame);
        if (!sighting || !p.disc) continue;
        expect(Math.abs(p.disc.cx - p.width / 2)).toBeLessThan(0.2 * p.width + 1);
        expect(p.cross!.y).toBeGreaterThan(p.disc.cy);
        // The crop's own pixel under the ball's center is the frame's.
        const f = src.frame(p.frame);
        const ox = Math.round(sighting.cx + 0.5 - p.disc.cx);
        const oy = Math.round(sighting.cy + 0.5 - p.disc.cy);
        expect(p.gray[Math.floor(p.disc.cy) * p.width + Math.floor(p.disc.cx)]).toBe(f.data[(Math.floor(p.disc.cy) + oy) * f.width + Math.floor(p.disc.cx) + ox]);
      }
    }
  });
}, 60_000);

describe("videoFrameNumber", () => {
  const times = [0, 0.1, 0.2, 0.3, 0.4];
  it("is the index of the frame the file shows nearest the time, counted from 0", () => {
    expect(videoFrameNumber(0, { times, step: null })).toBe(0);
    expect(videoFrameNumber(0.21, { times, step: 0.5 })).toBe(2);
    expect(videoFrameNumber(0.26, { times, step: null })).toBe(3);
    expect(videoFrameNumber(9, { times, step: null })).toBe(4);
    expect(videoFrameNumber(0.25, { times: [0, 0.5], step: null })).toBe(0);
  });

  it("falls back to the time over the video's own step, and to nothing without either", () => {
    expect(videoFrameNumber(3.9, { times: null, step: 1 / 60 })).toBe(234);
    expect(videoFrameNumber(3.9, { times: [], step: 1 / 60 })).toBe(234);
    expect(videoFrameNumber(-1, { times: null, step: 0.1 })).toBe(0);
    expect(videoFrameNumber(3.9, { times: null, step: null })).toBeNull();
  });
});
