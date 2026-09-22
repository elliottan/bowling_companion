import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readManual } from "./manual.js";
import { checkCandidate } from "../promote.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A transcription typed by eye from a photo of Kegel's 2025 Striking Against
 * Breast Cancer Mixed Doubles sheet, kept so the pattern in the catalog can
 * always be re-derived from the reading it came from.
 */
const PATH = resolve(HERE, "../data/transcripts/2025-striking-against-breast-cancer-mixed-doubles.txt");
const TRANSCRIPT = readFileSync(PATH, "utf8");

describe("readManual", () => {
  it("reads the arrow layout's header and rows exactly as a real text layer would", () => {
    const { candidate, checks, verified } = readManual(PATH, TRANSCRIPT, {
      name: "2025 Striking Against Breast Cancer Mixed Doubles",
    });
    expect(candidate.reader).toBe("manual");
    expect(candidate.passes).toHaveLength(14);
    expect(candidate.stated).toEqual({ distance: 41, volumeMl: 29.095, forwardMl: 20.845, reverseMl: 8.25 });
    expect(verified).toBe(true);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("falls back to the file name when the transcript carries no name and none is given", () => {
    const { candidate } = readManual("some-sheet.txt", TRANSCRIPT);
    expect(candidate.name).toBe("some-sheet.txt");
  });

  it("promotes clean, the same check `npm run promote-patterns` runs", () => {
    const { candidate } = readManual(PATH, TRANSCRIPT, {
      name: "2025 Striking Against Breast Cancer Mixed Doubles",
    });
    expect(checkCandidate(candidate)).toEqual([]);
  });

  it("catches a mistyped T.OIL the way a misread parse would be caught", () => {
    const wrong = TRANSCRIPT.replace("1 2L 2R 5 55 18 3 A - ICE 0 → 10 10,175", "1 2L 2R 5 55 18 3 A - ICE 0 → 10 10,000");
    const { verified, checks } = readManual(PATH, wrong, { name: "Typo" });
    expect(verified).toBe(false);
    expect(checks.some((c) => !c.ok)).toBe(true);
  });
});
