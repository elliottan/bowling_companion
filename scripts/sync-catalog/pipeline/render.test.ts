import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import {
  EDGE_SHADE,
  NORMALISER,
  RIM_INSET,
  backgroundMask,
  cutToCircle,
  finishEdge,
  fitBallCircle,
  renderBallPair,
} from "./render.js";

const W = 160;
const H = 160;
const CX = 80;
const CY = 76;
const R = 60;

type Paint = (x: number, y: number) => [number, number, number, number] | null;

/**
 * A dark ball of radius 60 on a white square, with a white swirl at its
 * centre. `extra` paints over it: a shadow, a fringe, a bite.
 */
function ballOnWhite(extra?: Paint): Buffer {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d = Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
      const v = d <= R && d > 12 ? 30 : 250;
      const px = extra?.(x, y) ?? [v, v, v, 255];
      data[i] = px[0];
      data[i + 1] = px[1];
      data[i + 2] = px[2];
      data[i + 3] = px[3];
    }
  }
  return data;
}

function fit(data: Buffer) {
  const circle = fitBallCircle(backgroundMask(data, W, H), W, H);
  expect(circle).not.toBeNull();
  return circle!;
}

describe("backgroundMask", () => {
  it("takes the white around the ball and leaves the white swirl inside it", () => {
    const mask = backgroundMask(ballOnWhite(), W, H);
    expect(mask[0]).toBe(1);
    expect(mask[W * H - 1]).toBe(1);
    // The swirl is white too, but the ball's dark edge walls it off.
    expect(mask[CY * W + CX]).toBe(0);
  });

  it("takes a backdrop of any colour, read from the border", () => {
    const data = ballOnWhite((x, y) => (Math.hypot(x + 0.5 - CX, y + 0.5 - CY) > R ? [40, 90, 200, 255] : null));
    const mask = backgroundMask(data, W, H);
    expect(mask[0]).toBe(1);
    expect(mask[(CY - 15) * W + CX]).toBe(0);
  });

  it("trusts a cut-out's transparency, so white reaching the rim stays ball", () => {
    // A cut-out whose white swirl runs out to the rim on the right.
    const data = ballOnWhite((x, y) => {
      const d = Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
      if (d > R) return [0, 0, 0, 0];
      return x > CX + 20 ? [250, 250, 250, 255] : null;
    });
    const mask = backgroundMask(data, W, H);
    expect(mask[0]).toBe(1);
    expect(mask[CY * W + CX + R - 2]).toBe(0);
    const c = fit(data);
    expect(c.r).toBeCloseTo(R, 0);
  });
});

describe("fitBallCircle", () => {
  it("finds a clean ball's circle", () => {
    const c = fit(ballOnWhite());
    expect(c.cx).toBeCloseTo(CX, 0);
    expect(c.cy).toBeCloseTo(CY, 0);
    expect(c.r).toBeCloseTo(R, 0);
  });

  it("ignores a drop shadow hanging under the ball", () => {
    const shadow: Paint = (x, y) =>
      y >= CY + R - 2 && y <= CY + R + 6 && Math.abs(x + 0.5 - CX) < 22 && Math.hypot(x + 0.5 - CX, y + 0.5 - CY) > R
        ? [120, 120, 120, 255]
        : null;
    const c = fit(ballOnWhite(shadow));
    expect(c.cy).toBeCloseTo(CY, 0);
    expect(c.r).toBeCloseTo(R, 0);
  });

  it("is not pulled in by a bite out of the rim", () => {
    const bite: Paint = (x, y) => (Math.hypot(x + 0.5 - (CX + R), y + 0.5 - CY) < 10 ? [0, 0, 0, 0] : null);
    const c = fit(ballOnWhite(bite));
    expect(c.cx).toBeCloseTo(CX, 0);
    expect(c.r).toBeCloseTo(R, 0);
  });

  it("finds nothing in an empty canvas", () => {
    const blank = Buffer.alloc(W * H * 4);
    expect(fitBallCircle(backgroundMask(blank, W, H), W, H)).toBeNull();
  });
});

describe("cutToCircle", () => {
  it("cuts a hair inside the rim, so a light fringe on the edge goes", () => {
    const fringe: Paint = (x, y) => {
      const d = Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
      return d > R - 1 && d <= R ? [235, 235, 235, 255] : null;
    };
    const data = ballOnWhite(fringe);
    const cut = cutToCircle(data, W, H, { cx: CX, cy: CY, r: R });
    expect(cut.size).toBe(Math.round(2 * R * (1 - RIM_INSET)));
    // Corners and the old rim take the ball's dark colour, never white.
    const at = (x: number, y: number) => cut.data[(y * cut.size + x) * 4];
    expect(at(0, 0)).toBe(30);
    expect(at(cut.size >> 1, 0)).toBe(30);
    // The swirl at the centre is the ball's own, and stays.
    expect(at(cut.size >> 1, cut.size >> 1)).toBe(250);
  });

  it("fills a hole inside the ball from the ball around it", () => {
    const hole: Paint = (x, y) => (Math.hypot(x + 0.5 - (CX + 20), y + 0.5 - CY) < 3 ? [0, 0, 0, 0] : null);
    const cut = cutToCircle(ballOnWhite(hole), W, H, { cx: CX, cy: CY, r: R });
    const i = ((cut.size >> 1) * cut.size + (cut.size >> 1) + 20) * 4;
    expect(cut.data[i]).toBe(30);
    expect(cut.data[i + 3]).toBe(255);
  });
});

describe("finishEdge", () => {
  it("draws the circle in alpha and shades only the rim", () => {
    const size = 100;
    const data = Buffer.alloc(size * size * 4, 200);
    for (let p = 3; p < data.length; p += 4) data[p] = 255;
    finishEdge(data, size);
    const px = (x: number, y: number) => data.subarray((y * size + x) * 4, (y * size + x) * 4 + 4);
    expect(px(0, 0)[3]).toBe(0);
    expect(px(50, 50)[3]).toBe(255);
    expect(px(50, 50)[0]).toBe(200);
    // The middle of the top edge is on the circle: opaque, and shaded the most.
    expect(px(50, 0)[3]).toBeGreaterThan(250);
    expect(px(50, 0)[0]).toBeLessThan(200);
    expect(px(50, 0)[0]).toBeGreaterThanOrEqual(Math.floor(200 * (1 - EDGE_SHADE.depth)));
  });
});

describe("renderBallPair", () => {
  const dir = mkdtempSync(join(tmpdir(), "render-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("writes both sizes as round cut-outs that fill the canvas", async () => {
    const png = await sharp(ballOnWhite(), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const entry = await renderBallPair(png, "ball", dir);
    expect(entry).toEqual({
      imageThumb: "/catalog/img/ball-thumb.webp",
      imageFull: "/catalog/img/ball-full.webp",
      normaliser: NORMALISER,
    });
    for (const [file, size] of [["ball-thumb.webp", 160], ["ball-full.webp", 800]] as const) {
      const { data, info } = await sharp(join(dir, file)).raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(size);
      expect(info.channels).toBe(4);
      const a = (x: number, y: number) => data[(y * size + x) * 4 + 3];
      expect(a(0, 0)).toBe(0);
      expect(a(size >> 1, 0)).toBeGreaterThan(200);
      expect(a(0, size >> 1)).toBeGreaterThan(200);
      expect(a(size >> 1, size >> 1)).toBe(255);
    }
  });

  it("refuses an image with no ball in it", async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    await expect(renderBallPair(png, "none", dir)).rejects.toThrow("no ball");
  });
});
