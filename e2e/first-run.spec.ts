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

  await page.getByRole("button", { name: "Start fresh" }).click();
  await expect(page.getByText("Which hand do you bowl with?")).toBeVisible();

  await page.getByRole("button", { name: "right-handed" }).click();

  // The first run is done and hands over to the app.
  await expect(page.getByRole("dialog", { name: "Set up Headpin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start new session" })).toBeVisible();
});

test("restoring opens the file picker, and cancelling costs nothing", async ({ page }) => {
  await freshInstall(page);

  // The offer used to be a screen whose only job was to hold a Choose a file
  // button. Now the tap opens the picker, so there is no step to back out of.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Restore from a backup" }).click();
  await chooser;

  await expect(page.getByRole("button", { name: "Start fresh" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore from a backup" })).toBeVisible();
});

test("a file that is not a backup is refused without leaving the welcome screen", async ({
  page
}) => {
  await freshInstall(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "holiday.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"not":"a backup"}')
  });

  // The database is untouched: nothing is written until the counts are
  // confirmed, so the way out is simply to pick a different file.
  await expect(page.getByRole("button", { name: "Restore from a backup" })).toBeVisible();
  await expect(page.getByText(/^Backed up /)).toHaveCount(0);
});

test("a restore brings the history back and never asks the hand twice", async ({ page }) => {
  // Build a real history, export it, then wipe and restore through first run.
  await freshInstall(page);
  await page.getByRole("button", { name: "Start fresh" }).click();
  await page.getByRole("button", { name: "left-handed" }).click();

  await startSession(page, "Restored Lanes");
  for (let i = 0; i < 12; i++) await recordShot(page, []);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Back up|Backup/ }).first().click();
  await page.getByRole("button", { name: /Export|Save a copy|Back up now/ }).first().click();
  const file = await (await download).path();

  await freshInstall(page);
  // Straight to the input: the button opens the OS picker, which a test cannot
  // fill in, and the input is mounted for the whole first run.
  await page.locator('input[type="file"]').setInputFiles(file!);

  await expect(page.getByText(/^Backed up /)).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();

  // Straight into the app: the file carried the handedness, so the question
  // that would have overwritten it is never asked.
  await expect(page.getByRole("dialog", { name: "Set up Headpin" })).toHaveCount(0);
  await expect(page.getByText("Restored Lanes")).toBeVisible();
});
