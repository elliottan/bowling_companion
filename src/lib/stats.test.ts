import { describe, expect, it } from "vitest";
import { calculateCommonLeaves, calculateStats, filterSessionsBy } from "./stats";
import type { Frame, Game, PinNumber, SessionSummary, Shot } from "../types/bowling";

const NONE: PinNumber[] = [];

function frame(
  n: number,
  s1: PinNumber[],
  s2?: PinNumber[],
  s3?: PinNumber[]
): Frame {
  const shots: Shot[] = [{ pins_standing: s1 }];
  if (s2 !== undefined) shots.push({ pins_standing: s2 });
  if (s3 !== undefined) shots.push({ pins_standing: s3 });
  return {
    game_id: 1,
    frame_number: n,
    shots,
    is_strike: s1.length === 0,
    is_spare: s1.length > 0 && s2?.length === 0
  };
}

function game(finalScore: number | undefined, frames: Frame[]): Game & { frames: Frame[] } {
  return { id: 1, session_id: 1, game_number: 1, final_score: finalScore, frames };
}

function session(alley: string, games: Array<Game & { frames: Frame[] }>): SessionSummary {
  return { session: { date: "2026-06-07", alley_name: alley }, games };
}

describe("calculateStats", () => {
  it("returns null metrics for no data", () => {
    const stats = calculateStats([]);
    expect(stats).toEqual({
      totalSessions: 0,
      totalGames: 0,
      completedGames: 0,
      averageScore: null,
      highGame: null,
      strikePct: null,
      sparePct: null,
      byAlley: []
    });
  });

  it("scores a perfect game as 100% strikes", () => {
    const frames = [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE)),
      frame(10, NONE, NONE, NONE)
    ];
    const stats = calculateStats([session("Perfect Lanes", [game(300, frames)])]);

    expect(stats.completedGames).toBe(1);
    expect(stats.averageScore).toBe(300);
    expect(stats.highGame).toBe(300);
    expect(stats.strikePct).toBe(100);
    expect(stats.sparePct).toBeNull(); // no spare opportunities
  });

  it("counts spare opportunities and conversions", () => {
    // 9 open frames (no strike, no spare), 10th open.
    const frames = [
      frame(1, [10], NONE), // spare made (9 then clear)
      frame(2, [10], [10]), // spare opportunity missed
      ...Array.from({ length: 7 }, (_, i) => frame(i + 3, [10], [10])),
      frame(10, [10], [10])
    ];
    const stats = calculateStats([session("Spare Lanes", [game(90, frames)])]);

    // Frames 1-9: 9 first-ball opps, 0 strikes. 10th ball1 opp, 0 strikes.
    expect(stats.strikePct).toBe(0);
    // Spare opps: frames 1-9 each have a 2nd ball (9) + 10th (1) = 10.
    // Made: only frame 1. 1/10 = 10%.
    expect(stats.sparePct).toBe(10);
  });

  it("averages only completed games and groups by alley", () => {
    const open = [
      ...Array.from({ length: 9 }, (_, i) => frame(i + 1, [10], [10])),
      frame(10, [10], [10])
    ];
    const sessions: SessionSummary[] = [
      session("Alley A", [game(150, open), game(undefined, open)]),
      session("Alley B", [game(120, open)])
    ];
    const stats = calculateStats(sessions);

    expect(stats.totalGames).toBe(3);
    expect(stats.completedGames).toBe(2);
    expect(stats.averageScore).toBe(135); // (150 + 120) / 2
    expect(stats.highGame).toBe(150);
    expect(stats.byAlley).toEqual([
      { alley: "Alley A", games: 1, average: 150, high: 150 },
      { alley: "Alley B", games: 1, average: 120, high: 120 }
    ]);
  });
});

