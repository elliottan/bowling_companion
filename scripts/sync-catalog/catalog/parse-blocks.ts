/**
 * Shared deterministic parsing for Storm/SPI spec PDFs.
 *
 * Consumed by:
 *   - catalog/parse-catalog-pdf.ts  (year catalog → many balls)
 *   - catalog/parse-ball-pdf.ts     (one tech-data sheet / paste → one ball)
 *
 * Both the year catalog and the single-ball tech sheets use the same labeled
 * layout: an `RG DIFF [PSA]` weight table followed by COVERSTOCK / WEIGHT BLOCK /
 * FACTORY FINISH / (BALL) COLOR / SKU fields, with the ball logo (name) printed
 * in the SKU clause. Label spelling varies slightly between the two formats
 * ("WEIGHTBLOCK" vs "WEIGHT BLOCK", "BALL COLOR" vs "COLOR", "™" vs "TM"); the
 * regexes below tolerate both.
 *
 * TOKEN-SAFE: callers extract PDF text to a string and never return it to a model
 * context. No LLM.
 */
import { readFileSync, mkdirSync, existsSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get as httpsGet } from "node:https";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import { normalizeName } from "../normalize.js";
import type { RawBall } from "../types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../../../");
export const USBC_INDEX = resolve(REPO_ROOT, "scripts/sync-catalog/data/usbc-index.json");
export const SEED_DIR = resolve(REPO_ROOT, "scripts/sync-catalog/data/seed");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Colorway {
  sku: string;
  color: string | null;
}
export interface SeedBall extends RawBall {
  colorways: Colorway[];
  _needsReview?: boolean;
  _candidateName?: string;
}
export interface UsbcIndexEntry {
  brand: string;
  name: string;
  normalizedName: string;
  approvalDate: string | null;
}
export interface Segment {
  hasPsa: boolean;
  body: string;
}
type WeightRow = { weight: number; rg: number; diff: number; mbDiff: number | null };
interface SkuClause {
  sku: string;
  color: string | null;
  names: string[]; // candidate ALL-CAPS names found in the clause
}

/** All-caps logo token: has an uppercase letter, no lowercase. */
function isCapsToken(t: string): boolean {
  return /[A-Z]/.test(t) && !/[a-z]/.test(t);
}

/** Caps tokens that are catalog/spec chrome, never ball names. */
const NAME_STOPWORDS = new Set([
  "RG", "DIFF", "PSA", "PBA", "USBC", "LB", "LBS", "OZ", "TM", "SKU", "N/A",
]);

// ---------------------------------------------------------------------------
// Text acquisition: URL → download+extract, path → extract, "-" → stdin
// ---------------------------------------------------------------------------
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((res, rej) => {
    const file = createWriteStream(dest);
    httpsGet(url, (r) => {
      if (r.statusCode === 301 || r.statusCode === 302) {
        file.close();
        downloadFile(r.headers.location!, dest).then(res).catch(rej);
        return;
      }
      if (r.statusCode !== 200) {
        file.close();
        rej(new Error(`HTTP ${r.statusCode} downloading ${url}`));
        return;
      }
      r.pipe(file);
      file.on("finish", () => file.close(() => res()));
      file.on("error", rej);
    }).on("error", rej);
  });
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const buf = readFileSync(pdfPath);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += " " + content.items.map((it: { str: string }) => it.str).join(" ");
  }
  return text;
}

function readStdin(): Promise<string> {
  return new Promise((res) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => res(data));
  });
}

/** Resolve a source (url | path | "-" for stdin) to raw text. */
export async function getText(src: string): Promise<string> {
  if (src === "-") return readStdin();
  let pdfPath = src;
  if (src.startsWith("http")) {
    const dest = resolve(REPO_ROOT, "tmp/spi-download.pdf");
    mkdirSync(resolve(REPO_ROOT, "tmp"), { recursive: true });
    console.log(`Downloading ${src}…`);
    await downloadFile(src, dest);
    pdfPath = dest;
  } else {
    pdfPath = resolve(REPO_ROOT, src);
  }
  // Pasted text saved to a .txt path is also supported.
  if (pdfPath.endsWith(".txt")) return readFileSync(pdfPath, "utf-8");
  return extractPdfText(pdfPath);
}

