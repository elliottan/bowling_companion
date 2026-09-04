import { expect, test } from "@playwright/test";
import { preferDownloadOverShare, recordShot, startSession } from "./helpers";

/** Wipe the database and reload, landing on a genuine first run. */
async function freshInstall(page: Parameters<typeof startSession>[0]) {
  await preferDownloadOverShare(page);
  await page.goto("/score");
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("BowlingCompanionDB");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
}

/**
 * The fast path (ADR-080): a bowler who has just installed the app reaches the
 * pin deck without naming an alley or opening the form at all.
 */
test("scores without filling anything in", async ({ page }) => {
  await freshInstall(page);
  await page.getByRole("button", { name: "Start fresh" }).click();
  await page.getByRole("button", { name: "right-handed" }).click();

  await page.getByRole("button", { name: "Score now, add details later" }).first().click();

  // Straight onto the pin deck, no form and no lane editor in the way.
  await expect(page.getByRole("button", { name: /^Next(:|$)/ })).toBeVisible();

  // The session it made is real, and says so where it has no alley to print.
  await expect(page.getByText("Unnamed session").first()).toBeVisible();
});

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

test("the welcome screen is the first thing painted, never a Dashboard first", async ({
  page
}) => {
  await page.goto("/score");
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("BowlingCompanionDB");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });

  // A flag set by whatever appears first. The three boot reads used to land in
  // any order, so a new bowler saw an empty Dashboard and then a welcome over
  // the top of it, which reads as a wipe to anyone who is not new.
  await page.addInitScript(() => {
    (window as unknown as { __sawApp?: boolean }).__sawApp = false;
    new MutationObserver(() => {
      const buttons = document.querySelectorAll("button");
      for (const b of buttons) {
        if (b.textContent?.includes("Start session")) {
          (window as unknown as { __sawApp?: boolean }).__sawApp = true;
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });

  await page.reload();
  await expect(page.getByRole("dialog", { name: "Set up Headpin" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __sawApp?: boolean }).__sawApp)).toBe(
    false
  );
});

test("walks new bowlers through to the app", async ({ page }) => {
  await freshInstall(page);

  await page.getByRole("button", { name: "Start fresh" }).click();
  await expect(page.getByText("Which hand do you bowl with?")).toBeVisible();

  await page.getByRole("button", { name: "right-handed" }).click();

  // The first run is done and hands over to the app.
  await expect(page.getByRole("dialog", { name: "Set up Headpin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start session" }).first()).toBeVisible();
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

test("a file that is not JSON at all is refused in the app's own words", async ({ page }) => {
  await freshInstall(page);

  // A photo renamed to .json used to surface a JSON.parse message about a
  // token at a position, which tells a bowler nothing.
  await page.locator('input[type="file"]').setInputFiles({
    name: "photo.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json at all")
  });

  await expect(page.getByText("That file is not a Headpin backup.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore from a backup" })).toBeVisible();
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
  await page.getByRole("button", { name: "Save a backup" }).click();
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

test("a bowler who already has sessions is never asked if they are new", async ({ page }) => {
  // A history on the device, then the handedness row alone taken away: the
  // exact state a backup taken before `settings` were in the file restores to.
  await freshInstall(page);
  await page.getByRole("button", { name: "Start fresh" }).click();
  await page.getByRole("button", { name: "right-handed" }).click();
  await startSession(page, "Returning Lanes");
  await recordShot(page, []);

  await page.evaluate(async () => {
    const { db } = await import("/src/db/bowlingDb.ts");
    await db.settings.delete("handedness");
  });
  await page.reload();

  // Asked the one thing that is genuinely unanswered, and nothing else. No
  // offer to start fresh over the top of a history that is right there.
  const firstRun = page.getByRole("dialog", { name: "Set up Headpin" });
  await expect(firstRun.getByRole("button", { name: "right-handed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start fresh" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore from a backup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);

  // Answering it lands on Home, with the history still there.
  await firstRun.getByRole("button", { name: "right-handed" }).click();
  await expect(firstRun).toHaveCount(0);
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("button", { name: /Returning Lanes/ })).toBeVisible();
});
