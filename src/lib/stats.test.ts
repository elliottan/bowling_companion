import { describe, expect, it } from "vitest";
import { calculateStats } from "./stats";
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
