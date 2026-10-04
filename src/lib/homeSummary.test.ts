import { describe, expect, it } from "vitest";
import { recentAlleys, sessionSeries } from "./homeSummary";
import type { SessionSummary } from "../types/bowling";

const s = (
  id: number,
  alley: string,
  description?: string,
  oil?: number
): SessionSummary => ({
  session: { id, date: `2026-09-${10 + id}`, alley_name: alley, description, oil_pattern_id: oil },
  games: []
});

describe("recentAlleys", () => {
  it("lists distinct alley and description pairs, newest first", () => {
    const list = recentAlleys([
      s(5, "Chinese Swimming Club", "League", 3),
      s(4, "chinese swimming club", "league"),
      s(3, "Seletar Country Club", "Adult Interclub"),
      s(2, "Chinese Swimming Club", "Practice"),
      s(1, "Orchid Bowl")
    ]);
    expect(list).toEqual([
      { alley_name: "Chinese Swimming Club", description: "League", oil_pattern_id: 3 },
      { alley_name: "Seletar Country Club", description: "Adult Interclub" },
      { alley_name: "Chinese Swimming Club", description: "Practice" }
    ]);
  });

  it("skips sessions with no alley", () => {
    expect(recentAlleys([s(1, "  "), s(2, "Orchid Bowl")])).toEqual([{ alley_name: "Orchid Bowl" }]);
  });
});

describe("sessionSeries", () => {
  it("adds up the scored games", () => {
    const summary: SessionSummary = {
      session: { id: 1, date: "2026-09-30", alley_name: "X" },
      games: [
        { id: 1, session_id: 1, game_number: 1, final_score: 200, frames: [] },
        { id: 2, session_id: 1, game_number: 2, final_score: 241, frames: [] },
        { id: 3, session_id: 1, game_number: 3, frames: [] }
      ]
    };
    expect(sessionSeries(summary)).toEqual({ series: 441, average: 221, games: 2 });
  });

  it("is null with nothing scored", () => {
    expect(sessionSeries(s(1, "X"))).toBeNull();
  });
});
