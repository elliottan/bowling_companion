/**
 * Download the original sheet of every staged candidate that has none kept yet
 * (ADR-136).
 *
 *   npm run fetch-pattern-sheets [-- --force] [-- <id> ...]
 *
 * Ingest keeps the PDF it reads, so this is for candidates staged before it did,
 * and for a sheet whose publisher has replaced it (`--force`). Each download must
 * be a PDF, is written to public/catalog/sheets/ under a name carrying its hash,
 * and is recorded on the candidate. Then `npm run promote-patterns` checks the
 * bytes and carries the copy into the catalog, and `npm run sync-patterns`
 * publishes it.
 *
 * A failed download is reported and skipped: the candidate keeps whatever copy
 * it had, and the catalog keeps linking to the original.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { PatternCandidate } from "./types.js";
import { archiveSheet, sheetProblem } from "./sheets.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = resolve(HERE, "data/candidates");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = new Set(args.filter((a) => !a.startsWith("--")));
  let kept = 0;
  let failed = 0;

  for (const file of readdirSync(CANDIDATES).filter((f) => f.endsWith(".json"))) {
    const path = resolve(CANDIDATES, file);
    const candidate = JSON.parse(readFileSync(path, "utf8")) as PatternCandidate;
    if (only.size > 0 && !only.has(candidate.id)) continue;
    if (!candidate.sourceUrl) {
      console.log(`skip   ${candidate.id}: no sourceUrl`);
      continue;
    }
    if (!force && candidate.sheet && sheetProblem(candidate.sheet) == null) {
      console.log(`have   ${candidate.id}: ${candidate.sheet.file}`);
      continue;
    }
    try {
      const response = await fetch(candidate.sourceUrl, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const copy = await archiveSheet(candidate.id, new Uint8Array(await response.arrayBuffer()));
      writeFileSync(path, JSON.stringify({ ...candidate, sheet: copy }, null, 2) + "\n");
      console.log(`kept   ${candidate.id}: ${copy.file} (${Math.round(copy.bytes / 1024)} KB)`);
      kept += 1;
    } catch (error) {
      console.error(`FAILED ${candidate.id}: ${candidate.sourceUrl}: ${(error as Error).message}`);
      failed += 1;
    }
  }

  console.log(`\n${kept} kept, ${failed} failed.`);
  if (kept > 0) console.log("Run `npm run promote-patterns` then `npm run sync-patterns` to publish them.");
  if (failed > 0) process.exitCode = 1;
}

main();
