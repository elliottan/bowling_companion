import { describe, expect, it } from "vitest";
import { arcFit, ARC_MIN, carryFace, CARRY_MIN } from "./ballDetect";
import { boxBlur, makeFrame } from "./image";
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

/**
 * A ball among the pins, as at the far end of a phone's video: white pins
 * (columns 20 px apart, 9 wide) with dark gaps between them, the ball mid-gray
 * with a lighter top, the lane bright below the pins' bases, blurred twice.
 * The ball sits half in front of a pin and half in front of a gap.
 */
function amongPins(cx: number, cy: number, r: number): GrayFrame {
  const f = makeFrame(120, 120, 0, 0);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      let v = y > 75 ? 190 : x % 20 < 9 ? 225 : 35;
      if (Math.hypot(x - cx, y - cy) <= r) v = y < cy - 0.4 * r ? 150 : 115;
      f.data[y * f.width + x] = v;
    }
  }
  return boxBlur(boxBlur(f, 1), 1);
}

describe("arcFit", () => {
  const down = { x: 0, y: 1 };

  it("puts a blurred ball among white pins and dark gaps on its rim, its size known, from a prior a quarter radius off", () => {
    // The ball's right half over a white pin (x 60 to 68), its left over the dark gap before it.
    const f = amongPins(58.3, 66.6, 7);
    for (const prior of [{ x: 60, y: 67.5 }, { x: 56.6, y: 65.4 }, { x: 58.3, y: 66.6 }]) {
      const a = arcFit(f, down, prior, 7, 0.3 * 7);
      expect(a).not.toBeNull();
      // Within a tenth of its radius, the target for every circle.
      expect(Math.hypot(a!.cx - 58.3, a!.cy - 66.6)).toBeLessThanOrEqual(0.7);
      expect(a!.support).toBeGreaterThanOrEqual(ARC_MIN);
    }
  });

  it("measures the radius where the rim shows round most of the ball", () => {
    const f = amongPins(58.3, 50, 7);
    // Told 4% large, the rim gives the ball's own size and center back.
    const a = arcFit(f, down, { x: 59.5, y: 50.5 }, 7.3, 0.3 * 7.3)!;
    expect(a.free).not.toBeNull();
    expect(Math.abs(a.free!.r - 7)).toBeLessThanOrEqual(0.5);
    expect(Math.hypot(a.free!.cx - 58.3, a.free!.cy - 50)).toBeLessThanOrEqual(0.5);
  });

  it("places a ball whose right side is behind a leg by the rim that shows", () => {
    // Shot-04's frame 109: a leg over the ball's right side; the detector's blob and the face's match sit low and right.
    const f = ballFrame(50, 50, 16, 57);
    const a = arcFit(f, down, { x: 53, y: 52.5 }, 16, 0.3 * 16);
    expect(a).not.toBeNull();
    expect(Math.hypot(a!.cx - 50, a!.cy - 50)).toBeLessThanOrEqual(1.6);
    // Not round enough of the ball for its own radius.
    expect(a!.free).toBeNull();
  });

  it("finds no rim where there is no ball, or none in the picture", () => {
    expect(arcFit(makeFrame(120, 120, 0, 210), down, { x: 60, y: 60 }, 10, 3)).toBeNull();
    expect(arcFit(ballFrame(50, 50, 16), down, { x: -40, y: -40 }, 16, 4)).toBeNull();
    // Pins and gaps alone: straight edges, no arc of the ball's size.
    expect(arcFit(amongPins(-50, -50, 7), down, { x: 60, y: 60 }, 7, 2.1)).toBeNull();
  });
});
