import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import {
  addGameToSession,
  createSession,
  getSessionHistory,
  saveFrame
} from "./bowlingRepository";

describe("bowlingRepository", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates a session, adds a game, saves a frame, and reads history", async () => {
    const sessionId = Number(await createSession({
      date: "2026-05-26",
      alley_name: "Test Lanes",
      oil_pattern: "House",
      general_notes: "Fresh pair"
    }));
    const gameId = Number(await addGameToSession(sessionId, {
      game_number: 1,
      lane_number: "12"
    }));

    await saveFrame(gameId, {
      frame_number: 1,
      shot_1_pins_standing: [],
      is_strike: true,
      is_spare: false
    });

    const history = await getSessionHistory();

    expect(history).toHaveLength(1);
    expect(history[0].session.alley_name).toBe("Test Lanes");
    expect(history[0].games[0].frames[0].is_strike).toBe(true);
  });
});
