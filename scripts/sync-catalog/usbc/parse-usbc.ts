/**
 * USBC approved-ball-list diff script.
 *
 * Usage:
 *   npm run usbc-diff
 *
 * Downloads the USBC approved ball PDF (cached in tmp/), extracts ball names
 * for the 4 whitelisted brands, and diffs against scripts/sync-catalog/data/balls.json.
 * Outputs a per-brand report of balls missing from our catalog and balls in our
 * catalog not found in the USBC list.
 *
 * No LLM. Fully deterministic text extraction via pdfjs-dist.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get as httpsGet } from "node:https";
import { get as httpGet } from "node:http";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import { normalizeName } from "../normalize.js";
import type { RawBall } from "../types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../");

const USBC_PDF_URL =
  "https://bowl.com/getmedia/8b570e80-761c-4486-8628-9d50d718dd60/approved_balllist_CURRENT.pdf";
const PDF_CACHE = resolve(REPO_ROOT, "tmp/usbc-approved-balls.pdf");
const BALLS_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/balls.json");

/** The 4 brands we curate. Must match PDF text exactly (including spacing). */
const WHITELISTED_BRANDS = ["Storm", "Roto Grip", "900 Global", "Motiv"] as const;
type WhitelistedBrand = (typeof WHITELISTED_BRANDS)[number];

// ---------------------------------------------------------------------------
// PDF download (with disk cache)
// ---------------------------------------------------------------------------
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const getFunc = url.startsWith("https") ? httpsGet : httpGet;
    const file = createWriteStream(dest);
    getFunc(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        // Follow redirect
        downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function ensurePdf(): Promise<void> {
  if (existsSync(PDF_CACHE)) {
    console.log(`Using cached PDF: ${PDF_CACHE}`);
    return;
  }
  console.log(`Downloading USBC PDF from ${USBC_PDF_URL}…`);
  mkdirSync(resolve(REPO_ROOT, "tmp"), { recursive: true });
  await downloadFile(USBC_PDF_URL, PDF_CACHE);
  console.log(`PDF saved to: ${PDF_CACHE}`);
}

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------
async function extractText(): Promise<string> {
  const buf = readFileSync(PDF_CACHE);
  const uint8 = new Uint8Array(buf);
  const doc = await (pdfjsLib as typeof pdfjsLib).getDocument({ data: uint8 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: { str: string }) => item.str).join(" ");
  }
  return text;
}

