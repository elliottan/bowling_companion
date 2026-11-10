import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./bowlingDb";

/** The device's write count (ADR-275). */
async function revision(): Promise<number> {
  const row = await db.backup_state.get("revision");
  return row?.key === "revision" ? row.value : 0;
}

/**
 * The count is kept by the database rather than by each write path, so a
 * path added later cannot forget it. These pin what it counts and that it
 * commits with the write it counts.
 */
describe("the backup revision counter", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("counts a write to the bowler's data, and a bulk write once", async () => {
    await db.sessions.add({ date: "2026-11-01", alley_name: "Count Lanes" });
    expect(await revision()).toBe(1);

    await db.frames.bulkAdd([
      { game_id: 1, frame_number: 1, shots: [], is_strike: false, is_spare: false },
      { game_id: 1, frame_number: 2, shots: [], is_strike: false, is_spare: false }
    ]);
    expect(await revision()).toBe(2);

    await db.sessions.where("alley_name").equals("Count Lanes").delete();
    expect(await revision()).toBeGreaterThan(2);
  });

  // A theme or a snoozed reminder does not make a backup out of date, and
  // the catalog is not in a backup at all.
  it("does not count preferences or the catalog", async () => {
    await db.settings.put({ key: "theme", value: "dark" });
    await db.ball_catalog.put({ id: "storm-phaze" } as never);
    expect(await revision()).toBe(0);
  });

  it("rolls back with a write that fails", async () => {
    await db.sessions.add({ date: "2026-11-01", alley_name: "Kept Lanes" });
    const before = await revision();

    await expect(
      db.transaction("rw", db.sessions, async () => {
        await db.sessions.add({ date: "2026-11-02", alley_name: "Lost Lanes" });
        throw new Error("abandoned");
      })
    ).rejects.toThrow("abandoned");

    expect(await revision()).toBe(before);
    expect(await db.sessions.count()).toBe(1);
  });
});
