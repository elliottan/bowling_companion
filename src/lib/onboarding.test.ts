import { describe, expect, it } from "vitest";
import { NEXT_STEP_LIMIT, nextStepDismissedKey, nextSteps, type OnboardingFacts } from "./onboarding";

/** A user with nothing missing: every rule closed. */
const furnished: OnboardingFacts = {
  sessionCount: 12,
  ballCount: 3,
  answeredSpareLines: 5,
  oilPatternCount: 2,
  repeatAlleyCount: 2,
  laneNoteCount: 4,
  dismissed: []
};

function facts(overrides: Partial<OnboardingFacts>): OnboardingFacts {
  return { ...furnished, ...overrides };
}

describe("nextSteps", () => {
  it("offers nothing to a user whose data is already furnished", () => {
    expect(nextSteps(furnished)).toEqual([]);
  });

  it("asks a brand new user for balls only, and nothing else", () => {
    const steps = nextSteps({
      sessionCount: 0,
      ballCount: 0,
      answeredSpareLines: 0,
      oilPatternCount: 0,
      repeatAlleyCount: 0,
      laneNoteCount: 0,
      dismissed: []
    });
    expect(steps).toEqual(["arsenal"]);
  });

  it("opens spare lines and oil patterns once a session is on record", () => {
    expect(nextSteps(facts({ sessionCount: 1, answeredSpareLines: 0, oilPatternCount: 0 })))
      .toEqual(["spare-lines", "oil-pattern"]);
  });

  it("treats seeded pin sets with no answer as no spare lines", () => {
    expect(nextSteps(facts({ answeredSpareLines: 0 }))).toEqual(["spare-lines"]);
  });

  it("holds lane notes back until an alley has been bowled twice", () => {
    expect(nextSteps(facts({ laneNoteCount: 0, repeatAlleyCount: 0 }))).toEqual([]);
    expect(nextSteps(facts({ laneNoteCount: 0, repeatAlleyCount: 1 }))).toEqual(["lane-notes"]);
  });

  it("caps the list so Home never becomes a wall of chores", () => {
    const everythingMissing = nextSteps({
      sessionCount: 5,
      ballCount: 0,
      answeredSpareLines: 0,
      oilPatternCount: 0,
      repeatAlleyCount: 3,
      laneNoteCount: 0,
      dismissed: []
    });
    expect(everythingMissing).toHaveLength(NEXT_STEP_LIMIT);
    expect(everythingMissing).toEqual(["arsenal", "spare-lines"]);
  });

  it("lets a dismissed step through to the one behind it", () => {
    expect(
      nextSteps({
        sessionCount: 5,
        ballCount: 0,
        answeredSpareLines: 0,
        oilPatternCount: 0,
        repeatAlleyCount: 3,
        laneNoteCount: 0,
        dismissed: ["arsenal", "spare-lines"]
      })
    ).toEqual(["oil-pattern", "lane-notes"]);
  });

  it("keys dismissals per step", () => {
    expect(nextStepDismissedKey("arsenal")).toBe("next_step_dismissed:arsenal");
    expect(nextStepDismissedKey("lane-notes")).toBe("next_step_dismissed:lane-notes");
  });
});
