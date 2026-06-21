/**
 * sync-catalog build script
 * Usage:
 *   npm run sync-catalog                              # reads scripts/sync-catalog/data/balls.json
 *   npm run sync-catalog -- path/to/balls.json        # custom input path (e.g. for dry-run with sample)
 *
 * No network calls. Pure deterministic transform.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CatalogBall, CatalogManifest } from "../../src/types/catalog.js";
import { mapCoverstock, deriveCoreType, slug } from "./normalize.js";
import { validateRaw } from "./validate.js";
import type { RawBall } from "./types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../");

const DEFAULT_INPUT = resolve(__dirname, "data/balls.json");
// Output dir is overridable (env) so tests can write to a temp dir instead of
// clobbering the real public/catalog catalog.
const OUT_DIR = process.env.CATALOG_OUT_DIR
  ? resolve(process.cwd(), process.env.CATALOG_OUT_DIR)
  : resolve(REPO_ROOT, "public/catalog");
const CATALOG_OUT = resolve(OUT_DIR, "catalog.json");
const MANIFEST_OUT = resolve(OUT_DIR, "catalog-manifest.json");

// ---------------------------------------------------------------------------
// Stable JSON serialisation (sorted keys, 2-space indent)
// ---------------------------------------------------------------------------
const KEY_ORDER: (keyof CatalogBall)[] = [
  "id",
  "brand",
  "name",
  "releaseDate",
  "releaseYear",
  "coverstockRaw",
  "coverstockCategory",
  "factoryFinish",
  "coreName",
  "coreType",
  "rg",
  "diff",
  "mbDiff",
  "imageThumb",
  "imageFull",
  "sourceUrl",
  "weights",
  "colorways",
];

function stableStringify(balls: CatalogBall[]): string {
  const ordered = balls.map((b) => {
    const obj: Record<string, unknown> = {};
    for (const k of KEY_ORDER) {
      if (k in b) obj[k] = b[k];
    }
    return obj;
  });
  return JSON.stringify(ordered, null, 2);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  const inputPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : DEFAULT_INPUT;

  if (!existsSync(inputPath)) {
    console.error(`ERROR: input file not found: ${inputPath}`);
    console.error(
      "Create scripts/sync-catalog/data/balls.json or pass a path as an argument."
    );
    process.exit(1);
  }

  // Read raw input
  const rawBalls: RawBall[] = JSON.parse(readFileSync(inputPath, "utf-8"));

  const flagged: { name: string; problems: string[] }[] = [];
  const unclassified: string[] = [];
  const seenIds = new Map<string, string>(); // id -> name
  const collisions: string[] = [];
  const catalogBalls: CatalogBall[] = [];

  for (const raw of rawBalls) {
    // Validation (flags but does NOT drop)
    const problems = validateRaw(raw);
    if (problems.length > 0) {
      flagged.push({ name: raw.name ?? "(unnamed)", problems });
    }

    // Derive fields
    const releaseYear =
      raw.releaseDate ? parseInt(raw.releaseDate.slice(0, 4), 10) : null;
    const id = slug(raw.brand, raw.name, releaseYear);
    const coverstockCategory = mapCoverstock(raw.coverstockRaw ?? "");
    const coreType = deriveCoreType(raw.mbDiff);

    if (coverstockCategory === null) {
      unclassified.push(`${raw.brand} ${raw.name} — "${raw.coverstockRaw}"`);
    }

    // Dedupe by id
    if (seenIds.has(id)) {
      collisions.push(
        `id "${id}" collision: "${seenIds.get(id)}" and "${raw.name}"`
      );
      continue; // keep first occurrence
    }
    seenIds.set(id, raw.name);

    const ball: CatalogBall = {
      id,
      brand: raw.brand,
      name: raw.name,
      releaseDate: raw.releaseDate,
      releaseYear,
      coverstockRaw: raw.coverstockRaw,
      coverstockCategory,
      factoryFinish: raw.factoryFinish,
      coreName: raw.coreName,
      coreType,
      rg: raw.rg,
      diff: raw.diff,
      mbDiff: raw.mbDiff,
      imageThumb: null,
      imageFull: null,
      sourceUrl: raw.sourceUrls[0] ?? "",
      ...(raw.weights !== undefined ? { weights: raw.weights } : {}),
      ...(raw.colorways !== undefined ? { colorways: raw.colorways } : {}),
    };

    catalogBalls.push(ball);
  }

  // Serialize catalog
  const catalogJson = stableStringify(catalogBalls);
  writeFileSync(CATALOG_OUT, catalogJson + "\n", "utf-8");

  // Compute hash
  const hash = createHash("sha256").update(catalogJson).digest("hex");

  // Read existing manifest to decide whether to bump version
  let existingVersion = 0;
  if (existsSync(MANIFEST_OUT)) {
    try {
      const existing: CatalogManifest = JSON.parse(
        readFileSync(MANIFEST_OUT, "utf-8")
      );
      existingVersion = existing.version ?? 0;
      // Only bump if hash changed
      if (existing.hash === hash) {
        existingVersion = existingVersion; // keep
      } else {
        existingVersion = existingVersion + 1;
      }
    } catch {
      existingVersion = 1;
    }
  } else {
    existingVersion = 1;
  }

  const manifest: CatalogManifest = {
    version: existingVersion,
    generatedAt: new Date().toISOString(),
    ballCount: catalogBalls.length,
    hash,
  };
  writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n=== sync-catalog summary ===");
  console.log(`Input:         ${inputPath}`);
  console.log(`Balls written: ${catalogBalls.length}`);
  console.log(`Catalog hash:  ${hash.slice(0, 12)}…`);
  console.log(`Manifest v${manifest.version} written.`);

  if (collisions.length > 0) {
    console.log(`\nWARN — ${collisions.length} ID collision(s) (first kept):`);
    for (const c of collisions) console.log(`  • ${c}`);
  }

  if (flagged.length > 0) {
    console.log(`\nWARN — ${flagged.length} ball(s) with validation flags:`);
    for (const { name, problems } of flagged) {
      console.log(`  ${name}:`);
      for (const p of problems) console.log(`    – ${p}`);
    }
  }

  if (unclassified.length > 0) {
    console.log(
      `\nINFO — ${unclassified.length} ball(s) with unclassified coverstock (coverstockCategory = null):`
    );
    for (const u of unclassified) console.log(`  ? ${u}`);
    console.log(
      "  → Add 'solid', 'pearl', 'hybrid', or 'urethane' to coverstockRaw, or classify manually."
    );
  }

  if (collisions.length === 0 && flagged.length === 0 && unclassified.length === 0) {
    console.log("All clean. No warnings.");
  }

  console.log("");
}

main();
