import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { archiveSheet, sha256, sheetProblem, SHEETS_DIR } from "./sheets.js";
import { tinyPdf } from "./tiny-pdf.fixture.js";

describe("archiveSheet", () => {
  it("names a sheet for its content, so a changed sheet is a new URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sheets-"));
    const a = await archiveSheet("stonehenge", tinyPdf("one"), dir);
    expect(a.file).toMatch(/^stonehenge\.[0-9a-f]{12}\.pdf$/);
    expect(a.sha256.startsWith(a.file.split(".")[1])).toBe(true);
    expect((await archiveSheet("stonehenge", tinyPdf("two"), dir)).file).not.toBe(a.file);
  });

  // What lets the app show a sheet with no PDF reader and on a phone whose
  // browser will not show one inline.
  it("draws every page beside the PDF, as a webp named for the same sheet", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sheets-"));
    const copy = await archiveSheet("big-ben", tinyPdf("page"), dir);
    expect(copy.pages).toEqual([copy.file.replace(/\.pdf$/, ".p1.webp")]);
    const webp = readFileSync(resolve(dir, copy.pages[0]));
    expect(webp.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect(sheetProblem(copy, dir)).toBeNull();
  });

  it("keeps one sheet per pattern, replacing the older copy and its pages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sheets-"));
    await archiveSheet("stonehenge", tinyPdf("one"), dir);
    const other = await archiveSheet("stonehenge-v2", tinyPdf("other"), dir);
    const latest = await archiveSheet("stonehenge", tinyPdf("two"), dir);
    expect(readdirSync(dir).sort()).toEqual(
      [latest.file, ...latest.pages, other.file, ...other.pages].sort()
    );
  });

  // An expired link often answers 200 with an HTML page, and that must never be
  // kept as the sheet.
  it("refuses anything that is not a PDF", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sheets-"));
    await expect(archiveSheet("x", new TextEncoder().encode("<html>Not found"), dir)).rejects.toThrow(/not a PDF/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("notices a page image that has gone missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sheets-"));
    const copy = await archiveSheet("tungsten", tinyPdf("t"), dir);
    expect(sheetProblem({ ...copy, pages: ["tungsten.000000000000.p1.webp"] }, dir)).toMatch(/not drawn from/);
  });
});

describe("the shipped catalog", () => {
  // The catalog bowlers download must never name a sheet or a page that is not
  // there. It hashes every kept sheet, about 57 MB, so it gets its own timeout:
  // alone it takes a second or two, but a cold full coverage run on 4 cores
  // pushed it past the 5 s default.
  it("serves every sheet and page it names, with the bytes the sheet's name promises", () => {
    const catalog = JSON.parse(readFileSync(resolve(SHEETS_DIR, "../patterns.json"), "utf8")) as {
      patterns: { id: string; sheet?: string; sheetPages?: string[] }[];
    };
    for (const pattern of catalog.patterns.filter((p) => p.sheet)) {
      const file = pattern.sheet!.replace(/^sheets\//, "");
      const pages = (pattern.sheetPages ?? []).map((p) => p.replace(/^sheets\//, ""));
      expect(existsSync(resolve(SHEETS_DIR, file)), `${pattern.id}: ${file}`).toBe(true);
      expect(pages.length, `${pattern.id} has no page images`).toBeGreaterThan(0);
      const bytes = readFileSync(resolve(SHEETS_DIR, file));
      // Hashed here, so what is checked is that the name carries that hash.
      expect(sheetProblem({ file, sha256: sha256(bytes), bytes: bytes.length, pages })).toBeNull();
    }
  }, 30_000);
});
