import { describe, expect, it } from "vitest";
import { apply } from "../lib/shotTrack/homography";
import { Notes } from "../lib/shotTrack/notes";
import type { ShotFound } from "../lib/shotTrack/shotStart";
import { frameCount, timeAt, truthAt, type SyntheticShot } from "../lib/shotTrack/synthetic";
import { standardShot, syntheticSource } from "../lib/shotTrack/syntheticSource";
import { readShot, type FrameReader } from "./readShot";
import type { VideoFrames } from "./videoFrames";

/**
 * `readShot` on a synthetic video: the frames of a synthetic shot, the true
 * lane on every sixth frame of a part as the lane search, and a first look
 * that guessed wrong.
 */
const sources = new Map<SyntheticShot, ReturnType<typeof syntheticSource>>();
function video(spec: SyntheticShot) {
  // Each spec's frames rendered once for every test that reads it.
  const src = sources.get(spec) ?? sources.set(spec, syntheticSource(spec)).get(spec)!;
  const step = 1 / spec.fps;
  const reads: { from: number; to: number }[] = [];
  const read: FrameReader = async (plan) => {
    reads.push({ from: plan.from, to: plan.to });
    const out: VideoFrames = { width: spec.camera.width, height: spec.camera.height, gray: [], times: [], src: step, step, missing: 0, via: "synthetic" };
    for (let i = 0; i < frameCount(spec); i++) {
      const t = i * step;
      if (t < plan.from - 1e-6 || t > plan.to + 1e-6) continue;
      out.gray.push(Uint8ClampedArray.from(src.frame(i).data));
      out.times.push(t);
    }
    return out;
  };
  // The lane on every sixth frame of a part, each the truth on its frame.
  const look = async (part: VideoFrames) =>
    part.times.flatMap((t, k) => (k % 6 === 0 ? [{ frame: k, H: truthAt(spec, Math.round(t * spec.fps)).H, weight: 1 }] : []));
  return { read, look, reads, info: { width: spec.camera.width, height: spec.camera.height, duration: spec.duration } };
}

/**
 * A run the first look saw, through the true lane: a point every fifteenth of a
 * second from `v0` feet at `fts` feet a second on board `u`, from `t0`.
 */
function lookRun(spec: SyntheticShot, t0: number, v0: number, fts: number, n = 5, u = 20) {
  return Array.from({ length: n }, (_, k) => {
    const t = t0 + k / 15;
    const p = apply(truthAt(spec, Math.round(t * spec.fps)).H, { x: u, y: v0 + fts * (t - t0) });
    return { t, x: p.x / spec.camera.width, y: p.y / spec.camera.height };
  });
}

const found = (over: Partial<ShotFound>): ShotFound => ({ start: 0, release: 0.5, pinHit: null, confidence: 0.5, run: [], ...over });

/** Rendering and reading a few seconds of synthetic video takes seconds, more under coverage. */
const SLOW = 90_000;

describe("readShot finds the ball whatever the first look picked", () => {
  // A 4 s video, the ball let go at 2.6 s; no ball on the next lane, a still camera.
  const spec: SyntheticShot = { ...standardShot({ duration: 4, seed: 3 }), releaseT: 2.6, distractor: false, drift: undefined, jitter: 0 };
  const crossing = timeAt(spec, 0);
  // The same with no ball in its 2.4 s.
  const hidden: SyntheticShot = { ...spec, duration: 2.4, releaseT: 9 };

  it("steps through the video to the ball when the look guessed a run long before it", async () => {
    const v = video(spec);
    const notes = new Notes();
    // The look's only run is the bowler at 0.5 s, 12 ft behind the foul line, and it was a guess.
    const guess = found({ release: 0.5, run: lookRun(spec, 0.5, -12, 6), guessed: true });
    const r = await readShot(v.read, guess, v.info, null, v.look, () => {}, true, notes);
    expect(r).not.toBe("no-shot");
    if (typeof r === "string") return;
    expect(r.window!.by).toBe("seen");
    expect(Math.abs(r.window!.foul! - crossing)).toBeLessThan(0.07);
    expect(r.window!.speed! / (5280 / 3600)).toBeGreaterThan(15);
    expect(r.frames.times[0]).toBeLessThanOrEqual(crossing - 0.3);
    // To the end of the video: the ball has not left the deck before it.
    expect(r.frames.times[r.frames.times.length - 1]).toBeGreaterThan(spec.duration - 0.1);
    // The first part, then parts of the video stepped through until the ball.
    expect(v.reads.length).toBeGreaterThan(2);
    expect(notes.text()).toMatch(/looked again/);
    expect(notes.text()).toMatch(/ball: foul line/);
  }, SLOW);

  it("does not take a run of the bowler's that crosses the foul line at a ball's speed when no ball rolls after it", async () => {
    const v = video(spec);
    const notes = new Notes();
    // At 0.8 s, from 3 ft behind the foul line to 7 ft past it at 25 ft/s: the look's run passes on the lane, but nothing rolls.
    const approach = lookRun(spec, 0.8, -3, 25);
    const r = await readShot(v.read, found({ release: 0.8, run: approach }), v.info, null, v.look, () => {}, true, notes);
    if (typeof r === "string") throw new Error(r);
    expect(notes.text()).toMatch(/window foul line 0\.9\d s/);
    expect(r.window!.by).toBe("seen");
    expect(Math.abs(r.window!.foul! - crossing)).toBeLessThan(0.07);
  }, SLOW);

  it("takes the look's run when the ball is seen nowhere, and says so", async () => {
    const v = video(hidden);
    const notes = new Notes();
    const r = await readShot(v.read, found({ release: 0.8, run: lookRun(hidden, 0.8, -3, 25) }), v.info, null, v.look, () => {}, true, notes);
    if (typeof r === "string") throw new Error(r);
    expect(r.window!.by).toBe("speed");
    expect(notes.text()).toMatch(/though no ball rolled after its crossing/);
  }, SLOW);

  it("says no shot when the look guessed, nothing passes and no ball is seen", async () => {
    const v = video(hidden);
    const r = await readShot(v.read, found({ release: 0.5, run: lookRun(hidden, 0.5, -12, 6), guessed: true }), v.info, null, v.look, () => {}, true);
    expect(r).toBe("no-shot");
  }, SLOW);
});
