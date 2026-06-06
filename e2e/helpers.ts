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
 */
export async function recordShot(page: Page, standingAfter: number[]) {
  const standing = new Set(standingAfter);
  // Knock down every pin that should NOT remain standing.
  for (let pin = 1; pin <= 10; pin += 1) {
    if (standing.has(pin)) continue;
    const down = page.locator(`button[aria-label="Pin ${pin} standing"]`);
    if (await down.count()) await down.click();
  }
  await page.getByRole("button", { name: "Record", exact: true }).click();
}
