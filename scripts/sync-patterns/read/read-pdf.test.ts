import { describe, expect, it } from "vitest";
import { normalizePatternName } from "./read-pdf.js";

/**
 * A list of patterns that all begin "Kegel Element Challenge" is a list nobody
 * can scan. What a bowler calls the pattern is what goes on screen.
 */
describe("normalizePatternName", () => {
  it("drops the vendor and the series", () => {
    expect(normalizePatternName("Kegel Element Challenge Chromium 6742")).toBe("Chromium 6742");
    expect(normalizePatternName("EP-CHALLENGE_MERCURY_4940.pdf")).toBe("Mercury 4940");
  });

  it("drops the reverse-brush marker a sheet puts in front", () => {
    expect(normalizePatternName("R - Stonehenge")).toBe("Stonehenge");
  });

  it("stops a sheet shouting", () => {
    expect(normalizePatternName("BIG BEN")).toBe("Big Ben");
  });

  it("keeps the pattern code, which is how a sheet is identified", () => {
    expect(normalizePatternName("Stonehenge 5840")).toBe("Stonehenge 5840");
  });

  it("leaves a name that is already a name", () => {
    expect(normalizePatternName("Main Street")).toBe("Main Street");
  });
});
