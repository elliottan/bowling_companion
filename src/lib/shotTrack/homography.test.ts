import { describe, expect, it } from "vitest";
import {
  IDENTITY,
  apply,
  downAt,
  horizon,
  intersect,
  invert,
  lineDistance,
  lineThrough,
  mapLine,
  multiply,
  normalize,
  similarityFrom,
  similarityParts,
  solveHomography,
  solveLinear,
  transpose
} from "./homography";
import type { Mat3, Point } from "./types";

const H: Mat3 = [3.1, 0.4, 420, -0.2, -2.6, 610, 0.0004, -0.012, 1];

describe("homography", () => {
  it("solves exactly from four pairs and round trips", () => {
    const src: Point[] = [
      { x: 0.5, y: 0 },
      { x: 39.5, y: 0 },
      { x: 0.5, y: 62.85 },
      { x: 39.5, y: 62.85 }
    ];
    const dst = src.map((p) => apply(H, p));
    const S = solveHomography(src, dst);
    for (const p of [{ x: 20, y: 15 }, { x: 3, y: 50 }, { x: 37, y: 2 }]) {
      const q = apply(S, p);
      const r = apply(H, p);
      expect(q.x).toBeCloseTo(r.x, 6);
      expect(q.y).toBeCloseTo(r.y, 6);
      const back = apply(invert(S), q);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it("solves more than four pairs in the least squares sense", () => {
    const src: Point[] = [];
    for (let u = 0; u <= 40; u += 10) for (let v = 0; v <= 60; v += 20) src.push({ x: u, y: v });
    const S = solveHomography(src, src.map((p) => apply(H, p)));
    expect(apply(S, { x: 12, y: 33 }).x).toBeCloseTo(apply(H, { x: 12, y: 33 }).x, 5);
  });

  it("refuses too few or mismatched pairs, and a singular system", () => {
    expect(() => solveHomography([{ x: 0, y: 0 }], [{ x: 0, y: 0 }])).toThrow();
    expect(() => solveLinear([[1, 2], [2, 4]], [1, 2])).toThrow();
    expect(() => invert([1, 2, 3, 2, 4, 6, 0, 0, 0])).toThrow();
  });

  it("multiplies, transposes and normalises", () => {
    const I = multiply(H, invert(H));
    I.forEach((x, i) => expect(x).toBeCloseTo(IDENTITY[i], 9));
    expect(transpose(transpose(H))).toEqual(H);
    expect(normalize(H.map((x) => x * 4) as Mat3)[8]).toBeCloseTo(1);
    expect(normalize([2, 0, 0, 0, 2, 0, 0, 0, 0])[0]).toBeCloseTo(1);
  });

  it("intersects lines and measures signed distance", () => {
    const l = lineThrough({ x: 0, y: 0 }, { x: 10, y: 10 });
    const m = lineThrough({ x: 0, y: 10 }, { x: 10, y: 0 });
    const p = intersect(l, m)!;
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(5);
    expect(intersect(l, lineThrough({ x: 0, y: 1 }, { x: 1, y: 2 }))).toBeNull();
    expect(Math.abs(lineDistance(l, { x: 0, y: 2 }))).toBeCloseTo(Math.SQRT2);
  });

  it("maps a lane line onto the image of its points", () => {
    const l = lineThrough({ x: 10, y: 0 }, { x: 10, y: 60 });
    const img = mapLine(H, l);
    for (const v of [5, 25, 55]) expect(lineDistance(img, apply(H, { x: 10, y: v }))).toBeCloseTo(0, 6);
  });

  it("finds the horizon where far lane points converge, and down away from it", () => {
    const hz = horizon(H);
    const far = apply(H, { x: 20, y: 1e7 });
    expect(Math.abs(lineDistance(hz, far))).toBeLessThan(0.01);
    const near = apply(H, { x: 20, y: 0 });
    const d = downAt(H, near);
    const ahead = { x: near.x + d.x, y: near.y + d.y };
    expect(Math.abs(lineDistance(hz, ahead))).toBeGreaterThan(Math.abs(lineDistance(hz, near)));
    expect(downAt(IDENTITY, { x: 1, y: 1 })).toEqual({ x: 0, y: 1 });
  });

  it("builds a similarity from two point pairs", () => {
    const p0 = { x: 10, y: 20 };
    const p1 = { x: 110, y: 20 };
    const q0 = { x: 15, y: 18 };
    const q1 = { x: 15 + 102 * Math.cos(0.03), y: 18 + 102 * Math.sin(0.03) };
    const S = similarityFrom(p0, p1, q0, q1);
    expect(apply(S, p1).x).toBeCloseTo(q1.x, 9);
    expect(apply(S, p1).y).toBeCloseTo(q1.y, 9);
    const parts = similarityParts(S);
    expect(parts.angle).toBeCloseTo(0.03, 9);
    expect(parts.scale).toBeCloseTo(1.02, 9);
    expect(() => similarityFrom(p0, p0, q0, q1)).toThrow();
  });
});
