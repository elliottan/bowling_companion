import { describe, expect, it } from "vitest";
import { describeGameMove } from "./alleyHistoryCopy";
import type { MovementSlot } from "../lib/briefing";

const slot = (gameNumber: number, stance?: number, target?: number): MovementSlot => ({
  gameNumber,
  games: 2,
  score: 200,
  stance,
  target
});

describe("describeGameMove", () => {
  it("names the usual move into a game, in the bowler's directions", () => {
    const slots = [slot(1, 20, 10), slot(2, 22, 11)];
    expect(describeGameMove(slots, 2, "right")).toBe(
      "Game 2 here: you usually move 2 boards left at the stance and 1 board left at the target."
    );
    expect(describeGameMove(slots, 2, "left")).toBe(
      "Game 2 here: you usually move 2 boards right at the stance and 1 board right at the target."
    );
  });

  it("says nothing without both games, or without a move", () => {
    expect(describeGameMove([slot(1, 20, 10)], 2, "right")).toBeNull();
    expect(describeGameMove([slot(1, 20, 10), slot(2, 20, 10)], 2, "right")).toBeNull();
  });
});
