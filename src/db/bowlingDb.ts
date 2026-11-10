import Dexie, { type DBCore, type EntityTable, type Middleware, type Table } from "dexie";
import type { AppSetting, BackupStateRow, Ball, Frame, Game, LaneNote, OilPattern, Session, SpareLine } from "../types/bowling";
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
  backup_state!: Table<BackupStateRow, string>;

  constructor() {
    super("BowlingCompanionDB");
    this.use(backupRevisionMiddleware);

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
      await tx.table("frames").toCollection().modify((frame: Record<string, unknown>) => migrateFrameV1ToV2(frame));
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
      await tx.table("games").toCollection().modify((game: Record<string, unknown>) => migrateGameV2ToV3(game));
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

    // ADR-275: the backup bookkeeping leaves `settings`, which every backup
    // carries, for a table no backup does. The counter starts now, so what
    // was edited before it is unknown: the last backup's revision is null,
    // and the row claims no "no changes" until the next one.
    this.version(7).stores({
      sessions: "++id, date, alley_name, oil_pattern_id",
      games: "++id, session_id, game_number, lane_number, final_score",
      frames: "++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare",
      balls: "++id, name, is_spare_ball",
      oil_patterns: "++id, name",
      spare_lines: "++id",
      lane_notes: "++id, [alley+lane]",
      settings: "&key",
      ball_catalog: "&id, brand, coverstockCategory, coreType, rg, diff, releaseYear",
      backup_state: "&key"
    }).upgrade(async (tx) => {
      const settings = tx.table("settings");
      const at = (await settings.get("last_backup_at")) as AppSetting | undefined;
      const sessions = (await settings.get("sessions_at_last_backup")) as AppSetting | undefined;
      if (at?.value) {
        await tx.table("backup_state").put({
          key: "last_backup",
          at: at.value,
          sessions: Number(sessions?.value ?? 0) || 0,
          revision: null
        } satisfies BackupStateRow);
      }
      await settings.bulkDelete(LEGACY_BACKUP_SETTINGS);
    });
  }
}

/** Where the bookkeeping lived before ADR-275. A restored file from before it
 *  still carries these, and they are dropped rather than installed. */
export const LEGACY_BACKUP_SETTINGS = ["last_backup_at", "sessions_at_last_backup"];

/** The tables a backup holds the bowler's data in (ADR-275). `settings` is in
 *  the file too, but it is preferences (a theme, a snoozed reminder), and a
 *  backup is not out of date because the theme changed. */
const COUNTED_TABLES = new Set([
  "sessions",
  "games",
  "frames",
  "balls",
  "oil_patterns",
  "spare_lines",
  "lane_notes"
]);

/**
 * Counts every write to the bowler's data, in the database itself (ADR-275).
 *
 * A write path that forgets to count is the one bug a count kept by the
 * repositories would have, and there are dozens of write paths. Here every
 * read-write transaction over a counted table also takes `backup_state`, and
 * every mutation bumps `revision` inside it, so the count commits or rolls
 * back with the write. It costs one small read and write per mutation,
 * however large the history, and a bulk write counts once.
 */
const backupRevisionMiddleware: Middleware<DBCore> = {
  stack: "dbcore",
  name: "BackupRevision",
  create(down) {
    const counts = (stores: string[]) => stores.some((name) => COUNTED_TABLES.has(name));
    return {
      ...down,
      transaction(stores, mode, options) {
        const widened =
          mode === "readwrite" && counts(stores) && !stores.includes("backup_state")
            ? [...stores, "backup_state"]
            : stores;
        return down.transaction(widened, mode, options);
      },
      table(name) {
        const table = down.table(name);
        if (!COUNTED_TABLES.has(name)) return table;
        return {
          ...table,
          async mutate(req) {
            const result = await table.mutate(req);
            // A schema upgrade writes through here too, before this table
            // exists for the versions older than 7. The v7 upgrade starts the
            // count fresh, so nothing is lost by not counting them.
            if ((req.trans as unknown as IDBTransaction).mode !== "versionchange") {
              const state = down.table("backup_state");
              const current = (await state.get({ trans: req.trans, key: "revision" })) as
                | { value: number }
                | undefined;
              await state.mutate({
                trans: req.trans,
                type: "put",
                values: [{ key: "revision", value: (current?.value ?? 0) + 1 }]
              });
            }
            return result;
          }
        };
      }
    };
  }
};

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
 * drop the denormalized string. Idempotent, used by the v6 upgrade and by
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

/** v1 stored one column per shot; v2 a `shots` array. Run by the v2 upgrade
 *  and by backup import, which can land a v1 file at any time. Idempotent. */
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

/** v3 replaced the single `lane_number` with `lanes` + `start_lane`. Run by
 *  the v3 upgrade. Idempotent. */
export function migrateGameV2ToV3(game: Record<string, unknown>): void {
  if (Array.isArray(game.lanes)) return;
  const lane = typeof game.lane_number === "string" ? game.lane_number.trim() : "";
  if (lane) {
    game.lanes = [lane];
    game.start_lane = lane;
  }
}
