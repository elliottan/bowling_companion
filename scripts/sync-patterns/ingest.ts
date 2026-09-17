/**
 * Stage 1, read sheets and stage them as candidates (ADR-104).
 *
 *   npm run ingest-patterns -- <sheet.pdf> [more.pdf ...] [--url <source>]
 *
 * A sheet PDF is read by `read/read-pdf.ts`, and a Kegel KOSI program file, the
 * machine's own copy of the same pattern, by `read/kosi.ts`. A program file
 * states no volume, so `--volume` carries the one the printed sheet states:
 * without it there is nothing to check the loads against.
 *
 * Reads nothing into the catalog. Every sheet lands in data/candidates/ and
 * waits for `npm run promote-patterns` to check its arithmetic.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readSheet } from "./read/read-pdf.js";
import { readKosi } from "./read/kosi.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = resolve(HERE, "data/candidates");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const urlAt = args.indexOf("--url");
  const sourceUrl = urlAt >= 0 ? args[urlAt + 1] : undefined;
  const vendorAt = args.indexOf("--vendor");
  const vendor = vendorAt >= 0 ? args[vendorAt + 1] : undefined;
  const volumeAt = args.indexOf("--volume");
  const volumeMl = volumeAt >= 0 ? Number(args[volumeAt + 1]) : undefined;
  const FLAGS = ["--url", "--vendor", "--volume"];
  const sheets = args.filter((a, i) => !a.startsWith("--") && !FLAGS.includes(args[i - 1]));

  if (sheets.length === 0) {
    console.error(
      "Usage: npm run ingest-patterns -- <sheet.pdf|program.kosi> [--url <source>] [--vendor <name>] [--volume <mL>]"
    );
    process.exitCode = 1;
    return;
  }
  mkdirSync(CANDIDATES, { recursive: true });

  for (const sheet of sheets) {
    const { candidate, checks, verified } = sheet.toLowerCase().endsWith(".pdf")
      ? await readSheet(sheet, { sourceUrl, vendor })
      : readKosi(sheet, readFileSync(sheet, "utf8"), { sourceUrl, vendor, volumeMl });
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
