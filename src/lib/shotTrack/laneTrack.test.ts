import { describe, expect, it } from "vitest";
import { apply, invert, multiply, normalize } from "./homography";
import { blendLanes, laneDisagreement, laneTrack, type FrameLane } from "./laneTrack";
import { cameraAt, laneHomography } from "./synthetic";
import { standardShot } from "./syntheticSource";
import type { Mat3 } from "./types";

const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const shift = (dx: number, dy = 0): Mat3 => [1, 0, dx, 0, 1, dy, 0, 0, 1];
/** A lane mapping: 4 pixels a board across, perspective along. */
const LANE: Mat3 = normalize([4, 0, 300, 0, -6, 600, 0, 0.012, 1]);
/** Boards between where two mappings put the lane's corners. */
const boards = (A: Mat3, B: Mat3) => laneDisagreement(A, B).boards;

describe("laneDisagreement", () => {
  it("is zero for the same mapping and a board for a board's shift", () => {
    expect(boards(LANE, LANE)).toBeLessThan(1e-9);
    expect(laneDisagreement(LANE, LANE).feet).toBeLessThan(1e-9);
    const moved = multiply(LANE, shift(1));
    expect(boards(moved, LANE)).toBeCloseTo(1, 6);
    expect(laneDisagreement(multiply(LANE, shift(0, 2)), LANE).feet).toBeCloseTo(2, 6);
  });
});

describe("blendLanes", () => {
  it("is null with nothing to blend and the mapping itself with one", () => {
    expect(blendLanes([])).toBeNull();
    expect(blendLanes([{ H: LANE, w: 0 }])).toBeNull();
    expect(boards(blendLanes([{ H: LANE, w: 1 }])!, LANE)).toBeLessThan(1e-9);
  });

  it("lands between two mappings by their weights", () => {
    const a = multiply(LANE, shift(-1));
    const b = multiply(LANE, shift(1));
    expect(boards(blendLanes([{ H: a, w: 1 }, { H: b, w: 1 }])!, LANE)).toBeLessThan(1e-6);
    const leaning = blendLanes([{ H: a, w: 3 }, { H: b, w: 1 }])!;
    // A quarter of the way from a to b: half a board left of the middle.
    const q = apply(invert(LANE), apply(leaning, { x: 20, y: 0 }));
    expect(q.x).toBeCloseTo(19.5, 3);
  });
});

