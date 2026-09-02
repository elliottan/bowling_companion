import { expect, test } from "@playwright/test";
import { clearDatabase } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/** Spare lines has its own shortcut on Home. */
async function openSpareLines(page: import("@playwright/test").Page) {
  await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Spare lines", exact: true }).click();
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
  // The screen is a push off the current tab (ADR-063), so it has a route and
  // a reload lands straight back on it.
  await page.reload();
  await expect(page).toHaveURL(/#\/home\/spares$/);
  await expect(page.getByRole("button", { name: "Edit spare line for pins 3, 10" })).toBeVisible();

  await page.getByRole("button", { name: "Edit spare line for pins 3, 10" }).click();
  await page.getByRole("button", { name: "Delete spare line for pins 3, 10" }).click();

  // A line is tuned over a season and there is no undo behind it, so the delete
  // is confirmed before it runs.
  // The topmost dialog: the pushed screen behind it is also one, and it
  // contains this text by containing the confirm.
  const confirm = page.getByRole("dialog").filter({ hasText: "Delete this spare line?" }).last();
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByRole("button", { name: "Edit spare line for pins 3, 10" })).toHaveCount(0);
  await expect(seeded).toHaveCount(9);
});