describe("calculateCommonLeaves", () => {
  it("returns empty array for no sessions", () => {
    expect(calculateCommonLeaves([])).toEqual([]);
  });

  it("counts leaves and conversions correctly", () => {
    // Frame leaving the 10-pin, converted
    const f1 = frame(1, [10 as PinNumber], NONE);
    // Frame leaving the 10-pin, not converted
    const f2 = frame(2, [10 as PinNumber], [10 as PinNumber]);
    // Frame leaving pins 7 and 10
    const f3 = frame(3, [7 as PinNumber, 10 as PinNumber], NONE);
    const sessions: SessionSummary[] = [
      session("Lanes", [game(undefined, [f1, f2, f3])])
    ];
    const result = calculateCommonLeaves(sessions);

    // 10-pin leave appears twice — most frequent
    expect(result[0].pins).toEqual([10]);
    expect(result[0].attempts).toBe(2);
    expect(result[0].conversions).toBe(1);
    expect(result[0].conversionPct).toBe(50);

    // 7-10 split appears once
    expect(result[1].pins).toEqual([7, 10]);
    expect(result[1].attempts).toBe(1);
    expect(result[1].conversions).toBe(1);
    expect(result[1].conversionPct).toBe(100);
  });

  it("ignores strikes", () => {
    const strikeFrames = Array.from({ length: 9 }, (_, i) => frame(i + 1, NONE));
    const sessions: SessionSummary[] = [
      session("Lanes", [game(undefined, strikeFrames)])
    ];
    expect(calculateCommonLeaves(sessions)).toEqual([]);
  });

  it("sorts by frequency descending", () => {
    // 7-pin leave once, 10-pin leave three times
    const f1 = frame(1, [10 as PinNumber], NONE);
    const f2 = frame(2, [10 as PinNumber], NONE);
    const f3 = frame(3, [10 as PinNumber], NONE);
    const f4 = frame(4, [7 as PinNumber], NONE);
    const sessions: SessionSummary[] = [
      session("Lanes", [game(undefined, [f1, f2, f3, f4])])
    ];
    const result = calculateCommonLeaves(sessions);

    expect(result[0].pins).toEqual([10]);
    expect(result[0].attempts).toBe(3);
    expect(result[1].pins).toEqual([7]);
    expect(result[1].attempts).toBe(1);
  });
});

describe("filterSessionsBy", () => {
  const makeSession = (
    alley: string,
    oilPattern: string | undefined,
    gamesData: Array<{ lane?: string }>
  ): SessionSummary => ({
    session: { date: "2026-06-01", alley_name: alley, oil_pattern: oilPattern },
    games: gamesData.map((g, i) => ({
      id: i + 1,
      session_id: 1,
      game_number: i + 1,
      lane_number: g.lane,
      frames: []
    }))
  });

  it("returns all sessions when no filter applied", () => {
    const sessions = [
      makeSession("Alley A", "Sport", [{ lane: "1" }]),
      makeSession("Alley B", "House", [{ lane: "2" }])
    ];
    expect(filterSessionsBy(sessions, {})).toHaveLength(2);
  });

  it("filters by alley name (case-insensitive)", () => {
    const sessions = [
      makeSession("Bowlero", undefined, [{}]),
      makeSession("AMF", undefined, [{}])
    ];
    const result = filterSessionsBy(sessions, { alleyName: "bowlero" });
    expect(result).toHaveLength(1);
    expect(result[0].session.alley_name).toBe("Bowlero");
  });

  it("filters by oil pattern (contains, case-insensitive)", () => {
    const sessions = [
      makeSession("Lanes A", "PBA Wolf", [{}]),
      makeSession("Lanes B", "House Shot", [{}]),
      makeSession("Lanes C", "PBA Bear", [{}])
    ];
    const result = filterSessionsBy(sessions, { oilPattern: "pba" });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.session.alley_name)).toEqual(["Lanes A", "Lanes C"]);
  });

  it("filters games by lane number within a session", () => {
    const sessions = [
      makeSession("Alley", undefined, [{ lane: "5" }, { lane: "6" }, { lane: "5" }])
    ];
    const result = filterSessionsBy(sessions, { laneNumber: "5" });
    expect(result).toHaveLength(1);
    expect(result[0].games).toHaveLength(2);
  });

  it("excludes sessions where no games match the lane filter", () => {
    const sessions = [
      makeSession("Alley A", undefined, [{ lane: "1" }]),
      makeSession("Alley B", undefined, [{ lane: "2" }])
    ];
    const result = filterSessionsBy(sessions, { laneNumber: "3" });
    expect(result).toHaveLength(0);
  });
});
