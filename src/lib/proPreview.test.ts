import { describe, expect, it } from "vitest";
import { previewSplit, standInBall } from "./proPreview";

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

describe("the blurred row's stand-ins (ADR-190)", () => {
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
