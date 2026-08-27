import { expect, test } from "@playwright/test";
import { clearDatabase } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/** Spare lines live in the Stats tab's own menu, next to Open frames. */
async function openSpareLines(page: import("@playwright/test").Page) {
  await page.getByRole("navigation").getByRole("button", { name: "Stats" }).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Spare lines" }).click();
}

/**
 * Spare lines are the app's other stored line data (ADR-021) and had no
 * coverage. The screen seeds the nine single-pin leaves on first open, so this
 * works on a multi-pin leave that is never seeded.
 */
test("adds a spare line for a leave, stores its boards, and deletes it", async ({ page }) => {
  await openSpareLines(page);
  const seeded = page.getByRole("button", { name: /^Edit spare line for pins/ });
  await expect(seeded).toHaveCount(9);

  await page.getByRole("button", { name: "Add spare" }).click();
  // A leave starts with nothing selected: tap the pins left standing.
  await page.getByRole("button", { name: /Pin 3 (down|standing)/ }).click();
  await page.getByRole("button", { name: /Pin 10 (down|standing)/ }).click();
  await page.getByRole("button", { name: "Save spare line" }).click();

  const card = page.getByRole("button", { name: "Edit spare line for pins 3, 10" });
  await expect(card).toBeVisible();

  // Reopening reads back what was stored, rather than the form's own state.
  // The screen is a push off the Stats tab (ADR-063), so it has a route and a
  // reload lands straight back on it.
  await page.reload();
  await expect(page).toHaveURL(/#\/stats\/spares$/);
  await expect(page.getByRole("button", { name: "Edit spare line for pins 3, 10" })).toBeVisible();

  await page.getByRole("button", { name: "Edit spare line for pins 3, 10" }).click();
  await page.getByRole("button", { name: "Delete spare line for pins 3, 10" }).click();
  await expect(page.getByRole("button", { name: "Edit spare line for pins 3, 10" })).toHaveCount(0);
  await expect(seeded).toHaveCount(9);
});
