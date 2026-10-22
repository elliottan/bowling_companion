import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession, openArsenalFromHome } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/**
 * Lists read Dexie through live queries, so a write updates every list showing
 * that data without anything being told to reload. These drive the two paths that
 * used to carry hand-wired refresh callbacks: if a live query stopped tracking,
 * the row would still be on screen after the delete.
 */

test("deleting a session updates the list it was deleted from", async ({ page }) => {
  await startSession(page, "Live Lanes");
  await recordShot(page, []);

  await page.getByRole("navigation").getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("button", { name: /Live Lanes/ }).first()).toBeVisible();

  // Deleted from the session's own editor (ADR-184): open it, tap its header,
  // and the red Delete session at the foot, behind its confirm.
  await page.getByRole("button", { name: /Live Lanes/ }).first().click();
  await page.getByRole("button", { name: "Edit session" }).click();
  await page.getByRole("dialog", { name: "Edit session" }).getByRole("button", { name: "Delete session" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();

  // Back on History with no reload: the list follows the write.
  await page.getByRole("navigation").getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("button", { name: /Live Lanes/ })).toHaveCount(0);
});

test("a ball deleted in its editor leaves the arsenal list at once", async ({ page }) => {
  await openArsenalFromHome(page);
  await page.getByRole("button", { name: "Add ball" }).first().click();
  await page.getByPlaceholder("e.g. Storm Phaze II").fill("Live Ball");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Live Ball")).toBeVisible();

  await page.locator("li").filter({ hasText: "Live Ball" }).getByRole("button").nth(1).click();
  await page.getByRole("button", { name: /delete/i }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText(/no balls yet/i)).toBeVisible();
});
