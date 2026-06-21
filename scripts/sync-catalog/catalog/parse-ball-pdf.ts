/**
 * Single Storm ball tech-data sheet (or pasted text) → one staging seed entry.
 *
 * Usage:
 *   npm run parse-ball -- <tech-data-pdf-url-or-path>
 *   npm run parse-ball -- https://stormproducts.../Storm_IQ%20Tour%2078U_Tech%20Data.pdf
 *   pbpaste | npm run parse-ball -- -          # parse pasted spec text on stdin
 *
 * Appends the parsed ball to scripts/sync-catalog/data/seed/single-balls-seed.json
 * for review before merge into balls.json. Use this to add any new ball by
 * pasting its tech-spec PDF link (or the raw spec text).
 *
 * TOKEN-SAFE: PDF/text parsed in-script, never returned to a model context.
 * Name + brand reconcile against data/usbc-index.json. Shared parsing lives in
 * ./parse-blocks.ts. No LLM.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  SEED_DIR,
  getText,
  segment,
  parseBall,
  loadUsbcIndex,
  type SeedBall,
} from "./parse-blocks.js";

const OUT_PATH = resolve(SEED_DIR, "single-balls-seed.json");

async function main(): Promise<void> {
  const [src] = process.argv.slice(2);
  if (!src) {
    console.error("Usage: npm run parse-ball -- <pdf-url-or-path | ->");
    process.exit(1);
  }

  const text = await getText(src);
  const { index, byNorm } = loadUsbcIndex();

  // A tech sheet is one ball, but its layout may yield several RG/DIFF matches
  // (e.g. a design-intent box). Pick the segment with the most weight rows.
  const segs = segment(text);
  const candidates = segs
    .map((seg) => parseBall(seg, { releaseDate: null, sourceUrls: [src], index, byNorm }))
    .filter((b): b is SeedBall => b !== null);
  if (candidates.length === 0) {
    console.error("No spec block (RG/DIFF table) found in source.");
    process.exit(1);
  }
  const ball = candidates.sort((a, b) => (b.weights?.length ?? 0) - (a.weights?.length ?? 0))[0];
  ball.sourceUrls = src.startsWith("http") ? [src] : ["https://www.stormbowling.com", src];

  // Append to the single-balls staging file (dedupe by brand+name).
  mkdirSync(SEED_DIR, { recursive: true });
  const existing: SeedBall[] = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf-8")) : [];
  const dupIdx = existing.findIndex((b) => b.brand === ball.brand && b.name === ball.name);
  if (dupIdx >= 0) existing[dupIdx] = ball;
  else existing.push(ball);
  writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2) + "\n");

  console.log("=== Parsed ball ===");
  console.log(`  Name:    ${ball.name}${ball._needsReview ? "  ⚠ REVIEW" : ""}`);
  console.log(`  Brand:   ${ball.brand}`);
  console.log(`  Cover:   ${ball.coverstockRaw}`);
  console.log(`  Core:    ${ball.coreName}`);
  console.log(`  Finish:  ${ball.factoryFinish}`);
  console.log(`  15lb:    RG ${ball.rg}  Diff ${ball.diff}  MB ${ball.mbDiff}`);
  console.log(`  Weights: ${ball.weights?.map((w) => w.weight).join(", ")}`);
  console.log(`  Colors:  ${ball.colorways.map((c) => `${c.sku}${c.color ? ` (${c.color})` : ""}`).join(", ")}`);
  if (ball._needsReview) console.log(`  Candidate name(s): ${ball._candidateName}`);
  console.log(`  ${dupIdx >= 0 ? "Updated" : "Appended"} → ${OUT_PATH}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
