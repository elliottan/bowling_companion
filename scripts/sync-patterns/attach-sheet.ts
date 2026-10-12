/**
 * Keep a local sheet PDF for a pattern already staged (ADR-136).
 *
 *   npm run attach-pattern-sheet -- <id> <sheet.pdf>
 *
 * For a sheet someone has to hand when its original link is dead, blocked, or
 * never existed. Records the copy on the candidate and changes nothing else: the
 * reading stays the one that was checked. Check the sheet is the same pattern
 * first (its header totals against the catalog's); promote then checks the bytes.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { PatternCandidate } from "./types.js";
import { archiveSheet } from "./sheets.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const [id, pdf] = process.argv.slice(2);
if (!id || !pdf) {
  console.error("Usage: npm run attach-pattern-sheet -- <id> <sheet.pdf>");
  process.exit(1);
}
const path = resolve(HERE, "data/candidates", `${id}.json`);
if (!existsSync(path)) {
  console.error(`No candidate ${id} in data/candidates/.`);
  process.exit(1);
}
const candidate = JSON.parse(readFileSync(path, "utf8")) as PatternCandidate;
const sheet = await archiveSheet(id, readFileSync(pdf));
writeFileSync(path, JSON.stringify({ ...candidate, sheet }, null, 2) + "\n");
console.log(`kept   ${id}: ${sheet.file} (${Math.round(sheet.bytes / 1024)} KB)`);
console.log("Run `npm run promote-patterns` then `npm run sync-patterns` to publish it.");
