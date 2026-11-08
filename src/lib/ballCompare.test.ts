import { describe, expect, it } from "vitest";
import type { CatalogBall } from "../types/catalog";
import { specsAt, weightsOf } from "./ballCompare";

function ball(id: string, over: Partial<CatalogBall> = {}): CatalogBall {
  return {
    id,
    brand: "Storm",
    name: id,
    releaseDate: "2025",
    releaseYear: 2025,
    coverstockRaw: "R2S Solid Reactive",
    coverstockCategory: "Solid",
    factoryFinish: null,
    coreName: "Velocity",
    coreType: "Symmetric",
    rg: 2.5,
    diff: 0.05,
    mbDiff: null,
    imageThumb: null,
    imageFull: null,
    sourceUrl: "",
    ...over
  };
}

describe("specsAt", () => {
  const b = ball("a", { weights: [{ weight: 14, rg: 2.53, diff: 0.046, mbDiff: null }] });

  it("reads the weight's own numbers", () => {
    expect(specsAt(b, 14)).toEqual({ rg: 2.53, diff: 0.046, mbDiff: null, weight: 14, exact: true });
  });

  it("stands in the 15 lb numbers where the weight has none, and says so", () => {
    expect(specsAt(b, 12)).toEqual({ rg: 2.5, diff: 0.05, mbDiff: null, weight: 15, exact: false });
    expect(specsAt(b, 15).exact).toBe(true);
  });
});

describe("weightsOf", () => {
  it("lists every weight any ball has, heaviest first, 15 lb always", () => {
    const a = ball("a", { weights: [{ weight: 14, rg: 2.5, diff: 0.05, mbDiff: null }] });
    const b = ball("b", { weights: [{ weight: 16, rg: 2.5, diff: 0.05, mbDiff: null }] });
    expect(weightsOf([a, b])).toEqual([16, 15, 14]);
    expect(weightsOf([])).toEqual([15]);
  });
});
