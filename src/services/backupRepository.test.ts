import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import { createBackup, exportBackup, prepareImport, replaceAllData } from "./backupRepository";
import { addGameToSession, createSession, getSessionHistory, getSetting, saveFrame } from "./bowlingRepository";


/** The full import flow: validate, then replace everything (ADR-038). */
async function importBackup(fileOrJson: unknown) {
  const prepared = await prepareImport(fileOrJson);
  return replaceAllData(prepared.backup);
}

describe("backupRepository", () => {
  beforeEach(async () => {
    // replaceAllData downloads a safety copy; jsdom has no Blob URL APIs.
    URL.createObjectURL = () => "blob:stub";
    URL.revokeObjectURL = () => {};
    await db.delete();
    await db.open();
  });

  it("creates and imports a backup", async () => {
    const sessionId = Number(
      await createSession({
        date: "2026-05-27",
        alley_name: "Backup Lanes"
      })
    );
    const gameId = Number(
      await addGameToSession(sessionId, {
        game_number: 1,
        lane_number: "2"
      })
    );

    await saveFrame(gameId, {
      frame_number: 1,
      shots: [{ pins_standing: [] }],
      is_strike: true,
      is_spare: false
    });

    const backup = await createBackup();
    await db.delete();
    await db.open();

    const result = await importBackup(backup);
    const history = await getSessionHistory();

    expect(result).toEqual({ sessions: 1, games: 1, frames: 1, balls: 0, oil_patterns: 0, spare_lines: 0, lane_notes: 0, settings: 0 });
    expect(history[0].session.alley_name).toBe("Backup Lanes");
    expect(history[0].games[0].frames[0].is_strike).toBe(true);
  });

  it("rejects invalid backup JSON", async () => {
    await expect(importBackup("{bad json")).rejects.toThrow();
  });

  it("replaces every local row with the file's contents", async () => {
    // A local session the imported file knows nothing about.
    await createSession({ date: "2026-05-27", alley_name: "Local Lanes" });

    const importedBackup = {
      app: "bowling-companion" as const,
      version: 1 as const,
      exported_at: "2026-05-27T00:00:00.000Z",
      tables: {
        sessions: [{ id: 1, date: "2026-05-27", alley_name: "Imported Lanes" }],
        games: [],
        frames: []
      }
    };

    await importBackup(importedBackup);
    const history = await getSessionHistory();

    // Local Lanes is gone — the file is the whole truth after an import.
    expect(history).toHaveLength(1);
    expect(history[0].session.alley_name).toBe("Imported Lanes");
  });

  it("downloads a safety copy of the current data before wiping it", async () => {
    await createSession({ date: "2026-05-27", alley_name: "About To Be Deleted" });

    let downloadedBlob: Blob | null = null;
    URL.createObjectURL = (blob: Blob) => {
      downloadedBlob = blob;
      return "blob:stub";
    };

    await importBackup({
      app: "bowling-companion" as const,
      version: 3 as const,
      exported_at: "2026-05-27T00:00:00.000Z",
      tables: { sessions: [], games: [], frames: [] }
    });

    // jsdom's Blob implements neither .text() nor the fetch Blob interface,
    // so read it the way jsdom does support.
    const downloaded = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(downloadedBlob!);
    });
    expect(downloaded).toContain("About To Be Deleted");
    expect(await db.sessions.count()).toBe(0);
  });

  it("imports a v1 backup with flat frame fields", async () => {
    const v1Backup = {
      app: "bowling-companion" as const,
      version: 1 as const,
      exported_at: new Date().toISOString(),
      tables: {
        sessions: [{ id: 1, date: "2026-05-27", alley_name: "V1 Lanes" }],
        games: [{ id: 1, session_id: 1, game_number: 1 }],
        frames: [{
          id: 1, game_id: 1, frame_number: 1,
          shot_1_pins_standing: [7, 10],
          shot_2_pins_standing: [],
          is_strike: false, is_spare: true
        }]
      }
    };

    const result = await importBackup(v1Backup);
    const history = await getSessionHistory();

    expect(result.frames).toBe(1);
    const frame = history[0].games[0].frames[0];
    expect(frame.shots).toHaveLength(2);
    expect(frame.shots[0].pins_standing).toEqual([7, 10]);
    expect(frame.shots[1].pins_standing).toEqual([]);
    expect(frame.is_spare).toBe(true);
  });

  it("exports and reimports balls and oil patterns", async () => {
    await db.balls.add({ name: "Storm Phaze II", is_spare_ball: false });
    await db.oil_patterns.add({ name: "Kegel Main Street" });

    const backup = await createBackup();
    expect(backup.version).toBe(3);
    expect(backup.tables.balls).toHaveLength(1);
    expect(backup.tables.oil_patterns).toHaveLength(1);

    await db.delete();
    await db.open();

    const result = await importBackup(backup);
    expect(result.balls).toBe(1);
    expect(result.oil_patterns).toBe(1);

    const balls = await db.balls.toArray();
    expect(balls[0].name).toBe("Storm Phaze II");
  });

  it("exports and reimports lane notes", async () => {
    await db.lane_notes.add({ alley: "Orchid Bowl", lane: "12", notes: "hooks early" });

    const backup = await createBackup();
    expect(backup.tables.lane_notes).toHaveLength(1);

    await db.delete();
    await db.open();

    const result = await importBackup(backup);
    expect(result.lane_notes).toBe(1);

    const notes = await db.lane_notes.toArray();
    expect(notes[0].notes).toBe("hooks early");
  });

  it("stamps last_backup_at and sessions_at_last_backup after export", async () => {
    // jsdom doesn't implement the Blob URL APIs the download link uses.
    URL.createObjectURL = () => "blob:stub";
    URL.revokeObjectURL = () => {};

    await createSession({ date: "2026-07-19", alley_name: "Stamp Lanes" });

    await exportBackup();

    expect(await getSetting("last_backup_at")).toEqual(expect.any(String));
    expect(await getSetting("sessions_at_last_backup")).toBe("1");
  });
});
