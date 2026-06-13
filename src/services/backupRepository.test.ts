import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import { createBackup, importBackup } from "./backupRepository";
import { addGameToSession, createSession, getSessionHistory, saveFrame } from "./bowlingRepository";

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

    expect(result).toEqual({ sessions: 1, games: 1, frames: 1 });
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
});
