import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import {
  backupFilename,
  createBackup,
  exportBackup,
  prepareImport,
  replaceAllData
} from "./backupRepository";
import type { BowlingBackup } from "../types/bowling";
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

  it("rejects invalid backup JSON in the app's own words", async () => {
    await expect(importBackup("{bad json")).rejects.toThrow(
      "That file is not a Headpin backup."
    );
  });

  it("re-derives the strike and spare marks from the shots (ADR-078)", async () => {
    // A file that says the opposite of what its own shots say. The shots win.
    await importBackup({
      app: "bowling-companion" as const,
      version: 3 as const,
      exported_at: "2026-05-27T00:00:00.000Z",
      tables: {
        sessions: [{ id: 1, date: "2026-05-27", alley_name: "Liar Lanes" }],
        games: [{ id: 1, session_id: 1, game_number: 1 }],
        frames: [
          {
            id: 1, game_id: 1, frame_number: 1,
            shots: [{ pins_standing: [] }],
            is_strike: false, is_spare: true
          },
          {
            id: 2, game_id: 1, frame_number: 2,
            shots: [{ pins_standing: [7] }, { pins_standing: [] }],
            is_strike: true, is_spare: false
          }
        ]
      }
    });

    const frames = (await getSessionHistory())[0].games[0].frames;
    expect(frames[0].is_strike).toBe(true);
    expect(frames[0].is_spare).toBe(false);
    expect(frames[1].is_strike).toBe(false);
    expect(frames[1].is_spare).toBe(true);
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

    // Local Lanes is gone, the file is the whole truth after an import.
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

describe("backup filenames", () => {
  it("sorts by time and shows its size, so a cloud folder is readable", () => {
    const name = backupFilename({
      app: "bowling-companion",
      version: 3,
      exported_at: "2026-08-28T19:30:12.000Z",
      tables: { sessions: [{}, {}, {}] as never, games: [] as never, frames: [] as never }
    });
    expect(name).toBe("headpin-2026-08-28-1930-3s.json");
  });

  it("gives two exports on the same day different names", () => {
    const at = (iso: string) =>
      backupFilename({
        app: "bowling-companion",
        version: 3,
        exported_at: iso,
        tables: { sessions: [] as never, games: [] as never, frames: [] as never }
      });
    expect(at("2026-08-28T09:05:00.000Z")).not.toBe(at("2026-08-28T21:40:00.000Z"));
  });
});

describe("a restore that goes backwards", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("counts what would be lost", async () => {
    for (const date of ["2026-06-01", "2026-06-08", "2026-06-15"]) {
      await createSession({ date, alley_name: "Sea Bowl" });
    }
    const thin: BowlingBackup = {
      app: "bowling-companion",
      version: 3,
      exported_at: "2026-06-02T00:00:00.000Z",
      tables: {
        sessions: [{ id: 1, date: "2026-06-01", alley_name: "Sea Bowl" }],
        games: [],
        frames: []
      }
    };
    const prepared = await prepareImport(JSON.stringify(thin));
    expect(prepared.losingSessions).toBe(2);
  });

  it("counts nothing lost when the file is the fuller one", async () => {
    await createSession({ date: "2026-06-01", alley_name: "Sea Bowl" });
    const fat: BowlingBackup = {
      app: "bowling-companion",
      version: 3,
      exported_at: "2026-06-20T00:00:00.000Z",
      tables: {
        sessions: [
          { id: 1, date: "2026-06-01", alley_name: "Sea Bowl" },
          { id: 2, date: "2026-06-08", alley_name: "Sea Bowl" }
        ],
        games: [],
        frames: []
      }
    };
    const prepared = await prepareImport(JSON.stringify(fat));
    expect(prepared.losingSessions).toBe(0);
  });
});

/**
 * The gate that stops a future table or field being dropped from a backup in
 * silence (ADR-038).
 *
 * A backup that quietly loses data is the one bug the user cannot recover
 * from: the file looks fine, imports without an error, and the missing part is
 * only noticed on the far side, once the original device has been wiped. So
 * coverage is asserted against the schema itself rather than against a list
 * kept by hand, which is the list that goes stale.
 */
describe("backup completeness", () => {
  beforeEach(async () => {
    URL.createObjectURL = () => "blob:stub";
    URL.revokeObjectURL = () => {};
    await db.delete();
    await db.open();
  });

  /**
   * Tables deliberately left out, each with the reason it is safe to lose.
   * Adding a name here is the explicit decision; forgetting one fails the test
   * above instead of shipping.
   */
  const NOT_BACKED_UP: Record<string, string> = {
    ball_catalog: "read-only reference data, re-synced from the shipped catalog"
  };

  it("backs up every table in the schema, or names why not", async () => {
    const backup = await createBackup();
    const covered = new Set(Object.keys(backup.tables));
    const missing = db.tables
      .map((t) => t.name)
      .filter((name) => !covered.has(name) && !(name in NOT_BACKED_UP));

    expect(missing).toEqual([]);
  });

  it("puts nothing in the file that the schema does not have", async () => {
    const backup = await createBackup();
    const schema = new Set(db.tables.map((t) => t.name));

    expect(Object.keys(backup.tables).filter((name) => !schema.has(name))).toEqual([]);
  });

  it("restores every row of every table byte for byte", async () => {
    // One row per backed-up table, with every optional field filled in. A field
    // added to any of these types in future is carried by the same round trip;
    // a field the export drops shows up here as a diff, not as a lost season.
    const line = {
      stance: 20,
      slide: 18,
      laydown: 12,
      target: 10,
      breakpoint: 6,
      breakpoint_distance: 42,
      hook_start_distance: 38,
      hook_length: 14,
      final_board: 17.5,
      final_distance: 60
    };

    await db.sessions.add({
      id: 1,
      date: "2026-06-01",
      alley_name: "Round Trip Lanes",
      description: "league night",
      oil_pattern_id: 1,
      general_notes: "fresh oil"
    });
    await db.games.add({
      id: 1,
      session_id: 1,
      game_number: 1,
      lane_number: "7",
      lanes: ["7", "8"],
      start_lane: "7",
      final_score: 212,
      notes: "moved left"
    });
    await db.frames.add({
      id: 1,
      game_id: 1,
      frame_number: 1,
      is_strike: false,
      is_spare: true,
      shots: [
        {
          pins_standing: [10],
          ball_id: 1,
          pocket_hit: true,
          intended: line,
          actual: { ...line, stance: 21 },
          notes: "ringing ten"
        },
        { pins_standing: [], ball_id: 1, notes: "covered" }
      ]
    });
    await db.balls.add({
      id: 1,
      name: "Phaze II",
      is_spare_ball: false,
      layout: "45 x 4 x 35",
      notes: "2000 grit",
      sort_order: 1,
      catalog_ref_id: "storm-phaze-ii",
      catalog_snapshot: {
        brand: "Storm",
        name: "Phaze II",
        coverstockCategory: "Reactive",
        coreName: "Velocity",
        rg: 2.48,
        diff: 0.051,
        mbDiff: null,
        imageThumb: "/balls/phaze-ii.webp"
      },
      weight: 15,
      colorway_sku: "PHZ2-15"
    });
    await db.oil_patterns.add({ id: 1, name: "Kegel Main Street", url: "https://example.com/p.pdf", archived: false });
    await db.spare_lines.add({
      id: 1,
      pins: [10],
      line,
      strike_offset: { stance: 2, target: -1 },
      notes: "flat ten",
      sort_order: 1
    });
    await db.lane_notes.add({ id: 1, alley: "Round Trip Lanes", lane: "7", notes: "dry outside" });
    await db.settings.add({ key: "drift_model", value: JSON.stringify({ v: 1, release_offset: 5 }) });

    const before = await createBackup();
    await importBackup(JSON.parse(JSON.stringify(before)));
    const after = await createBackup();

    expect(after.tables).toEqual(before.tables);

    // And every table actually carried a row, so an empty table can never make
    // this pass by comparing nothing to nothing.
    for (const [name, rows] of Object.entries(before.tables)) {
      expect(rows, `${name} must have a row to round trip`).not.toHaveLength(0);
    }
  });
});
