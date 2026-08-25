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
import { parsePage as parseMotiv } from "./catalog/parse-motiv.js";
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

// ---------------------------------------------------------------------------
// catalog/parse-motiv.ts
// ---------------------------------------------------------------------------
describe("parse-motiv", () => {
  const fixture = (name: string): string =>
    readFileSync(resolve(process.cwd(), "scripts/sync-catalog/__fixtures__", name), "utf-8");

  const JG2_URL = "https://www.motivbowling.com/products/balls/heavy-oil/jackal-ghost-v2.html";
  const NEBULA_URL = "https://www.motivbowling.com/products/balls/medium-oil/nebula.html";
  const COVERT_URL =
    "https://www.motivbowling.com/products/balls/medium-heavy-oil/covert-vip-exj.html";

  it("reads an asymmetric ball off its spec tables", () => {
    const ball = parseMotiv(fixture("motiv-jackal-ghost-v2.html"), JG2_URL);
    expect(ball.brand).toBe("Motiv");
    expect(ball.name).toBe("Jackal Ghost V2");
    expect(ball.releaseDate).toBe("2026-08-12");
    expect(ball.factoryFinish).toBe("3000 Grit LSS");
    expect(ball.rg).toBe(2.47);
    expect(ball.diff).toBe(0.054);
    expect(ball.mbDiff).toBe(0.015);
    expect(ball.sourceUrls).toEqual([JG2_URL]);
    expect(ball._discontinued).toBe(false);
  });

  it("drops the trademark sign and the core's shape label", () => {
    const ball = parseMotiv(fixture("motiv-jackal-ghost-v2.html"), JG2_URL);
    // The cell reads "Predator™ V2 Asymmetric".
    expect(ball.coreName).toBe("Predator V2");
    expect(parseMotiv(fixture("motiv-nebula.html"), NEBULA_URL).coreName).toBe("Hadron");
  });

  it("takes the coverstock exactly as MOTIV states it", () => {
    // A solid cover is filed as plain "Reactive" here. Adding the "Solid" that
    // other databases infer would be inventing a word the source never used.
    expect(parseMotiv(fixture("motiv-jackal-ghost-v2.html"), JG2_URL).coverstockRaw).toBe(
      "Leverage HFS Reactive"
    );
    expect(parseMotiv(fixture("motiv-nebula.html"), NEBULA_URL).coverstockRaw).toBe(
      "Dark Matter Propulsion Pearl Reactive"
    );
  });

  it("gives a symmetric ball a null mbDiff, on every weight", () => {
    const ball = parseMotiv(fixture("motiv-nebula.html"), NEBULA_URL);
    expect(ball.mbDiff).toBeNull();
    expect(ball.weights?.every((w) => w.mbDiff === null)).toBe(true);
  });

  it("reads every weight, heaviest first, and takes the 15 lb row as the headline", () => {
    const ball = parseMotiv(fixture("motiv-jackal-ghost-v2.html"), JG2_URL);
    expect(ball.weights?.map((w) => w.weight)).toEqual([16, 15, 14, 13, 12]);
    expect(ball.weights?.[0]).toEqual({ weight: 16, rg: 2.48, diff: 0.047, mbDiff: 0.013 });
    const w15 = ball.weights?.find((w) => w.weight === 15);
    expect([ball.rg, ball.diff, ball.mbDiff]).toEqual([w15?.rg, w15?.diff, w15?.mbDiff]);
  });

  it("reads both shapes of release date, and neither as day/month", () => {
    // A ball still coming reads "AVAILABLE 11/26/2025"; one already out reads
    // a bare "3/28/2014". Both are month/day/year, so a day past the 12th is
    // the case that would expose reading them the other way round.
    expect(parseMotiv(fixture("motiv-nebula.html"), NEBULA_URL).releaseDate).toBe("2025-11-26");
    const bare =
      '<span data-product-variant-item-number>MTVBVSPPS</span>' +
      '<div class="item-name-plus-release-date"><h1>Venom Shock</h1>' +
      '<span class="release-date">3/28/2014</span></div>';
    expect(parseMotiv(bare, NEBULA_URL).releaseDate).toBe("2014-03-28");
  });

  it("leaves the release date null when the page carries no date", () => {
    const undated =
      '<span data-product-variant-item-number>MTVBNEB</span>' +
      '<div class="item-name-plus-release-date"><h1>Nebula</h1>' +
      '<span class="release-date"></span></div>';
    expect(parseMotiv(undated, NEBULA_URL).releaseDate).toBeNull();
  });

  it("takes the gallery's first slide as the image, not the core render", () => {
    const ball = parseMotiv(fixture("motiv-nebula.html"), NEBULA_URL);
    expect(ball._imageUrl).toBe(
      "https://www.motivbowling.com/userfiles/filemanager/z481knm90gdcad8fd6sn"
    );
  });

  it("marks a ball filed under retired-balls as discontinued", () => {
    const retired = JG2_URL.replace("/heavy-oil/", "/retired-balls/");
    expect(parseMotiv(fixture("motiv-jackal-ghost-v2.html"), retired)._discontinued).toBe(true);
  });

  it("reports a malformed number as printed, rather than repairing it", () => {
    // MOTIV's Covert VIP EXJ page prints the 15 lb differential as "056",
    // missing the leading point every other row carries. Inferring 0.056 here
    // would be the parser inventing a digit, so it reads 56 and lets the
    // promote gate refuse it as out of range, which puts it in front of a
    // human instead of into the catalog.
    const ball = parseMotiv(fixture("motiv-covert-vip-exj.html"), COVERT_URL);
    expect(ball.diff).toBe(56);
    expect(validateRaw(ball)).toContain("diff 56 out of range [0, 0.065]");
    // The rows that are well formed are unaffected.
    expect(ball.weights?.find((w) => w.weight === 16)?.diff).toBe(0.05);
  });

  it("names a ball whose page has retired out of the sale layout", () => {
    // A ball still listed wraps its heading in `item-name-plus-release-date`;
    // one retired long enough drops the wrapper and leaves the <h1> bare, with
    // no release date anywhere on the page.
    const url = "https://www.motivbowling.com/products/balls/retired-balls/jackal.html";
    const ball = parseMotiv(fixture("motiv-jackal-retired.html"), url);
    expect(ball.name).toBe("Jackal");
    expect(ball.releaseDate).toBeNull();
    expect(ball._discontinued).toBe(true);
    expect(ball.rg).toBe(2.46);
    expect(ball.diff).toBe(0.06);
    expect(ball.mbDiff).toBe(0.015);
  });

  it("folds in a cover type MOTIV states only in the page copy", () => {
    // An older page gives the cell just the coverstock's name and leaves the
    // type to the copy. Left out, the build cannot classify the cover and the
    // ball never answers a coverstock filter, so it is read from the two
    // shapes MOTIV writes: an expanded acronym, or a plain description.
    const trident = parseMotiv(
      fixture("motiv-trident-retired.html"),
      "https://www.motivbowling.com/products/balls/retired-balls/trident.html"
    );
    // The page reads "Coercion HVH (High Volume Hybrid) cover stock".
    expect(trident.coverstockRaw).toBe("Coercion HVH Hybrid Reactive");

    const jackal = parseMotiv(
      fixture("motiv-jackal-retired.html"),
      "https://www.motivbowling.com/products/balls/retired-balls/jackal.html"
    );
    // The page opens "The Jackal is a power pearl".
    expect(jackal.coverstockRaw).toBe("Turmoil HFP Pearl Reactive");
  });

  it("leaves a cell that already names its type alone", () => {
    expect(parseMotiv(fixture("motiv-nebula.html"), NEBULA_URL).coverstockRaw).toBe(
      "Dark Matter Propulsion Pearl Reactive"
    );
    // No type in the cell and none stated on the page: still no invention.
    const quiet =
      '<span data-product-variant-item-number>X</span><h1>Quiet</h1>' +
      '<section class="product-specifications">' +
      "<table><tr><th>Cover Stock</th><td>Something Reactive</td></tr></table></section>";
    expect(parseMotiv(quiet, NEBULA_URL).coverstockRaw).toBe("Something Reactive");
  });

  it("throws rather than staging a nameless ball", () => {
    expect(() => parseMotiv("<html><h1>Be the first to know</h1></html>", JG2_URL)).toThrow(
      /No ball name/
    );
  });
});