// ---------------------------------------------------------------------------
// Parse ball names per brand from PDF text
// The PDF layout (deterministic text extraction) is:
//   "Brand   Ball Name   Date Approved  Brand   Ball Name   Date …"
// where 3 spaces separate Brand from Ball Name, and Name from Date.
// We extract all Brand → Ball Name pairs for whitelisted brands only.
// ---------------------------------------------------------------------------
function parseBallNames(text: string): Map<WhitelistedBrand, Set<string>> {
  const result = new Map<WhitelistedBrand, Set<string>>(
    WHITELISTED_BRANDS.map((b) => [b, new Set<string>()])
  );

  // Match entries of the form: "<Brand>   <Ball Name>   <Date>"
  // Brand is one of the 4 whitelisted brands (with possible multi-word brand).
  // The separator between columns is 3 spaces ("   ").
  // Date field may be: "Oct-14", "January 30, 2018", "Jun-'05", etc.
  // Regex: capture brand, then name (up to the 3-space date separator).
  const brandPattern = WHITELISTED_BRANDS.map((b) =>
    b.replace(/ /g, "\\s+")
  ).join("|");
  // Each entry: (Brand)   (Name)   (Date)
  // We use a non-greedy name match stopped before the next "   <date or brand>"
  const entryRe = new RegExp(
    `(${brandPattern})   ([^  ]+(?:   ?[^  ]+)*)   (?=[A-Za-z0-9*\\(])`,
    "g"
  );

  // Simpler approach: split on known brand tokens (3-space-prefixed entries)
  // and extract (brand, name) pairs directly.
  // Strategy: tokenize on "  Brand   " occurrences; each token is "Name   Date".

  for (const brand of WHITELISTED_BRANDS) {
    // Build a regex that finds: exactly the brand string followed by 3 spaces
    const escapedBrand = brand.replace(/ /g, " ");
    // Split by "brand   " — this gives us (name + date) chunks between brand occurrences
    const parts = text.split(`${escapedBrand}   `);
    // parts[0] is everything before first brand occurrence; skip it
    for (let i = 1; i < parts.length; i++) {
      const chunk = parts[i];
      // The ball name ends at the first "   " (3 spaces) that separates it from the date
      const nameDateSep = chunk.indexOf("   ");
      if (nameDateSep === -1) continue;
      const rawName = chunk.slice(0, nameDateSep).trim();
      // Strip leading ** markers (denote under-13-pound balls)
      const cleanName = rawName.replace(/^\*+/, "").trim();
      if (cleanName.length > 0) {
        result.get(brand)!.add(cleanName);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Load our catalog balls.json
// ---------------------------------------------------------------------------
function loadCatalogBalls(): Map<WhitelistedBrand, Set<string>> {
  const rawBalls: RawBall[] = JSON.parse(readFileSync(BALLS_JSON, "utf-8"));
  const result = new Map<WhitelistedBrand, Set<string>>(
    WHITELISTED_BRANDS.map((b) => [b, new Set<string>()])
  );
  for (const ball of rawBalls) {
    const brand = ball.brand as WhitelistedBrand;
    if (result.has(brand)) {
      result.get(brand)!.add(ball.name);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Diff: using normalizeName for fuzzy matching
// ---------------------------------------------------------------------------
function diff(
  usbcByBrand: Map<WhitelistedBrand, Set<string>>,
  catalogByBrand: Map<WhitelistedBrand, Set<string>>
): void {
  console.log("\n=== USBC diff summary ===\n");

  for (const brand of WHITELISTED_BRANDS) {
    const usbcNames = usbcByBrand.get(brand)!;
    const catalogNames = catalogByBrand.get(brand)!;

    // Normalize both sets for comparison
    const usbcNorm = new Map<string, string>(); // normalizedName -> originalName
    for (const name of usbcNames) {
      usbcNorm.set(normalizeName(name), name);
    }
    const catalogNorm = new Map<string, string>();
    for (const name of catalogNames) {
      catalogNorm.set(normalizeName(name), name);
    }

    const inUsbcNotCatalog: string[] = [];
    for (const [norm, orig] of usbcNorm) {
      if (!catalogNorm.has(norm)) {
        inUsbcNotCatalog.push(orig);
      }
    }

    const inCatalogNotUsbc: string[] = [];
    for (const [norm, orig] of catalogNorm) {
      if (!usbcNorm.has(norm)) {
        inCatalogNotUsbc.push(orig);
      }
    }

    console.log(`--- ${brand} ---`);
    console.log(`  USBC total:    ${usbcNames.size}`);
    console.log(`  Catalog total: ${catalogNames.size}`);
    console.log(`  In USBC, missing from catalog: ${inUsbcNotCatalog.length}`);
    if (inUsbcNotCatalog.length > 0 && inUsbcNotCatalog.length <= 20) {
      for (const n of inUsbcNotCatalog.slice(0, 20)) console.log(`    + ${n}`);
    } else if (inUsbcNotCatalog.length > 20) {
      for (const n of inUsbcNotCatalog.slice(0, 20)) console.log(`    + ${n}`);
      console.log(`    … and ${inUsbcNotCatalog.length - 20} more`);
    }
    console.log(`  In catalog, not found in USBC: ${inCatalogNotUsbc.length}`);
    if (inCatalogNotUsbc.length > 0) {
      for (const n of inCatalogNotUsbc) console.log(`    - ${n}`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  await ensurePdf();
  console.log("Extracting text from PDF…");
  const text = await extractText();
  console.log(`Extracted ${text.length.toLocaleString()} characters from PDF.`);

  console.log("Parsing ball names per brand…");
  const usbcByBrand = parseBallNames(text);

  for (const brand of WHITELISTED_BRANDS) {
    console.log(`  ${brand}: ${usbcByBrand.get(brand)!.size} balls found`);
  }

  const catalogByBrand = loadCatalogBalls();
  diff(usbcByBrand, catalogByBrand);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
