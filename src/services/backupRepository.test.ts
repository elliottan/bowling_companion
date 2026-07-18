import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import { createBackup, exportBackup, importBackup } from "./backupRepository";
import { addGameToSession, createSession, getSessionHistory, getSetting, saveFrame } from "./bowlingRepository";


describe("backupRepository", () => {
  beforeEach(async () => {
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

  it("merges by content keys without overwriting unrelated local rows", async () => {
    // Local row gets id=1 (different alley) before import.
    await createSession({ date: "2026-05-27", alley_name: "Local Lanes" });

    // Import a backup whose session.id=1 but with a different alley name.
    // Old (buggy) merge would overwrite Local Lanes; new merge inserts new row.
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

    expect(history).toHaveLength(2);
    expect(history.map((h) => h.session.alley_name).sort()).toEqual([
      "Imported Lanes",
      "Local Lanes"
    ]);
  });

  it("imports a v1 backup with flat frame fields", async () => {
    await createSession({ date: "2026-05-27", alley_name: "V1 Lanes" });
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
