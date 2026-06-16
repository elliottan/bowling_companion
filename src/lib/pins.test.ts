import { describe, expect, it } from "vitest";
import { isSplit } from "./pins";

describe("isSplit", () => {
  it("returns false for empty leave", () => {
    expect(isSplit([])).toBe(false);
  });

  it("returns false for single pin standing", () => {
    expect(isSplit([7])).toBe(false);
  });

  it("returns false when headpin (1) is standing", () => {
    expect(isSplit([1, 2, 4, 10])).toBe(false);
  });

  it("returns false for adjacent pins 4-5", () => {
    expect(isSplit([4, 5])).toBe(false);
  });

  it("returns false for adjacent pins 2-3", () => {
    expect(isSplit([2, 3])).toBe(false);
  });

  it("returns false for connected bucket 2-4-5", () => {
    expect(isSplit([2, 4, 5])).toBe(false);
  });

  it("detects 7-10 split", () => {
    expect(isSplit([7, 10])).toBe(true);
  });

  it("detects 4-6 split", () => {
    expect(isSplit([4, 6])).toBe(true);
  });

  it("detects 3-10 split", () => {
    expect(isSplit([3, 10])).toBe(true);
  });

  it("detects 5-7 split", () => {
    expect(isSplit([5, 7])).toBe(true);
  });

  it("detects 6-7-10 split", () => {
    expect(isSplit([6, 7, 10])).toBe(true);
  });
});
