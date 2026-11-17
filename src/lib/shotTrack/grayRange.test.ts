import { describe, expect, it } from "vitest";
import { lumaRange, toFullRange } from "./grayRange";

describe("grayRange", () => {
  it("takes the frame's word first, then the file's, else limited", () => {
    expect(lumaRange(true, false)).toBe("full");
    expect(lumaRange(false, true)).toBe("limited");
    expect(lumaRange(null, true)).toBe("full");
    expect(lumaRange(undefined, false)).toBe("limited");
    expect(lumaRange(null, null)).toBe("limited");
  });

  it("brings video range to full range as ffmpeg's gray does, clamped, in place", () => {
    const g = Uint8ClampedArray.from([0, 10, 16, 17, 64, 126, 128, 200, 235, 240, 255]);
    const out = toFullRange(g, "limited");
    expect(out).toBe(g);
    expect(Array.from(out)).toEqual([0, 0, 0, 1, 56, 128, 130, 214, 255, 255, 255]);
    // ffmpeg's -pix_fmt gray on the clips: 1.1647 Y - 18.68, within one level of it everywhere in range.
    for (let y = 16; y <= 235; y++) expect(Math.abs(toFullRange(Uint8ClampedArray.of(y), "limited")[0] - (1.1647 * y - 18.68))).toBeLessThanOrEqual(1);
  });

  it("leaves a full range picture alone", () => {
    const g = Uint8Array.from([0, 16, 235, 255]);
    expect(Array.from(toFullRange(g, "full"))).toEqual([0, 16, 235, 255]);
  });
});
