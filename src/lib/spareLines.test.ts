import { describe, expect, it } from "vitest";
import type { PinNumber, SpareLine } from "../types/bowling";
import {
  describeMove,
  matchesFilters,
  mostLeftWithoutLine,
  sameShot,
  stackByLine,
  suggestLineCopies,
  suggestionKey,
  type SpareFilter
} from "./spareLines";

const line = (id: number, pins: PinNumber[], stance?: number, target?: number): SpareLine => ({
  id,
  pins,
  ...(stance != null || target != null ? { line: { stance, target } } : {})
});

describe("stackByLine", () => {
  it("stacks leaves with the same boards where the first of them sits", () => {
    const lines = [line(1, [10], 30, 15), line(2, [2, 4, 5, 8], 25, 12), line(3, [7]), line(4, [2, 4, 8], 25, 12)];
    expect(stackByLine(lines).map((s) => s.map((sl) => sl.id))).toEqual([[1], [2, 4], [3]]);
  });

  it("never stacks leaves that have no line", () => {
    expect(stackByLine([line(1, [7]), line(2, [10])])).toHaveLength(2);
  });

  it("takes a leave out of its stack once its boards change", () => {
    const lines = [line(1, [2, 4, 5, 8], 25, 12), line(2, [2, 4, 8], 26, 12)];
    expect(stackByLine(lines)).toHaveLength(2);
  });
});

describe("sameShot", () => {
  it("reads the 2-8 sleeper family as one shot", () => {
    for (const pins of [[2, 4, 8], [2, 5, 8], [2, 4, 5, 7, 8]] as PinNumber[][]) {
      expect(sameShot(pins, [2, 4, 5, 8])).toBe(true);
    }
    expect(sameShot([2, 4, 7, 8], [2, 4, 8])).toBe(true);
  });

  it("keeps a leave without the sleeper apart from one with it", () => {
    expect(sameShot([2, 4, 5], [2, 4, 5, 8])).toBe(false);
  });

  it("does not pair single pins, leaves two pins apart, or different front pins", () => {
    expect(sameShot([10], [6, 10])).toBe(false);
    expect(sameShot([2, 8], [2, 4, 5, 8])).toBe(false);
    expect(sameShot([3, 6, 10], [6, 10])).toBe(false);
  });
});

describe("suggestLineCopies", () => {
  const lines = [line(1, [2, 4, 5, 8], 25, 12), line(2, [6, 10])];

  it("offers the saved line to a faced leave that is the same shot, most-faced first", () => {
    const faced = [
      { pins: [2, 5, 8] as PinNumber[], attempts: 2 },
      { pins: [2, 4, 8] as PinNumber[], attempts: 5 },
      { pins: [2, 4, 5] as PinNumber[], attempts: 9 }
    ];
    const out = suggestLineCopies(faced, lines);
    expect(out.map((s) => s.pins)).toEqual([
      [2, 4, 8],
      [2, 5, 8]
    ]);
    expect(out[0].from.id).toBe(1);
  });

  it("leaves out a suggestion once dismissed, and a leave that has its own line", () => {
    const faced = [{ pins: [2, 4, 8] as PinNumber[], attempts: 5 }];
    const [first] = suggestLineCopies(faced, lines);
    expect(suggestLineCopies(faced, lines, new Set([suggestionKey(first)]))).toEqual([]);
    expect(suggestLineCopies(faced, [...lines, line(3, [2, 4, 8], 20, 10)])).toEqual([]);
  });
});

describe("matchesFilters", () => {
  const has = (sl: SpareLine, ...f: SpareFilter[]) => matchesFilters(sl, new Set(f));

  it("passes everything with no filter on", () => {
    expect(has(line(1, [7, 10]))).toBe(true);
  });

  it("matches any one shape, and all of shape and line status together", () => {
    expect(has(line(1, [7]), "single", "sleeper")).toBe(true);
    expect(has(line(1, [2, 8]), "single", "sleeper")).toBe(true);
    expect(has(line(1, [3, 10]), "baby")).toBe(true);
    expect(has(line(1, [7, 10]), "baby")).toBe(false);
    expect(has(line(1, [2, 8], 25, 12), "sleeper", "noLine")).toBe(false);
    expect(has(line(1, [2, 8]), "sleeper", "noLine")).toBe(true);
  });
});

describe("mostLeftWithoutLine", () => {
  const leave = (pins: PinNumber[], attempts: number, chances = attempts) => ({
    pins,
    attempts,
    chances,
    conversions: 0,
    conversionPct: 0,
    sharePct: null
  });

  it("asks for the leave left most that has no boards saved", () => {
    const leaves = [leave([10], 9), leave([3, 6, 10], 5), leave([7], 2)];
    const lines = [
      { pins: [10] as PinNumber[], line: { stance: 15, target: 10 } },
      // A seeded leave with nothing written down is still asked for.
      { pins: [3, 6, 10] as PinNumber[] }
    ];
    expect(mostLeftWithoutLine(leaves, lines)?.pins).toEqual([3, 6, 10]);
  });

  it("asks for nothing when every leave has a line, or none had a ball after it", () => {
    expect(mostLeftWithoutLine([leave([7], 3, 0)], [])).toBeUndefined();
    expect(
      mostLeftWithoutLine([leave([7], 3)], [{ pins: [7], line: { target: 20 } }])
    ).toBeUndefined();
  });
});

describe("describeMove", () => {
  it("says up the boards is left for a right-hander and right for a left-hander", () => {
    expect(describeMove(2, "right")).toBe("2 left");
    expect(describeMove(-1.5, "right")).toBe("1.5 right");
    expect(describeMove(2, "left")).toBe("2 right");
    expect(describeMove(-1, "left")).toBe("1 left");
  });

  it("calls no move none", () => {
    expect(describeMove(0, "right")).toBe("None");
  });
});
