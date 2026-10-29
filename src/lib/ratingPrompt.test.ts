import { describe, expect, it } from "vitest";
import { RATING_GAP_DAYS, shouldAskForRating } from "./ratingPrompt";

const now = new Date("2026-11-01T20:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("shouldAskForRating", () => {
  it("asks after a game at or above the bowler's usual", () => {
    expect(shouldAskForRating({ score: 180, finishedScores: [150, 170, 180], lastAskedAt: undefined, now })).toBe(true);
    expect(shouldAskForRating({ score: 160, finishedScores: [150, 170, 160], lastAskedAt: undefined, now })).toBe(true);
  });

  it("does not ask after a game below the bowler's usual", () => {
    expect(shouldAskForRating({ score: 120, finishedScores: [150, 170, 120], lastAskedAt: undefined, now })).toBe(false);
  });

  it("never asks before the third finished game", () => {
    expect(shouldAskForRating({ score: 300, finishedScores: [300], lastAskedAt: undefined, now })).toBe(false);
    expect(shouldAskForRating({ score: 300, finishedScores: [100, 300], lastAskedAt: undefined, now })).toBe(false);
  });

  it("waits the gap after asking once", () => {
    const moment = { score: 200, finishedScores: [150, 160, 200] };
    expect(shouldAskForRating({ ...moment, lastAskedAt: daysAgo(RATING_GAP_DAYS - 1), now })).toBe(false);
    expect(shouldAskForRating({ ...moment, lastAskedAt: daysAgo(RATING_GAP_DAYS), now })).toBe(true);
  });

  it("treats an unreadable last ask as never asked", () => {
    expect(shouldAskForRating({ score: 200, finishedScores: [150, 160, 200], lastAskedAt: "nonsense", now })).toBe(true);
  });
});
