import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./bowlingDb";
import type { Frame, Game, Session } from "../types/bowling";

/**
 * The upgrade path is the one thing here that can destroy data with no way
 * back: the app is offline-first, so a bad migration eats the only copy of a
 * user's season. These tests open a database at an old version, write the shape
 * that version actually stored, and then open it through the app's own Dexie
 * declaration so the real upgrades run.
 */

const DB_NAME = "BowlingCompanionDB";

/** The v1 schema, verbatim, so old rows land in the old shape. */
function openV1() {
  const legacy = new Dexie(DB_NAME);
  legacy.version(1).stores({
    sessions: "++id, date, alley_name",
    games: "++id, session_id, game_number, lane_number, final_score",
    frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare"
  });
  return legacy;
}

beforeEach(async () => {
  await db.delete();
});

afterEach(async () => {
  if (db.isOpen()) db.close();
  await db.delete();
});

describe("database upgrades", () => {
  it("carries a v1 database all the way to the current version", async () => {
    const legacy = openV1();
    await legacy.open();
    const sessionId = await legacy.table("sessions").add({
      date: "2026-01-05",
      alley_name: "Old Lanes",
      // Pre-v2 sessions carried the pattern as a bare string (ADR-037).
      oil_pattern: "Kegel Navigation"
    });
    const gameId = await legacy.table("games").add({
      session_id: sessionId,
      game_number: 1,
      lane_number: "12",
      final_score: 0
    });
    // v1 stored one column per shot rather than a `shots` array.
    await legacy.table("frames").add({
      game_id: gameId,
      frame_number: 1,
      is_strike: false,
      is_spare: true,
      shot_1_pins_standing: [7, 10],
      shot_1_notes: "left the big four's little brother",
      shot_2_pins_standing: []
    });
    legacy.close();

    await db.open();
    expect(db.verno).toBe(6);

    const frame = (await db.frames.toArray())[0] as Frame & Record<string, unknown>;
    expect(frame.shots).toEqual([
      { pins_standing: [7, 10], notes: "left the big four's little brother" },
      { pins_standing: [], notes: undefined }
    ]);
    expect(frame.shot_1_pins_standing).toBeUndefined();
    expect(frame.shot_2_pins_standing).toBeUndefined();
    expect(frame.shot_1_notes).toBeUndefined();

    // v3 backfilled the cross-lane config from the single lane number.
    const game = (await db.games.toArray())[0] as Game;
    expect(game.lanes).toEqual(["12"]);
    expect(game.start_lane).toBe("12");
    expect(game.lane_number).toBe("12");

    // v6 linked the denormalized pattern name to a real pattern row.
    const session = (await db.sessions.toArray())[0] as Session;
    const patterns = await db.oil_patterns.toArray();
    expect(patterns.map((p) => p.name)).toEqual(["Kegel Navigation"]);
    expect(session.oil_pattern_id).toBe(patterns[0].id);
  });

  it("leaves already-migrated rows untouched", async () => {
    const legacy = openV1();
    await legacy.open();
    const gameId = await legacy.table("games").add({
      session_id: 1,
      game_number: 1,
      lane_number: "9",
      // A row written by a newer version and reopened by an older one: the
      // upgrades all guard on shape, not on version.
      lanes: ["9", "10"],
      start_lane: "10",
      final_score: 0
    });
    await legacy.table("frames").add({
      game_id: gameId,
      frame_number: 1,
      is_strike: true,
      is_spare: false,
      shots: [{ pins_standing: [] }]
    });
    legacy.close();

    await db.open();

    const game = (await db.games.toArray())[0] as Game;
    expect(game.lanes).toEqual(["9", "10"]);
    expect(game.start_lane).toBe("10");
    expect((await db.frames.toArray())[0].shots).toEqual([{ pins_standing: [] }]);
  });

  it("does not invent a pattern row for a session that never named one", async () => {
    const legacy = openV1();
    await legacy.open();
    await legacy.table("sessions").add({ date: "2026-02-02", alley_name: "Plain Lanes" });
    legacy.close();

    await db.open();

    expect(await db.oil_patterns.toArray()).toEqual([]);
    expect((await db.sessions.toArray())[0].oil_pattern_id).toBeUndefined();
  });
});
