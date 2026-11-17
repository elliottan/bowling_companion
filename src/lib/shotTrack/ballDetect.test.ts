import { describe, expect, it } from "vitest";
import { carryFace, CARRY_MIN } from "./ballDetect";
import { makeFrame } from "./image";
import { lineAt } from "./pipeline";
import type { GrayFrame } from "./types";

/** A dark ball with a bright highlight on a bright lane, `cover` pixels right of `coverX` hidden by a mid-gray leg. */
function ballFrame(cx: number, cy: number, r: number, cover?: number): GrayFrame {
  const f = makeFrame(120, 120, 0, 210);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) f.data[y * f.width + x] = Math.hypot(x - (cx - 0.3 * r), y - (cy - 0.5 * r)) < 0.25 * r ? 150 : 25;
      if (cover !== undefined && x >= cover) f.data[y * f.width + x] = 120;
    }
  }
  return f;
}

describe("carryFace", () => {
  it("places a ball whose rim is half covered by its face from a clean frame, scaled to its size there", () => {
    const f0 = ballFrame(50, 50, 16);
    // Two frames on: up the picture and a little smaller, its right side behind a leg.
    const f = ballFrame(52.5, 44, 15, 62);
    const m = carryFace(f0, { cx: 50, cy: 50, r: 16 }, f, { x: 54, y: 46 }, 15, 6);
    expect(m).not.toBeNull();
    // Within a tenth of its radius, the target for every circle.
    expect(Math.abs(m!.cx - 52.5)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(m!.cy - 44)).toBeLessThanOrEqual(1.5);
    expect(m!.score).toBeGreaterThanOrEqual(CARRY_MIN);
  });

  it("gives nothing where the ball is not, or where the clean frame has no face", () => {
    const f0 = ballFrame(50, 50, 16);
    expect(carryFace(f0, { cx: 50, cy: 50, r: 16 }, makeFrame(120, 120, 0, 210), { x: 50, y: 50 }, 16, 4)).toBeNull();
    expect(carryFace(makeFrame(120, 120, 0, 210), { cx: 50, cy: 50, r: 16 }, f0, { x: 50, y: 50 }, 16, 4)).toBeNull();
    // Off the picture's edge.
    expect(carryFace(f0, { cx: 5, cy: 5, r: 16 }, f0, { x: 50, y: 50 }, 16, 4)).toBeNull();
  });
});

describe("lineAt", () => {
  it("reads the least squares line through the points at x, one point's own y, flat for one x", () => {
    expect(lineAt([1, 2, 3], [2, 4, 6], 5)).toBeCloseTo(10, 9);
    expect(lineAt([7], [3.5], 9)).toBe(3.5);
    expect(lineAt([4, 4], [1, 3], 10)).toBe(2);
  });
});
