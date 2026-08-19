/**
 * Stage 2, the cheap path, staged parser output becomes candidates.
 *
 * Usage:
 *   npm run seed-to-candidates -- bowwwl-seed.json
 *   npm run seed-to-candidates -- single-balls-seed.json --parser parse-ball
 *
 * `parse-bowwwl` and `parse-ball` already turn a source document into a full
 * entry without a model in the loop, and they stage to data/seed/. This maps
 * that output into data/candidates/ so it goes through the same promote gate as
 * anything a model read: collision checks, range checks, one entry point into
 * balls.json. Their readings are marked with the parser that produced them,
 * which is what earns them an exemption from the quote and second-site rules.
 *
 * The seed file is left alone; converting twice is harmless, because promote
 * refuses the second copy as a collision.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { slug } from "../normalize.js";
import type { RawBall } from "../types.js";
import type { Manufacturer } from "../../../src/types/catalog.js";
import type { BallCandidate, Evidence } from "./types.js";

/** What the parsers stage: a RawBall plus their own bookkeeping fields. */
type StagedBall = RawBall & { _imageUrl?: string | null; _discontinued?: boolean };

/** Which parser wrote which seed file, so the provenance is not guesswork. */
const PARSER_BY_FILE: Record<string, string> = {
  "bowwwl-seed.json": "parse-bowwwl",
  "single-balls-seed.json": "parse-ball",
  "spi-2022-seed.json": "parse-catalog-pdf",
  "spi-2023-seed.json": "parse-catalog-pdf",
  "spi-2024-seed.json": "parse-catalog-2024",
  "spi-2025-seed.json": "parse-catalog-columnar",
};

/** An SPI catalog or tech sheet is the manufacturer's own document. */
const OFFICIAL_PARSERS = new Set([
  "parse-ball",
  "parse-catalog-pdf",
  "parse-catalog-2024",
  "parse-catalog-columnar",
]);

function reading<T>(value: T | null | undefined, sourceUrl: string, parser: string): Evidence<T>[] {
  return value == null ? [] : [{ value, sourceUrl, quote: "", parser }];
}

export function toCandidate(ball: StagedBall, parser: string): BallCandidate {
  const src = ball.sourceUrls.find((u) => u && u !== "-") ?? "";
  return {
    brand: ball.brand as Manufacturer,
    name: ball.name,
    official: OFFICIAL_PARSERS.has(parser),
    releaseDate: reading(ball.releaseDate, src, parser),
    coverstockRaw: reading(ball.coverstockRaw, src, parser),
    factoryFinish: reading(ball.factoryFinish, src, parser),
    coreName: reading(ball.coreName, src, parser),
    rg: reading(ball.rg, src, parser),
    diff: reading(ball.diff, src, parser),
    mbDiff: reading(ball.mbDiff, src, parser),
    ...(ball.weights ? { weights: reading(ball.weights, src, parser) } : {}),
    ...(ball.colorways ? { colorways: reading(ball.colorways, src, parser) } : {}),
    ...(ball._imageUrl ? { imageUrl: reading(ball._imageUrl, src, parser) } : {}),
  };
}

function main(): void {
  const DATA = resolve(fileURLToPath(new URL(".", import.meta.url)), "../data");
  const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npm run seed-to-candidates -- <seed-file.json> [--parser <name>]");
    process.exit(1);
  }
  const parserArg = process.argv.indexOf("--parser");
  const parser =
    parserArg >= 0 ? process.argv[parserArg + 1] : (PARSER_BY_FILE[file] ?? "unknown-parser");
  if (parser === "unknown-parser") {
    console.error(`No parser recorded for ${file}. Pass --parser <name> so provenance is honest.`);
    process.exit(1);
  }

  const staged: StagedBall[] = JSON.parse(readFileSync(resolve(DATA, "seed", file), "utf-8"));
  const outDir = resolve(DATA, "candidates");
  mkdirSync(outDir, { recursive: true });

  for (const ball of staged) {
    const year = ball.releaseDate ? parseInt(ball.releaseDate.slice(0, 4), 10) : null;
    const id = slug(ball.brand, ball.name, year);
    const candidate = toCandidate(ball, parser);
    writeFileSync(resolve(outDir, `${id}.json`), JSON.stringify(candidate, null, 2) + "\n");
  }

  console.log(`\n=== Seed to candidates ===`);
  console.log(`  ${staged.length} staged entr(ies) from ${file} via ${parser}`);
  console.log(`  Wrote ${outDir}`);
  console.log(`  Next: npm run promote-candidates -- --dry-run`);
}

if (process.argv[1] && process.argv[1].endsWith("from-seed.ts")) main();
