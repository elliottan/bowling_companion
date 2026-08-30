import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import { dismissNextStep, getOnboardingFacts } from "./onboardingRepository";

describe("getOnboardingFacts", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("reads an untouched database as empty on every count", async () => {
    expect(await getOnboardingFacts()).toEqual({
      sessionCount: 0,
      ballCount: 0,
      answeredSpareLines: 0,
      oilPatternCount: 0,
      laneNoteCount: 0,
      repeatAlleyCount: 0,
      dismissed: []
    });
  });

  it("counts a spare line only once it holds an answer", async () => {
    await db.spare_lines.add({ pins: [10] });
    expect((await getOnboardingFacts()).answeredSpareLines).toBe(0);

    await db.spare_lines.add({ pins: [7], strike_offset: { target: 3 } });
    expect((await getOnboardingFacts()).answeredSpareLines).toBe(1);
  });

  it("counts an alley as a repeat only on the second visit, ignoring case and padding", async () => {
    await db.sessions.add({ date: "2026-08-01", alley_name: "Orchid Bowl" });
    expect((await getOnboardingFacts()).repeatAlleyCount).toBe(0);

    await db.sessions.add({ date: "2026-08-08", alley_name: "  orchid bowl " });
    const facts = await getOnboardingFacts();
    expect(facts.repeatAlleyCount).toBe(1);
    expect(facts.sessionCount).toBe(2);
  });

  it("reports only the steps that were actually dismissed", async () => {
    await dismissNextStep("oil-pattern");
    expect((await getOnboardingFacts()).dismissed).toEqual(["oil-pattern"]);
  });
});
