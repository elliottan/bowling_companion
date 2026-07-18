import { db } from "../db/bowlingDb";
import { calculateGameScore } from "../lib/scoring";
import { nextGameStartLane } from "../lib/lanes";
import {
  migrateLegacyLaydownOffset,
  parseDriftModel,
  serializeDriftModel,
  type DriftModel
} from "../lib/driftModel";
import type { BackupNudgeState } from "../lib/backupNudge";
import type { Frame, Game, Handedness, Session, SessionSummary } from "../types/bowling";

const HANDEDNESS_KEY = "handedness";
const LAYDOWN_OFFSET_KEY = "laydown_offset";
const DRIFT_MODEL_KEY = "drift_model";
const LAST_BACKUP_AT_KEY = "last_backup_at";
const SESSIONS_AT_LAST_BACKUP_KEY = "sessions_at_last_backup";
const BACKUP_NUDGE_SNOOZED_UNTIL_KEY = "backup_nudge_snoozed_until";

/** Read a key-value app setting (undefined if unset). */
export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value;
}

/** Write a key-value app setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

/** Stored handedness, or null if the user has never chosen one. */
export async function getHandedness(): Promise<Handedness | null> {
  const v = await getSetting(HANDEDNESS_KEY);
  return v === "right" || v === "left" ? v : null;
}

export async function setHandedness(value: Handedness): Promise<void> {
  await setSetting(HANDEDNESS_KEY, value);
}

/**
 * The bowler's drift model (ADR-030): zone-based drift + release offset.
 * Reads the new `drift_model` setting; falls back to migrating the legacy
 * `laydown_offset` setting (still read, never deleted) and materializes the
 * migrated result back to `drift_model` so the migration is idempotent.
 */
export async function getDriftModel(): Promise<DriftModel> {
  const raw = await getSetting(DRIFT_MODEL_KEY);
  const parsed = parseDriftModel(raw);
  if (parsed) return parsed;

  const legacy = await getSetting(LAYDOWN_OFFSET_KEY);
  const migrated = migrateLegacyLaydownOffset(legacy);
  await setSetting(DRIFT_MODEL_KEY, serializeDriftModel(migrated));
  return migrated;
}

export async function setDriftModel(model: DriftModel): Promise<void> {
  await setSetting(DRIFT_MODEL_KEY, serializeDriftModel(model));
}

export type CreateSessionInput = Omit<Session, "id">;
export type AddGameInput = Omit<Game, "id" | "session_id" | "final_score">;
export type SaveFrameInput = Omit<Frame, "game_id">;

export async function createSession(input: CreateSessionInput): Promise<number> {
  const id = await db.sessions.add(input);
  return Number(id);
}

export interface UpdateSessionInput {
  alley_name: string;
  date: string;
  description?: string;
  oil_pattern?: string;
  oil_pattern_id?: number;
  general_notes?: string;
}

/** Edit a session's alley, date, description, oil pattern, and notes. */
export async function updateSession(
  sessionId: number,
  input: UpdateSessionInput
): Promise<void> {
  await db.sessions.update(sessionId, {
    alley_name: input.alley_name,
    date: input.date,
    description: input.description?.trim() || undefined,
    oil_pattern: input.oil_pattern,
    oil_pattern_id: input.oil_pattern_id,
    general_notes: input.general_notes?.trim() || undefined
  });
}

export async function addGameToSession(
  sessionId: number,
  input: AddGameInput
): Promise<number> {
  const session = await db.sessions.get(sessionId);

  if (!session) {
    throw new Error(`Cannot add game. Session ${sessionId} was not found.`);
  }

  const id = await db.games.add({ ...input, session_id: sessionId });
  return Number(id);
}

