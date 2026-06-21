/**
 * Shared USBC approved-ball-list PDF extraction.
 *
 * No LLM. Fully deterministic text extraction via pdfjs-dist. The PDF text is
 * never loaded into a model context — callers operate on the parsed entries.
 *
 * Consumed by:
 *   - usbc/parse-usbc.ts   (npm run usbc-diff)   — diff catalog vs approved list
 *   - usbc/build-index.ts  (npm run usbc-index)  — emit data/usbc-index.json
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get as httpsGet } from "node:https";
import { get as httpGet } from "node:http";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../../../");

export const USBC_PDF_URL =
  "https://bowl.com/getmedia/8b570e80-761c-4486-8628-9d50d718dd60/approved_balllist_CURRENT.pdf";
export const PDF_CACHE = resolve(REPO_ROOT, "tmp/usbc-approved-balls.pdf");

/** The 4 brands we curate. Must match PDF text exactly (including spacing). */
export const WHITELISTED_BRANDS = ["Storm", "Roto Grip", "900 Global", "Motiv"] as const;
export type WhitelistedBrand = (typeof WHITELISTED_BRANDS)[number];

/** One approved-list row: ball name + raw approval-date string. */
export type BallEntry = { name: string; dateStr: string };

// ---------------------------------------------------------------------------
// PDF download (with disk cache)
// ---------------------------------------------------------------------------
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolveP, reject) => {
    const getFunc = url.startsWith("https") ? httpsGet : httpGet;
    const file = createWriteStream(dest);
    getFunc(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        downloadFile(res.headers.location!, dest).then(resolveP).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolveP()));
      file.on("error", reject);
    }).on("error", reject);
  });
}

export async function ensurePdf(): Promise<void> {
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
export async function extractText(): Promise<string> {
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
// Parse ball names + approval dates per brand from PDF text.
// The PDF layout (deterministic text extraction) is:
//   "Brand   Ball Name   Date Approved  Brand   Ball Name   Date …"
// where 3 spaces separate Brand from Ball Name, and Name from Date.
// ---------------------------------------------------------------------------
export function parseBallEntries(text: string): Map<WhitelistedBrand, BallEntry[]> {
  const result = new Map<WhitelistedBrand, BallEntry[]>(
    WHITELISTED_BRANDS.map((b) => [b, []])
  );

  for (const brand of WHITELISTED_BRANDS) {
    const parts = text.split(`${brand}   `);
    for (let i = 1; i < parts.length; i++) {
      const chunk = parts[i];
      const nameDateSep = chunk.indexOf("   ");
      if (nameDateSep === -1) continue;
      const rawName = chunk.slice(0, nameDateSep).trim();
      const cleanName = rawName.replace(/^\*+/, "").trim();
      if (cleanName.length === 0) continue;

      // Date ends at the first 2+ whitespace run (entry separator) or end of chunk
      const afterName = chunk.slice(nameDateSep + 3);
      const dateEnd = afterName.search(/\s{2,}/);
      const dateStr = (dateEnd === -1 ? afterName : afterName.slice(0, dateEnd)).trim();

      result.get(brand)!.push({ name: cleanName, dateStr });
    }
  }

  return result;
}

/**
 * Parse an approval-date string → ISO yyyy-mm-dd, or null if unparseable.
 * Handles "Oct-14", "Jun-'05", "January 30, 2018".
 * Day defaults to 01 for month-only ("Oct-14" → 2014-10-01).
 */
export function parseApprovalDateIso(dateStr: string): string | null {
  const ms = parseApprovalDateMs(dateStr);
  if (ms === 0) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parse an approval-date string → Unix ms (0 if unparseable). For sorting. */
export function parseApprovalDateMs(dateStr: string): number {
  // "Oct-14", "Jun-'05", "Mar-97"
  const shortMatch = dateStr.match(/^([A-Za-z]+)-'?(\d{2,4})$/);
  if (shortMatch) {
    let year = parseInt(shortMatch[2]);
    if (year < 100) year = year >= 90 ? 1900 + year : 2000 + year;
    const d = new Date(`${shortMatch[1]} 1, ${year} UTC`);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  // "January 30, 2018" or "March 15, 2020"
  const d = new Date(`${dateStr} UTC`);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Convenience: ensure PDF is present, extract text, parse entries. */
export async function loadUsbcEntries(): Promise<Map<WhitelistedBrand, BallEntry[]>> {
  await ensurePdf();
  const text = await extractText();
  return parseBallEntries(text);
}
