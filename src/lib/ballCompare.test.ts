import { describe, expect, it } from "vitest";
import type { CatalogBall } from "../types/catalog";
import { closeToOwned, marked, specsAt, weightsOf } from "./ballCompare";

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

describe("marked", () => {
  it("marks the lowest or the highest, and ties alike", () => {
    expect(marked([2.47, 2.5, 2.47], "low")).toEqual([true, false, true]);
    expect(marked([0.05, null, 0.058], "high")).toEqual([false, false, true]);
  });

  it("marks nothing when there is one number, or all are the same", () => {
    expect(marked([0.05, null], "high")).toEqual([false, false]);
    expect(marked([2.5, 2.5], "low")).toEqual([false, false]);
  });
});

describe("closeToOwned", () => {
  const owned = [ball("widow", { rg: 2.5, diff: 0.058 }), ball("pearl", { rg: 2.5, diff: 0.058, coverstockCategory: "Pearl" })];

  it("names the owned ball a new one would do the same job as", () => {
    const near = closeToOwned([ball("ignition", { rg: 2.49, diff: 0.055 })], owned, 15);
    expect(near.map((n) => [n.ball.id, n.owned.id])).toEqual([["ignition", "widow"]]);
  });

  it("names none across cover types, far apart, or for a ball already owned", () => {
    expect(closeToOwned([ball("p", { rg: 2.5, diff: 0.058, coverstockCategory: "Hybrid" })], owned, 15)).toEqual([]);
    expect(closeToOwned([ball("far", { rg: 2.56, diff: 0.04 })], owned, 15)).toEqual([]);
    expect(closeToOwned([owned[0]], owned, 15)).toEqual([]);
  });
});
