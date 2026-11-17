import { describe, expect, it } from "vitest";
import { medianBackground } from "./background";
import type { GrayFrame } from "./types";
import { joinBackground, MAX_WORKERS, poolSize, rowBands, rowsOf } from "./workers";

describe("sharing the tracer among workers", () => {
  it("runs one fewer worker than the cores, at most four, at least one", () => {
    expect(poolSize(8, false)).toBe(MAX_WORKERS);
    expect(poolSize(4, false)).toBe(3);
    expect(poolSize(2, false)).toBe(1);
    expect(poolSize(1, false)).toBe(1);
    expect(poolSize(undefined, false)).toBe(1);
    // An iPhone that reports two cores has six.
    expect(poolSize(2, true)).toBe(3);
    expect(poolSize(6, true)).toBe(4);
    // The harness's count wins when it is a whole number from 1.
    expect(poolSize(8, false, 2)).toBe(2);
    expect(poolSize(8, false, 0)).toBe(4);
    expect(poolSize(8, false, 1.5)).toBe(4);
    expect(poolSize(8, false, null)).toBe(4);
  });

  it("cuts rows into even bands, none empty", () => {
    expect(rowBands(10, 3)).toEqual([[0, 3], [3, 7], [7, 10]]);
    expect(rowBands(2, 4)).toEqual([[0, 1], [1, 2]]);
    expect(rowBands(5, 0)).toEqual([[0, 5]]);
  });

  it("gives the same background from bands of rows as from the whole", () => {
    const w = 5;
    const h = 7;
    const frames: GrayFrame[] = Array.from({ length: 6 }, (_, k) => ({
      width: w,
      height: h,
      data: Float32Array.from({ length: w * h }, (_, i) => (i % 3 === k % 3 ? NaN : (i * 7 + k * 13) % 29)),
      t: k
    }));
    const whole = medianBackground(frames);
    const parts = rowBands(h, 3).map(([a, b]) => medianBackground(frames.map((f) => rowsOf(f, a, b))));
    const joined = joinBackground(parts);
    expect(joined.height).toBe(h);
    expect(Array.from(joined.data)).toEqual(Array.from(whole.data));
    expect(Array.from(joined.spread)).toEqual(Array.from(whole.spread));
    expect(rowsOf(frames[1], 2, 4)).toMatchObject({ width: w, height: 2, t: 1 });
  });
});
