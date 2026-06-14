import { db } from "../db/bowlingDb";
import { validateBackup } from "../lib/backupValidation";
import type { Ball, BowlingBackup, Frame, Game, LaneNote, OilPattern, PinNumber, Session, Shot, SpareLine } from "../types/bowling";

export interface ImportBackupResult {
  sessions: number;
  games: number;
  frames: number;
  balls: number;
  oil_patterns: number;
  spare_lines: number;
  lane_notes: number;
}

export async function createBackup(): Promise<BowlingBackup> {
  const [sessions, games, frames, balls, oil_patterns, spare_lines, lane_notes] = await Promise.all([
    db.sessions.toArray(),
    db.games.toArray(),
    db.frames.toArray(),
    db.balls.toArray(),
    db.oil_patterns.toArray(),
    db.spare_lines.toArray(),
    db.lane_notes.toArray()
  ]);

  return {
    app: "bowling-companion",
    version: 2,
    exported_at: new Date().toISOString(),
    tables: {
      sessions,
      games,
      frames,
      balls,
      oil_patterns,
      spare_lines,
      lane_notes
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

  const backup = normalizeBackup(validation.backup);
  return mergeBackup(backup);
}

function normalizeBackup(backup: BowlingBackup): BowlingBackup {
  if (backup.version === 2) return backup;

  // Transform v1 flat frame fields → shots[]
  const frames = backup.tables.frames.map((frame) => {
    const raw = frame as unknown as Record<string, unknown>;
    if (Array.isArray(raw.shots)) return frame;

    const shots: Shot[] = [];
    if (raw.shot_1_pins_standing !== undefined) {
      shots.push({ pins_standing: raw.shot_1_pins_standing as PinNumber[], notes: raw.shot_1_notes as string | undefined });
    }
    if (raw.shot_2_pins_standing !== undefined) {
      shots.push({ pins_standing: raw.shot_2_pins_standing as PinNumber[], notes: raw.shot_2_notes as string | undefined });
    }
    if (raw.shot_3_pins_standing !== undefined) {
      shots.push({ pins_standing: raw.shot_3_pins_standing as PinNumber[] });
    }
    return { ...frame, shots };
  });

  return { ...backup, version: 2, tables: { ...backup.tables, frames, balls: [], oil_patterns: [], spare_lines: [], lane_notes: [] } };
}

export async function mergeBackup(backup: BowlingBackup): Promise<ImportBackupResult> {
  return db.transaction("rw", [db.sessions, db.games, db.frames, db.balls, db.oil_patterns, db.spare_lines, db.lane_notes], async () => {
    const sessionIdMap = new Map<number, number>();
    const gameIdMap = new Map<number, number>();
    const ballIdMap = new Map<number, number>();
    const oilPatternIdMap = new Map<number, number>();

    // Import balls first (shots reference ball_ids)
    for (const ball of backup.tables.balls ?? []) {
      const importedId = ball.id;
      const localId = await upsertBall(ball);
      if (typeof importedId === "number") ballIdMap.set(importedId, Number(localId));
    }

    // Import oil patterns (sessions reference oil_pattern_ids)
    for (const op of backup.tables.oil_patterns ?? []) {
      const importedId = op.id;
      const localId = await upsertOilPattern(op);
      if (typeof importedId === "number") oilPatternIdMap.set(importedId, Number(localId));
    }

    // Sessions (with oil_pattern_id remap)
    for (const session of backup.tables.sessions) {
      const importedId = session.id;
      const mappedSession = {
        ...session,
        oil_pattern_id: session.oil_pattern_id != null
          ? (oilPatternIdMap.get(session.oil_pattern_id) ?? session.oil_pattern_id)
          : undefined
      };
      const localId = await upsertSession(mappedSession);
      if (typeof importedId === "number") sessionIdMap.set(importedId, Number(localId));
    }

    // Games
    for (const game of backup.tables.games) {
      const importedId = game.id;
      const sessionId = sessionIdMap.get(game.session_id) ?? game.session_id;
      const localId = await upsertGame({ ...game, session_id: sessionId });
      if (typeof importedId === "number") gameIdMap.set(importedId, Number(localId));
    }

    // Frames (with game_id remap and ball_id remap in shots)
    for (const frame of backup.tables.frames) {
      const gameId = gameIdMap.get(frame.game_id) ?? frame.game_id;
      const remappedShots = frame.shots.map((shot) => ({
        ...shot,
        ball_id: shot.ball_id != null ? (ballIdMap.get(shot.ball_id) ?? shot.ball_id) : undefined
      }));
      await upsertFrame({ ...frame, game_id: gameId, shots: remappedShots });
    }

    // Spare lines (keyed by pins array)
    for (const sl of backup.tables.spare_lines ?? []) {
      await upsertSpareLine(sl);
    }

    // Lane notes (keyed by alley + lane)
    for (const ln of backup.tables.lane_notes ?? []) {
      await upsertLaneNote(ln);
    }

    return {
      sessions: backup.tables.sessions.length,
      games: backup.tables.games.length,
      frames: backup.tables.frames.length,
      balls: (backup.tables.balls ?? []).length,
      oil_patterns: (backup.tables.oil_patterns ?? []).length,
      spare_lines: (backup.tables.spare_lines ?? []).length,
      lane_notes: (backup.tables.lane_notes ?? []).length
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

async function upsertBall(ball: Ball): Promise<number> {
  const match = await db.balls.where("name").equals(ball.name).first();
  if (match?.id) { await db.balls.put({ ...ball, id: match.id }); return match.id; }
  return Number(await db.balls.add(stripId(ball)));
}

async function upsertOilPattern(op: OilPattern): Promise<number> {
  const match = await db.oil_patterns.where("name").equals(op.name).first();
  if (match?.id) { await db.oil_patterns.put({ ...op, id: match.id }); return match.id; }
  return Number(await db.oil_patterns.add(stripId(op)));
}

async function upsertLaneNote(ln: LaneNote): Promise<void> {
  const all = await db.lane_notes.toArray();
  const match = all.find((existing) => existing.alley === ln.alley && existing.lane === ln.lane);
  await db.lane_notes.put({ ...ln, id: match?.id });
}

async function upsertSpareLine(sl: SpareLine): Promise<void> {
  const sortedPins = [...sl.pins].sort((a, b) => a - b);
  const all = await db.spare_lines.toArray();
  const match = all.find((existing) =>
    existing.pins.length === sortedPins.length &&
    existing.pins.every((p, i) => p === sortedPins[i])
  );
  await db.spare_lines.put({ ...sl, pins: sortedPins, id: match?.id });
}

function stripId<T extends { id?: number }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  return rest as Omit<T, "id">;
}
