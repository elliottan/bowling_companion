/**
 * SPI catalog parser for the COLUMNAR weight-table layout (2022 + 2023).
 *
 * Usage:
 *   npm run parse-catalog-columnar -- <pdf-url-or-path> <year>
 *
 * In these years the spec table is transposed: a weight header
 *   "16 lb 15 lb 14 lb 13 lb 12 lb"
 * is followed by all RG values (one per weight), then all DIFF values, then
 * (for asymmetric balls) all PSA values. The ball's labels (Color/Coverstock/
 * Factory Finish/SKU/Name) appear *before* its weight header. We tokenize, anchor
 * on the weight header, read values by magnitude (2.xx = RG, .0xx = diff/psa),
 * and hand the preceding field text to buildSeedBall().
 *
 * TOKEN-SAFE: PDF text parsed in-script, never returned to a model context.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { SEED_DIR, getText, buildSeedBall, loadUsbcIndex, type SeedBall, type WeightRow } from "./parse-blocks.js";

interface Record {
  body: string;        // field text preceding the weight header
  weights: WeightRow[];
}

function parseRecords(text: string): Record[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const isWeight = (t: string) => /^1[0-6]$/.test(t);
  const isRg = (t: string) => /^2\.\d{2}$/.test(t);
  const isDecimal = (t: string) => /^\.\d{3}$/.test(t);

  const records: Record[] = [];
  let bodyStart = 0;

  let i = 0;
  while (i < tokens.length) {
    // Detect a weight header: >=3 consecutive "<wt> lb" pairs.
    const weights: number[] = [];
    let j = i;
    while (j + 1 < tokens.length && isWeight(tokens[j]) && tokens[j + 1] === "lb") {
      weights.push(parseInt(tokens[j]));
      j += 2;
    }
    if (weights.length < 3) {
      i++;
      continue;
    }
    const headerStart = i;

    // Read RG run (one per weight, in header order), then the .0xx run.
    const rgs: number[] = [];
    while (j < tokens.length && isRg(tokens[j]) && rgs.length < weights.length) {
      rgs.push(parseFloat(tokens[j])); j++;
    }
    const decs: number[] = [];
    while (j < tokens.length && isDecimal(tokens[j])) {
      decs.push(parseFloat(tokens[j])); j++;
    }
    const k = weights.length;
    const diffs = decs.slice(0, k);
    const psas = decs.length >= 2 * k ? decs.slice(k, 2 * k) : [];

    const rows: WeightRow[] = weights.map((w, idx) => ({
      weight: w,
      rg: rgs[idx] ?? null as unknown as number,
      diff: diffs[idx] ?? null as unknown as number,
      mbDiff: psas[idx] ?? null,
    })).filter((r) => r.rg != null && r.diff != null);

    if (rows.length > 0) {
      records.push({ body: tokens.slice(bodyStart, headerStart).join(" "), weights: rows });
      bodyStart = j; // next ball's fields start after this ball's values
    }
    i = j;
  }
  return records;
}

async function main(): Promise<void> {
  const [src, yearArg] = process.argv.slice(2);
  if (!src) {
    console.error("Usage: npm run parse-catalog-columnar -- <pdf-url-or-path> <year>");
    process.exit(1);
  }

  console.log("Extracting catalog text…");
  const text = await getText(src);
  console.log(`Extracted ${text.length.toLocaleString()} chars.`);

  const { index, byNorm } = loadUsbcIndex();
  const records = parseRecords(text);
  console.log(`Found ${records.length} columnar weight tables.`);

  const balls: SeedBall[] = [];
  let needsReview = 0;
  for (const rec of records) {
    const ball = buildSeedBall(rec.body, rec.weights, {
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
  console.log(`  Weight tables:  ${records.length}`);
  console.log(`  Balls emitted:  ${balls.length}`);
  console.log(`  Need review:    ${needsReview}`);
  console.log(`  Wrote: ${outPath}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
