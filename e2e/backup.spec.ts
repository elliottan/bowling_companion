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
  // Timestamped to the minute and carrying its session count, so a folder of
  // these sorts and identifies itself (ADR-067).
  expect(download.suggestedFilename()).toMatch(
    /^headpin-\d{4}-\d{2}-\d{2}-\d{4}-\d+s\.json$/
  );

  // Wipe the database, confirm history is empty.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("BowlingCompanionDB");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await dismissHandednessModal(page);
  // The reload lands back on Backup & restore, which is pushed over the tab
  // bar, so leave it before crossing to a tab.
  await page.getByRole("dialog", { name: "Backup & restore" }).getByRole("button", { name: "Back" }).click();
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
  expect((await safetyCopyPromise).suggestedFilename()).toMatch(
    /^pre-import-headpin-.*\.json$/
  );

  await expect(page.getByText(/Restored 1 sessions/)).toBeVisible();

  // Backup & restore is pushed over the tab bar, so leave it before crossing.
  await page.getByRole("dialog", { name: "Backup & restore" }).getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "History" }).click();
  // Target the session row button (a location-filter <option> shares the name).
  await expect(page.getByRole("button", { name: /Backup Lanes/ })).toBeVisible();
});

test("a finished game in a browser tab asks for a copy, and it can be closed", async ({ page }) => {
  await startSession(page, "Eviction Lanes");

  // Nothing to lose yet: the session exists but no game is finished, and
  // asking now would train the user to ignore the prompt (ADR-068).
  await expect(page.getByText("Save a copy")).toHaveCount(0);

  // Bowl a perfect game to finish it.
  for (let i = 0; i < 12; i++) {
    await recordShot(page, []);
  }

  // Playwright is a browser tab, never standalone, so the tab policy applies:
  // one unsaved session is enough.
  await expect(
    page.getByText("Saved on this phone only.", { exact: false })
  ).toBeVisible();

  // The close is the only dismissal now; while it is merely due, closing it
  // snoozes exactly as Later did (ADR-073).
  await page.getByRole("button", { name: "Dismiss backup reminder" }).click();
  await expect(page.getByText("Save a copy")).toHaveCount(0);
});
