import { describe, expect, it } from "vitest";
import { averageLabelY, trendInset } from "./chartLabels";

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

  it("keeps off the latest point's own value, not only its dot", () => {
    // 193 just under an average of 197: the value printed over the dot crosses
    // the line, so neither side of it is clear and the label rises above it.
    const y = averageLabelY(60, 64, 9, true);
    expect(y).toBeLessThanOrEqual(64 - 18 - 2);
  });

  it("still takes the side opposite the point when that side is clear of its value", () => {
    expect(averageLabelY(50, 80, 9, true)).toBe(46);
  });
});

describe("trendInset", () => {
  it("pulls a handful of points in from the edges, and lets many run to them", () => {
    expect(trendInset(3)).toBeGreaterThan(trendInset(12));
    expect(trendInset(5)).toBe(trendInset(2));
    expect(trendInset(6)).toBe(14);
  });
});
