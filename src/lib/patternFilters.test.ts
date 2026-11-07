import { describe, expect, it } from "vitest";
import { byGamesBowled } from "./patternFilters";

describe("byGamesBowled", () => {
  const patterns = [
    { id: 1, name: "Alpha" },
    { id: 2, name: "Beaten Path" },
    { id: 3, name: "Cheetah" },
    { id: 4, name: "Route 66" },
    { name: "Unsaved" }
  ];

  it("leads with the patterns bowled most, most games first", () => {
    const games = new Map([[3, 4], [4, 12], [2, 1]]);
    expect(byGamesBowled(patterns, games).map((p) => p.name)).toEqual([
      "Route 66",
      "Cheetah",
      "Beaten Path",
      "Alpha",
      "Unsaved"
    ]);
  });

  it("keeps the order it was given for ties and for patterns never bowled", () => {
    const games = new Map([[3, 2], [1, 2]]);
    expect(byGamesBowled(patterns, games).map((p) => p.name)).toEqual([
      "Alpha",
      "Cheetah",
      "Beaten Path",
      "Route 66",
      "Unsaved"
    ]);
  });

  it("leaves the list as it was with nothing bowled", () => {
    expect(byGamesBowled(patterns, new Map())).toEqual(patterns);
  });
});
