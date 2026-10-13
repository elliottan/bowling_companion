import { describe, expect, it } from "vitest";
import { matchesCatalogSearch } from "./catalogSearch";

describe("matchesCatalogSearch", () => {
  it("finds a name however it is spaced: Storm writes AstroPhysiX as one word", () => {
    expect(matchesCatalogSearch(["AstroPhysiX II", "Storm"], "astro physix")).toBe(true);
    expect(matchesCatalogSearch(["Hy-Road", "Storm"], "hyroad")).toBe(true);
  });

  it("still finds by brand, coverstock or core, and an empty search finds everything", () => {
    expect(matchesCatalogSearch(["Gem", "Roto Grip", "Defiant LRG"], "roto grip")).toBe(true);
    expect(matchesCatalogSearch(["Gem", "Roto Grip", null], "")).toBe(true);
  });

  it("does not match what is not there", () => {
    expect(matchesCatalogSearch(["Phaze II", "Storm"], "hustle")).toBe(false);
    // Punctuation alone is not a search for everything.
    expect(matchesCatalogSearch(["Phaze II", "Storm"], "-")).toBe(false);
  });
});
