import { describe, expect, it } from "vitest";
import { closeGaps } from "./ballDetect";
import { median, medianOf, parabolaPeak } from "./image";
import { matchPatch, type Patch } from "./registration";
import { findDisc } from "./release";
import type { GrayFrame, Point } from "./types";

/**
 * The tracer's hot loops take shortcuts (selection instead of sorting,
 * separable passes, searches that give up early): each must give exactly
 * what the plain way it replaced gave, which is written out here.
 */

/** A repeatable stream of numbers in [0, 1). */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function sortedMedian(values: number[]): number {
  const a = values.filter(Number.isFinite).sort((p, q) => p - q);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

describe("median by selection", () => {
  it("is the sorted middle, with repeats, odd and even counts and values to skip", () => {
    const rnd = random(7);
    for (let t = 0; t < 3000; t++) {
      const n = Math.floor(rnd() * 40);
      const v = Array.from({ length: n }, () => (rnd() < 0.05 ? NaN : rnd() < 0.5 ? Math.floor(rnd() * 5) : rnd() * 100 - 50));
      const got = median(v);
      const want = sortedMedian(v);
      if (Number.isNaN(want)) expect(got).toBeNaN();
      else expect(got).toBe(want);
    }
  });

  it("selects in place over the first n values only", () => {
    const a = Float64Array.from([5, 1, 4, 2, 3, 100, -100]);
    expect(medianOf(a, 5)).toBe(3);
    expect(medianOf(Float64Array.from([4, 1, 3, 2]), 4)).toBe(2.5);
    expect(medianOf(Float32Array.from([2, 2, 2]), 3)).toBe(2);
    // A long run, so the selection's partitions run more than once.
    const long = Float64Array.from({ length: 1001 }, (_, i) => (i * 7919) % 1001);
    expect(medianOf(long, 1001)).toBe(500);
  });
});

describe("closeGaps", () => {
  /** The square's plain way: grown, then shrunk, outside the picture clear. */
  function plain(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
    const pass = (src: Uint8Array, grow: boolean) => {
      const out = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let hit = !grow;
          for (let j = -radius; j <= radius && hit !== grow; j++) {
            for (let i = -radius; i <= radius; i++) {
              const xx = x + i;
              const yy = y + j;
              const v = xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx] === 1;
              if (v === grow) {
                hit = grow;
                break;
              }
            }
          }
          out[y * w + x] = hit ? 1 : 0;
        }
      }
      return out;
    };
    return pass(pass(mask, true), false);
  }

  it("matches the square's plain way on scattered masks, at the border too", () => {
    const rnd = random(11);
    for (const [w, h, fill] of [[23, 17, 0.1], [40, 9, 0.3], [5, 30, 0.5], [3, 3, 0.6]] as const) {
      for (const radius of [1, 2, 3]) {
        const mask = Uint8Array.from({ length: w * h }, () => (rnd() < fill ? 1 : 0));
        expect(Array.from(closeGaps(mask, w, h, radius))).toEqual(Array.from(plain(mask, w, h, radius)));
      }
    }
  });
});

