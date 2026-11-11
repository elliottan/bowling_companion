import { describe, expect, it } from "vitest";
import { boxBlur, downsample, gradient, makeFrame, median, parabolaPeak, sample, warp } from "./image";
import type { GrayFrame, Mat3 } from "./types";

function ramp(w: number, h: number): GrayFrame {
  const f = makeFrame(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f.data[y * w + x] = 2 * x + 3 * y;
  return f;
}

describe("image", () => {
  it("samples bilinearly and reads NaN outside", () => {
    const f = ramp(8, 6);
    expect(sample(f, 2.5, 1.25)).toBeCloseTo(2 * 2.5 + 3 * 1.25);
    expect(sample(f, 7, 5)).toBeCloseTo(14 + 15);
    expect(sample(f, -0.1, 2)).toBeNaN();
    expect(sample(f, 2, 5.1)).toBeNaN();
  });

  it("box blurs without moving a ramp", () => {
    const f = ramp(10, 10);
    const b = boxBlur(f, 1);
    expect(b.data[5 * 10 + 5]).toBeCloseTo(f.data[5 * 10 + 5]);
    const flat = makeFrame(5, 5, 0, 7);
    expect(boxBlur(flat, 2).data[0]).toBeCloseTo(7);
  });

  it("takes the gradient", () => {
    const { gx, gy } = gradient(ramp(6, 6));
    expect(gx[2 * 6 + 2]).toBeCloseTo(2);
    expect(gy[2 * 6 + 2]).toBeCloseTo(3);
    expect(gx[0]).toBe(0);
  });

  it("warps through a matrix", () => {
    const f = ramp(20, 20);
    const shift: Mat3 = [1, 0, 2.5, 0, 1, 1, 0, 0, 1];
    const w = warp(f, shift, 3, 4, 5, 5);
    expect(w.data[0]).toBeCloseTo(2 * 5.5 + 3 * 5);
    const out = warp(f, shift, 30, 0, 2, 2);
    expect(out.data[0]).toBeNaN();
  });

  it("downsamples by averaging blocks", () => {
    const d = downsample(ramp(8, 8), 2);
    expect(d.width).toBe(4);
    expect(d.data[0]).toBeCloseTo((0 + 2 + 3 + 5) / 4);
  });

  it("takes medians and parabola peaks", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, NaN, 2, 3])).toBe(2.5);
    expect(median([NaN])).toBeNaN();
    expect(parabolaPeak(1, 2, 1)).toBeCloseTo(0);
    expect(parabolaPeak(0, 4, 3)).toBeGreaterThan(0);
    expect(parabolaPeak(1, 1, 1)).toBe(0);
  });
});
