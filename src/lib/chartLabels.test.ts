import { describe, expect, it } from "vitest";
import { averageLabelY } from "./chartLabels";

describe("averageLabelY", () => {
  it("goes above the line when the latest point is below it", () => {
    expect(averageLabelY(50, 70)).toBe(46);
  });

  it("goes below the line when the latest point is above it", () => {
    expect(averageLabelY(50, 30)).toBe(63);
  });

  it("goes above when the point sits on the line", () => {
    expect(averageLabelY(50, 50)).toBe(46);
  });
});
