import { describe, expect, it } from "vitest";
import { readPick, scanPick } from "./framePick";
import { blobSource, readVideoTrack, type VideoTrack } from "./mp4";

// The fixtures are read off disk. The app's type config carries no node
// types (tsconfig.app.json), so node's file API is reached untyped, by name.
const NODE_FS = "node:fs";
const NODE_URL = "node:url";
const track = async (name: string): Promise<VideoTrack> => {
  const path = (await import(/* @vite-ignore */ NODE_URL)).fileURLToPath(new URL(`../../../scripts/shot-tracker/fixtures/${name}`, import.meta.url));
  return readVideoTrack(blobSource(await (await import(/* @vite-ignore */ NODE_FS)).openAsBlob(path)));
};

describe("the frames the reader keeps (as the app's details block counted them in Chromium)", () => {
  it("looks at 70 of shot-01's 279 frames, one a fifteenth of a second", async () => {
    const { samples, duration } = await track("clips/shot-01.mp4");
    const pick = scanPick(samples, duration)!;
    expect(pick.order.length).toBe(70);
    expect(pick.offGrid).toBe(209);
    expect(pick.span).toEqual({ first: 0, last: 278 });
    const t = pick.order.map((s) => s / 1e6);
    t.slice(1).forEach((x, i) => expect(Math.floor(x * 15 + 0.03)).toBeGreaterThan(Math.floor(t[i] * 15 + 0.03) - 1e-9));
    expect(scanPick([], 1)).toBeNull();
  });

  it("reads shot-01's first part and carries the rest on from its last frame", async () => {
    const tr = await track("clips/shot-01.mp4");
    const first = readPick(tr, { from: 0, to: 1.6, fps: 60, band: null });
    expect([first.wanted.size, first.missing, first.width, first.height]).toEqual([95, 1, 962, 718]);
    expect(first.src).toBeCloseTo(1 / 60, 9);
    const stamps = [...first.wanted.keys()];
    const last = stamps[stamps.length - 1] / 1e6;
    const rest = readPick(tr, { from: 1.6, to: tr.duration, fps: 60, band: null, after: { t: last, src: first.src } });
    expect([rest.wanted.size, rest.missing]).toEqual([184, 0]);
    // Every frame kept is the one after the last: nothing twice, nothing left between.
    expect(Math.min(...rest.wanted.keys()) / 1e6 - last).toBeCloseTo(1 / 60, 3);
  });

  it("keeps every other frame of a 120 fps video at 60, counted from its start wherever the read starts", async () => {
    const tr = await track("clips/shot-05.mp4");
    const a = [...readPick(tr, { from: 0.67, to: 2.27, fps: 60, band: null }).wanted.keys()];
    const b = [...readPick(tr, { from: 0.675, to: 2.27, fps: 60, band: null }).wanted.keys()];
    expect(a.length).toBe(96);
    expect(b.slice(-90)).toEqual(a.slice(-90));
    const at30 = readPick(tr, { from: 0, to: 1, fps: 30, band: null });
    expect(at30.step).toBeCloseTo(1 / 30, 9);
  });

  it("keeps a portrait original's band at close to its own scale", async () => {
    const tr = await track("originals/IMG_1996.mov");
    const p = readPick(tr, { from: 3.2, to: 4.8, fps: 60, band: { top: 0.3, bottom: 0.72 } });
    expect([p.width, p.height, p.rows.y, p.rows.h]).toEqual([961, 719, 576, 808]);
    expect(p.band.top).toBeCloseTo(576 / 1920, 9);
    expect(p.wanted.size).toBe(96);
    expect(readPick(tr, { from: 40, to: 50, fps: 60, band: null }).span).toBeNull();
  });
});