describe("laneTrack", () => {
  // A camera that pans 3 pixels a frame: frame k's pixels are the first's moved by 3k.
  const S = (k: number): Mat3 => shift(3 * k, 0.5 * k);
  const truth = (k: number) => normalize(multiply(S(k), LANE));
  const carry = (from: number, to: number) => normalize(multiply(S(to), invert(S(from))));
  const frames = Array.from({ length: 50 }, (_, k) => k);

  it("gives every frame the lane carried from the found frames near it", () => {
    const lanes: FrameLane[] = [0, 10, 20, 30, 40].map((k) => ({ frame: k, H: truth(k) }));
    const { H, kept, dropped } = laneTrack(lanes, carry, frames);
    expect(kept).toHaveLength(5);
    expect(dropped).toHaveLength(0);
    for (const k of frames) expect(boards(H.get(k)!, truth(k))).toBeLessThan(1e-6);
  });

  it("drops a lane that disagrees with the rest", () => {
    const wrong = { frame: 20, H: normalize(multiply(truth(20), shift(3))) };
    const lanes: FrameLane[] = [{ frame: 0, H: truth(0) }, { frame: 10, H: truth(10) }, wrong, { frame: 30, H: truth(30) }, { frame: 40, H: truth(40) }];
    const { H, dropped } = laneTrack(lanes, carry, frames);
    expect(dropped).toEqual([wrong]);
    expect(boards(H.get(20)!, truth(20))).toBeLessThan(1e-6);
  });

  it("drops a run of frames that found the next lane, though they are as many as the right ones near them", () => {
    // shot-01: frames 210, 220 and 230 took the next lane; 200 and 240 to 270 did not.
    const next = (k: number) => normalize(multiply(truth(k), shift(41.5)));
    const lanes: FrameLane[] = [0, 10, 20, 30, 40, 50, 60, 70].map((k) => ({ frame: k, H: k >= 30 && k <= 50 ? next(k) : truth(k) }));
    const { H, kept, dropped, checks } = laneTrack(lanes, carry, frames);
    expect(dropped.map((l) => l.frame)).toEqual([30, 40, 50]);
    expect(kept.map((l) => l.frame)).toEqual([0, 10, 20, 60, 70]);
    expect(checks.find((c) => c.frame === 60)!.agree).toBe(4);
    expect(boards(H.get(40)!, truth(40))).toBeLessThan(1e-6);
  });

  it("keeps only the anchor's lane, the heaviest unless named, where the finder took another lane on most frames", () => {
    const next = (k: number) => normalize(multiply(truth(k), shift(41.5)));
    const lanes: FrameLane[] = [
      ...[0, 5, 10, 15, 20, 25, 30].map((k) => ({ frame: k, H: next(k), weight: 0.7 })),
      ...[35, 40, 45].map((k) => ({ frame: k, H: truth(k), weight: 1.2 }))
    ];
    const r = laneTrack(lanes, carry, frames);
    expect(r.kept.map((l) => l.frame)).toEqual([35, 40, 45]);
    expect(boards(r.H.get(0)!, truth(0))).toBeLessThan(1e-6);
    // Named, the anchor wins whatever the weights.
    expect(laneTrack(lanes, carry, frames, { anchor: 10 }).kept.map((l) => l.frame)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    // A lane that cannot be carried to the anchor cannot be checked, and is dropped.
    const cut = (from: number, to: number) => (from < 20 && to >= 35 ? null : carry(from, to));
    expect(laneTrack(lanes.map((l) => ({ ...l, H: truth(l.frame) })), cut, frames).dropped.map((l) => l.frame)).toEqual([0, 5, 10, 15]);
  });

  it("averages the noise of single frames and counts a guess for less", () => {
    const noisy: FrameLane[] = [0, 4, 8, 12, 16, 20].map((k, i) => ({ frame: k, H: normalize(multiply(truth(k), shift(i % 2 ? 0.3 : -0.3))) }));
    const { H } = laneTrack(noisy, carry, [10], { reach: 40 });
    expect(boards(H.get(10)!, truth(10))).toBeLessThan(0.05);
    const guessed = laneTrack([{ frame: 0, H: truth(0) }, { frame: 1, H: normalize(multiply(truth(1), shift(0.8))), guess: true }], carry, [0], { reach: 1000 });
    // Weighted 1 to 0.25: a fifth of the guess's 0.8 boards.
    expect(boards(guessed.H.get(0)!, truth(0))).toBeCloseTo(0.16, 2);
  });

  it("follows a registration that drifts, where one calibration carried through does not", () => {
    // The registration is off by a tenth of a pixel more each frame (on a
    // hand-held phone it drifts with the frames it is chained over).
    const drifting = (from: number, to: number) => normalize(multiply(shift(0.1 * (to - from)), carry(from, to)));
    const lanes: FrameLane[] = Array.from({ length: 11 }, (_, i) => ({ frame: 5 * i, H: truth(5 * i) }));
    const { H } = laneTrack(lanes, drifting, frames, { reach: 6 });
    const one = (k: number) => normalize(multiply(drifting(0, k), truth(0)));
    expect(boards(one(49), truth(49))).toBeGreaterThan(1);
    // The two end lanes agree with fewer others under this much drift and are
    // left out, so the end frames are carried a little further.
    for (const k of frames) expect(boards(H.get(k)!, truth(k))).toBeLessThan(k < 5 || k > 45 ? 0.25 : 0.1);
  });

  it("leaves out frames nothing can be carried to and keeps lanes it cannot check", () => {
    const lanes: FrameLane[] = [{ frame: 0, H: truth(0) }, { frame: 10, H: truth(10) }];
    const only0 = (from: number, to: number) => (to === 0 || from === to ? carry(from, to) : null);
    const { H, kept } = laneTrack(lanes, only0, [0, 5, 10]);
    expect(kept).toHaveLength(2);
    expect(H.has(5)).toBe(false);
    expect(boards(H.get(10)!, truth(10))).toBeLessThan(1e-9);
    expect(boards(H.get(0)!, truth(0))).toBeLessThan(1e-6);
  });

  it("blends real lane mappings of a moving synthetic camera", () => {
    const spec = standardShot({ width: 360, height: 640 });
    const Hk = (k: number) => laneHomography(cameraAt(spec, k));
    // The true picture transform between frames, from the lanes themselves.
    const carryTrue = (from: number, to: number) => normalize(multiply(Hk(to), invert(Hk(from))));
    const { H } = laneTrack([0, 20, 40].map((k) => ({ frame: k, H: Hk(k) })), carryTrue, [30]);
    expect(boards(H.get(30)!, Hk(30))).toBeLessThan(1e-3);
    expect(I).toBeDefined();
  });
});
