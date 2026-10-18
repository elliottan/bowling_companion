import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shareFileFromApp = vi.fn(async (_name: string, _data: Blob | string) => "shared" as "shared" | "cancelled");
vi.mock("../lib/nativeShare", () => ({ shareFileFromApp: (n: string, d: Blob | string) => shareFileFromApp(n, d) }));

const { db } = await import("../db/bowlingDb");
const { exportBackup, shareBackup } = await import("./backupRepository");
const { getSetting } = await import("./bowlingRepository");

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

  it("sends the error screen's export through the sheet too", async () => {
    await exportBackup();
    expect(shareFileFromApp).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });
});
