// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shareFileFromApp = vi.fn(async (_name: string, _data: Blob | string) => "shared" as "shared" | "cancelled");
vi.mock("../lib/nativeShare", () => ({ shareFileFromApp: (n: string, d: Blob | string) => shareFileFromApp(n, d) }));

const { db } = await import("../db/bowlingDb");
const { createBackup, exportBackup, prepareImport, replaceAllData, saveSafetyCopy, shareBackup } = await import("./backupRepository");
const { createSession, getSetting } = await import("./bowlingRepository");

/** The store apps' web views neither download nor share (ADR-156). */
describe("backups in the store apps", () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click");

  beforeEach(async () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
    await db.settings.clear();
    shareFileFromApp.mockClear();
    click.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands Save a backup to the platform's sheet, and counts it as a backup", async () => {
    expect(await shareBackup()).toBe("shared");
    const [name, data] = shareFileFromApp.mock.calls[0];
    expect(name).toMatch(/^headpin-\d{4}-\d{2}-\d{2}-\d{4}-\d+s\.json$/);
    expect(JSON.parse(data as string).tables).toBeDefined();
    expect(click).not.toHaveBeenCalled();
    expect(await getSetting("last_backup_at")).toBeDefined();
  });

  it("does not count a closed sheet as a backup, so the reminder keeps asking", async () => {
    shareFileFromApp.mockResolvedValueOnce("cancelled");
    expect(await shareBackup()).toBe("cancelled");
    expect(await getSetting("last_backup_at")).toBeUndefined();
  });

  it("sends the safety copy through the sheet, and says when it was closed (ADR-274)", async () => {
    shareFileFromApp.mockResolvedValueOnce("cancelled");
    expect(await saveSafetyCopy()).toBe("cancelled");
    expect(shareFileFromApp.mock.calls[0][0]).toMatch(/^pre-import-/);
    expect(click).not.toHaveBeenCalled();
    // A safety copy is not a backup the reminder counts.
    expect(await getSetting("last_backup_at")).toBeUndefined();
  });

  it("replaces without opening a sheet of its own", async () => {
    await db.sessions.clear();
    await createSession({ date: "2026-11-01", alley_name: "Old Lanes" });
    const incoming = await prepareImport(JSON.stringify({ ...(await createBackup()), tables: { ...(await createBackup()).tables, sessions: [] } }));

    await replaceAllData(incoming.backup);

    expect(await db.sessions.count()).toBe(0);
    expect(shareFileFromApp).not.toHaveBeenCalled();
  });

  it("sends the error screen's export through the sheet too", async () => {
    await exportBackup();
    expect(shareFileFromApp).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });
});
