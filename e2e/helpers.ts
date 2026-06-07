import type { Page } from "@playwright/test";

/** Wipe IndexedDB so each test starts from an empty database. */
export async function clearDatabase(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("BowlingCompanionDB");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
}

/** Fill the start-session form and submit. Lands on the active scorer. */
export async function startSession(page: Page, alley: string) {
  await page.getByPlaceholder("Orchid Bowl").fill(alley);
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByText(/Frame \d+ . Shot \d+/i).waitFor();
}

/**
 * Record one shot. `standingAfter` is the set of pin numbers LEFT STANDING
 * after the shot — [] means a strike/clear. Mirrors the data model.
 *
 * Inverted input (ADR-006): each shot starts with all pins down; tap the pins
 * that remain standing. So we tap each pin in `standingAfter` that is currently
 * down and tappable.
 */
export async function recordShot(page: Page, standingAfter: number[]) {
  for (const pin of standingAfter) {
    const down = page.locator(`button[aria-label="Pin ${pin} down"]`);
    if (await down.count()) await down.click();
  }
  await page.getByRole("button", { name: "Record", exact: true }).click();
}
