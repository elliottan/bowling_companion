import { describe, expect, it } from "vitest";
import { invert, multiply } from "./homography";
import { boxBlur, makeFrame, warp } from "./image";
import { steadySpan } from "./pipeline";
import { finishRegister, GIVE_UP_S, passFrames, PlanePass, RegisterPass, REKEY_ZOOM, turnHomography, type FrameGeometry, type Lens, type TurnParams } from "./registration";
import type { GrayFrame, Mat3 } from "./types";

const W = 320;
const H = 240;
/** The lens `RegisterPass` starts from for a W by H picture. */
const lens: Lens = { f: 1.5 * W, cx: (W - 1) / 2, cy: (H - 1) / 2 };

/** A textured scene twice the picture's size: blobs placed by a fixed sequence, blurred. */
function scene(): GrayFrame {
  const s = makeFrame(2 * W, 2 * H, 0, 90);
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 1400; k++) {
    const x = Math.floor(next() * 2 * W);
    const y = Math.floor(next() * 2 * H);
    const r = 2 + Math.floor(next() * 6);
    const v = 20 + next() * 220;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (x + i >= 0 && x + i < 2 * W && y + j >= 0 && y + j < 2 * H) s.data[(y + j) * 2 * W + x + i] = v;
  }
  return boxBlur(s, 1);
}

/** The picture of a camera turned and zoomed by `p` from the calibration frame (the scene's middle). */
function view(world: GrayFrame, p: TurnParams, t: number): GrayFrame {
  const M = multiply([1, 0, W / 2, 0, 1, H / 2, 0, 0, 1] as Mat3, invert(turnHomography(lens, p)));
  const f = warp(world, M, 0, 0, W, H);
  return { ...f, t, data: f.data.map((v) => (Number.isFinite(v) ? v : 90)) };
}

describe("RegisterPass key frames", () => {
  it("follows a zoom out to 0.6 of the calibration frame's scale, a key frame at a time", () => {
    const world = scene();
    // 1.7% a frame, with a slow pan: IMG_2938 zooms about 1% a frame at 30 a second.
    const params = (i: number): TurnParams => [0.0004 * i, -0.0006 * i, 0, -0.5 * (i / 30)];
    const frames = Array.from({ length: 31 }, (_, i) => view(world, params(i), i / 30));
    const pass = new RegisterPass(frames[0], { focal: lens.f });
    const matches = passFrames(0, 1, 0, 30).map((i) => pass.step(i, frames[i]));
    expect(matches.every((m) => m.ok)).toBe(true);
    expect(pass.rekeyed).toBeGreaterThanOrEqual(Math.floor(0.5 / REKEY_ZOOM) - 2);
    expect(pass.rekeyed).toBeGreaterThan(0);
    const geo = finishRegister({ width: W, height: H }, 0, [1, 0, 0, 0, 1, 0, 0, 0, 1], 0, matches, [], pass.patchCount, { focal: lens.f });
    for (const i of [10, 20, 30]) {
      expect(geo[i].zoom).toBeCloseTo(Math.exp(params(i)[3]), 2);
      expect(Math.abs(geo[i].turn[1] - params(i)[1]) * lens.f).toBeLessThan(1);
      // Matched by a key frame's patches, its share is of those.
      expect(geo[i].share).toBeGreaterThan(0.3);
    }
  }, 60000);

  it("keeps the calibration frame's patches for a camera that only shakes", () => {
    const world = scene();
    const params = (i: number): TurnParams => [0.002 * Math.sin(i), 0.003 * Math.cos(1.3 * i), 0.001 * Math.sin(0.7 * i), 0.01 * Math.sin(0.5 * i)];
    const frames = Array.from({ length: 12 }, (_, i) => view(world, params(i), i / 30));
    const pass = new RegisterPass(frames[0], { focal: lens.f });
    const matches = passFrames(0, 1, 0, 11).map((i) => pass.step(i, frames[i]));
    expect(matches.every((m) => m.ok && m.patches === undefined)).toBe(true);
    expect(pass.rekeyed).toBe(0);
  }, 60000);

  it("moves its key frame when the camera pans its patches out of the picture", () => {
    const world = scene();
    // 6 px a frame to the side: by frame 20 most of the calibration frame has left.
    const params = (i: number): TurnParams => [0, (6 * i) / lens.f, 0, 0];
    const frames = Array.from({ length: 26 }, (_, i) => view(world, params(i), i / 30));
    const pass = new RegisterPass(frames[0], { focal: lens.f });
    const matches = passFrames(0, 1, 0, 25).map((i) => pass.step(i, frames[i]));
    expect(matches.every((m) => m.ok)).toBe(true);
    expect(pass.rekeyed).toBeGreaterThan(0);
    expect(Math.abs(matches[24].p[1] - params(25)[1]) * lens.f).toBeLessThan(1);
  }, 60000);

  it("stops looking once the camera has left the picture for GIVE_UP_S, and so does the floor's pass", () => {
    const world = scene();
    const flat = makeFrame(W, H, 0, 90);
    // Steady for six frames, then a blank wall (the camera turned away) at 30 a second.
    const frames = Array.from({ length: 30 }, (_, i) => (i < 6 ? view(world, [0, 0, 0, 0], i / 30) : { ...flat, t: i / 30 }));
    const pass = new RegisterPass(frames[0], { focal: lens.f });
    const matches = passFrames(0, 1, 0, 29).map((i) => pass.step(i, frames[i]));
    expect(matches.slice(0, 5).every((m) => m.ok)).toBe(true);
    const lost = matches.filter((m) => !m.ok);
    expect(lost.length).toBe(24);
    // Lost from 0.2 s: still looked for to 0.7 s, then left.
    const left = matches.filter((m) => m.reason === "lane-left");
    expect(Math.abs(left[0].index - (6 + GIVE_UP_S * 30))).toBeLessThanOrEqual(1);
    expect(left.every((m) => m.P.length === 0)).toBe(true);
    const geo = finishRegister({ width: W, height: H }, 0, [1, 0, 0, 0, 1, 0, 0, 0, 1], 0, matches, [], pass.patchCount, { focal: lens.f });
    const H0: Mat3 = [8, 2, 100, 0, -2, 200, 0, 0.004, 1];
    const plane = new PlanePass(frames[0], H0, { focal: lens.f });
    const g = geo[left[0].index];
    expect(plane.step(g, frames[g.index]).S).toEqual(g.S);
  }, 60000);
});

describe("steadySpan", () => {
  it("is the first to the last frame that could be steadied", () => {
    const g = (ok: boolean) => ({ ok }) as FrameGeometry;
    expect(steadySpan([undefined, g(false), g(true), g(false), g(true), g(false)])).toEqual({ first: 2, last: 4 });
    expect(steadySpan([g(false)])).toBeNull();
  });
});