export async function getSessionDetails(
  sessionId: number
): Promise<SessionSummary | null> {
  const session = await db.sessions.get(sessionId);

  if (!session) {
    return null;
  }

  const games = await db.games
    .where("session_id")
    .equals(sessionId)
    .sortBy("game_number");

  const gamesWithFrames = await Promise.all(
    games.map(async (game) => {
      if (!game.id) {
        return { ...game, frames: [] };
      }

      const frames = await db.frames
        .where("game_id")
        .equals(game.id)
        .sortBy("frame_number");

      return { ...game, frames };
    })
  );

  return {
    session,
    games: gamesWithFrames
  };
}

export interface LaneConfig {
  lanes?: string[];
  start_lane?: string;
}

export async function addNextGameToSession(
  sessionId: number,
  override?: LaneConfig
): Promise<number> {
  // Atomic: read existing games + insert next in a single transaction
  // to prevent duplicate game_number on rapid double-tap.
  return db.transaction("rw", db.sessions, db.games, async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Cannot add game. Session ${sessionId} was not found.`);
    }

    const games = await db.games.where("session_id").equals(sessionId).toArray();
    const nextGameNumber = games.length + 1;
    const previous = games.sort((a, b) => a.game_number - b.game_number)[games.length - 1];

    // Carry the lane pair; flip the start lane (cross-lane) unless overridden.
    const lanes = override?.lanes ?? previous?.lanes;
    const start_lane =
      override?.start_lane ?? (previous ? nextGameStartLane(previous) : undefined);

    const id = await db.games.add({
      session_id: sessionId,
      game_number: nextGameNumber,
      lanes,
      start_lane,
      lane_number: lanes?.[0]
    });
    return Number(id);
  });
}

export async function updateGameLanes(
  gameId: number,
  config: LaneConfig
): Promise<void> {
  await db.games.update(gameId, {
    lanes: config.lanes,
    start_lane: config.start_lane,
    lane_number: config.lanes?.[0]
  });
}

/** Distinct alley names from past sessions, most-recent first, for autocomplete. */
export async function getDistinctAlleys(): Promise<string[]> {
  return distinctSessionField((s) => s.alley_name);
}

/** Distinct session descriptions, most-recent first, for autocomplete. */
export async function getDistinctDescriptions(): Promise<string[]> {
  return distinctSessionField((s) => s.description);
}

async function distinctSessionField(pick: (s: Session) => string | undefined): Promise<string[]> {
  const sessions = await db.sessions.orderBy("date").reverse().toArray();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sessions) {
    const value = pick(s)?.trim();
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      out.push(value);
    }
  }
  return out;
}

export async function updateGameNotes(gameId: number, notes: string): Promise<void> {
  const trimmed = notes.trim();
  await db.games.update(gameId, { notes: trimmed.length ? trimmed : undefined });
}

export async function saveFrame(gameId: number, frame: SaveFrameInput): Promise<number> {
  const game = await db.games.get(gameId);
  if (!game) {
    throw new Error(`Cannot save frame. Game ${gameId} was not found.`);
  }

  const id = await db.transaction("rw", db.frames, db.games, async () => {
    const existing = await db.frames
      .where("[game_id+frame_number]")
      .equals([gameId, frame.frame_number])
      .first()
      .catch(() => undefined);

    const payload: Frame = {
      ...frame,
      game_id: gameId,
      id: existing?.id ?? frame.id
    };

    const savedId = await db.frames.put(payload);
    const frames = await db.frames.where("game_id").equals(gameId).toArray();
    const score = calculateGameScore(frames);

    if (score.isComplete) {
      await db.games.update(gameId, { final_score: score.total });
    }

    return savedId;
  });

  return Number(id);
}

/** Delete a session and all of its games + frames. */
export async function deleteSession(sessionId: number): Promise<void> {
  await db.transaction("rw", db.sessions, db.games, db.frames, async () => {
    const games = await db.games.where("session_id").equals(sessionId).toArray();
    for (const game of games) {
      if (game.id) await db.frames.where("game_id").equals(game.id).delete();
    }
    await db.games.where("session_id").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

/**
 * Delete a single game and its frames, then renumber the session's remaining
 * games to stay 1..N contiguous. If it was the only game, the session is
 * deleted too. Returns whether the parent session was removed.
 */
export async function deleteGame(
  gameId: number
): Promise<{ sessionDeleted: boolean; sessionId: number }> {
  return db.transaction("rw", db.sessions, db.games, db.frames, async () => {
    const game = await db.games.get(gameId);
    if (!game) throw new Error(`Cannot delete game. Game ${gameId} was not found.`);
    const sessionId = game.session_id;

    await db.frames.where("game_id").equals(gameId).delete();
    await db.games.delete(gameId);

    const remaining = (await db.games.where("session_id").equals(sessionId).toArray()).sort(
      (a, b) => a.game_number - b.game_number
    );

    if (remaining.length === 0) {
      await db.sessions.delete(sessionId);
      return { sessionDeleted: true, sessionId };
    }

    for (let i = 0; i < remaining.length; i++) {
      const want = i + 1;
      if (remaining[i].id && remaining[i].game_number !== want) {
        await db.games.update(remaining[i].id!, { game_number: want });
      }
    }
    return { sessionDeleted: false, sessionId };
  });
}

export interface ResumableGame {
  sessionId: number;
  alleyName: string;
  gameNumber: number;
}

/**
 * An unfinished game (no final score yet) from a session dated today, most
 * recent session first — used to offer "jump back in" on launch.
 */
export async function getResumableToday(): Promise<ResumableGame | null> {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = (await db.sessions.where("date").equals(today).toArray()).sort(
    (a, b) => (b.id ?? 0) - (a.id ?? 0)
  );
  for (const s of sessions) {
    if (s.id == null) continue;
    const games = await db.games.where("session_id").equals(s.id).sortBy("game_number");
    const unfinished = games.find((g) => g.final_score === undefined);
    if (unfinished) {
      return { sessionId: s.id, alleyName: s.alley_name, gameNumber: unfinished.game_number };
    }
  }
  return null;
}

/**
 * Resume info for a specific session — the most recent unfinished game, or
 * `null` if every game in the session is finished. Used so the home widget
 * only offers to resume a session that actually has an unfinished game.
 */
export async function getResumableForSession(sessionId: number): Promise<ResumableGame | null> {
  const session = await db.sessions.get(sessionId);
  if (!session || session.id == null) return null;
  const games = await db.games.where("session_id").equals(session.id).sortBy("game_number");
  if (games.length === 0) return null;
  const target = games.find((g) => g.final_score === undefined);
  if (!target) return null;
  return { sessionId: session.id, alleyName: session.alley_name, gameNumber: target.game_number };
}

/** Assembles the state needed to decide whether to show the backup nudge. */
export async function getBackupNudgeState(): Promise<BackupNudgeState> {
  const [lastBackupAt, sessionsAtLastBackup, snoozedUntil, totalSessions] = await Promise.all([
    getSetting(LAST_BACKUP_AT_KEY),
    getSetting(SESSIONS_AT_LAST_BACKUP_KEY),
    getSetting(BACKUP_NUDGE_SNOOZED_UNTIL_KEY),
    db.sessions.count()
  ]);

  return {
    lastBackupAt: lastBackupAt ?? null,
    sessionsAtLastBackup: sessionsAtLastBackup ? Number(sessionsAtLastBackup) : 0,
    totalSessions,
    snoozedUntil: snoozedUntil ?? null,
    now: new Date()
  };
}

/** Snooze the backup nudge until the given ISO timestamp ("Later" action). */
export async function setBackupNudgeSnoozedUntil(iso: string): Promise<void> {
  await setSetting(BACKUP_NUDGE_SNOOZED_UNTIL_KEY, iso);
}

export async function getSessionHistory(): Promise<SessionSummary[]> {
  const sessions = await db.sessions.orderBy("date").reverse().toArray();

  return Promise.all(
    sessions.map(async (session) =>
      session.id ? getSessionDetails(session.id) : { session, games: [] }
    )
  ).then((items) =>
    items.filter((item): item is SessionSummary => Boolean(item))
  );
}
