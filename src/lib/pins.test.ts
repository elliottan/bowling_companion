import { describe, expect, it } from "vitest";
import type { PinNumber } from "../types/bowling";
import { isBabySplit, isPocketHit, isSplit, isWashout, resolvePocketHit } from "./pins";

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

describe("isBabySplit", () => {
  it("returns true for adjacent-pin splits (baby splits)", () => {
    expect(isBabySplit([7, 8])).toBe(true);
    expect(isBabySplit([3, 10])).toBe(true);
    expect(isBabySplit([2, 7])).toBe(true);
    expect(isBabySplit([5, 6])).toBe(true);
    expect(isBabySplit([9, 10])).toBe(true);
    expect(isBabySplit([3, 9, 10])).toBe(true);
  });

  it("returns false for real (wide) splits", () => {
    expect(isBabySplit([4, 6])).toBe(false);
    expect(isBabySplit([5, 7])).toBe(false);
    expect(isBabySplit([7, 9])).toBe(false);
    expect(isBabySplit([7, 10])).toBe(false);
    expect(isBabySplit([8, 10])).toBe(false);
    expect(isBabySplit([4, 6, 7, 10])).toBe(false);
  });

  it("returns false when not a split at all", () => {
    expect(isBabySplit([2, 8])).toBe(false);  // sleeper
    expect(isBabySplit([10])).toBe(false);    // single pin
    expect(isBabySplit([1, 5])).toBe(false);  // has headpin
  });
});

describe("isWashout", () => {
  it("flags head-pin leaves with a gap behind the head pin", () => {
    expect(isWashout([1, 2, 10])).toBe(true);
    expect(isWashout([1, 3, 7])).toBe(true);
    expect(isWashout([1, 2, 4, 10])).toBe(true);
  });

  it("is false without the head pin, and false for ordinary head-pin leaves", () => {
    expect(isWashout([2, 10])).toBe(false);   // that's a split
    expect(isWashout([1, 2, 4, 5])).toBe(false);
    expect(isWashout([1])).toBe(false);
    expect(isWashout([])).toBe(false);
  });
});

describe("isPocketHit", () => {
  const rh = (leave: PinNumber[]) => isPocketHit(leave, "right");
  const lh = (leave: PinNumber[]) => isPocketHit(leave, "left");

  it("counts a strike", () => {
    expect(rh([])).toBe(true);
  });

  it("rejects any leave with the 1 or the 3 standing (RH)", () => {
    expect(rh([1])).toBe(false);
    expect(rh([3])).toBe(false);
    expect(rh([3, 6, 10])).toBe(false);
    expect(rh([1, 2, 4, 10])).toBe(false);
  });

  it("counts the ordinary pocket leaves", () => {
    for (const leave of [[4], [6], [7], [8], [9], [10], [2], [2, 8], [4, 7], [8, 10], [7, 10], [7, 9], [6, 10], [4, 5]]) {
      expect(rh(leave as PinNumber[])).toBe(true);
    }
  });

  it("counts the 5 alongside a corner but not the 5 alone", () => {
    expect(rh([5, 7])).toBe(true);
    expect(rh([5, 10])).toBe(true);
    expect(rh([5, 7, 10])).toBe(true);
    expect(rh([5, 8])).toBe(true);
    expect(rh([5])).toBe(false);
  });

  it("rejects the through-the-nose shapes", () => {
    expect(rh([4, 6, 7, 10])).toBe(false);      // big four
    expect(rh([4, 6, 7, 9, 10])).toBe(false);   // Greek church
    expect(rh([4, 6])).toBe(false);
    expect(rh([4, 9])).toBe(false);
  });

  it("rejects the light shapes", () => {
    expect(rh([2, 10])).toBe(false);
    expect(rh([2, 4, 5])).toBe(false);
    expect(rh([2, 4, 5, 8])).toBe(false);
    expect(rh([2, 4, 5, 7, 8])).toBe(false);
  });

  it("mirrors the whole table for a left-hander", () => {
    expect(lh([2])).toBe(false);            // 2 is a pocket pin for a lefty
    expect(lh([3])).toBe(true);             // mirror of the RH 2
    expect(lh([7])).toBe(true);
    expect(lh([6, 8])).toBe(false);         // mirror of 4-9
    expect(lh([3, 7])).toBe(false);         // mirror of 2-10
    expect(lh([3, 5, 6])).toBe(false);      // mirror of the bucket
    expect(lh([4, 6, 7, 10])).toBe(false);  // big four is symmetric
    expect(lh([5])).toBe(false);
  });
});

describe("resolvePocketHit", () => {
  it("prefers the stored verdict over the inference", () => {
    expect(resolvePocketHit({ pins_standing: [], pocket_hit: false }, "right")).toBe(false);
    expect(resolvePocketHit({ pins_standing: [1, 3], pocket_hit: true }, "right")).toBe(true);
  });

  it("falls back to the inference when no verdict was recorded", () => {
    expect(resolvePocketHit({ pins_standing: [10] }, "right")).toBe(true);
    expect(resolvePocketHit({ pins_standing: [3] }, "right")).toBe(false);
  });
});
