/**
 * USBC approved-ball-list diff script.
 *
 * Usage:
 *   npm run usbc-diff
 *
 * Downloads the USBC approved ball PDF (cached in tmp/), extracts ball names for
 * the 4 whitelisted brands, and diffs against scripts/sync-catalog/data/balls.json.
 * Outputs a per-brand report of balls missing from our catalog (sorted by most
 * recently approved) and balls in our catalog not found in the USBC list.
 *
 * No LLM. Fully deterministic. PDF extraction lives in ./extract.ts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeName } from "../normalize.js";
import type { RawBall } from "../types.js";
import {
  REPO_ROOT,
  WHITELISTED_BRANDS,
  type WhitelistedBrand,
  type BallEntry,
  loadUsbcEntries,
  parseApprovalDateMs,
} from "./extract.js";

const BALLS_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/balls.json");

// ---------------------------------------------------------------------------
// Load our catalog balls.json
// ---------------------------------------------------------------------------
function loadCatalogBalls(): Map<WhitelistedBrand, Set<string>> {
  const rawBalls: RawBall[] = JSON.parse(readFileSync(BALLS_JSON, "utf-8"));
  const result = new Map<WhitelistedBrand, Set<string>>(
    WHITELISTED_BRANDS.map((b) => [b, new Set<string>()])
  );
  for (const ball of rawBalls) {
    const brand = ball.brand as WhitelistedBrand;
    if (result.has(brand)) {
      result.get(brand)!.add(ball.name);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Diff: using normalizeName for fuzzy matching
// ---------------------------------------------------------------------------
function diff(
  usbcEntries: Map<WhitelistedBrand, BallEntry[]>,
  catalogByBrand: Map<WhitelistedBrand, Set<string>>
): void {
  console.log("\n=== USBC diff summary ===\n");

  for (const brand of WHITELISTED_BRANDS) {
    const entries = usbcEntries.get(brand)!;
    const catalogNames = catalogByBrand.get(brand)!;

    // normalizedName -> { original name, date } (first occurrence wins)
    const usbcNorm = new Map<string, BallEntry>();
    for (const entry of entries) {
      const norm = normalizeName(entry.name);
      if (!usbcNorm.has(norm)) usbcNorm.set(norm, entry);
    }
    const catalogNorm = new Map<string, string>();
    for (const name of catalogNames) {
      catalogNorm.set(normalizeName(name), name);
    }

    const missingEntries: BallEntry[] = [];
    for (const [norm, entry] of usbcNorm) {
      if (!catalogNorm.has(norm)) missingEntries.push(entry);
    }
    // Sort by approval date descending (most recent first)
    missingEntries.sort(
      (a, b) => parseApprovalDateMs(b.dateStr) - parseApprovalDateMs(a.dateStr)
    );

    const inCatalogNotUsbc: string[] = [];
    for (const [norm, orig] of catalogNorm) {
      if (!usbcNorm.has(norm)) inCatalogNotUsbc.push(orig);
    }

    console.log(`--- ${brand} ---`);
    console.log(`  USBC total:    ${usbcNorm.size}`);
    console.log(`  Catalog total: ${catalogNames.size}`);
    console.log(
      `  In USBC, missing from catalog: ${missingEntries.length} (sorted by most recently approved)`
    );
    for (const e of missingEntries.slice(0, 20)) {
      console.log(`    + ${e.name}${e.dateStr ? `  [${e.dateStr}]` : ""}`);
    }
    if (missingEntries.length > 20) {
      console.log(`    … and ${missingEntries.length - 20} more`);
    }
    console.log(`  In catalog, not found in USBC: ${inCatalogNotUsbc.length}`);
    for (const n of inCatalogNotUsbc) console.log(`    - ${n}`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("Extracting text from PDF…");
  const usbcEntries = await loadUsbcEntries();

  for (const brand of WHITELISTED_BRANDS) {
    console.log(`  ${brand}: ${usbcEntries.get(brand)!.length} balls found`);
  }

  const catalogByBrand = loadCatalogBalls();
  diff(usbcEntries, catalogByBrand);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
