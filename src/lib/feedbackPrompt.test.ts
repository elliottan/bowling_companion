import { describe, expect, it } from "vitest";
import { FEEDBACK_PROMPT_SESSIONS, shouldAskForFeedback } from "./feedbackPrompt";

describe("shouldAskForFeedback", () => {
  it("stays quiet until the habit has stuck", () => {
    for (let n = 0; n < FEEDBACK_PROMPT_SESSIONS; n++) {
      expect(shouldAskForFeedback(n, false)).toBe(false);
    }
    expect(shouldAskForFeedback(FEEDBACK_PROMPT_SESSIONS, false)).toBe(true);
  });

  it("never asks again once it has been answered or waved off", () => {
    expect(shouldAskForFeedback(FEEDBACK_PROMPT_SESSIONS, true)).toBe(false);
    expect(shouldAskForFeedback(500, true)).toBe(false);
  });
});
