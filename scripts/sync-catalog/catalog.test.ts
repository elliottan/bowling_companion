/**
 * Vitest tests for the sync-catalog pipeline.
 * Run via: npm test
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  mapCoverstock,
  deriveCoreType,
  normalizeName,
  slug,
} from "./normalize.js";
import { validateRaw } from "./validate.js";
import type { CatalogBall, CatalogManifest } from "../../src/types/catalog.js";

// ---------------------------------------------------------------------------
// normalize.ts
// ---------------------------------------------------------------------------
describe("mapCoverstock", () => {
  it("maps 'urethane' regardless of case", () => {
    expect(mapCoverstock("Predator V2 HP Urethane")).toBe("Urethane");
    expect(mapCoverstock("URETHANE SOLID")).toBe("Urethane"); // urethane wins over solid
  });

  it("maps 'hybrid' strings", () => {
    expect(mapCoverstock("Hybrid Reactive")).toBe("Hybrid");
    expect(mapCoverstock("eTrax Hybrid S20")).toBe("Hybrid");
  });

  it("maps 'pearl' strings", () => {
    expect(mapCoverstock("ReX Pearl Reactive")).toBe("Pearl");
    expect(mapCoverstock("NeX (Nano Engineered eXterior) Pearl")).toBe("Pearl");
  });

  it("maps 'solid' strings", () => {
    expect(mapCoverstock("NeX Solid")).toBe("Solid");
    expect(mapCoverstock("MicroTrax-S18 Solid")).toBe("Solid");
  });

  it("returns null for unrecognised strings", () => {
    expect(mapCoverstock("Proactive Reactive")).toBe(null);
    expect(mapCoverstock("")).toBe(null);
    expect(mapCoverstock("Unknown Material XZ")).toBe(null);
  });

  it("urethane priority beats solid/pearl/hybrid", () => {
    expect(mapCoverstock("Urethane Pearl Reactive")).toBe("Urethane");
    expect(mapCoverstock("hybrid urethane mix")).toBe("Urethane");
  });

  it("hybrid priority beats pearl and solid", () => {
    expect(mapCoverstock("Hybrid Pearl Reactive")).toBe("Hybrid");
    expect(mapCoverstock("Hybrid Solid Reactive")).toBe("Hybrid");
  });
});

describe("deriveCoreType", () => {
  it("returns Asymmetric when mbDiff > 0", () => {
    expect(deriveCoreType(0.018)).toBe("Asymmetric");
    expect(deriveCoreType(0.001)).toBe("Asymmetric");
  });

  it("returns Symmetric when mbDiff is null", () => {
    expect(deriveCoreType(null)).toBe("Symmetric");
  });

  it("returns Symmetric when mbDiff is 0", () => {
    expect(deriveCoreType(0)).toBe("Symmetric");
  });
});

describe("normalizeName", () => {
  it("lowercases", () => {
    expect(normalizeName("Hustle INK")).toBe("hustle ink");
  });

  it("strips punctuation", () => {
    expect(normalizeName("Hy-Road")).toBe("hy road");
    expect(normalizeName("R.M.S.")).toBe("r m s");
  });

  it("converts roman numeral II to 2", () => {
    expect(normalizeName("Phaze II")).toBe("phaze 2");
  });

  it("converts roman numeral III to 3", () => {
    expect(normalizeName("Alpha III")).toBe("alpha 3");
  });

  it("converts roman numeral IV to 4", () => {
    expect(normalizeName("Hyper IV")).toBe("hyper 4");
  });

  it("converts roman numeral V to 5", () => {
    expect(normalizeName("Crux V")).toBe("crux 5");
  });

  it("does not convert 'live' (contains i)", () => {
    // 'live' should NOT get the 'i' substituted
    expect(normalizeName("Live Ball")).toBe("live ball");
  });

  it("collapses whitespace", () => {
    expect(normalizeName("  Phaze   II  ")).toBe("phaze 2");
  });
});

describe("slug", () => {
  it("produces a stable slug for Storm Phaze II 2017", () => {
    expect(slug("Storm", "Phaze II", 2017)).toBe("storm-phaze-2-2017");
  });

  it("handles brand with space (Roto Grip)", () => {
    expect(slug("Roto Grip", "Hustle Ink", 2022)).toBe(
      "roto-grip-hustle-ink-2022"
    );
  });

  it("handles null releaseYear (trims trailing dash)", () => {
    const result = slug("Storm", "Phaze II", null);
    expect(result).not.toMatch(/-$/);
    expect(result).toBe("storm-phaze-2");
  });
});

// ---------------------------------------------------------------------------
// validate.ts
// ---------------------------------------------------------------------------
describe("validateRaw", () => {
  const valid = {
    brand: "Storm" as const,
    name: "Phaze II",
    releaseDate: "2017-09-01",
    coverstockRaw: "ReX Pearl Reactive",
    factoryFinish: null,
    coreName: null,
    rg: 2.48,
    diff: 0.054,
    mbDiff: 0.018,
    sourceUrls: ["https://example.com"],
  };

  it("returns empty for a valid ball", () => {
    expect(validateRaw(valid)).toEqual([]);
  });

  it("flags missing brand", () => {
    const b = { ...valid, brand: "" as never };
    expect(validateRaw(b).length).toBeGreaterThan(0);
  });

  it("flags empty name", () => {
    const b = { ...valid, name: "" };
    expect(validateRaw(b)).toContain("missing name");
  });

  it("flags missing coverstockRaw", () => {
    const b = { ...valid, coverstockRaw: "" };
    expect(validateRaw(b)).toContain("missing coverstockRaw");
  });

  it("flags empty sourceUrls", () => {
    const b = { ...valid, sourceUrls: [] };
    expect(validateRaw(b)).toContain("sourceUrls must be non-empty");
  });

  it("flags rg out of range but does NOT throw", () => {
    const b = { ...valid, rg: 3.5 };
    const problems = validateRaw(b);
    expect(problems.some((p) => p.includes("rg"))).toBe(true);
  });

  it("flags diff out of range", () => {
    const b = { ...valid, diff: 0.1 };
    const problems = validateRaw(b);
    expect(problems.some((p) => p.includes("diff"))).toBe(true);
  });

  it("flags mbDiff out of range", () => {
    const b = { ...valid, mbDiff: 0.1 };
    const problems = validateRaw(b);
    expect(problems.some((p) => p.includes("mbDiff"))).toBe(true);
  });

  it("does NOT flag null rg/diff/mbDiff", () => {
    const b = { ...valid, rg: null, diff: null, mbDiff: null };
    expect(validateRaw(b)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// build smoke test against data/balls.sample.json
// ---------------------------------------------------------------------------
describe("build script smoke test (balls.sample.json)", () => {
  // process.cwd() is the repo root (where vitest is run from)
  const REPO_ROOT = process.cwd();
  const SCRIPT_DIR = resolve(REPO_ROOT, "scripts/sync-catalog");
  const SAMPLE = resolve(SCRIPT_DIR, "data/balls.sample.json");
  // Write to a temp dir so the smoke test never clobbers the real catalog.
  const OUT_DIR = mkdtempSync(resolve(tmpdir(), "catalog-build-"));
  const CATALOG = resolve(OUT_DIR, "catalog.json");
  const MANIFEST = resolve(OUT_DIR, "catalog-manifest.json");

  // Run the build before all assertions in this suite
  let buildOutput = "";
  beforeAll(() => {
    const buildScript = resolve(SCRIPT_DIR, "build.ts");
    buildOutput = execSync(
      `node --import tsx/esm ${buildScript} ${SAMPLE}`,
      { cwd: REPO_ROOT, encoding: "utf-8", env: { ...process.env, CATALOG_OUT_DIR: OUT_DIR } }
    );
  });

  it("runs successfully against balls.sample.json", () => {
    expect(buildOutput).toContain("Balls written: 2");
  });

  it("produces a valid catalog.json with CatalogBall shape", () => {
    expect(existsSync(CATALOG)).toBe(true);
    const balls: CatalogBall[] = JSON.parse(readFileSync(CATALOG, "utf-8"));
    expect(Array.isArray(balls)).toBe(true);
    expect(balls.length).toBe(2);

    for (const ball of balls) {
      expect(typeof ball.id).toBe("string");
      expect(typeof ball.brand).toBe("string");
      expect(typeof ball.name).toBe("string");
      expect(typeof ball.sourceUrl).toBe("string");
      // Images are always null in build output
      expect(ball.imageThumb).toBeNull();
      expect(ball.imageFull).toBeNull();
    }
  });

  it("classifies Phaze II as Asymmetric Pearl", () => {
    const balls: CatalogBall[] = JSON.parse(readFileSync(CATALOG, "utf-8"));
    const phaze = balls.find((b) => b.name === "Phaze II");
    expect(phaze).toBeDefined();
    expect(phaze?.coverstockCategory).toBe("Pearl");
    expect(phaze?.coreType).toBe("Asymmetric");
    expect(phaze?.id).toBe("storm-phaze-2-2017");
  });

  it("classifies Hustle Ink as Symmetric Hybrid", () => {
    const balls: CatalogBall[] = JSON.parse(readFileSync(CATALOG, "utf-8"));
    const hustle = balls.find((b) => b.name === "Hustle Ink");
    expect(hustle).toBeDefined();
    expect(hustle?.coverstockCategory).toBe("Hybrid");
    expect(hustle?.coreType).toBe("Symmetric");
  });

  it("produces a valid catalog-manifest.json", () => {
    expect(existsSync(MANIFEST)).toBe(true);
    const manifest: CatalogManifest = JSON.parse(
      readFileSync(MANIFEST, "utf-8")
    );
    expect(typeof manifest.version).toBe("number");
    expect(manifest.version).toBeGreaterThan(0);
    expect(typeof manifest.generatedAt).toBe("string");
    expect(manifest.ballCount).toBe(2);
    expect(typeof manifest.hash).toBe("string");
    expect(manifest.hash.length).toBeGreaterThan(0);
  });

  it("passes weights[] through for Phaze II (round-trip)", () => {
    const balls: CatalogBall[] = JSON.parse(readFileSync(CATALOG, "utf-8"));
    const phaze = balls.find((b) => b.name === "Phaze II");
    expect(phaze).toBeDefined();
    expect(Array.isArray(phaze?.weights)).toBe(true);
    expect(phaze?.weights?.length).toBe(2);
    const w15 = phaze?.weights?.find((w) => w.weight === 15);
    expect(w15).toBeDefined();
    expect(w15?.rg).toBe(2.48);
    expect(w15?.diff).toBe(0.054);
    expect(w15?.mbDiff).toBe(0.018);
    const w14 = phaze?.weights?.find((w) => w.weight === 14);
    expect(w14).toBeDefined();
    expect(w14?.rg).toBe(2.50);
  });

  it("omits weights key for Hustle Ink (no weights in input)", () => {
    const balls: CatalogBall[] = JSON.parse(readFileSync(CATALOG, "utf-8"));
    const hustle = balls.find((b) => b.name === "Hustle Ink");
    expect(hustle).toBeDefined();
    expect(hustle?.weights).toBeUndefined();
  });
});
