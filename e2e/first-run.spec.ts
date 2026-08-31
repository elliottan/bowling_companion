import { expect, test } from "@playwright/test";
import { recordShot, startSession } from "./helpers";

/** Wipe the database and reload, landing on a genuine first run. */
async function freshInstall(page: Parameters<typeof startSession>[0]) {
  await page.goto("/score");
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("BowlingCompanionDB");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
}

test("opens on the welcome screen, not on a question over an unseen app", async ({ page }) => {
  await freshInstall(page);

  const firstRun = page.getByRole("dialog", { name: "Set up Headpin" });
  await expect(firstRun).toBeVisible();
  await expect(firstRun.getByText("Headpin", { exact: true })).toBeVisible();

  // Handedness is not asked yet: the restore has to be offered first, because
  // a backup carries the answer.
  await expect(page.getByRole("button", { name: "right-handed" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore from a backup" })).toBeVisible();
});

test("walks new bowlers through to the app", async ({ page }) => {
  await freshInstall(page);

  await page.getByRole("button", { name: "Set up a new book" }).click();
  await expect(page.getByText("Which hand do you bowl with?")).toBeVisible();

  await page.getByRole("button", { name: "right-handed" }).click();

  // The first run is done and hands over to the app.
  await expect(page.getByRole("dialog", { name: "Set up Headpin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start new session" })).toBeVisible();
});

test("every step can be backed out of", async ({ page }) => {
  await freshInstall(page);

  await page.getByRole("button", { name: "Restore from a backup" }).click();
  await expect(page.getByText("Pick a Headpin backup file", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Set up a new book" })).toBeVisible();
});

test("a restore brings the history back and never asks the hand twice", async ({ page }) => {
  // Build a real history, export it, then wipe and restore through first run.
  await freshInstall(page);
  await page.getByRole("button", { name: "Set up a new book" }).click();
  await page.getByRole("button", { name: "left-handed" }).click();

  await startSession(page, "Restored Lanes");
  for (let i = 0; i < 12; i++) await recordShot(page, []);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Back up|Backup/ }).first().click();
  await page.getByRole("button", { name: /Export|Save a copy|Back up now/ }).first().click();
  const file = await (await download).path();

  await freshInstall(page);
  await page.getByRole("button", { name: "Restore from a backup" }).click();
  await page.locator('input[type="file"]').setInputFiles(file!);

  await expect(page.getByText("This file holds")).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();

  // Straight into the app: the file carried the handedness, so the question
  // that would have overwritten it is never asked.
  await expect(page.getByRole("dialog", { name: "Set up Headpin" })).toHaveCount(0);
  await expect(page.getByText("Restored Lanes")).toBeVisible();
});
