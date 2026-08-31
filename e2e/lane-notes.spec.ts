import { expect, test } from "@playwright/test";
import { clearDatabase } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/**
 * Lane notes are keyed by alley + lane and reached from the dashboard shortcut.
 * Uncovered until now: writing one, editing it, and having it survive a reload.
 */
test("writes a lane note, edits it, and keeps it across a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Lane notes" }).click();
  await page.getByRole("button", { name: /Add a lane note|Add lane note/ }).first().click();

  await page.getByPlaceholder("Orchid Bowl").fill("Palace Lanes");
  await page.getByPlaceholder("12").fill("7");
  await page
    .getByPlaceholder(/How this lane plays/)
    .fill("Hooks early, play 4th arrow");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Palace Lanes" })).toBeVisible();
  await expect(page.getByText("Hooks early, play 4th arrow")).toBeVisible();

  await page.getByRole("button", { name: "Edit note for Palace Lanes lane 7" }).click();
  await page.getByPlaceholder(/How this lane plays/).fill("Dries up after game 2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Wait for the sheet to close: the note text is also the textarea's value
  // while it is open, so asserting on the text alone can pass on a save that
  // never happened.
  await expect(page.getByPlaceholder(/How this lane plays/)).toHaveCount(0);
  await expect(page.getByText("Dries up after game 2")).toBeVisible();

  // The reload returns to this screen on its own now (ADR-041), so there is
  // nothing to navigate: the note is either there or it never persisted.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Palace Lanes" })).toBeVisible();
  await expect(page.getByText("Dries up after game 2")).toBeVisible();
});
