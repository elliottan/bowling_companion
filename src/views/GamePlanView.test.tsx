import { describe, expect, it } from "vitest";
import { describeShot, lineBoards, ofCount } from "./GamePlanView";

/**
 * The counts and groups are `lib/lineReport`'s and are tested there. These are
 * the few words the screen puts around them.
 */
describe("the words on the alley report", () => {
  it("says a count as a count, never a rate", () => {
    expect(ofCount(7, 10)).toBe("7 of 10");
  });

  it("names a line by its boards, or by the one it has", () => {
    expect(lineBoards({ stance: 4, target: 6.5 })).toBe("4 to 6.5");
    expect(lineBoards({ target: 7 })).toBe("target 7");
  });

  it("names a first ball by what it left, and whether that was a pocket hit", () => {
    expect(describeShot({ pinsStanding: [], pocket: true })).toBe("Strike");
    expect(describeShot({ pinsStanding: [10], pocket: true })).toBe("Pin 10, pocket");
    expect(describeShot({ pinsStanding: [2, 4, 5], pocket: false })).toBe("2-4-5");
  });
});
