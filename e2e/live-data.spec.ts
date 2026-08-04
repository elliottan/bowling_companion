import { expect, test, type Page } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/**
 * Lists read Dexie through live queries, so a write updates every list showing
 * that data without anything being told to reload. These drive the two paths that
 * used to carry hand-wired refresh callbacks: if a live query stopped tracking,
 * the row would still be on screen after the delete.
 */

/** The session rows carry a long-press menu; a tap opens the session instead. */
async function longPress(page: Page, name: RegExp) {
  const row = page.getByRole("button", { name }).first();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

test("deleting a session updates the list it was deleted from", async ({ page }) => {
  await startSession(page, "Live Lanes");
  await recordShot(page, []);

  await page.getByRole("navigation").getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("button", { name: /Live Lanes/ }).first()).toBeVisible();

  await longPress(page, /Live Lanes/);
  await page.getByRole("button", { name: /^Delete/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();

  // No reload, no navigation: the list follows the write.
  await expect(page.getByRole("button", { name: /Live Lanes/ })).toHaveCount(0);
});

test("a ball deleted in its editor leaves the arsenal list at once", async ({ page }) => {
  await page.getByRole("button", { name: "Arsenal", exact: true }).click();
  await page.getByRole("button", { name: "Add ball" }).first().click();
  await page.getByPlaceholder("e.g. Storm Phaze II").fill("Live Ball");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Live Ball")).toBeVisible();

  await page.locator("li").filter({ hasText: "Live Ball" }).getByRole("button").nth(1).click();
  await page.getByRole("button", { name: /delete/i }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText(/no balls yet/i)).toBeVisible();
});
