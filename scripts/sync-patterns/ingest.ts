/**
 * Stage 1, read sheets and stage them as candidates (ADR-104).
 *
 *   npm run ingest-patterns -- <sheet.pdf|program.kosi|transcript.txt> [more ...] [--url <source>]
 *
 * A sheet PDF is read by `read/read-pdf.ts`, a Kegel KOSI program file, the
 * machine's own copy of the same pattern, by `read/kosi.ts`, and anything else
 * (typically a `.txt` transcription typed from a photo or a sheet with no PDF
 * at all) as a manual reading by `read/manual.ts`, through the same row grammar
 * a text layer goes through. A program file states no volume, so `--volume`
 * carries the one the printed sheet states: without it there is nothing to
 * check the loads against. A transcription's title line often starts with the
 * pattern's own numbers ("2025 Striking..."), which the title guess skips as a
 * header figure, so `--name` carries the name in that case.
 *
 * Reads nothing into the catalog. Every sheet lands in data/candidates/ and
 * waits for `npm run promote-patterns` to check its arithmetic.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readSheet } from "./read/read-pdf.js";
import { readKosi } from "./read/kosi.js";
import { readManual } from "./read/manual.js";

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
  const nameAt = args.indexOf("--name");
  const name = nameAt >= 0 ? args[nameAt + 1] : undefined;
  const FLAGS = ["--url", "--vendor", "--volume", "--name"];
  const sheets = args.filter((a, i) => !a.startsWith("--") && !FLAGS.includes(args[i - 1]));

  if (sheets.length === 0) {
    console.error(
      "Usage: npm run ingest-patterns -- <sheet.pdf|program.kosi|transcript.txt> " +
        "[--url <source>] [--vendor <name>] [--volume <mL>] [--name <pattern name>]"
    );
    process.exitCode = 1;
    return;
  }
  mkdirSync(CANDIDATES, { recursive: true });

  for (const sheet of sheets) {
    const lower = sheet.toLowerCase();
    const { candidate, checks, verified } = lower.endsWith(".pdf")
      ? await readSheet(sheet, { sourceUrl, vendor })
      : lower.endsWith(".kosi")
        ? readKosi(sheet, readFileSync(sheet, "utf8"), { sourceUrl, vendor, volumeMl })
        : readManual(sheet, readFileSync(sheet, "utf8"), { sourceUrl, vendor, name });
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
