import { db } from "../db/bowlingDb";
import { calculateGameScore } from "../lib/scoring";
import type { Frame, Game, Session, SessionSummary } from "../types/bowling";

export type CreateSessionInput = Omit<Session, "id">;
export type AddGameInput = Omit<Game, "id" | "session_id" | "final_score">;
export type SaveFrameInput = Omit<Frame, "game_id">;

export async function createSession(input: CreateSessionInput): Promise<number> {
  const id = await db.sessions.add(input);
  return Number(id);
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

export async function addNextGameToSession(
  sessionId: number,
  laneNumber?: string
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

    const id = await db.games.add({
      session_id: sessionId,
      game_number: nextGameNumber,
      lane_number: laneNumber
    });
    return Number(id);
  });
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
