import { describe, expect, it } from "vitest";
import * as fdlibm from "./detMath";

/** A run of inputs from a fixed seed, and the bits of each result folded into one hash. */
function bitsOf(f: (a: number, b: number) => number, gen: (r: () => number) => [number, number], n = 20000): string {
  let seed = 99;
  const r = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i++) {
    const [a, b] = gen(r);
    f64[0] = f(a, b);
    h = Math.imul(h ^ u32[0], 0x01000193) >>> 0;
    h = Math.imul(h ^ u32[1], 0x01000193) >>> 0;
  }
  return h.toString(16);
}

describe("detMath", () => {
  // The hashes are fdlibm's own bits (Node 22's Math gave the same on every
  // input, 2026-11-17): a change of one bit anywhere fails.
  it("gives fdlibm's bits", () => {
    expect({
      exp: bitsOf(fdlibm.exp, (r) => [(r() - 0.5) * 60, 0]),
      expSmall: bitsOf(fdlibm.exp, (r) => [(r() - 0.5) * 0.8, 0]),
      log: bitsOf(fdlibm.log, (r) => [r() * 1e4, 0]),
      logNearOne: bitsOf(fdlibm.log, (r) => [1 + (r() - 0.5) * 1e-5, 0]),
      sin: bitsOf(fdlibm.sin, (r) => [(r() - 0.5) * 20, 0]),
      cos: bitsOf(fdlibm.cos, (r) => [(r() - 0.5) * 20, 0]),
      sinFar: bitsOf(fdlibm.sin, (r) => [(r() - 0.5) * 2e5, 0]),
      cosFar: bitsOf(fdlibm.cos, (r) => [(r() - 0.5) * 2e5, 0]),
      atan: bitsOf(fdlibm.atan, (r) => [(r() - 0.5) * 50, 0]),
      atan2: bitsOf(fdlibm.atan2, (r) => [(r() - 0.5) * 100, (r() - 0.5) * 100])
    }).toMatchInlineSnapshot(`
      {
        "atan": "ba3bf06d",
        "atan2": "d580500f",
        "cos": "d72b28f3",
        "cosFar": "4c1410a5",
        "exp": "35985ef4",
        "expSmall": "539bf052",
        "log": "8c2f818a",
        "logNearOne": "92c2917b",
        "sin": "ee377086",
        "sinFar": "274e5b3a",
      }
    `);
  });

  it("agrees with Math to the last bit or two", () => {
    for (const x of [-700, -3.2, -1, -0.3, -1e-9, 1e-9, 0.2, 0.5, 1, 2.5, 30, 700]) {
      expect(fdlibm.exp(x)).toBeCloseTo(Math.exp(x), 12 - Math.round(Math.log10(Math.exp(x) + 1)));
      expect(fdlibm.sin(x)).toBeCloseTo(Math.sin(x), 12);
      expect(fdlibm.cos(x)).toBeCloseTo(Math.cos(x), 12);
      expect(fdlibm.atan(x)).toBeCloseTo(Math.atan(x), 12);
      expect(fdlibm.atan2(x, 0.7)).toBeCloseTo(Math.atan2(x, 0.7), 12);
      if (x > 0) expect(fdlibm.log(x)).toBeCloseTo(Math.log(x), 12);
    }
  });

  it("handles the edges as Math does", () => {
    expect(fdlibm.exp(Infinity)).toBe(Infinity);
    expect(fdlibm.exp(-Infinity)).toBe(0);
    expect(fdlibm.exp(NaN)).toBeNaN();
    expect(fdlibm.exp(800)).toBe(Infinity);
    expect(fdlibm.exp(-800)).toBe(0);
    expect(fdlibm.exp(-740)).toBe(Math.exp(-740));
    expect(fdlibm.exp(1e-20)).toBe(1);
    expect(fdlibm.log(0)).toBe(-Infinity);
    expect(fdlibm.log(-1)).toBeNaN();
    expect(fdlibm.log(Infinity)).toBe(Infinity);
    expect(fdlibm.log(1)).toBe(0);
    expect(fdlibm.log(2)).toBe(Math.LN2);
    expect(fdlibm.log(5e-324)).toBe(Math.log(5e-324));
    expect(fdlibm.log(1 + 2 ** -40)).toBe(Math.log(1 + 2 ** -40));
    expect(fdlibm.sin(1e-10)).toBe(1e-10);
    expect(fdlibm.cos(1e-10)).toBe(1);
    expect(fdlibm.sin(Math.PI / 2)).toBe(1);
    expect(fdlibm.cos(Math.PI)).toBe(-1);
    expect(fdlibm.sin(-Math.PI / 2)).toBe(-1);
    expect(fdlibm.sin(1e7)).toBe(Math.sin(1e7));
    expect(fdlibm.cos(1e7)).toBe(Math.cos(1e7));
    expect(fdlibm.sin(NaN)).toBeNaN();
    expect(fdlibm.atan(1e30)).toBe(Math.PI / 2);
    expect(fdlibm.atan(-1e30)).toBe(-Math.PI / 2);
    expect(fdlibm.atan(NaN)).toBeNaN();
    expect(fdlibm.atan(1e-12)).toBe(1e-12);
    expect(fdlibm.atan2(NaN, 1)).toBeNaN();
    expect(fdlibm.atan2(1, 1)).toBe(Math.PI / 4);
    expect(fdlibm.atan2(0, 1)).toBe(0);
    expect(fdlibm.atan2(-0, 1)).toBe(-0);
    expect(fdlibm.atan2(0, -1)).toBe(Math.PI);
    expect(fdlibm.atan2(-0, -1)).toBe(-Math.PI);
    expect(fdlibm.atan2(1, 0)).toBe(Math.PI / 2);
    expect(fdlibm.atan2(-1, 0)).toBe(-Math.PI / 2);
    expect(fdlibm.atan2(Infinity, Infinity)).toBe(Math.PI / 4);
    expect(fdlibm.atan2(-Infinity, Infinity)).toBe(-Math.PI / 4);
    expect(fdlibm.atan2(Infinity, -Infinity)).toBe((3 * Math.PI) / 4);
    expect(fdlibm.atan2(-Infinity, -Infinity)).toBe((-3 * Math.PI) / 4);
    expect(fdlibm.atan2(1, Infinity)).toBe(0);
    expect(fdlibm.atan2(-1, Infinity)).toBe(-0);
    expect(fdlibm.atan2(1, -Infinity)).toBe(Math.PI);
    expect(fdlibm.atan2(-1, -Infinity)).toBe(-Math.PI);
    expect(fdlibm.atan2(Infinity, 1)).toBe(Math.PI / 2);
    expect(fdlibm.atan2(-Infinity, 1)).toBe(-Math.PI / 2);
    expect(fdlibm.atan2(1e300, 1e-300)).toBe(Math.PI / 2);
    expect(fdlibm.atan2(1e-300, -1e300)).toBe(Math.PI);
    expect(fdlibm.atan2(-2, -3)).toBe(Math.atan2(-2, -3));
  });
});
