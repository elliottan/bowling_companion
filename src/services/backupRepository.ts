import { db } from "../db/bowlingDb";
import { validateBackup } from "../lib/backupValidation";
import type { BowlingBackup, Frame, Game, Session } from "../types/bowling";

export interface ImportBackupResult {
  sessions: number;
  games: number;
  frames: number;
}

export async function createBackup(): Promise<BowlingBackup> {
  const [sessions, games, frames] = await Promise.all([
    db.sessions.toArray(),
    db.games.toArray(),
    db.frames.toArray()
  ]);

  return {
    app: "bowling-companion",
    version: 1,
    exported_at: new Date().toISOString(),
    tables: {
      sessions,
      games,
      frames
    }
  };
}

export async function exportBackup() {
  const backup = await createBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `bowling-companion-backup-${backup.exported_at.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return backup;
}

export async function importBackup(fileOrJson: File | string | unknown) {
  const json = await readBackupInput(fileOrJson);
  const validation = validateBackup(json);

  if (!validation.isValid || !validation.backup) {
    throw new Error(validation.errors.join(" "));
  }

  return mergeBackup(validation.backup);
}

export async function mergeBackup(backup: BowlingBackup): Promise<ImportBackupResult> {
  return db.transaction("rw", db.sessions, db.games, db.frames, async () => {
    const sessionIdMap = new Map<number, number>();
    const gameIdMap = new Map<number, number>();

    for (const session of backup.tables.sessions) {
      const importedId = session.id;
      const localId = await upsertSession(session);

      if (typeof importedId === "number") {
        sessionIdMap.set(importedId, Number(localId));
      }
    }

    for (const game of backup.tables.games) {
      const importedId = game.id;
      const sessionId = sessionIdMap.get(game.session_id) ?? game.session_id;
      const localId = await upsertGame({
        ...game,
        session_id: sessionId
      });

      if (typeof importedId === "number") {
        gameIdMap.set(importedId, Number(localId));
      }
    }

    for (const frame of backup.tables.frames) {
      const gameId = gameIdMap.get(frame.game_id) ?? frame.game_id;

      await upsertFrame({
        ...frame,
        game_id: gameId
      });
    }

    return {
      sessions: backup.tables.sessions.length,
      games: backup.tables.games.length,
      frames: backup.tables.frames.length
    };
  });
}

async function readBackupInput(fileOrJson: File | string | unknown) {
  if (typeof File !== "undefined" && fileOrJson instanceof File) {
    return JSON.parse(await fileOrJson.text()) as unknown;
  }

  if (typeof fileOrJson === "string") {
    return JSON.parse(fileOrJson) as unknown;
  }

  return fileOrJson;
}

/**
 * Match-by-content merge: never trust imported `id`s.
 * Sessions match on (date + alley_name). Games on (session_id + game_number).
 * Frames on (game_id + frame_number). See docs/DECISIONS.md ADR-003.
 */
async function upsertSession(session: Session): Promise<number> {
  const candidates = await db.sessions
    .where("date")
    .equals(session.date)
    .and((existing) => existing.alley_name === session.alley_name)
    .toArray();
  const match = candidates[0];

  if (match?.id) {
    await db.sessions.put({ ...session, id: match.id });
    return match.id;
  }

  const id = await db.sessions.add(stripId(session));
  return Number(id);
}

async function upsertGame(game: Game): Promise<number> {
  const match = await db.games
    .where("session_id")
    .equals(game.session_id)
    .and((existing) => existing.game_number === game.game_number)
    .first();

  if (match?.id) {
    await db.games.put({ ...game, id: match.id });
    return match.id;
  }

  const id = await db.games.add(stripId(game));
  return Number(id);
}

async function upsertFrame(frame: Frame): Promise<void> {
  const match = await db.frames
    .where("[game_id+frame_number]")
    .equals([frame.game_id, frame.frame_number])
    .first()
    .catch(() => undefined);

  await db.frames.put({ ...frame, id: match?.id });
}

function stripId<T extends { id?: number }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  return rest as Omit<T, "id">;
}
