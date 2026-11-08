import { describe, expect, it } from "vitest";
import { columnWidth, headingWidthRem, longestWordEm } from "./headingWidth";

describe("headingWidthRem", () => {
  it("holds the longest word, not the whole heading", () => {
    expect(headingWidthRem("After strike")).toBe(headingWidthRem("Strike"));
  });

  it("gives a wide character a full em", () => {
    expect(headingWidthRem("ストライク")).toBeGreaterThan(headingWidthRem("Strike"));
  });

  it("is wider for a longer word", () => {
    expect(headingWidthRem("Convertible")).toBeGreaterThan(headingWidthRem("Made"));
  });
});

describe("columnWidth", () => {
  it("takes the widest heading and keeps the numbers' scaled width", () => {
    const w = columnWidth(2.25, ["Made", "Chuzas"]);
    expect(w).toContain("2.25rem * var(--type-scale)");
    expect(w).toContain(`${headingWidthRem("Chuzas").toFixed(2)}rem`);
  });

  it("scales the heading when it follows the type scale", () => {
    expect(columnWidth(3, ["Strike"], true)).toMatch(/calc\([\d.]+rem \* var\(--type-scale\)\)\)$/);
  });
});

describe("longestWordEm", () => {
  it("measures the longest word, where a hyphen or slash also ends one", () => {
    expect(longestWordEm("Pin to PAP", true)).toBeCloseTo(3 * 0.72);
    expect(longestWordEm("Deslizamiento")).toBeCloseTo(13 * 0.6);
    expect(longestWordEm("pin-to-PAP")).toBeCloseTo(3 * 0.6);
  });

  it("counts a Hangul or Han character as a whole em", () => {
    expect(longestWordEm("스페어마다 던지는")).toBe(5);
  });

  it("is zero for nothing", () => {
    expect(longestWordEm("")).toBe(0);
  });
});
