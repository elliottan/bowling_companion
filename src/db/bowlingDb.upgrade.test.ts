import { describe, expect, it } from "vitest";
import { migrateFrameV1ToV2, migrateGameV2ToV3 } from "./bowlingDb";

describe("migrateFrameV1ToV2", () => {
  it("upgrades v1 flat frame fields to shots[]", () => {
    const frame: Record<string, unknown> = {
      game_id: 1,
      frame_number: 1,
      shot_1_pins_standing: [7, 10],
      shot_2_pins_standing: [],
      is_strike: false,
      is_spare: true
    };

    migrateFrameV1ToV2(frame);

    expect(Array.isArray(frame.shots)).toBe(true);
    const shots = frame.shots as Array<{ pins_standing: number[]; notes?: string }>;
    expect(shots).toHaveLength(2);
    expect(shots[0].pins_standing).toEqual([7, 10]);
    expect(shots[1].pins_standing).toEqual([]);
    expect(frame.shot_1_pins_standing).toBeUndefined();
    expect(frame.is_strike).toBe(false);
    expect(frame.is_spare).toBe(true);
  });

  it("preserves shot notes during upgrade", () => {
    const frame: Record<string, unknown> = {
      game_id: 1,
      frame_number: 2,
      shot_1_pins_standing: [8, 9, 10],
      shot_1_notes: "felt good",
      is_strike: false,
      is_spare: false
    };

    migrateFrameV1ToV2(frame);

    const shots = frame.shots as Array<{ pins_standing: number[]; notes?: string }>;
    expect(shots[0].notes).toBe("felt good");
  });

  it("strike frame (empty pins_standing) with no shot 2 produces shots.length === 1", () => {
    const frame: Record<string, unknown> = {
      game_id: 1,
      frame_number: 3,
      shot_1_pins_standing: [],
      is_strike: true,
      is_spare: false
    };

    migrateFrameV1ToV2(frame);

    const shots = frame.shots as Array<{ pins_standing: number[] }>;
    expect(shots).toHaveLength(1);
    expect(shots[0].pins_standing).toEqual([]);
  });

  it("is a no-op when shots array already exists", () => {
    const existingShots = [{ pins_standing: [1, 2] }];
    const frame: Record<string, unknown> = {
      game_id: 1,
      frame_number: 4,
      shots: existingShots,
      is_strike: false,
      is_spare: false
    };

    migrateFrameV1ToV2(frame);

    expect(frame.shots).toBe(existingShots);
  });
});

describe("migrateGameV2ToV3", () => {
  it("backfills lanes + start_lane from a single lane_number", () => {
    const game: Record<string, unknown> = { session_id: 1, game_number: 1, lane_number: "12" };
    migrateGameV2ToV3(game);
    expect(game.lanes).toEqual(["12"]);
    expect(game.start_lane).toBe("12");
  });

  it("is a no-op when lanes already exists", () => {
    const lanes = ["11", "12"];
    const game: Record<string, unknown> = { session_id: 1, game_number: 1, lanes, start_lane: "11" };
    migrateGameV2ToV3(game);
    expect(game.lanes).toBe(lanes);
    expect(game.start_lane).toBe("11");
  });

  it("leaves a game with no lane untouched", () => {
    const game: Record<string, unknown> = { session_id: 1, game_number: 1 };
    migrateGameV2ToV3(game);
    expect(game.lanes).toBeUndefined();
  });
});
