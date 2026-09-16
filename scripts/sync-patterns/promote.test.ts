import { describe, expect, it } from "vitest";
import { checkCandidate, toCatalogPattern } from "./promote.js";
import type { PatternCandidate } from "./types.js";
import { CHROMIUM_6742 } from "../../src/lib/oilPattern.fixture.js";

/**
 * The promote stage is the only thing standing between a fallible reader and a
 * pattern a bowler will trust on the lane for a season, so it is tested harder
 * than anything that reads.
 */
const chromium = (over: Partial<PatternCandidate> = {}): PatternCandidate => ({
  id: "kegel-chromium-6742",
  name: "Kegel Element Challenge Chromium 6742",
  vendor: "kegel",
  reader: "manual",
  passes: CHROMIUM_6742,
  stated: { distance: 42, forwardMl: 15.41, reverseMl: 10.15, volumeMl: 25.56 },
  ...over,
});

describe("checkCandidate", () => {
  it("passes a reading that matches the sheet it came from", () => {
    expect(checkCandidate(chromium())).toEqual([]);
  });

  it("does not care which reader produced it", () => {
    for (const reader of ["text-layer", "ocr", "manual"] as const) {
      expect(checkCandidate(chromium({ reader }))).toEqual([]);
    }
  });

  // The real failure this caught: OCR lost two forward rows, and the header
  // totals are what noticed. 13.94 mL against a printed 15.41.
  it("catches a reading that lost a row, by the volume it no longer adds up to", () => {
    const short = CHROMIUM_6742.filter((p) => !(p.direction === "forward" && p.microliters === 45));
    const complaints = checkCandidate(chromium({ passes: short }));
    expect(complaints.map((c) => c.field)).toContain("forwardMl");
    expect(complaints.find((c) => c.field === "forwardMl")).toMatchObject({ stated: 15.41 });
  });

  it("catches a misread board, which changes the oil the pass lays", () => {
    const wide = CHROMIUM_6742.map((p) =>
      p.left_board === 7 ? { ...p, right_board: 39 } : p
    );
    expect(checkCandidate(chromium({ passes: wide })).length).toBeGreaterThan(0);
  });

  it("catches a distance that is not the one the sheet quotes", () => {
    const complaints = checkCandidate(chromium({ stated: { distance: 39, volumeMl: 25.56 } }));
    expect(complaints).toContainEqual({ field: "distance", stated: 39, derived: 42 });
  });

  it("refuses a pattern with no rows at all", () => {
    expect(checkCandidate(chromium({ passes: [] }))).toHaveLength(1);
  });

  // A sheet that states nothing cannot be checked, and something that cannot be
  // checked is exactly what this pipeline exists to keep out.
  it("refuses a reading the sheet says nothing about", () => {
    const complaints = checkCandidate(chromium({ stated: {} }));
    expect(complaints.map((c) => c.field)).toContain("stated totals");
  });

  it("refuses a pass that goes nowhere or runs off the boards", () => {
    const still = [{ ...CHROMIUM_6742[0], end_distance: CHROMIUM_6742[0].start_distance }];
    expect(checkCandidate(chromium({ passes: still, stated: { distance: 0, volumeMl: 0 } })).length)
      .toBeGreaterThan(0);
  });

  it("allows the rounding a sheet prints at, and nothing looser", () => {
    expect(checkCandidate(chromium({
      stated: { distance: 42, forwardMl: 15.412, reverseMl: 10.15, volumeMl: 25.56 },
    }))).toEqual([]);
    expect(checkCandidate(chromium({
      stated: { distance: 42, forwardMl: 15.43, reverseMl: 10.15, volumeMl: 25.56 },
    })).map((c) => c.field)).toContain("forwardMl");
  });
});

describe("toCatalogPattern", () => {
  it("carries the derived numbers so the app does not recompute a whole list", () => {
    const pattern = toCatalogPattern(chromium());
    expect(pattern).toMatchObject({ distance: 42, volumeMl: 25.56 });
    expect(pattern.ratio).toBeCloseTo(6.71, 2);
    expect(pattern.passes).toHaveLength(15);
  });
});
