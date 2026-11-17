import { describe, expect, it } from "vitest";
import { PIN_POSITIONS } from "../pinGeometry";
import { makeFrame } from "./image";
import { BALL_DIAMETER_IN, expectedRadiusPx } from "./laneModel";
import { firstPinMove, pinScores, pinShares, pinsInReach, REACH_BOARDS, type PinFrame } from "./pinMove";
import type { GrayFrame, Mat3 } from "./types";

/** Lane (u boards, v feet) to picture: 3 px a board across, 20 px a foot up the picture from row 340 at 58 ft. */
const H: Mat3 = [3, 0, 30, 0, -20, 340 + 20 * 58, 0, 0, 1];
const PIN_H = (15 / BALL_DIAMETER_IN) * 2 * expectedRadiusPx(H, 20, 60);
const FPS = 60;

interface Scene {
  /** Pins shifted across the picture, px, by pin number. */
  moved?: Partial<Record<number, number>>;
  /** A dark box over the picture (a bowler in front of the rack). */
  cover?: { x0: number; x1: number };
  /** A dark ball, picture pixels. */
  ball?: { cx: number; cy: number; r: number };
}

/** Ten bright pins standing on a dark deck, as `pinMove` samples them. */
function frameOf(i: number, s: Scene = {}): GrayFrame {
  const f = makeFrame(180, 360, i / FPS, 30);
  for (const [n, p] of Object.entries(PIN_POSITIONS)) {
    const cx = 30 + 3 * p.board + (s.moved?.[Number(n)] ?? 0);
    const base = 340 - 20 * (p.feet - 58);
    for (let y = Math.max(0, Math.round(base - PIN_H)); y <= Math.round(base); y++) for (let x = Math.round(cx - 6); x <= Math.round(cx + 6); x++) f.data[y * f.width + x] = 220;
  }
  if (s.cover) for (let y = 0; y < f.height; y++) for (let x = s.cover.x0; x < s.cover.x1; x++) f.data[y * f.width + x] = 25;
  if (s.ball) {
    const { cx, cy, r } = s.ball;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r) f.data[y * f.width + x] = 60;
  }
  return f;
}

const clip = (n: number, scene: (i: number) => Scene, ball?: (i: number) => PinFrame["ball"]): PinFrame[] =>
  Array.from({ length: n }, (_, i) => ({ index: 100 + i, t: i / FPS, f: frameOf(i, scene(i)), H, ball: ball?.(i) ?? null }));

describe("firstPinMove", () => {
  it("finds the first frame a pin moves, and nothing when none does", () => {
    const frames = clip(20, (i) => (i >= 12 ? { moved: { 3: 4 + (i - 12) } } : {}));
    const hit = firstPinMove(frames, 0);
    expect(hit?.index).toBe(112);
    expect(hit?.t).toBeCloseTo(12 / FPS, 9);
    expect(hit?.scores[11]).toBe(0);
    expect(hit!.scores[12]).toBeGreaterThan(0.2);
    expect(firstPinMove(clip(20, () => ({})), 0)).toBeNull();
    // Not before `from`: looked for from the last frame on, nothing is seen.
    expect(firstPinMove(frames, 19 / FPS)).toBeNull();
  });

  it("passes over one frame's jump of every pin, which is gone on the next", () => {
    const all = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4 };
    const frames = clip(20, (i) => (i === 8 ? { moved: all } : i >= 14 ? { moved: { 1: 5 } } : {}));
    expect(pinScores(frames)[8]).toBeGreaterThan(0.2);
    expect(firstPinMove(frames, 0)?.index).toBe(114);
  });

  it("does not take pins the bowler covered for pins, and looks from the ball's approach on", () => {
    // The right half of the rack is behind the bowler on frames 0 to 6 (shot-06).
    // A pin half behind the bowler (pin 1's edge) changes as it is uncovered,
    // like a pin moving: that is before the ball nears (`from`).
    const frames = clip(20, (i) => ({ ...(i < 7 ? { cover: { x0: 95, x1: 180 } } : {}), ...(i >= 13 ? { moved: { 6: 5 } } : {}) }));
    const shares = pinShares(frames);
    // Pin 6 (board 31.25, x 124) is no pin while the references still show the bowler.
    expect(shares[8][5]).toBeNaN();
    expect(firstPinMove(frames, 0)?.index).toBe(107);
    expect(firstPinMove(frames, 10 / FPS)?.index).toBe(113);
  });

  it("masks the ball and its mirror image out of the pins it passes in front of", () => {
    const ballAt = (i: number) => ({ cx: 30 + 3 * 14 + 2 * i, cy: 285, r: 12 });
    const scene = (i: number): Scene => ({ ball: ballAt(i) });
    expect(firstPinMove(clip(20, scene, ballAt), 0)).toBeNull();
    expect(firstPinMove(clip(20, scene), 0)).not.toBeNull();
  });

  it("counts only the pins the ball can reach first", () => {
    // Pin 7 (board 3.1) is knocked by something else at frame 9; the ball, on board 25, moves pin 3 at 15.
    const frames = clip(20, (i) => ({ moved: { ...(i >= 9 ? { 7: 5 } : {}), ...(i >= 15 ? { 3: 5 } : {}) } }));
    expect(firstPinMove(frames, 0)?.index).toBe(109);
    const reach = pinsInReach(() => 25);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(reach)).toEqual([1, 3, 5, 6, 9]);
    expect(reach(11)).toBe(false);
    expect(firstPinMove(frames, 0, reach)?.index).toBe(115);
    expect(REACH_BOARDS).toBe(10);
  });
});