// ---------------------------------------------------------------------------
// Segmentation + field parsers
// ---------------------------------------------------------------------------
export function segment(text: string): Segment[] {
  const headerRe = /RG\s+DIFF(\s+PSA)?/g;
  const heads: { idx: number; end: number; hasPsa: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    heads.push({ idx: m.index, end: m.index + m[0].length, hasPsa: !!m[1] });
  }
  const segs: Segment[] = [];
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i].end;
    const stop = i + 1 < heads.length ? heads[i + 1].idx : text.length;
    segs.push({ hasPsa: heads[i].hasPsa, body: text.slice(start, stop) });
  }
  return segs;
}

function parseWeights(body: string, hasPsa: boolean): WeightRow[] {
  const rows: WeightRow[] = [];
  const re = hasPsa
    ? /(\d\.\d{2})\s+(\.\d{3})\s+(\.\d{3})\s+(\d{1,2})\s*lb/g
    : /(\d\.\d{2})\s+(\.\d{3})\s+(\d{1,2})\s*lb/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (hasPsa) {
      rows.push({ rg: parseFloat(m[1]), diff: parseFloat(m[2]), mbDiff: parseFloat(m[3]), weight: parseInt(m[4]) });
    } else {
      rows.push({ rg: parseFloat(m[1]), diff: parseFloat(m[2]), mbDiff: null, weight: parseInt(m[3]) });
    }
  }
  return rows;
}

function cleanField(s: string): string {
  return s.replace(/™|®|\bTM\b/g, " ").replace(/\s+/g, " ").trim();
}

function stripFooter(s: string): string {
  return s
    .replace(/STORMBOWLING\.COM/gi, " ")
    .replace(/\bVISIT\b|\bFOR MORE DETAILS\b|\bSCAN HERE\b/gi, " ")
    .replace(/\b\d{4}\s+BALL\s+CATALOG\b/gi, " ")
    .replace(/\bBALL\s+CATALOG\b/gi, " ");
}

function parseLabel(body: string, label: RegExp): string | null {
  const m = body.match(label);
  const v = m ? cleanField(stripFooter(m[1])) : null;
  return v && v.length > 0 ? v : null;
}

/** Ball SKU codes are short (VEQ, TQY, RZS, GOE); accessories are long/AC-CH. */
function isBallSku(code: string): boolean {
  if (/^(AC|CH|AD)/.test(code)) return false;
  return /^[A-Z]{2,3}[A-Z0-9]?$/.test(code);
}

