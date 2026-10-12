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
export function archiveSheet(id: string, bytes: Uint8Array, dir = SHEETS_DIR): SheetCopy {
  if (!isPdf(bytes)) throw new Error(`${id}: not a PDF (does not start with ${PDF_MAGIC})`);
  const hash = sha256(bytes);
  const file = sheetFileName(id, hash);
  mkdirSync(dir, { recursive: true });
  for (const old of readdirSync(dir)) {
    if (old !== file && old.startsWith(`${id}.`) && old.endsWith(".pdf")) rmSync(resolve(dir, old));
  }
  writeFileSync(resolve(dir, file), bytes);
  return { file, sha256: hash, bytes: bytes.length };
}

/** Why a recorded copy cannot be served, or null when it can. */
export function sheetProblem(copy: SheetCopy, dir = SHEETS_DIR): string | null {
  const path = resolve(dir, copy.file);
  if (!existsSync(path)) return `${copy.file} is not in ${dir}`;
  const hash = sha256(readFileSync(path));
  if (hash !== copy.sha256) return `${copy.file} hashes to ${hash}, not the recorded ${copy.sha256}`;
  if (!copy.file.includes(`.${hash.slice(0, 12)}.`)) return `${copy.file} is not named for its hash`;
  return null;
}
