import { expect, test } from "@playwright/test";
import { clearDatabase, dismissHandednessModal, recordShot, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

test("exports a backup, clears the database, and restores it via import", async ({ page }) => {
  await startSession(page, "Backup Lanes");
  await recordShot(page, []); // one strike -> a frame is saved

  // Export and capture the downloaded JSON.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Backup & restore" }).click();
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
  await dismissHandednessModal(page);
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "No sessions yet" })).toBeVisible();

  // Import the captured backup, confirm the session is restored.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Backup & restore" }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);

  // Import replaces everything (ADR-038), so it is gated behind typed confirmation.
  await expect(page.getByRole("heading", { name: "Replace all data?" })).toBeVisible();
  const replaceButton = page.getByRole("button", { name: "Replace everything" });
  await expect(replaceButton).toBeDisabled();
  await page.getByPlaceholder("REPLACE").fill("REPLACE");
  // The safety copy of the current (empty) database downloads before the wipe.
  const safetyCopyPromise = page.waitForEvent("download");
  await replaceButton.click();
  expect((await safetyCopyPromise).suggestedFilename()).toMatch(/^bowling-companion-pre-import-.*\.json$/);

  await expect(page.getByText(/Replaced all data\. You now have 1 sessions/)).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  // Target the session row button (a location-filter <option> shares the name).
  await expect(page.getByRole("button", { name: /Backup Lanes/ })).toBeVisible();
});
