import { describe, expect, it } from "vitest";
import { isOpenLeave, openLeaveKeys, previewSplit } from "./proPreview";
import type { LeaveStats } from "./stats";
import type { PinNumber } from "../types/bowling";

const leave = (pins: PinNumber[], attempts: number, chances = attempts): LeaveStats => ({
  pins,
  attempts,
  chances,
  conversions: 0,
  conversionPct: chances ? 0 : null,
  sharePct: null
});

describe("previewSplit", () => {
  it("shows the free rows, blurs the next, and leaves out the rest", () => {
    expect(previewSplit([1, 2, 3, 4], 2)).toEqual({ shown: [1, 2], blurred: 3 });
  });

  it("is always one row short of the whole list, so something is locked", () => {
    expect(previewSplit([1, 2], 2)).toEqual({ shown: [1], blurred: 2 });
    expect(previewSplit([1], 1)).toEqual({ shown: [], blurred: 1 });
  });

  it("is nothing for nothing", () => {
    expect(previewSplit([], 2)).toEqual({ shown: [], blurred: undefined });
  });
});

describe("openLeaveKeys", () => {
  it("opens the leaves Stats shows in full: left most, among those a ball followed", () => {
    const leaves = [leave([7], 4), leave([10], 9), leave([4], 6), leave([2, 4, 5, 8], 12, 0)];
    // The washout off the 10th's last ball has no chance to convert, so it is
    // not on the card and not counted.
    expect([...openLeaveKeys(leaves)]).toEqual(["10", "4"]);
    expect(isOpenLeave(leaves, [10])).toBe(true);
    expect(isOpenLeave(leaves, [7])).toBe(false);
  });

  it("breaks a tie on attempts by chances, as Stats does", () => {
    const leaves = [leave([7], 5, 3), leave([10], 5, 5), leave([4], 1)];
    expect([...openLeaveKeys(leaves)]).toEqual(["10", "7"]);
  });
});
