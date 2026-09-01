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

/**
 * A name that sorts and identifies itself in a cloud folder (ADR-067).
 *
 * Date alone collided: two exports on the same day become "(1)" and "(2)" in
 * Drive, with nothing to say which is which. Minutes make them sort, and the
 * session count makes it obvious at a glance which one is the fuller history.
 */
export function backupFilename(backup: BowlingBackup): string {
  const stamp = backup.exported_at.slice(0, 16).replace("T", "-").replace(":", "");
  return `headpin-${stamp}-${backup.tables.sessions.length}s.json`;
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

/**
 * Whether this browser can hand a file to the OS share sheet.
 *
 * That sheet is the only route to iCloud Drive on iOS, and the whole point of
 * a second copy is that it leaves the device (ADR-067). Feature-detected on
 * the file itself, because Safari advertises `share` while refusing files.
 */
export function canShareBackupFile(file: File, nav: Navigator = navigator): boolean {
  return typeof nav.canShare === "function" && nav.canShare({ files: [file] });
}

function backupFile(backup: BowlingBackup): File {
  return new File([JSON.stringify(backup, null, 2)], backupFilename(backup), {
    type: "application/json"
  });
}

export type BackupDestination = "shared" | "downloaded" | "cancelled";

/**
 * Send a backup out of the app: to the share sheet where there is one, and to
 * the downloads folder where there is not.
 *
 * A cancelled share is not a failure and must not be recorded as a backup:
 * the file never left, so the nudge has to keep asking.
 */
export async function shareBackup(): Promise<BackupDestination> {
  const backup = await createBackup();
  const file = backupFile(backup);

  if (canShareBackupFile(file)) {
    try {
      await navigator.share({ files: [file], title: "Headpin backup" });
    } catch (err) {
      // AbortError is the user closing the sheet. Anything else falls back to
      // a download rather than leaving them with nothing.
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      downloadBackup(backup, backupFilename(backup));
      await recordBackup();
      return "downloaded";
    }
    await recordBackup();
    return "shared";
  }

  downloadBackup(backup, backupFilename(backup));
  await recordBackup();
  return "downloaded";
}

/** Bookkeeping for the reminder. Best-effort: a failure here must not turn a
 *  backup that did leave into a reported failure. */
async function recordBackup(): Promise<void> {
  try {
    const sessionCount = await db.sessions.count();
    await setSetting("last_backup_at", new Date().toISOString());
    await setSetting("sessions_at_last_backup", String(sessionCount));
  } catch {
    // ignored
  }
}

export async function exportBackup() {
  const backup = await createBackup();
  downloadBackup(backup, backupFilename(backup));
  await recordBackup();
  return backup;
}

export interface PreparedImport {
  backup: BowlingBackup;
  /** What the file will install. */
  incoming: ImportBackupResult;
  /** What is in the database right now, and will be destroyed. */
  current: ImportBackupResult;
  /**
   * Sessions this device has that the file does not, or 0.
   *
   * A restore that goes backwards reads exactly like one that goes forwards:
   * two counts side by side, no judgement (ADR-067). This is the number that
   * makes the dangerous direction visible, and it is why the confirmation can
   * say "you would lose 32 sessions" rather than leaving the reader to
   * subtract two numbers under a dialog they want to dismiss.
   */
  losingSessions: number;
}

/**
 * Read + validate a backup file without touching the database, so the UI can
 * show the user exactly what they are about to destroy before they commit.
 */
export async function prepareImport(fileOrJson: File | string | unknown): Promise<PreparedImport> {
  const json = await readBackupInput(fileOrJson);
  const validation = validateBackup(json);

  if (!validation.isValid || !validation.backup) {
    // Only the first error reaches the reader. The rest are a cascade off the
    // same cause, and a paragraph of validator internals tells them nothing
    // they can act on: the answer is always to pick a different file.
    throw new Error(validation.errors[0]);
  }

  const backup = normalizeBackup(validation.backup);
  const incoming = countBackup(backup);
  const current = await countDatabase();
  return {
    backup,
    incoming,
    current,
    losingSessions: Math.max(0, current.sessions - incoming.sessions)
  };
}

/**
 * Replace the entire database with the file's contents (ADR-038). Every local
 * row is destroyed first, so a safety copy of the current data is downloaded
 * before anything is cleared — that file is the only way back.
 */
export async function replaceAllData(backup: BowlingBackup): Promise<ImportBackupResult> {
  const safetyCopy = await createBackup();
  downloadBackup(safetyCopy, `pre-import-${backupFilename(safetyCopy)}`);

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

export async function countDatabase(): Promise<ImportBackupResult> {
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

