import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { archiveSheet, sha256, sheetProblem, SHEETS_DIR } from "./sheets.js";

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4 ${text}`);

describe("archiveSheet", () => {
  it("names a sheet for its content, so a changed sheet is a new URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "sheets-"));
    const a = archiveSheet("stonehenge", pdf("one"), dir);
    expect(a.file).toMatch(/^stonehenge\.[0-9a-f]{12}\.pdf$/);
    expect(a.sha256.startsWith(a.file.split(".")[1])).toBe(true);
    expect(archiveSheet("stonehenge", pdf("two"), dir).file).not.toBe(a.file);
  });

  it("keeps one sheet per pattern, replacing the older copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "sheets-"));
    archiveSheet("stonehenge", pdf("one"), dir);
    archiveSheet("stonehenge-v2", pdf("other"), dir);
    const latest = archiveSheet("stonehenge", pdf("two"), dir);
    expect(readdirSync(dir).sort()).toEqual([latest.file, expect.stringMatching(/^stonehenge-v2\./)].sort());
  });

  // An expired link often answers 200 with an HTML page, and that must never be
  // kept as the sheet.
  it("refuses anything that is not a PDF", () => {
    const dir = mkdtempSync(join(tmpdir(), "sheets-"));
    expect(() => archiveSheet("x", new TextEncoder().encode("<html>Not found"), dir)).toThrow(/not a PDF/);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("the shipped catalog", () => {
  // The catalog bowlers download must never name a sheet that is not there.
  it("serves every sheet it names, with the bytes its name promises", () => {
    const catalog = JSON.parse(readFileSync(resolve(SHEETS_DIR, "../patterns.json"), "utf8")) as {
      patterns: { id: string; sheet?: string }[];
    };
    for (const pattern of catalog.patterns.filter((p) => p.sheet)) {
      const file = pattern.sheet!.replace(/^sheets\//, "");
      expect(existsSync(resolve(SHEETS_DIR, file)), `${pattern.id}: ${file}`).toBe(true);
      const bytes = readFileSync(resolve(SHEETS_DIR, file));
      // Hashed here, so what is checked is that the name carries that hash.
      expect(sheetProblem({ file, sha256: sha256(bytes), bytes: bytes.length })).toBeNull();
    }
  });
});
