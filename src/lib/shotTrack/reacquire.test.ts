import { describe, expect, it } from "vitest";
import { makeFrame } from "./image";
import { BALL_DIAMETER_BOARDS } from "./laneModel";
import { darkDisk, diskScore, findAfterGap, gapCandidates, gapTrack, MIN_GAP_TRACK, placeByRim, stillDark, type GapCandidate } from "./reacquire";
import type { GrayFrame, Mat3 } from "./types";

/** Lane (u boards, v feet) to picture: 4 px a board across, 6 px a foot up the picture from row 400. */
const H: Mat3 = [4, 0, 20, 0, -6, 400, 0, 0, 1];
const R = (BALL_DIAMETER_BOARDS / 2) * 4;
const radius = () => R;
const FPS = 60;
/** The ball: 22 ft a second from 20 ft at t = 0, from board 30 turning toward board 22 past 40 ft. */
const vAt = (t: number) => 20 + 22 * t;
const uAt = (v: number) => (v < 40 ? 30 : 30 - 0.4 * (v - 40));

function disc(f: GrayFrame, cx: number, cy: number, r: number, grey: number) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(f.height - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(f.width - 1, Math.ceil(cx + r)); x++) if (Math.hypot(x - cx, y - cy) <= r) f.data[y * f.width + x] = grey;
}

/**
 * Frame `i` of a bright lane: the ball standing on its lane spot, a dark
 * mark that never moves at board 10, 55 ft, and the bowler (a dark block)
 * across the lane over the ball's stretch from 26 to 50 ft.
 */
function frameAt(i: number, ball = true): GrayFrame {
  const t = i / FPS;
  const f = makeFrame(200, 420, t, 200);
  disc(f, 20 + 4 * 10, 400 - 6 * 55 - R, R, 30);
  const v = vAt(t);
  if (ball && v <= 60) disc(f, 20 + 4 * uAt(v), 400 - 6 * v - R, R, 40);
  for (let y = 400 - 6 * 50; y <= 400 - 6 * 26; y++) for (let x = 0; x < f.width; x++) f.data[y * f.width + x] = 10;
  return f;
}

const cand = (frame: number, u: number, v: number, score = 100): GapCandidate => ({ frame, t: frame / FPS, cx: 0, cy: 0, r: R, u, v, score, inner: 40 });

describe("darkDisk and diskScore", () => {
  it("scores a dark disk with the bright lane round it, and nothing on a dark edge or a plain lane", () => {
    const f = makeFrame(80, 80, 0, 200);
    disc(f, 40, 40, 8, 30);
    const down = { x: 0, y: 1 };
    const d = darkDisk(f, { x: 40, y: 40 }, 8, down)!;
    expect(d.inner).toBeCloseTo(30, 5);
    expect(d.bright).toBe(1);
    expect(diskScore(d)).toBeGreaterThan(100);
    // Half of what is round it is as dark as the ball (a leg beside it).
    for (let y = 0; y < 80; y++) for (let x = 0; x < 40; x++) f.data[y * 80 + x] = 20;
    expect(diskScore(darkDisk(f, { x: 40, y: 40 }, 8, down))).toBe(0);
    expect(diskScore(darkDisk(makeFrame(80, 80, 0, 200), { x: 40, y: 40 }, 8, down))).toBe(0);
    expect(darkDisk(f, { x: 2, y: 40 }, 8, down)).toBeNull();
  });

  it("leaves the ring's lower side out, where the ball's mirror image hangs", () => {
    const f = makeFrame(80, 80, 0, 200);
    disc(f, 40, 52, 8, 60);
    disc(f, 40, 40, 8, 30);
    expect(darkDisk(f, { x: 40, y: 40 }, 8, { x: 0, y: 1 })!.bright).toBe(1);
  });
});

describe("gapCandidates", () => {
  it("finds the ball where it stands on the lane, at its own size", () => {
    const i = 90; // 53 ft, board 24.8
    const [best] = gapCandidates(frameAt(i), H, i, 50, 56, 20, 35, radius);
    // On the half-board, half-foot grid it is stepped on.
    expect(Math.abs(best.u - uAt(vAt(i / FPS)))).toBeLessThan(1);
    expect(Math.abs(best.v - vAt(i / FPS))).toBeLessThan(1);
    expect(best.r).toBe(R);
    expect(best.frame).toBe(i);
  });

  it("keeps the best few that do not overlap", () => {
    const out = gapCandidates(frameAt(90), H, 90, 40, 60, 0, 39, radius);
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) expect(Math.hypot(out[a].cx - out[b].cx, out[a].cy - out[b].cy)).toBeGreaterThan(R);
  });
});

