import Dexie, { type EntityTable } from "dexie";
import type { AppSetting, Ball, Frame, Game, LaneNote, OilPattern, Session, SpareLine } from "../types/bowling";
import type { PinNumber, Shot } from "../types/bowling";
import type { CatalogBall } from "../types/catalog";

export class BowlingDatabase extends Dexie {
  sessions!: EntityTable<Session, "id">;
  games!: EntityTable<Game, "id">;
  frames!: EntityTable<Frame, "id">;
  balls!: EntityTable<Ball, "id">;
  oil_patterns!: EntityTable<OilPattern, "id">;
  spare_lines!: EntityTable<SpareLine, "id">;
  lane_notes!: EntityTable<LaneNote, "id">;
  settings!: EntityTable<AppSetting, "key">;
  ball_catalog!: EntityTable<CatalogBall, "id">;

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

    // Read-only ball catalog table (populated by syncCatalog, append-only).
    this.version(5).stores({
      sessions: "++id, date, alley_name, oil_pattern_id",
      games: "++id, session_id, game_number, lane_number, final_score",
      frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare",
      balls: "++id, name, is_spare_ball",
      oil_patterns: "++id, name",
      spare_lines: "++id",
      lane_notes: "++id, [alley+lane]",
      settings: "&key",
      ball_catalog: "&id, brand, coverstockCategory, coreType, rg, diff, releaseYear"
    });

    // ADR-037: `oil_patterns` becomes the sole source of truth for the pattern
    // name. Sessions that carried only the denormalized string (pre-v2 rows,
    // hand-entered data) are linked to a real pattern row so the name survives.
    this.version(6).stores({
      sessions: "++id, date, alley_name, oil_pattern_id",
      games: "++id, session_id, game_number, lane_number, final_score",
      frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare",
      balls: "++id, name, is_spare_ball",
      oil_patterns: "++id, name",
      spare_lines: "++id",
      lane_notes: "++id, [alley+lane]",
      settings: "&key",
      ball_catalog: "&id, brand, coverstockCategory, coreType, rg, diff, releaseYear"
    }).upgrade(async (tx) => {
      await linkLegacySessionOilPatterns(tx.table("sessions"), tx.table("oil_patterns"));
    });
  }
}

/** Minimal surface of a Dexie table, so this works against `db`'s typed tables
 *  or the loosely-typed ones a transaction hands out during an upgrade. */
interface OilPatternLinkTables {
  toArray(): PromiseLike<unknown[]>;
  add(row: never): PromiseLike<unknown>;
  update(key: number, changes: never): PromiseLike<unknown>;
}

/**
 * Link sessions that hold an `oil_pattern` name but no `oil_pattern_id` to a
 * pattern row (matched case-insensitively by name, created if absent), then
 * drop the denormalized string. Idempotent — used by the v6 upgrade and by
 * backup import, which can land legacy-shaped session rows at any time.
 */
export async function linkLegacySessionOilPatterns(
  sessions: OilPatternLinkTables,
  oilPatterns: OilPatternLinkTables
): Promise<void> {
  const sessionRows = (await sessions.toArray()) as Record<string, unknown>[];
  const stale = sessionRows.filter(
    (s) => typeof s.oil_pattern === "string" && (s.oil_pattern as string).trim() !== ""
  );
  if (stale.length === 0) return;

  const patternRows = (await oilPatterns.toArray()) as Record<string, unknown>[];
  const byName = new Map<string, number>();
  for (const p of patternRows) {
    if (typeof p.name === "string" && typeof p.id === "number") {
      byName.set(p.name.trim().toLowerCase(), p.id);
    }
  }

  for (const session of stale) {
    const name = (session.oil_pattern as string).trim();
    const key = name.toLowerCase();

    let patternId = typeof session.oil_pattern_id === "number" ? session.oil_pattern_id : undefined;
    if (patternId === undefined) {
      patternId = byName.get(key);
      if (patternId === undefined) {
        patternId = Number(await oilPatterns.add({ name } as never));
        byName.set(key, patternId);
      }
    }

    if (typeof session.id === "number") {
      await sessions.update(session.id, {
        oil_pattern_id: patternId,
        oil_pattern: undefined
      } as never);
    }
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
