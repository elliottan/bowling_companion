import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

test("exports a backup, clears the database, and restores it via import", async ({ page }) => {
  await startSession(page, "Backup Lanes");
  await recordShot(page, []); // one strike -> a frame is saved

  // Export and capture the downloaded JSON.
  await page.getByRole("button", { name: "Backup" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(download.suggestedFilename()).toMatch(/^bowling-companion-backup-.*\.json$/);

  // Wipe the database, confirm history is empty.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("BowlingCompanionDB");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("No sessions yet.")).toBeVisible();

  // Import the captured backup, confirm the session is restored.
  await page.getByRole("button", { name: "Backup" }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await expect(page.getByText(/Imported 1 sessions/)).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("Backup Lanes")).toBeVisible();
});