function parseSkuClauses(body: string): SkuClause[] {
  const out: SkuClause[] = [];
  const re =
    /SKU:\s+([A-Z0-9]{2,})\s+([\s\S]*?)(?=\s+SKU:|\s+RG\s+DIFF|\s+COVERSTOCK:|\s+WEIGHT\s*BLOCK:|\s+FACTORY|\s+BALL COLOR:|\s+COLOR:|\s+FRAGRANCE:|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const sku = m[1];
    if (!isBallSku(sku)) continue;
    const tail = cleanField(stripFooter(m[2]));
    if (tail.length === 0) {
      out.push({ sku, color: null, names: [] });
      continue;
    }
    const tokens = tail.split(" ").filter(Boolean);
    const colorTokens = [...new Set(tokens.filter((t) => t.includes("/")))];

    // Ball names are consecutive runs of ALL-CAPS tokens; prose (mixed case)
    // breaks the runs, so the logo survives while design-intent text drops out.
    const names: string[] = [];
    let run: string[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const meaningful = run.filter((t) => !NAME_STOPWORDS.has(t.toUpperCase()));
      const joined = meaningful.join(" ").trim();
      if (joined.replace(/[^A-Za-z0-9]/g, "").length >= 2) {
        names.push(joined);
        // also a slash-stripped variant ("BLACK/CHERRY TROPICAL SURGE" → "TROPICAL SURGE")
        const noSlash = meaningful.filter((t) => !t.includes("/")).join(" ").trim();
        if (noSlash && noSlash !== joined) names.push(noSlash);
      }
      run = [];
    };
    for (const t of tokens) {
      if (isCapsToken(t)) run.push(t);
      else flush();
    }
    flush();

    out.push({
      sku,
      color: colorTokens.join(" ").trim() || null,
      names: [...new Set(names)],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// USBC name + brand reconciliation
// ---------------------------------------------------------------------------
export function loadUsbcIndex(): { index: UsbcIndexEntry[]; byNorm: Map<string, UsbcIndexEntry> } {
  if (!existsSync(USBC_INDEX)) throw new Error(`Missing ${USBC_INDEX}. Run: npm run usbc-index`);
  const index: UsbcIndexEntry[] = JSON.parse(readFileSync(USBC_INDEX, "utf-8"));
  const byNorm = new Map<string, UsbcIndexEntry>();
  for (const e of index) if (!byNorm.has(e.normalizedName)) byNorm.set(e.normalizedName, e);
  return { index, byNorm };
}

interface Reconciled {
  name: string;
  brand: string;
  approvalDate: string | null;
  confident: boolean;
}

function reconcile(
  candidates: string[],
  index: UsbcIndexEntry[],
  byNorm: Map<string, UsbcIndexEntry>
): Reconciled | null {
  for (const cand of candidates) {
    const hit = byNorm.get(normalizeName(cand));
    if (hit) return { name: hit.name, brand: hit.brand, approvalDate: hit.approvalDate, confident: true };
  }
  for (const cand of candidates) {
    const norm = normalizeName(cand);
    if (norm.length < 3) continue;
    const hit = index.find(
      (e) =>
        e.normalizedName === norm ||
        e.normalizedName.startsWith(norm + " ") ||
        norm.startsWith(e.normalizedName + " ")
    );
    if (hit) return { name: hit.name, brand: hit.brand, approvalDate: hit.approvalDate, confident: false };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build one SeedBall from a spec segment.
// ---------------------------------------------------------------------------
export interface ParseOpts {
  releaseDate: string | null;
  sourceUrls: string[];
  index: UsbcIndexEntry[];
  byNorm: Map<string, UsbcIndexEntry>;
}

/** Returns null if the segment has no weight table (not a ball). */
export function parseBall(seg: Segment, opts: ParseOpts): SeedBall | null {
  const weights = parseWeights(seg.body, seg.hasPsa);
  if (weights.length === 0) return null;

  const coverstock = parseLabel(seg.body, /COVERSTOCK:\s*([^]*?)(?=WEIGHT|FACTORY|BALL COLOR:|COLOR:|FRAGRANCE:|SKU:|$)/);
  const coreName = parseLabel(seg.body, /WEIGHT\s*BLOCK:\s*([^]*?)(?=FACTORY|BALL COLOR:|COLOR:|FRAGRANCE:|SKU:|COVERSTOCK:|$)/);
  const factoryFinish = parseLabel(seg.body, /FACTORY FINISH:\s*([^]*?)(?=BALL COLOR:|COLOR:|FLARE|FRAGRANCE:|SKU:|COVERSTOCK:|WEIGHT|$)/);
  const labelColor = parseLabel(seg.body, /(?:BALL )?COLOR:\s*([^]*?)(?=FLARE|FRAGRANCE:|AVAILABLE|SKU:|COVERSTOCK:|WEIGHT|$)/);

  const clauses = parseSkuClauses(seg.body);
  const colorways: Colorway[] = clauses.map((c) => ({ sku: c.sku, color: c.color }));
  // Single-ball sheets carry color only in the COLOR: label — backfill it.
  if (colorways.length === 1 && colorways[0].color === null && labelColor) {
    colorways[0].color = labelColor;
  }

  const candidates = [...new Set(clauses.flatMap((c) => c.names))].sort(
    (a, b) => b.length - a.length
  );

  const w15 = weights.find((w) => w.weight === 15) ?? weights[0];
  const rec = reconcile(candidates, opts.index, opts.byNorm);

  const ball: SeedBall = {
    brand: (rec?.brand ?? "Storm") as RawBall["brand"],
    name: rec?.name ?? candidates[0] ?? "UNKNOWN",
    releaseDate: opts.releaseDate,
    coverstockRaw: coverstock ?? "",
    factoryFinish,
    coreName,
    rg: w15.rg,
    diff: w15.diff,
    mbDiff: w15.mbDiff,
    sourceUrls: opts.sourceUrls,
    weights: weights.sort((a, b) => b.weight - a.weight).map((w) => ({
      weight: w.weight,
      rg: w.rg,
      diff: w.diff,
      mbDiff: w.mbDiff,
    })),
    colorways,
  };
  if (!rec || !rec.confident) {
    ball._needsReview = true;
    ball._candidateName = candidates.join(" | ");
  }
  return ball;
}
