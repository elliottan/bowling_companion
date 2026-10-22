import { describe, expect, it } from "vitest";
import { freeLeavePreview, isOpenLeave, previewSplit, standInBall, standInLeave } from "./proPreview";
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

describe("the free leaves (ADR-195)", () => {
  it("are the two left most, with the next blurred", () => {
    const leaves = [leave([7], 4), leave([10], 9), leave([4], 6), leave([2, 4, 5, 8], 12, 0)];
    const { shown, blurred } = freeLeavePreview(leaves);
    // The washout off the 10th's last ball had no chance, so it is not ranked.
    expect(shown.map((l) => l.pins)).toEqual([[10], [4]]);
    expect(blurred?.pins).toEqual([7]);
  });

  it("opens the records of the leaves shown, and no others", () => {
    const leaves = [leave([7], 4), leave([10], 9), leave([4], 6)];
    expect(isOpenLeave(leaves, [10])).toBe(true);
    expect(isOpenLeave(leaves, [4])).toBe(true);
    expect(isOpenLeave(leaves, [7])).toBe(false);
  });
});

describe("the blurred row's stand-ins (ADR-190)", () => {
  it("keep a leave's pins and none of its record", () => {
    const real: LeaveStats = { pins: [7, 10], attempts: 31, chances: 30, conversions: 2, conversionPct: 7, sharePct: 9 };
    const shown = standInLeave(real);
    expect(shown.pins).toEqual([7, 10]);
    expect(standInLeave({ ...real, attempts: 3, conversions: 1, conversionPct: 33 })).toEqual(shown);
  });

  it("keep a ball's name and photo and none of its numbers", () => {
    const real = {
      ballId: 4,
      name: "Phaze II",
      imageThumb: "a.webp",
      brand: "Storm",
      firstBalls: 212,
      pocketPct: 71,
      carryPct: 66,
      strikePct: 47,
      firstBallAverage: 9.1,
      strikeOnStrikePct: 52,
      byGame: [],
      leaves: []
    };
    const shown = standInBall(real);
    expect(shown).toMatchObject({ ballId: 4, name: "Phaze II", imageThumb: "a.webp", brand: "Storm" });
    expect(standInBall({ ...real, firstBalls: 15, strikePct: 20 })).toEqual(shown);
  });
});
