// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { SessionSummary } from "../types/bowling";
import {
  bowledDays,
  clampMonth,
  monthBounds,
  sameMonth,
  dayKey,
  groupByDay,
  heatLevel,
  monthGrid,
  monthInputValue,
  monthOfDate,
  monthTotals,
  parseMonthInput,
  readCalendarShown,
  shiftMonth,
  weekStartFor,
  writeCalendarShown
} from "./historyCalendar";

let nextId = 1;
function summary(date: string, scores: Array<number | undefined>): SessionSummary {
  const id = nextId++;
  return {
    session: { id, date, alley_name: "Ace Lanes" },
    games: scores.map((final_score, i) => ({
      id: id * 100 + i,
      session_id: id,
      game_number: i + 1,
      final_score,
      frames: []
    }))
  } as unknown as SessionSummary;
}

describe("bowledDays", () => {
  it("averages a day's finished games across its sessions", () => {
    const days = bowledDays([
      summary("2026-10-21", [200, 180]),
      summary("2026-10-21", [220]),
      summary("2026-10-19", [150])
    ]);
    expect(days.get("2026-10-21")).toEqual({ sessions: 2, average: 200 });
    expect(days.get("2026-10-19")).toEqual({ sessions: 1, average: 150 });
  });

  it("has no average for a day with no finished game", () => {
    expect(bowledDays([summary("2026-11-08", [undefined])]).get("2026-11-08")).toEqual({
      sessions: 1,
      average: null
    });
  });
});

describe("heatLevel", () => {
  it("ranks against the averages shown, lightest to deepest", () => {
    expect(heatLevel(150, 150, 230)).toBe(1);
    expect(heatLevel(175, 150, 230)).toBe(2);
    expect(heatLevel(200, 150, 230)).toBe(3);
    expect(heatLevel(229, 150, 230)).toBe(4);
    expect(heatLevel(230, 150, 230)).toBe(4);
  });

  it("puts a lone or level month a step under the deepest", () => {
    expect(heatLevel(190, 190, 190)).toBe(3);
  });
});

describe("monthGrid", () => {
  // October 2026 starts on a Thursday.
  const october = { year: 2026, month: 9 };

  it("leads with a blank per weekday before the first", () => {
    const sunday = monthGrid(october, new Map(), 0);
    expect(sunday.slice(0, 4)).toEqual([null, null, null, null]);
    expect(sunday[4]?.day).toBe(1);
    expect(sunday.filter(Boolean)).toHaveLength(31);

    const monday = monthGrid(october, new Map(), 1);
    expect(monday.slice(0, 3)).toEqual([null, null, null]);
    expect(monday[3]?.key).toBe("2026-10-01");
  });

  it("shades only the bowled days, ranked within the month", () => {
    const days = bowledDays([
      summary("2026-10-03", [160]),
      summary("2026-10-21", [240]),
      summary("2026-10-28", [undefined]),
      // Another month's nights never move this month's scale.
      summary("2026-11-02", [300])
    ]);
    const cells = monthGrid(october, days, 0).filter((c) => c !== null);
    const at = (d: number) => cells.find((c) => c.day === d)!;
    expect(at(3).level).toBe(1);
    expect(at(21).level).toBe(4);
    expect(at(28)).toMatchObject({ level: 0, bowled: { sessions: 1, average: null } });
    expect(at(10)).toMatchObject({ level: 0, bowled: null });
  });
});

describe("months", () => {
  it("steps across a year's end both ways", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 5 }, -18)).toEqual({ year: 2024, month: 11 });
  });

  it("reads and writes the month input's value", () => {
    expect(monthInputValue({ year: 2026, month: 9 })).toBe("2026-10");
    expect(parseMonthInput("2026-10")).toEqual({ year: 2026, month: 9 });
    expect(parseMonthInput("")).toBeNull();
    expect(parseMonthInput("2026-13")).toBeNull();
  });

  it("keys a day as a session stores it", () => {
    expect(dayKey(2026, 0, 5)).toBe("2026-01-05");
    expect(monthOfDate(new Date(2026, 10, 8))).toEqual({ year: 2026, month: 10 });
  });

  it("totals a month's sessions and finished games", () => {
    const sessions = [
      summary("2026-10-21", [200, 180]),
      summary("2026-10-02", [undefined]),
      summary("2026-11-02", [300])
    ];
    expect(monthTotals({ year: 2026, month: 9 }, sessions)).toEqual({ sessions: 2, average: 190 });
    expect(monthTotals({ year: 2026, month: 8 }, sessions)).toEqual({ sessions: 0, average: null });
  });
});

describe("groupByDay", () => {
  it("puts a day's sessions under one heading, in list order", () => {
    const a = summary("2026-10-21", [200]);
    const b = summary("2026-10-21", [180]);
    const c = summary("2026-10-19", [190]);
    expect(groupByDay([a, b, c])).toEqual([
      { date: "2026-10-21", sessions: [a, b] },
      { date: "2026-10-19", sessions: [c] }
    ]);
  });
});

describe("weekStartFor", () => {
  it("is Sunday where nothing says otherwise", () => {
    expect(weekStartFor(undefined)).toBe(0);
    expect(weekStartFor("not a locale!")).toBe(0);
  });

  it("reads the region's first day where the browser knows it", () => {
    const known = new Intl.Locale("en-GB") as Intl.Locale & {
      getWeekInfo?: () => unknown;
      weekInfo?: unknown;
    };
    if (!known.getWeekInfo && !known.weekInfo) return; // this engine cannot say
    expect(weekStartFor("en-GB")).toBe(1);
    expect(weekStartFor("en-US")).toBe(0);
  });
});

describe("whether the calendar shows", () => {
  afterEach(() => localStorage.clear());

  it("is on until hidden, and remembers being hidden", () => {
    expect(readCalendarShown()).toBe(true);
    writeCalendarShown(false);
    expect(readCalendarShown()).toBe(false);
    writeCalendarShown(true);
    expect(readCalendarShown()).toBe(true);
  });
});

describe("monthBounds and clampMonth", () => {
  const bounds = monthBounds([summary("2026-03-02", [150]), summary("2025-11-30", [180]), summary("2026-01-10", [])]);

  it("runs from the first session's month to the last's", () => {
    expect(bounds).toEqual({ min: { year: 2025, month: 10 }, max: { year: 2026, month: 2 } });
    expect(monthBounds([])).toBeNull();
  });

  it("holds a month inside them", () => {
    expect(clampMonth({ year: 2025, month: 0 }, bounds)).toEqual({ year: 2025, month: 10 });
    expect(clampMonth({ year: 2026, month: 10 }, bounds)).toEqual({ year: 2026, month: 2 });
    expect(clampMonth({ year: 2026, month: 0 }, bounds)).toEqual({ year: 2026, month: 0 });
    expect(clampMonth({ year: 2020, month: 0 }, null)).toEqual({ year: 2020, month: 0 });
  });

  it("compares months", () => {
    expect(sameMonth({ year: 2026, month: 2 }, { year: 2026, month: 2 })).toBe(true);
    expect(sameMonth({ year: 2026, month: 2 }, { year: 2025, month: 2 })).toBe(false);
  });
});
