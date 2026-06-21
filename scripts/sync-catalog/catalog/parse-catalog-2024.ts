/**
 * SPI catalog parser for the 2024 layout.
 *
 * Usage:
 *   npm run parse-catalog-2024 -- <pdf-url-or-path> 2024
 *
 * In 2024 each ball is "RG DIFF PSA <fields…SKU NAME> RG DIFF PSA <weight rows>",
 * where a weight row is "<wt> lb <values>" and the RG/DIFF/PSA values appear
 * AFTER the weight in an inconsistent order (e.g. "16 lb .048 .020 2.48"). We
 * split on the RG/DIFF headers, detect which chunks are weight tables, classify
 * each row's numbers by magnitude (2.xx = RG, .0xx = diff/psa), and pair the
 * table with the preceding field chunk via buildSeedBall().
 *
 * TOKEN-SAFE: PDF text parsed in-script, never returned to a model context.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { SEED_DIR, getText, buildSeedBall, loadUsbcIndex, type SeedBall, type WeightRow } from "./parse-blocks.js";

function parse2024Weights(chunk: string): WeightRow[] {
  const tokens = chunk.split(/\s+/).filter(Boolean);
  // Indices where "<wt> lb" begins.
  const anchors: { idx: number; weight: number }[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (/^1[0-6]$/.test(tokens[i]) && tokens[i + 1] === "lb") {
      anchors.push({ idx: i, weight: parseInt(tokens[i]) });
    }
  }
  const rows: WeightRow[] = [];
  for (let a = 0; a < anchors.length; a++) {
    const from = anchors[a].idx + 2;
    const to = a + 1 < anchors.length ? anchors[a + 1].idx : Math.min(tokens.length, from + 4);
    const win = tokens.slice(from, to);
    const rg = win.find((t) => /^2\.\d{2}$/.test(t));
    const decs = win.filter((t) => /^\.\d{3}$/.test(t)).map(parseFloat);
    if (rg && decs.length >= 1) {
      rows.push({ weight: anchors[a].weight, rg: parseFloat(rg), diff: decs[0], mbDiff: decs[1] ?? null });
    }
  }
  return rows;
}

async function main(): Promise<void> {
  const [src, yearArg] = process.argv.slice(2);
  if (!src) {
    console.error("Usage: npm run parse-catalog-2024 -- <pdf-url-or-path> 2024");
    process.exit(1);
  }

  console.log("Extracting catalog text…");
  const text = await getText(src);
  console.log(`Extracted ${text.length.toLocaleString()} chars.`);

  const { index, byNorm } = loadUsbcIndex();
  const chunks = text.split(/RG\s*DIFF(?:\s*PSA)?/);

  const balls: SeedBall[] = [];
  let needsReview = 0;
  let tables = 0;
  for (let i = 1; i < chunks.length; i++) {
    const weights = parse2024Weights(chunks[i]);
    if (weights.length === 0) continue;
    tables++;
    // Fields live in the preceding chunk (Color/Coverstock/SKU/Name).
    const ball = buildSeedBall(chunks[i - 1], weights, {
      releaseDate: yearArg ? `${yearArg}-01-01` : null,
      sourceUrls: ["https://www.stormbowling.com", src],
      index,
      byNorm,
    });
    if (!ball) continue;
    if (ball._needsReview) needsReview++;
    balls.push(ball);
  }

  mkdirSync(SEED_DIR, { recursive: true });
  const outPath = resolve(SEED_DIR, `spi-${yearArg ?? "unknown"}-seed.json`);
  writeFileSync(outPath, JSON.stringify(balls, null, 2) + "\n");

  console.log(`\n=== Summary ===`);
  console.log(`  Weight tables:  ${tables}`);
  console.log(`  Balls emitted:  ${balls.length}`);
  console.log(`  Need review:    ${needsReview}`);
  console.log(`  Wrote: ${outPath}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
