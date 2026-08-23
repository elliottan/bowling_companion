import { expect, test } from "@playwright/test";
import { clearDatabase } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

async function countSessions(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("BowlingCompanionDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise<number>((resolve) => {
      const req = db.transaction("sessions").objectStore("sessions").count();
      req.onsuccess = () => resolve(req.result);
    });
  });
}

/**
 * Regression: the pattern manager opens through a portal from inside the
 * session dialog. Portal events bubble up the REACT tree, not the DOM — so
 * when the manager was rendered inside <form>, saving a pattern fired the
 * session form's submit handler and silently created a session.
 */
test("adding a pattern from the session dialog does not submit the session form", async ({ page }) => {
  await page.getByRole("button", { name: "Start new session" }).click();
  await page.getByPlaceholder("Ball choice, surface, carry…").fill("keep me");

  await page.getByRole("button", { name: "Manage oil patterns" }).click();
  await page.getByRole("button", { name: "Add oil pattern" }).first().click();
  await page.getByPlaceholder("Kegel Main Street").fill("Kegel Navigation");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Kegel Navigation")).toBeVisible();
  // The whole point: saving a pattern must not have started a session.
  expect(await countSessions(page)).toBe(0);

  // Returning keeps the half-filled form and offers the new pattern.
  await page.getByRole("button", { name: "Back to session" }).click();
  await expect(page.getByPlaceholder("Ball choice, surface, carry…")).toHaveValue("keep me");
  await page.locator("#oil-pattern").selectOption({ label: "Kegel Navigation" });

  // Clearing is the only way to unset a pattern now that the empty option is gone.
  await page.getByRole("button", { name: "Clear oil pattern" }).click();
  await expect(page.locator("#oil-pattern")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Clear oil pattern" })).toHaveCount(0);

  expect(await countSessions(page)).toBe(0);
});
