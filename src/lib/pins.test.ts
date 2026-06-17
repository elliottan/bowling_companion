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

  // Sleepers: one pin directly behind another (same lateral line). Not splits.
  it("returns false for 2-8 sleeper", () => {
    expect(isSplit([2, 8])).toBe(false);
  });

  it("returns false for 3-9 sleeper", () => {
    expect(isSplit([3, 9])).toBe(false);
  });

  // Buckets / clusters with the bridging front pin standing. Not splits.
  it("returns false for connected bucket 2-4-5", () => {
    expect(isSplit([2, 4, 5])).toBe(false);
  });

  it("returns false for bucket 3-5-6", () => {
    expect(isSplit([3, 5, 6])).toBe(false);
  });

  it("returns false for right-side fence 3-6-10", () => {
    expect(isSplit([3, 6, 10])).toBe(false);
  });

  // Same-row gap splits.
  it("detects 7-10 split", () => {
    expect(isSplit([7, 10])).toBe(true);
  });

  it("detects 4-6 split", () => {
    expect(isSplit([4, 6])).toBe(true);
  });

  it("detects 8-10 split", () => {
    expect(isSplit([8, 10])).toBe(true);
  });

  it("detects 7-9 split", () => {
    expect(isSplit([7, 9])).toBe(true);
  });

  // Baby splits (cross-row, a down pin between/ahead).
  it("detects 3-10 split", () => {
    expect(isSplit([3, 10])).toBe(true);
  });

  it("detects 5-7 split", () => {
    expect(isSplit([5, 7])).toBe(true);
  });

  // Adjacent pins with the pin immediately ahead-between knocked down (USBC).
  it("detects 9-10 split (6 down ahead)", () => {
    expect(isSplit([9, 10])).toBe(true);
  });

  it("detects 5-6 split (3 down ahead)", () => {
    expect(isSplit([5, 6])).toBe(true);
  });

  it("detects 4-5 split (2 down ahead)", () => {
    expect(isSplit([4, 5])).toBe(true);
  });

  it("detects 6-7-10 split", () => {
    expect(isSplit([6, 7, 10])).toBe(true);
  });
});
