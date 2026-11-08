import { describe, expect, it } from "vitest";
import type { CatalogBall } from "../types/catalog";
import { kinKey, kinNames, rowKey, sameCore, sameCover } from "./catalogKin";

function ball(id: string, over: Partial<CatalogBall> = {}): CatalogBall {
  return {
    id,
    brand: "Storm",
    name: id,
    releaseDate: "2025-01",
    releaseYear: 2025,
    coverstockRaw: "R2S Pearl Reactive",
    coverstockCategory: "Pearl",
    factoryFinish: null,
    coreName: "Velocity",
    coreType: "Symmetric",
    rg: 2.5,
    diff: 0.04,
    mbDiff: null,
    imageThumb: null,
    imageFull: null,
    sourceUrl: "",
    ...over
  };
}

describe("kinKey", () => {
  it("reads one name the same however it is spelled", () => {
    expect(kinKey("Torsion A.I. Core")).toBe(kinKey("Torsion AI"));
    expect(kinKey("HK22")).toBe(kinKey("HK-22"));
    expect(kinKey("Gear  core")).toBe("gear");
    expect(kinKey("Core")).toBeNull();
    expect(kinKey("  ")).toBeNull();
    expect(kinKey(null)).toBeNull();
  });
});

describe("rowKey", () => {
  it("names nothing for a cover or core that is only a kind", () => {
    expect(rowKey("Solid Reactive")).toBeNull();
    expect(rowKey("Polyester")).toBeNull();
    expect(rowKey("Pancake")).toBeNull();
    expect(rowKey("Storm Traditional 3-piece")).toBe("stormtraditional3piece");
    expect(rowKey("R2S Pearl Reactive")).toBe("r2spearlreactive");
  });
});

describe("sameCore and sameCover", () => {
  const a = ball("a", { releaseDate: "2024-03" });
  const b = ball("b", { releaseDate: "2025-06", coreName: "Velocity Core", coverstockRaw: "TX-23 Solid" });
  const c = ball("c", { releaseDate: "2025-06", coreName: "Gear" });
  const d = ball("d", { coreName: null });
  const all = [a, b, c, d];

  it("finds every other ball on the core, newest first, and not the ball itself", () => {
    expect(sameCore(all, a).map((x) => x.id)).toEqual(["b"]);
    expect(sameCore(all, d)).toEqual([]);
  });

  it("finds every other ball in the cover, newest first", () => {
    expect(sameCover(all, a).map((x) => x.id)).toEqual(["c", "d"]);
    expect(sameCover(all, b)).toEqual([]);
  });

  it("starts no row for a generic name", () => {
    const p = ball("p", { coverstockRaw: "Polyester" });
    const q = ball("q", { coverstockRaw: "Polyester" });
    expect(sameCover([p, q], p)).toEqual([]);
  });
});

describe("kinNames", () => {
  it("offers one spelling per name, the most used, alphabetically", () => {
    expect(kinNames(["Velocity", "Velocity Core", "Velocity", "Gear", null, ""])).toEqual(["Gear", "Velocity"]);
  });
});
