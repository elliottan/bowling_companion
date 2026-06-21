/**
 * USBC approved-ball-list → searchable JSON index.
 *
 * Usage:
 *   npm run usbc-index
 *
 * Downloads/parses the USBC approved ball PDF and writes a flat, searchable
 * index to scripts/sync-catalog/data/usbc-index.json. Once written, downstream
 * tooling (catalog parsers, name reconciliation) reads this JSON and never has
 * to re-parse the PDF — until a new approved-list link is supplied.
 *
 * No LLM. Fully deterministic. PDF extraction lives in ./extract.ts.
 *
 * Index entry shape:
 *   { brand, name, normalizedName, approvalDate }   // approvalDate: ISO yyyy-mm-dd | null
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeName } from "../normalize.js";
import {
  REPO_ROOT,
  WHITELISTED_BRANDS,
  loadUsbcEntries,
  parseApprovalDateIso,
} from "./extract.js";

const OUT_PATH = resolve(REPO_ROOT, "scripts/sync-catalog/data/usbc-index.json");

interface UsbcIndexEntry {
  brand: string;
  name: string;
  normalizedName: string;
  approvalDate: string | null; // ISO yyyy-mm-dd
}

async function main(): Promise<void> {
  console.log("Extracting text from PDF…");
  const usbcEntries = await loadUsbcEntries();

  const index: UsbcIndexEntry[] = [];
  for (const brand of WHITELISTED_BRANDS) {
    const seen = new Set<string>(); // dedupe by normalizedName per brand
    let count = 0;
    for (const entry of usbcEntries.get(brand)!) {
      const normalizedName = normalizeName(entry.name);
      if (seen.has(normalizedName)) continue;
      seen.add(normalizedName);
      index.push({
        brand,
        name: entry.name,
        normalizedName,
        approvalDate: parseApprovalDateIso(entry.dateStr),
      });
      count++;
    }
    console.log(`  ${brand}: ${count} unique balls`);
  }

  // Sort by brand, then most recently approved first (null dates last).
  index.sort((a, b) => {
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    return (b.approvalDate ?? "").localeCompare(a.approvalDate ?? "");
  });

  writeFileSync(OUT_PATH, JSON.stringify(index, null, 2) + "\n");
  console.log(`\nWrote ${index.length} entries to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
