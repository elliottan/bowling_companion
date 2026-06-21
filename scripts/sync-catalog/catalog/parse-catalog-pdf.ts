/**
 * Storm Products Inc. (SPI) catalog PDF → staging seed file.
 *
 * Usage:
 *   npm run parse-catalog -- <pdf-url-or-path> <year>
 *   e.g. npm run parse-catalog -- tmp/storm-2025-catalog.pdf 2025
 *
 * Deterministically parses an SPI year-catalog PDF (Storm + Roto Grip + 900
 * Global share one catalog) into RawBall[] seed entries with colorways. Output
 * goes to scripts/sync-catalog/data/seed/spi-<year>-seed.json for human review
 * before merge into balls.json.
 *
 * TOKEN-SAFE: PDF text is extracted in-script and never returned to a model
 * context. Name + brand reconcile against data/usbc-index.json; unmatched balls
 * carry `_needsReview: true`. Shared parsing lives in ./parse-blocks.ts.
 *
 * No LLM. pdfjs-dist extraction only.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  SEED_DIR,
  getText,
  segment,
  parseBall,
  loadUsbcIndex,
  type SeedBall,
} from "./parse-blocks.js";

async function main(): Promise<void> {
  const [src, yearArg] = process.argv.slice(2);
  if (!src) {
    console.error("Usage: npm run parse-catalog -- <pdf-url-or-path> <year>");
    process.exit(1);
  }

  console.log("Extracting catalog text…");
  const text = await getText(src);
  console.log(`Extracted ${text.length.toLocaleString()} chars.`);

  const { index, byNorm } = loadUsbcIndex();
  const segs = segment(text);
  console.log(`Found ${segs.length} RG/DIFF spec blocks.`);

  const balls: SeedBall[] = [];
  let skippedNoWeights = 0;
  let needsReview = 0;

  for (const seg of segs) {
    const ball = parseBall(seg, {
      releaseDate: yearArg ? `${yearArg}-01-01` : null,
      sourceUrls: ["https://www.stormbowling.com", src],
      index,
      byNorm,
    });
    if (!ball) {
      skippedNoWeights++;
      continue;
    }
    if (ball._needsReview) needsReview++;
    balls.push(ball);
  }

  mkdirSync(SEED_DIR, { recursive: true });
  const outPath = resolve(SEED_DIR, `spi-${yearArg ?? "unknown"}-seed.json`);
  writeFileSync(outPath, JSON.stringify(balls, null, 2) + "\n");

  console.log(`\n=== Summary ===`);
  console.log(`  Spec blocks:        ${segs.length}`);
  console.log(`  Skipped (no table): ${skippedNoWeights}`);
  console.log(`  Balls emitted:      ${balls.length}`);
  console.log(`  Need review:        ${needsReview}`);
  console.log(`  Wrote: ${outPath}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
