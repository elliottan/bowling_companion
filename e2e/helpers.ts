import type { Page } from "@playwright/test";

/**
 * The first-run screen owns the viewport until handedness is stored, and after
 * any DB wipe it comes back. Walk it: start fresh, then right-handed.
 */
export async function dismissHandednessModal(page: Page) {
  await page.getByRole("button", { name: "Start fresh" }).click();
  await page.getByRole("button", { name: "right-handed" }).click();
}

/** Wipe IndexedDB so each test starts from an empty database. */
export async function clearDatabase(page: Page) {
  await page.goto("/score");
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("BowlingCompanionDB");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await dismissHandednessModal(page);
}

/** Fill the start-session form and submit. Lands on the active scorer. */
export async function startSession(page: Page, alley: string) {
  // "Start session" is the one label for this action, so Home offers it twice
  // (the card and the Fab) and the sheet's commit carries it too. Open with
  // either, then commit inside the sheet.
  await page.getByRole("button", { name: "Start session" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Start session" });
  await sheet.getByPlaceholder("Pinecrest Lanes").fill(alley);
  await sheet.getByRole("button", { name: "Start session" }).click();
  // A new game opens the lane editor (lanes unset); dismiss it. Lanes save as
  // they are typed, so the dialog's only control is its close.
  await page.getByRole("dialog", { name: /lanes/i }).getByRole("button", { name: "Close" }).click();
  // The scorer is up once the live-entry action buttons render.
  await page.getByRole("button", { name: "Next", exact: true }).waitFor();
}

/**
 * Record one shot. `standingAfter` is the set of pin numbers LEFT STANDING
 * after the shot — [] means a strike/clear. Mirrors the data model.
 *
 * Works for both the inverted shot-1 model (pins start down, tap to stand)
 * and the pins-up shot-2+ model (remaining pins start standing, tap to knock):
 * - Pins in standingAfter that are currently "down" get clicked (to mark standing).
 * - Pins NOT in standingAfter that are currently "standing" and enabled get clicked
 *   (to knock them down).
 */
export async function recordShot(page: Page, standingAfter: number[]) {
  const standingSet = new Set(standingAfter);
  for (let pin = 1; pin <= 10; pin++) {
    if (standingSet.has(pin)) {
      // Should be standing — click if currently "down" (and enabled).
      const downBtn = page.locator(`button[aria-label="Pin ${pin} down"]:not([disabled])`);
      if (await downBtn.count()) await downBtn.click();
    } else {
      // Should be knocked down — click if currently "standing" (and enabled).
      const standingBtn = page.locator(`button[aria-label="Pin ${pin} standing"]:not([disabled])`);
      if (await standingBtn.count()) await standingBtn.click();
    }
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
}
