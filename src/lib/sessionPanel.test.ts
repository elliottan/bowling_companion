import { describe, expect, it } from "vitest";
import { gameChipOn, tapGameChip } from "./sessionPanel";

describe("a game chip with the session panel up", () => {
  it("scopes the stats to a game and stays on the stats", () => {
    const next = tapGameChip("stats", { token: 0 }, 2);
    expect(next).toEqual({ tab: "stats", selection: { gameId: 2, token: 1 } });
  });

  it("gives the series back when the chip already on is tapped", () => {
    expect(tapGameChip("stats", { gameId: 2, token: 3 }, 2).selection).toEqual({ token: 4 });
  });

  it("goes to the game on the sheet from any other tab, and re-scrolls on a re-tap", () => {
    expect(tapGameChip("lanes", { token: 0 }, 1)).toEqual({ tab: "sheet", selection: { gameId: 1, token: 1 } });
    expect(tapGameChip("sheet", { gameId: 1, token: 1 }, 1).selection).toEqual({ gameId: 1, token: 2 });
  });

  it("reads as on only on the stats tab", () => {
    expect(gameChipOn("stats", { gameId: 2, token: 1 }, 2)).toBe(true);
    expect(gameChipOn("stats", { gameId: 2, token: 1 }, 1)).toBe(false);
    expect(gameChipOn("sheet", { gameId: 2, token: 1 }, 2)).toBe(false);
  });
});