describe("stillDark", () => {
  const refs = [{ f: frameAt(0, false), H }];
  it("is true of a mark as dark before the ball could be there, false of the ball", () => {
    const [mark] = gapCandidates(frameAt(90), H, 90, 53, 57, 6, 14, radius);
    expect(stillDark(mark, refs, radius)).toBe(true);
    const [ball] = gapCandidates(frameAt(90), H, 90, 50, 56, 20, 35, radius);
    expect(stillDark(ball, refs, radius)).toBe(false);
    expect(stillDark(ball, [], radius)).toBe(false);
  });
});

describe("gapTrack", () => {
  it("chains the candidates one ball can have made, turning across as it goes", () => {
    const ball = [70, 72, 74, 76, 78].map((i) => cand(i, uAt(vAt(i / FPS)), vAt(i / FPS)));
    const stray = [cand(71, 5, 46), cand(73, 30, 30), cand(75, 25, 59)];
    expect(gapTrack([...stray, ...ball], 22)).toEqual(ball);
  });

  it("finds nothing shorter than its fewest", () => {
    const ball = [70, 72, 74].map((i) => cand(i, 28, vAt(i / FPS)));
    expect(ball.length).toBeLessThan(MIN_GAP_TRACK);
    expect(gapTrack(ball, 22)).toEqual([]);
  });

  it("does not link candidates too far apart in time, going back, or too far across", () => {
    expect(gapTrack([cand(10, 28, 40), cand(12, 28, 41), cand(14, 28, 42), cand(60, 28, 60)], 22)).toEqual([]);
    expect(gapTrack([cand(10, 28, 44), cand(12, 28, 40), cand(14, 28, 36), cand(16, 28, 32)], 22)).toEqual([]);
    expect(gapTrack([cand(10, 28, 40), cand(12, 20, 41), cand(14, 28, 42), cand(16, 20, 43)], 22)).toEqual([]);
  });
});

describe("findAfterGap", () => {
  it("finds the ball again past the bowler, to the pins, and not the mark", () => {
    // Last seen at 25.5 ft (frame 15), then behind the bowler to 50 ft.
    const frames = Array.from({ length: 100 }, (_, k) => 16 + k).map((index) => ({ index, f: frameAt(index), H }));
    const found = findAfterGap({ frames: [{ index: 16, f: null, H: null }, ...frames], refs: [{ f: frameAt(0, false), H }], last: { v: vAt(15 / FPS), u: 30, t: 15 / FPS, speed: 22 }, radius });
    expect(found.length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...found.map((c) => c.v))).toBeGreaterThan(58);
    for (const c of found) {
      const v = vAt(c.t);
      // Where its top shows over the bowler, at 45 ft on, or past.
      expect(v).toBeGreaterThan(45);
      expect(v).toBeLessThanOrEqual(60.5);
      expect(Math.abs(c.u - uAt(v))).toBeLessThan(0.6);
      expect(Math.abs(c.v - v)).toBeLessThan(0.8);
    }
  });

  it("finds nothing when the ball never shows again, or with no pace", () => {
    const frames = Array.from({ length: 100 }, (_, k) => 16 + k).map((index) => ({ index, f: frameAt(index, false), H }));
    const last = { v: vAt(15 / FPS), u: 30, t: 15 / FPS, speed: 22 };
    expect(findAfterGap({ frames, refs: [{ f: frameAt(0, false), H }], last, radius })).toEqual([]);
    expect(findAfterGap({ frames, refs: [], last: { ...last, speed: 0 }, radius })).toEqual([]);
    expect(findAfterGap({ frames, refs: [], last: { ...last, v: 61 }, radius })).toEqual([]);
  });
});

describe("placeByRim", () => {
  it("moves a candidate onto the ball's rim, and leaves one where no rim shows", () => {
    const f = frameAt(75);
    const v = vAt(75 / FPS);
    const truth = { x: 20 + 4 * uAt(v), y: 400 - 6 * v - R };
    const off = { ...cand(75, 0, 0), cx: truth.x + 2, cy: truth.y - 1.5 };
    const placed = placeByRim(f, H, off);
    expect(Math.hypot(placed.cx - truth.x, placed.cy - truth.y)).toBeLessThan(0.5);
    expect(Math.abs(placed.u - uAt(v))).toBeLessThan(0.2);
    const blank = { ...cand(75, 3, 10), cx: 40, cy: 300 };
    expect(placeByRim(makeFrame(200, 420, 0, 200), H, blank)).toEqual(blank);
  });
});
