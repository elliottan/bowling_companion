import { describe, expect, it } from "vitest";
import { findHitOffset, parseFix } from "./viewportFix";

describe("parseFix", () => {
  it("round-trips a valid fix", () => {
    expect(parseFix("remount")).toBe("remount");
  });

  it("falls back to the shipped behaviour for junk or missing values", () => {
    expect(parseFix("nope")).toBe("none");
    expect(parseFix(null)).toBe("none");
    expect(parseFix(undefined)).toBe("none");
    expect(parseFix("")).toBe("none");
  });
});

describe("findHitOffset", () => {
  const target = { contains: () => false } as unknown as Element;
  const other = { contains: () => false } as unknown as Element;

  /** Fake page where `target` occupies y in [top, top+height). */
  const pageWithTargetAt = (top: number, height = 40) =>
    (_x: number, y: number) => (y >= top && y < top + height ? target : other);

  it("reports 0 when the tap lands on the element", () => {
    expect(findHitOffset(pageWithTargetAt(100), target, 50, 110)).toBe(0);
  });

  it("reports a negative offset when the hit region sits above the tap", () => {
    // Element occupies 40..80, tap at 130. The scan walks outward and stops at
    // the nearest edge of the element, not its centre: 130 - 52 = 78.
    expect(findHitOffset(pageWithTargetAt(40), target, 50, 130)).toBe(-52);
  });

  it("reports a positive offset when the hit region sits below the tap", () => {
    expect(findHitOffset(pageWithTargetAt(200), target, 50, 130)).toBe(70);
  });

  it("prefers the nearest explanation when two would fit", () => {
    // Bands at 100..140 and 160..200; tapping 150 is 10 from each side.
    const twoBands = (_x: number, y: number) =>
      (y >= 100 && y < 140) || (y >= 160 && y < 200) ? target : other;
    expect(Math.abs(findHitOffset(twoBands, target, 50, 150)!)).toBe(10);
  });

  it("accepts a descendant of the target as a match", () => {
    const child = {} as Element;
    const parent = { contains: (n: Element) => n === child } as unknown as Element;
    const page = (_x: number, y: number) => (y === 90 ? child : other);
    expect(findHitOffset(page, parent, 50, 100)).toBe(-10);
  });

  it("returns null when nothing within range explains the tap", () => {
    expect(findHitOffset(() => other, target, 50, 100)).toBeNull();
  });
});
