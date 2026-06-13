import Dexie, { type EntityTable } from "dexie";
import type { Ball, Frame, Game, OilPattern, Session, SpareLine } from "../types/bowling";
import type { PinNumber, Shot } from "../types/bowling";

export class BowlingDatabase extends Dexie {
  sessions!: EntityTable<Session, "id">;
  games!: EntityTable<Game, "id">;
  frames!: EntityTable<Frame, "id">;
  balls!: EntityTable<Ball, "id">;
  oil_patterns!: EntityTable<OilPattern, "id">;
  spare_lines!: EntityTable<SpareLine, "id">;

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
