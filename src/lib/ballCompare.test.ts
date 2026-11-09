import { describe, expect, it } from "vitest";
import type { CatalogBall } from "../types/catalog";
import { entryKey, graphPoints, nextWeight, specsAt, weightsFor } from "./ballCompare";

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

describe("weightsFor", () => {
  it("lists the weights a ball has specs for, heaviest first, 15 lb always", () => {
    expect(weightsFor(ball("a", { weights: [{ weight: 14, rg: 2.5, diff: 0.05, mbDiff: null }, { weight: 16, rg: 2.5, diff: 0.05, mbDiff: null }] }))).toEqual([16, 15, 14]);
    expect(weightsFor(ball("b"))).toEqual([15]);
  });
});

describe("nextWeight (ADR-262)", () => {
  const listed = ball("a", { weights: [14, 13].map((weight) => ({ weight, rg: 2.5, diff: 0.05, mbDiff: null })) });

  it("comes in at the default weight", () => {
    expect(nextWeight(listed, [], 14)).toBe(14);
    // Not listed is still allowed: its 15 lb numbers stand in.
    expect(nextWeight(listed, [], 12)).toBe(12);
  });

  it("takes the nearest listed weight once the default is taken", () => {
    expect(nextWeight(listed, [14], 14)).toBe(15);
    expect(nextWeight(listed, [14, 15], 14)).toBe(13);
  });

  it("brings an owned ball in at the weights it is owned in first", () => {
    expect(nextWeight(listed, [], 14, [16])).toBe(16);
    expect(nextWeight(listed, [16], 14, [16])).toBe(14);
  });

  it("has nothing left once every weight is taken", () => {
    expect(nextWeight(listed, [16, 15, 14, 13, 12, 11, 10, 9, 8], 15)).toBeNull();
  });
});

describe("graphPoints", () => {
  const a = ball("a");
  const b = ball("b");

  it("numbers the compared, then the bag, each at its own weight", () => {
    const points = graphPoints([{ ball: a, weight: 14 }, { ball: a, weight: 15 }], [{ ball: b, weight: 16 }], true);
    expect(points.map((p) => [p.key, p.n, p.selected, p.owned])).toEqual([
      ["a@14", 1, true, false],
      ["a@15", 2, true, false],
      ["b@16", 3, false, true]
    ]);
  });

  it("draws a compared ball at a weight it is owned in once, both selected and owned", () => {
    const points = graphPoints([{ ball: a, weight: 15 }], [{ ball: a, weight: 15 }, { ball: a, weight: 14 }], true);
    expect(points.map((p) => [p.key, p.selected, p.owned])).toEqual([
      ["a@15", true, true],
      ["a@14", false, true]
    ]);
  });

  it("leaves the bag off when it is hidden", () => {
    expect(graphPoints([{ ball: a, weight: 15 }], [{ ball: b, weight: 15 }], false).map((p) => p.key)).toEqual(["a@15"]);
  });

  it("keys a ball by its weight", () => {
    expect(entryKey({ id: "a", weight: 14 })).toBe("a@14");
  });
});
