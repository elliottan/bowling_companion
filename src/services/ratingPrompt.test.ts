import { describe, expect, it, vi } from "vitest";
import { considerRatingPrompt, type RatingDeps } from "./ratingPrompt";

function deps(overrides: Partial<RatingDeps> = {}): RatingDeps {
  return {
    ios: true,
    finishedScores: async () => [150, 160, 200],
    lastAskedAt: async () => undefined,
    markAsked: vi.fn(async () => {}),
    requestReview: vi.fn(async () => {}),
    wait: async () => {},
    now: () => new Date("2026-11-01T20:00:00Z"),
    ...overrides
  };
}

describe("considerRatingPrompt", () => {
  it("records the ask and asks Apple after a good game", async () => {
    const d = deps();
    expect(await considerRatingPrompt(200, d)).toBe(true);
    expect(d.markAsked).toHaveBeenCalledWith("2026-11-01T20:00:00.000Z");
    expect(d.requestReview).toHaveBeenCalledOnce();
  });

  it("does nothing outside the iPhone app", async () => {
    const d = deps({ ios: false });
    expect(await considerRatingPrompt(200, d)).toBe(false);
    expect(d.requestReview).not.toHaveBeenCalled();
  });

  it("does not ask after a game below the bowler's usual", async () => {
    const d = deps({ finishedScores: async () => [180, 190, 120] });
    expect(await considerRatingPrompt(120, d)).toBe(false);
    expect(d.markAsked).not.toHaveBeenCalled();
  });

  it("swallows a plugin that fails", async () => {
    const d = deps({
      requestReview: async () => {
        throw new Error("no scene");
      }
    });
    expect(await considerRatingPrompt(200, d)).toBe(false);
  });
});
