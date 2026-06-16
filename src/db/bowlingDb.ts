import Dexie, { type EntityTable } from "dexie";
import type { AppSetting, Ball, Frame, Game, LaneNote, OilPattern, Session, SpareLine } from "../types/bowling";
import type { PinNumber, Shot } from "../types/bowling";

export class BowlingDatabase extends Dexie {
  sessions!: EntityTable<Session, "id">;
  games!: EntityTable<Game, "id">;
  frames!: EntityTable<Frame, "id">;
  balls!: EntityTable<Ball, "id">;
  oil_patterns!: EntityTable<OilPattern, "id">;
  spare_lines!: EntityTable<SpareLine, "id">;
  lane_notes!: EntityTable<LaneNote, "id">;
  settings!: EntityTable<AppSetting, "key">;

  constructor() {
    super("BowlingCompanionDB");

    this.version(1).stores({
      sessions: "++id, date, alley_name",
      games: "++id, session_id, game_number, lane_number, final_score",
      frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare"
    });

    this.version(2).stores({
      sessions: "++id, date, alley_name, oil_pattern_id",
      games: "++id, session_id, game_number, lane_number, final_score",
      frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare",
      balls: "++id, name, is_spare_ball",
      oil_patterns: "++id, name",
      spare_lines: "++id"
    }).upgrade(async (tx) => {
      await tx.table("frames").toCollection().modify((frame: Record<string, unknown>) => {
        // Only migrate if still in old flat format (safety guard)
        if (Array.isArray(frame.shots)) return;

        const shots: Shot[] = [];
        if (frame.shot_1_pins_standing !== undefined) {
          shots.push({ pins_standing: frame.shot_1_pins_standing as PinNumber[], notes: frame.shot_1_notes as string | undefined });
        }
        if (frame.shot_2_pins_standing !== undefined) {
          shots.push({ pins_standing: frame.shot_2_pins_standing as PinNumber[], notes: frame.shot_2_notes as string | undefined });
        }
        if (frame.shot_3_pins_standing !== undefined) {
          shots.push({ pins_standing: frame.shot_3_pins_standing as PinNumber[] });
        }

        frame.shots = shots;
        delete frame.shot_1_pins_standing;
        delete frame.shot_2_pins_standing;
        delete frame.shot_3_pins_standing;
        delete frame.shot_1_notes;
        delete frame.shot_2_notes;
      });
    });

    this.version(3).stores({
      sessions: "++id, date, alley_name, oil_pattern_id",
      games: "++id, session_id, game_number, lane_number, final_score",
      frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare",
      balls: "++id, name, is_spare_ball",
      oil_patterns: "++id, name",
      spare_lines: "++id",
      lane_notes: "++id, [alley+lane]"
    }).upgrade(async (tx) => {
      // Backfill the cross-lane config from the legacy single lane_number.
      await tx.table("games").toCollection().modify((game: Record<string, unknown>) => {
        if (Array.isArray(game.lanes)) return; // already migrated
        const lane = typeof game.lane_number === "string" ? game.lane_number.trim() : "";
        if (lane) {
          game.lanes = [lane];
          game.start_lane = lane;
        }
      });
    });

    // Key-value preferences (handedness, etc.), keyed by `key`.
    this.version(4).stores({
      sessions: "++id, date, alley_name, oil_pattern_id",
      games: "++id, session_id, game_number, lane_number, final_score",
      frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare",
      balls: "++id, name, is_spare_ball",
      oil_patterns: "++id, name",
      spare_lines: "++id",
      lane_notes: "++id, [alley+lane]",
      settings: "&key"
    });
  }
}

export const db = new BowlingDatabase();

export function migrateFrameV1ToV2(frame: Record<string, unknown>): void {
  if (Array.isArray(frame.shots)) return;

  const shots: Shot[] = [];
  if (frame.shot_1_pins_standing !== undefined) {
    shots.push({ pins_standing: frame.shot_1_pins_standing as PinNumber[], notes: frame.shot_1_notes as string | undefined });
  }
  if (frame.shot_2_pins_standing !== undefined) {
    shots.push({ pins_standing: frame.shot_2_pins_standing as PinNumber[], notes: frame.shot_2_notes as string | undefined });
  }
  if (frame.shot_3_pins_standing !== undefined) {
    shots.push({ pins_standing: frame.shot_3_pins_standing as PinNumber[] });
  }

  frame.shots = shots;
  delete frame.shot_1_pins_standing;
  delete frame.shot_2_pins_standing;
  delete frame.shot_3_pins_standing;
  delete frame.shot_1_notes;
  delete frame.shot_2_notes;
}

export function migrateGameV2ToV3(game: Record<string, unknown>): void {
  if (Array.isArray(game.lanes)) return;
  const lane = typeof game.lane_number === "string" ? game.lane_number.trim() : "";
  if (lane) {
    game.lanes = [lane];
    game.start_lane = lane;
  }
}
