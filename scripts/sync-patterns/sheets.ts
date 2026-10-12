/**
 * The original sheet PDFs, kept and served by us (ADR-136).
 *
 * A pattern's sheet lives on a federation's or a school's site, which is where
 * links go to die: an upload folder named for a year, a season's directory that
 * gets archived. So a copy of every sheet sits in `public/catalog/sheets/`,
 * byte for byte what was downloaded, and the catalog points at it alongside the
 * original link. The copy is what the pipeline re-reads when it needs to, and
 * what a bowler opens when the original has gone.
 *
 * Each page is also drawn once, here, as a webp beside the PDF, so the app can
 * show the sheet in-app without a PDF reader (ADR-104 took that out, at 8.5 MB)
 * and without a browser that can show a PDF inline, which Android's cannot.
 *
 * The file name carries a prefix of its own sha256, so a sheet that changes is a
 * new URL. That is what lets the host and the service worker treat every one as
 * immutable, and the promote stage check that the bytes are the ones recorded.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { SheetCopy } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Under `public/` so the host serves it, under `catalog/` so it sits with the
 *  pattern list that names it. */
export const SHEETS_DIR = resolve(HERE, "../../public/catalog/sheets");

/** Every PDF starts with this, and an HTML error page served as a 200 does not. */
const PDF_MAGIC = "%PDF-";

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString("latin1") === PDF_MAGIC;
}

/** `<id>.<first 12 of the sha256>.pdf`: readable, and a new name per content. */
export function sheetFileName(id: string, hash: string): string {
  return `${id}.${hash.slice(0, 12)}.pdf`;
}

/**
 * Keep a sheet. Writes it under its content name and removes any older copy of
 * the same pattern, so the folder holds exactly one sheet per pattern.
 */
export async function archiveSheet(id: string, bytes: Uint8Array, dir = SHEETS_DIR): Promise<SheetCopy> {
  if (!isPdf(bytes)) throw new Error(`${id}: not a PDF (does not start with ${PDF_MAGIC})`);
  const hash = sha256(bytes);
  const file = sheetFileName(id, hash);
  const stem = file.replace(/\.pdf$/, "");
  const pages = await renderPages(bytes);
  const pageFiles = pages.map((_, i) => `${stem}.p${i + 1}.webp`);

  mkdirSync(dir, { recursive: true });
  const keep = new Set([file, ...pageFiles]);
  for (const old of readdirSync(dir)) {
    if (!keep.has(old) && ownedBy(old, id)) rmSync(resolve(dir, old));
  }
  writeFileSync(resolve(dir, file), bytes);
  pages.forEach((page, i) => writeFileSync(resolve(dir, pageFiles[i]), page));
  return { file, sha256: hash, bytes: bytes.length, pages: pageFiles };
}

/** A file this pattern's sheet wrote: `<id>.<12 hex>.pdf` or `.p<n>.webp`. The
 *  hash in the pattern is what stops `big-ben` claiming `big-ben-2`'s files. */
function ownedBy(name: string, id: string): boolean {
  return name.startsWith(`${id}.`) && /^[0-9a-f]{12}\.(pdf|p\d+\.webp)$/.test(name.slice(id.length + 1));
}

/** Wide enough to read the load table on a phone at two finger zoom, small
 *  enough that a page is a couple of hundred KB. */
const PAGE_WIDTH = 1600;

/** Every page of the sheet as a webp, white behind it, at PAGE_WIDTH. */
export async function renderPages(bytes: Uint8Array): Promise<Buffer[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: sharp } = await import("sharp");
  // pdf.js detaches the buffer it is given, so it gets a copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const doc = await task.promise;
  const pages: Buffer[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const scale = PAGE_WIDTH / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });
    // The canvas comes from pdf.js's own factory, never from an import here:
    // pdf.js draws with the Path2D of the canvas build it resolves itself, and
    // a canvas from any other build rejects those paths.
    const { canvas } = doc.canvasFactory.create(Math.round(viewport.width), Math.round(viewport.height)) as {
      canvas: { toBuffer(mime: "image/png"): Buffer };
    };
    await page.render({ canvas: canvas as never, viewport, background: "#ffffff" }).promise;
    pages.push(await sharp(canvas.toBuffer("image/png")).webp({ quality: 82 }).toBuffer());
  }
  await task.destroy();
  return pages;
}

/** Why a recorded copy cannot be served, or null when it can. */
export function sheetProblem(copy: SheetCopy, dir = SHEETS_DIR): string | null {
  const path = resolve(dir, copy.file);
  if (!existsSync(path)) return `${copy.file} is not in ${dir}`;
  const hash = sha256(readFileSync(path));
  if (hash !== copy.sha256) return `${copy.file} hashes to ${hash}, not the recorded ${copy.sha256}`;
  if (!copy.file.includes(`.${hash.slice(0, 12)}.`)) return `${copy.file} is not named for its hash`;
  const stem = copy.file.replace(/\.pdf$/, "");
  for (const page of copy.pages) {
    if (!page.startsWith(`${stem}.p`)) return `${page} was not drawn from ${copy.file}`;
    if (!existsSync(resolve(dir, page))) return `${page} is not in ${dir}`;
  }
  return null;
}
