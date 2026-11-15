import { describe, expect, it } from "vitest";
import type { Candidate } from "./ballDetect";
import { makeFrame } from "./image";
import { BALL_DIAMETER_BOARDS } from "./laneModel";
import { followNear, nearSeeds } from "./nearFollow";
import type { GrayFrame, Mat3 } from "./types";

/** Lane (u boards, v feet) to picture: 5 px a board across, 20 px a foot up the picture from row 400. */
const H: Mat3 = [5, 0, 50, 0, -20, 400, 0, 0, 1];
const R = (BALL_DIAMETER_BOARDS / 2) * 5;
const FPS = 60;
const vAt = (i: number) => 2 + 0.4 * i;

/** A dark ball rolling up the bright lane at board 20, hidden from frame `hideFrom` on. */
function frameAt(i: number, hideFrom = 26): GrayFrame {
  const f = makeFrame(300, 440, i / FPS, 200);
  if (i >= hideFrom) return f;
  const cx = 50 + 5 * 20;
  const cy = 400 - 20 * vAt(i) - R;
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) if (Math.hypot(x - cx, y - cy) <= R) f.data[y * f.width + x] = 30;
  return f;
}

const cand = (frame: number, u: number, v: number): Candidate => ({ frame, t: frame / FPS, x: 0, y: 0, r: R, u, v, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, area: 1 });

describe("nearSeeds", () => {
  it("keeps the last candidate of each run that moves up the lane, longest first", () => {
    const ball = [cand(1, 20, 1), cand(2, 20.2, 1.4), cand(4, 20.3, 2.2), cand(5, 20.3, 2.6)];
    const shoe = [1, 2, 3, 4, 5, 6].map((f) => cand(f, 30, 4.6));
    const short = [cand(10, 5, 3), cand(11, 5, 3.4)];
    const far = [cand(1, 12, 20), cand(2, 12, 20.5), cand(3, 12, 21)];
    const fast = [cand(20, 25, 1), cand(21, 25, 5), cand(22, 25, 9)];
    expect(nearSeeds([...shoe, ...ball, ...short, ...far, ...fast])).toEqual([ball[3]]);
    const longer = [...ball, cand(6, 20.4, 3)];
    expect(nearSeeds([...longer, cand(30, 10, 1), cand(31, 10, 1.4), cand(32, 10, 1.8)])[0]).toBe(longer[4]);
  });
});

describe("followNear", () => {
  const frame = (i: number) => (i < 40 ? frameAt(i) : null);
  const lane = () => H;

  it("follows the ball up the lane until it is hidden, as candidates with the lane's radius", () => {
    const seed = { frame: 0, x: 150, y: 400 - 20 * vAt(0) - R };
    const out = followNear(frame, lane, seed, 39);
    expect(out.map((c) => c.frame)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    for (const c of out) {
      expect(Math.abs(c.u - 20)).toBeLessThan(0.3);
      expect(Math.abs(c.v - vAt(c.frame))).toBeLessThan(0.1);
      expect(c.r).toBeCloseTo(R, 5);
      expect(c.t).toBeCloseTo(c.frame / FPS, 9);
    }
  });

  it("stops where the frame or its lane is missing, and gives nothing from a frame that is", () => {
    const seed = { frame: 0, x: 150, y: 400 - 20 * vAt(0) - R };
    expect(followNear(frame, (i) => (i < 10 ? H : null), seed, 39)).toHaveLength(9);
    expect(followNear((i) => (i < 6 ? frameAt(i) : null), lane, seed, 39).length).toBeLessThanOrEqual(5);
    expect(followNear(frame, () => null, seed, 39)).toEqual([]);
  });

  it("stops where the disc shrinks under the lane's radius (going behind something)", () => {
    // From frame 10 on the lane mapping says the ball is twice as wide as the dark disc.
    const wide: Mat3 = [10, 0, -50, 0, -20, 400, 0, 0, 1];
    const seed = { frame: 0, x: 150, y: 400 - 20 * vAt(0) - R };
    expect(followNear(frame, (i) => (i < 10 ? H : wide), seed, 39).map((c) => c.frame)).toEqual(Array.from({ length: 9 }, (_, i) => i + 1));
  });

  it("stops where the ball would move back down the lane", () => {
    // From frame 8 on the lane mapping puts every point 3 ft nearer the foul line.
    const back: Mat3 = [5, 0, 50, 0, -20, 340, 0, 0, 1];
    const seed = { frame: 0, x: 150, y: 400 - 20 * vAt(0) - R };
    expect(followNear(frame, (i) => (i < 8 ? H : back), seed, 39)).toHaveLength(7);
  });
});
