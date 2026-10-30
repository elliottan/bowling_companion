import { describe, expect, it } from "vitest";
import { columnWidth, headingWidthRem } from "./headingWidth";

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
