import { db, linkLegacySessionOilPatterns } from "../db/bowlingDb";
import { validateBackup } from "../lib/backupValidation";
import { setSetting } from "./bowlingRepository";
import type { BowlingBackup, PinNumber, Shot } from "../types/bowling";

export interface ImportBackupResult {
  sessions: number;
  games: number;
  frames: number;
  balls: number;
  oil_patterns: number;
  spare_lines: number;
  lane_notes: number;
  settings: number;
}

export async function createBackup(): Promise<BowlingBackup> {
  const [sessions, games, frames, balls, oil_patterns, spare_lines, lane_notes, settings] = await Promise.all([
    db.sessions.toArray(),
    db.games.toArray(),
    db.frames.toArray(),
    db.balls.toArray(),
    db.oil_patterns.toArray(),
    db.spare_lines.toArray(),
    db.lane_notes.toArray(),
    db.settings.toArray()
  ]);

  return {
    app: "bowling-companion",
    version: 3,
    exported_at: new Date().toISOString(),
    tables: {
      sessions,
      games,
      frames,
      balls,
      oil_patterns,
      spare_lines,
      lane_notes,
      settings
    }
  };
}

function downloadBackup(backup: BowlingBackup, filename: string): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportBackup() {
  const backup = await createBackup();
  downloadBackup(backup, `bowling-companion-backup-${backup.exported_at.slice(0, 10)}.json`);

  // Best-effort bookkeeping for the backup-reminder nudge: a failure here must
  // not turn an already-downloaded backup into a reported "export failed".
  try {
    const sessionCount = await db.sessions.count();
    await setSetting("last_backup_at", new Date().toISOString());
    await setSetting("sessions_at_last_backup", String(sessionCount));
  } catch {
    // Ignore — the backup itself already succeeded.
  }

  return backup;
}

export interface PreparedImport {
  backup: BowlingBackup;
  /** What the file will install. */
  incoming: ImportBackupResult;
  /** What is in the database right now, and will be destroyed. */
  current: ImportBackupResult;
}

/**
 * Read + validate a backup file without touching the database, so the UI can
 * show the user exactly what they are about to destroy before they commit.
 */
export async function prepareImport(fileOrJson: File | string | unknown): Promise<PreparedImport> {
  const json = await readBackupInput(fileOrJson);
  const validation = validateBackup(json);

  if (!validation.isValid || !validation.backup) {
    throw new Error(validation.errors.join(" "));
  }

  const backup = normalizeBackup(validation.backup);
  return { backup, incoming: countBackup(backup), current: await countDatabase() };
}

/**
 * Replace the entire database with the file's contents (ADR-038). Every local
 * row is destroyed first, so a safety copy of the current data is downloaded
 * before anything is cleared — that file is the only way back.
 */
export async function replaceAllData(backup: BowlingBackup): Promise<ImportBackupResult> {
  const safetyCopy = await createBackup();
  downloadBackup(safetyCopy, `bowling-companion-pre-import-${Date.now()}.json`);

  await db.transaction(
    "rw",
    [db.sessions, db.games, db.frames, db.balls, db.oil_patterns, db.spare_lines, db.lane_notes, db.settings],
    async () => {
      await Promise.all([
        db.sessions.clear(),
        db.games.clear(),
        db.frames.clear(),
        db.balls.clear(),
        db.oil_patterns.clear(),
        db.spare_lines.clear(),
        db.lane_notes.clear(),
        db.settings.clear()
      ]);

      // The tables are empty, so the file's own ids can be replayed verbatim —
      // no content matching, no id remapping, no collisions to resolve.
      await db.sessions.bulkAdd(backup.tables.sessions);
      await db.games.bulkAdd(backup.tables.games);
      await db.frames.bulkAdd(backup.tables.frames);
      await db.balls.bulkAdd(backup.tables.balls ?? []);
      await db.oil_patterns.bulkAdd(backup.tables.oil_patterns ?? []);
      await db.spare_lines.bulkAdd(backup.tables.spare_lines ?? []);
      await db.lane_notes.bulkAdd(backup.tables.lane_notes ?? []);
      await db.settings.bulkAdd(backup.tables.settings ?? []);

      // Pre-ADR-037 files carry the pattern name on the session itself; give
      // those sessions a real pattern row so the name survives.
      await linkLegacySessionOilPatterns(db.sessions, db.oil_patterns);
    }
  );

  return countBackup(backup);
}

function countBackup(backup: BowlingBackup): ImportBackupResult {
  return {
    sessions: backup.tables.sessions.length,
    games: backup.tables.games.length,
    frames: backup.tables.frames.length,
    balls: (backup.tables.balls ?? []).length,
    oil_patterns: (backup.tables.oil_patterns ?? []).length,
    spare_lines: (backup.tables.spare_lines ?? []).length,
    lane_notes: (backup.tables.lane_notes ?? []).length,
    settings: (backup.tables.settings ?? []).length
  };
}

async function countDatabase(): Promise<ImportBackupResult> {
  const [sessions, games, frames, balls, oil_patterns, spare_lines, lane_notes, settings] =
    await Promise.all([
      db.sessions.count(),
      db.games.count(),
      db.frames.count(),
      db.balls.count(),
      db.oil_patterns.count(),
      db.spare_lines.count(),
      db.lane_notes.count(),
      db.settings.count()
    ]);

  return { sessions, games, frames, balls, oil_patterns, spare_lines, lane_notes, settings };
}

function normalizeBackup(backup: BowlingBackup): BowlingBackup {
  if (backup.version === 2 || backup.version === 3) return backup;

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

  return { ...backup, version: 3, tables: { ...backup.tables, frames, balls: [], oil_patterns: [], spare_lines: [], lane_notes: [], settings: [] } };
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

