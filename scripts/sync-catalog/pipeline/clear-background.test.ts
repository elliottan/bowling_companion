import { describe, expect, it } from "vitest";

import { clearConnectedBackground, clearOutsideCircle } from "./clear-background.js";

const W = 40;
const H = 40;

/** A dark ball of radius 15 on a white square, with a white swirl inside it. */
function ballOnWhite(): Buffer {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inBall = Math.hypot(x - 20, y - 20) <= 15;
      const swirl = inBall && Math.hypot(x - 20, y - 20) <= 4;
      const v = inBall && !swirl ? 30 : 250;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

const alpha = (data: Buffer, x: number, y: number) => data[(y * W + x) * 4 + 3];

describe("clearConnectedBackground", () => {
  it("clears the white around a round ball and keeps the white inside it", () => {
    const data = ballOnWhite();
    const cleared = clearConnectedBackground(data, W, H);
    expect(cleared).toBeGreaterThan(0);
    expect(alpha(data, 0, 0)).toBe(0);
    expect(alpha(data, W - 1, H - 1)).toBe(0);
    // The swirl is white too, but the ball's dark edge walls it off.
    expect(alpha(data, 20, 20)).toBe(255);
    expect(alpha(data, 20, 10)).toBe(255);
  });

  it("reaches a white band that sits inside an earlier transparent cut", () => {
    const data = ballOnWhite();
    // An old cut: only the outer ring is transparent, white remains inside it.
    for (let p = 0; p < W * H; p++) {
      const x = p % W, y = Math.floor(p / W);
      if (Math.hypot(x - 20, y - 20) > 18) data[p * 4 + 3] = 0;
    }
    clearConnectedBackground(data, W, H);
    expect(alpha(data, 20, 3)).toBe(0); // the band between the cut and the ball
    expect(alpha(data, 20, 20)).toBe(255);
  });
});

describe("clearOutsideCircle", () => {
  it("cuts a shadow below the ball, fitting the circle to its sides and top", () => {
    const data = ballOnWhite();
    clearConnectedBackground(data, W, H);
    // A grey drop shadow hanging under the ball, opaque, the flood left it.
    for (let x = 14; x <= 26; x++) for (let y = 36; y <= 38; y++) {
      const i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 120;
      data[i + 3] = 255;
    }
    const cut = clearOutsideCircle(data, W, H);
    expect(cut).toBeGreaterThan(0);
    expect(alpha(data, 20, 37)).toBe(0);
    expect(alpha(data, 20, 20)).toBe(255);
    expect(alpha(data, 20, 33)).toBeGreaterThan(0); // the ball's own bottom edge survives
  });
});
