import { describe, expect, it } from "vitest";
import { markLanesPrompted, shouldPromptLanes } from "./lanePrompt";

describe("the lane editor's one automatic opening", () => {
  it("is owed to a game until it is used, then never again", () => {
    expect(shouldPromptLanes(9001)).toBe(true);
    markLanesPrompted(9001);
    expect(shouldPromptLanes(9001)).toBe(false);
  });

  it("is kept per game, so waiving one leaves the next game's alone", () => {
    markLanesPrompted(9101);
    expect(shouldPromptLanes(9102)).toBe(true);
  });
});
