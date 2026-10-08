import { describe, expect, it } from "vitest";
import type { PinNumber, SpareLine } from "../types/bowling";
import {
  askKey,
  describeMove,
  HINT_SNOOZE_DAYS,
  lineRows,
  matchesFilters,
  matchesPins,
  mostLeftWithoutLine,
  parseSnoozes,
  sameShot,
  snooze,
  snoozedKeys,
  spareLinesShown,
  suggestLineCopies,
  suggestionKey,
  type SpareFilter
} from "./spareLines";

const line = (id: number, pins: PinNumber[], stance?: number, target?: number): SpareLine => ({
  id,
  pins,
  ...(stance != null || target != null ? { line: { stance, target } } : {})
});

const seen = (pins: PinNumber[], attempts: number, chances = attempts, conversionPct: number | null = null) => ({
  pins,
  attempts,
  chances,
  conversionPct
});

describe("lineRows", () => {
  it("puts the leaves answered with one line on one row, most left first", () => {
    const lines = [line(1, [10], 30, 15), line(2, [2, 4, 5, 8], 25, 12), line(3, [7]), line(4, [2, 4, 8], 25, 12)];
    const rows = lineRows(lines, [seen([10], 9), seen([2, 4, 5, 8], 2), seen([2, 4, 8], 6)]);
    expect(rows.map((r) => r.tiles.map((t) => t.spareLine.id))).toEqual([[1], [4, 2], [3]]);
  });

  it("orders the rows by their most-left leave, whichever the hand, and the unanswered row last", () => {
    const lines = [line(1, [7], 10, 5), line(2, [10], 30, 15), line(3, [4])];
    const rows = lineRows(lines, [seen([7], 3), seen([10], 8), seen([4], 50)]);
    expect(rows.map((r) => r.key)).toEqual(["30|15", "10|5", "none"]);
  });

  it("breaks a tie by pin number, so the order never shuffles", () => {
    const lines = [line(1, [10], 30, 15), line(2, [7], 30, 15)];
    expect(lineRows(lines, []).map((r) => r.tiles.map((t) => t.spareLine.id))).toEqual([[2, 1]]);
  });

  it("carries the record onto the tile, and zero for a leave never faced", () => {
    const [row] = lineRows([line(1, [10], 30, 15), line(2, [7], 30, 15)], [seen([10], 4, 3, 67)]);
    expect(row.tiles.find((t) => t.spareLine.id === 1)).toMatchObject({ attempts: 4, chances: 3, conversionPct: 67 });
    expect(row.tiles.find((t) => t.spareLine.id === 2)).toMatchObject({ attempts: 0, chances: 0, conversionPct: null });
  });

  it("never puts leaves with no line on a line's row", () => {
    expect(lineRows([line(1, [7]), line(2, [10])], [])).toHaveLength(1);
    expect(lineRows([line(1, [7]), line(2, [10])], [])[0].line).toBeNull();
  });

  it("takes a leave off a row once its boards change", () => {
    const rows = lineRows([line(1, [2, 4, 5, 8], 25, 12), line(2, [2, 4, 8], 26, 12)], []);
    expect(rows).toHaveLength(2);
  });
});

describe("matchesPins", () => {
  const picked = (...p: PinNumber[]) => new Set<PinNumber>(p);
  it("matches everything when nothing is picked", () => {
    expect(matchesPins([2, 8], picked(), false)).toBe(true);
  });
  it("matches a leave that has every picked pin, among others", () => {
    expect(matchesPins([2, 4, 10], picked(10), false)).toBe(true);
    expect(matchesPins([2, 4], picked(10), false)).toBe(false);
    expect(matchesPins([4, 10], picked(4, 10), false)).toBe(true);
  });
  it("with exactly, matches only that leave, so a lone 10 is easy to reach", () => {
    expect(matchesPins([10], picked(10), true)).toBe(true);
    expect(matchesPins([4, 10], picked(10), true)).toBe(false);
  });
});

describe("turned-down hints", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("stay away for the snooze period and then come back", () => {
    const kept = snooze({}, "ask:10", now);
    expect(snoozedKeys(kept, now).has("ask:10")).toBe(true);
    const later = new Date(now.getTime() + (HINT_SNOOZE_DAYS + 1) * 24 * 60 * 60 * 1000);
    expect(snoozedKeys(kept, later).has("ask:10")).toBe(false);
  });
  it("drops lapsed ones when another is added", () => {
    const old = snooze({}, "a", new Date("2026-01-01T00:00:00Z"));
    expect(Object.keys(snooze(old, "b", now))).toEqual(["b"]);
  });
  it("reads nothing from a damaged setting", () => {
    expect(parseSnoozes("not json")).toEqual({});
    expect(parseSnoozes('["a"]')).toEqual({});
    expect(parseSnoozes(undefined)).toEqual({});
  });
  it("lets the ask for the next leave through once one is snoozed", () => {
    const faced = [seen([10], 9), seen([7], 5)];
    expect(mostLeftWithoutLine(faced, [])?.pins).toEqual([10]);
    expect(mostLeftWithoutLine(faced, [], new Set([askKey([10])]))?.pins).toEqual([7]);
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

describe("a strike ball move is a line", () => {
  const moveOnly: SpareLine = { id: 9, pins: [2, 8], strike_offset: { stance: -2, target: -1 } };

  it("counts for Has a line, not No line yet", () => {
    expect(matchesFilters(moveOnly, new Set<SpareFilter>(["withLine"]))).toBe(true);
    expect(matchesFilters(moveOnly, new Set<SpareFilter>(["noLine"]))).toBe(false);
  });

  it("is not asked for as a leave with no line", () => {
    expect(mostLeftWithoutLine([{ pins: [2, 8], attempts: 13, chances: 13 }], [moveOnly])).toBeUndefined();
  });
});

describe("pocket leaves have no spare line (ADR-123)", () => {
  const faced = (pins: PinNumber[], attempts: number) => ({
    pins,
    attempts,
    chances: attempts,
    conversions: 0,
    conversionPct: 0,
    sharePct: null
  });

  it("are left out of the lines shown", () => {
    const lines = [line(1, [10], 15, 10), line(2, [1, 2, 3, 5], 20, 12), line(3, [1, 3, 6, 10])];
    expect(spareLinesShown(lines).map((sl) => sl.id)).toEqual([1, 3]);
  });

  it("are never asked for, however often they are left", () => {
    expect(mostLeftWithoutLine([faced([1, 3, 5], 9), faced([7], 2)], [])?.pins).toEqual([7]);
  });

  it("are never offered a copied line, nor lend theirs", () => {
    // 1-5 and 1-3-5 are the same shot by `sameShot`, but neither is a spare line.
    expect(suggestLineCopies([faced([1, 3, 5], 4)], [line(1, [1, 5], 20, 12)])).toEqual([]);
  });
});
