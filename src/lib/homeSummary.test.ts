import { describe, expect, it } from "vitest";
import { HOME_TREND_SESSIONS, summarizeHome } from "./homeSummary";
import type { SessionSummary } from "../types/bowling";

function night(id: number, date: string, ...scores: Array<number | undefined>): SessionSummary {
  return {
    session: { id, date, alley_name: "Sea Bowl" },
    games: scores.map((final_score, i) => ({ id: id * 10 + i, session_id: id, game_number: i + 1, final_score, frames: [] }))
  };
}

describe("summarizeHome", () => {
  it("averages every finished game and ends the trend on the latest session", () => {
    const s = summarizeHome([night(2, "2026-10-08", 200, 220), night(1, "2026-10-01", 180, undefined)]);
    expect(s.average).toBeCloseTo(200);
    expect(s.games).toBe(3);
    expect(s.last?.date).toBe("2026-10-08");
    expect(s.last?.average).toBe(210);
    expect(s.trend).toEqual([180, 210]);
  });

  it("says nothing before the first finished game", () => {
    const s = summarizeHome([night(1, "2026-10-01", undefined)]);
    expect(s).toEqual({ average: null, games: 0, last: null, trend: [] });
  });

  it("draws only the latest sessions", () => {
    const nights = Array.from({ length: HOME_TREND_SESSIONS + 3 }, (_, i) =>
      night(i + 1, `2026-01-${String(i + 1).padStart(2, "0")}`, 150 + i)
    );
    const s = summarizeHome(nights);
    expect(s.trend).toHaveLength(HOME_TREND_SESSIONS);
    expect(s.trend[s.trend.length - 1]).toBe(150 + HOME_TREND_SESSIONS + 2);
  });
});
