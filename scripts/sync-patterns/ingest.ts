/**
 * Stage 1, read sheets and stage them as candidates (ADR-104).
 *
 *   npm run ingest-patterns -- <sheet.pdf> [more.pdf ...] [--url <source>]
 *
 * Reads nothing into the catalog. Every sheet lands in data/candidates/ and
 * waits for `npm run promote-patterns` to check its arithmetic.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readSheet } from "./read/read-pdf.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = resolve(HERE, "data/candidates");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const urlAt = args.indexOf("--url");
  const sourceUrl = urlAt >= 0 ? args[urlAt + 1] : undefined;
  const vendorAt = args.indexOf("--vendor");
  const vendor = vendorAt >= 0 ? args[vendorAt + 1] : undefined;
  const sheets = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--url" && args[i - 1] !== "--vendor");

  if (sheets.length === 0) {
    console.error("Usage: npm run ingest-patterns -- <sheet.pdf> [--url <source>] [--vendor <name>]");
    process.exitCode = 1;
    return;
  }
  mkdirSync(CANDIDATES, { recursive: true });

  for (const sheet of sheets) {
    const { candidate, checks, verified } = await readSheet(sheet, { sourceUrl, vendor });
    const passed = checks.filter((c) => c.ok).length;
    writeFileSync(
      resolve(CANDIDATES, `${candidate.id}.json`),
      JSON.stringify(candidate, null, 2) + "\n"
    );
    console.log(
      `${verified ? "read " : "READ?"} ${candidate.id} via ${candidate.reader}: ` +
        `${candidate.passes.length} passes, ${passed}/${checks.length} of the sheet's own checks`
    );
  }
  console.log("\nStaged. Run `npm run promote-patterns` to check them into the catalog.");
}

main();