describe("matchPatch", () => {
  /** Every shift summed in full, the first smallest kept: the plain search. */
  function plain(c0: GrayFrame, f: GrayFrame, p: Patch, guess: Point, r: number): Point | null {
    const gx = Math.round(guess.x);
    const gy = Math.round(guess.y);
    if (gx - p.h - r < 1 || gy - p.h - r < 1 || gx + p.h + r >= f.width - 1 || gy + p.h + r >= f.height - 1) return null;
    const err = (dx: number, dy: number) => {
      let e = 0;
      for (let j = -p.h; j < p.h; j++) {
        for (let i = -p.h; i < p.h; i++) {
          const d = c0.data[(p.y + j) * c0.width + p.x + i] - f.data[(gy + dy + j) * f.width + gx + dx + i];
          e += d * d;
        }
      }
      return e;
    };
    const grid: number[] = [];
    let best = 0;
    const w = 2 * r + 1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        grid.push(err(dx, dy));
        if (grid[grid.length - 1] < grid[best]) best = grid.length - 1;
      }
    }
    const bx = (best % w) - r;
    const by = Math.floor(best / w) - r;
    if (Math.abs(bx) === r || Math.abs(by) === r) return null;
    const at = (dx: number, dy: number) => grid[(dy + r) * w + dx + r];
    return {
      x: gx + bx + parabolaPeak(-at(bx - 1, by), -at(bx, by), -at(bx + 1, by)),
      y: gy + by + parabolaPeak(-at(bx, by - 1), -at(bx, by), -at(bx, by + 1))
    };
  }

  /** A textured picture, and the same moved by (mx, my) with a little noise. */
  function pair(seed: number, mx: number, my: number, flat: boolean, float: boolean) {
    const rnd = random(seed);
    const w = 64;
    const h = 56;
    const make = () => (float ? new Float32Array(w * h) : new Uint8ClampedArray(w * h));
    const a = make();
    const b = make();
    const tex = (x: number, y: number) => (flat ? 100 + ((x + y) % 2) : 128 + 60 * Math.sin(x * 0.7 + Math.cos(y * 0.45) * 2) + 40 * Math.cos(y * 0.9 - x * 0.2));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        a[y * w + x] = Math.round(tex(x, y));
        const v = tex(x - mx, y - my) + (rnd() - 0.5) * 6;
        b[y * w + x] = float ? v : Math.round(v);
      }
    }
    return { c0: { width: w, height: h, data: a, t: 0 }, f: { width: w, height: h, data: b, t: 0 } };
  }

  it("finds what the full search finds, ties and misses included", () => {
    let found = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const mx = (seed % 7) - 3;
      const my = ((seed * 3) % 9) - 4;
      const { c0, f } = pair(seed, mx, my, seed % 6 === 0, seed % 4 === 0);
      for (const p of [{ x: 30, y: 26, h: 8 }, { x: 22, y: 20, h: 6 }, { x: 40, y: 30, h: 10 }]) {
        for (const guess of [{ x: p.x, y: p.y }, { x: p.x + 1.4, y: p.y - 0.6 }]) {
          const want = plain(c0, f, p, guess, 6);
          const got = matchPatch(c0, f, p, guess, 6);
          if (want) found++;
          expect(got).toEqual(want);
        }
      }
    }
    // The pictures are made so that most patches are found.
    expect(found).toBeGreaterThan(60);
  });
});

describe("findDisc", () => {
  it("measures a radius by its tenth of a pixel, whatever was asked before", () => {
    // A dark disc, lighter to its sides, on a light floor with a gentle slope: every offset counts.
    const w = 40;
    const h = 40;
    const data = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.hypot(x - 20, y - 21) <= 5 ? 40 + (x - 20) ** 2 : 150 + x;
    const f = { width: w, height: h, data, t: 0 };
    // The contrast at (20, 21) for radius 5.0, worked out here.
    const ring: number[] = [];
    const inner: number[] = [];
    for (let j = -8; j <= 8; j++) {
      for (let i = -8; i <= 8; i++) {
        const d = Math.hypot(i, j);
        const v = data[(21 + j) * w + 20 + i];
        if (d <= 4) inner.push(v);
        else if (d >= 6 && d <= 8 && j > -0.5 * d) ring.push(v);
      }
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // 4.96 asked first: its tenth is 5.0, and 0.8 of 4.96 would leave out the pixels 4 away.
    const first = findDisc(f, { x: 20, y: 21 }, [4.96], 0);
    expect(first?.contrast).toBeCloseTo(mean(ring) - mean(inner), 9);
    expect(findDisc(f, { x: 20, y: 21 }, [5.04], 0)?.contrast).toBe(first?.contrast);
  });
});
