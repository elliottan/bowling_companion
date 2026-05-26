import Dexie, { type EntityTable } from "dexie";
import type { Frame, Game, Session } from "../types/bowling";

export class BowlingDatabase extends Dexie {
  sessions!: EntityTable<Session, "id">;
  games!: EntityTable<Game, "id">;
  frames!: EntityTable<Frame, "id">;

  constructor() {
    super("BowlingCompanionDB");

    this.version(1).stores({
      sessions: "++id, date, alley_name",
      games: "++id, session_id, game_number, lane_number, final_score",
      frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare"
    });
  }
}

export const db = new BowlingDatabase();
