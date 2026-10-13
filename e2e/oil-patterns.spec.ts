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
  await page.getByRole("button", { name: "Start session" }).first().click();
  await page.getByPlaceholder("Ball choice, surface, carry…").fill("keep me");

  await page.getByRole("button", { name: "Manage oil patterns" }).click();
  await page.getByRole("button", { name: "Add oil pattern" }).first().click();
  await page.getByPlaceholder("Kegel Main Street").fill("Kegel Navigation");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Kegel Navigation")).toBeVisible();
  // The whole point: saving a pattern must not have started a session.
  expect(await countSessions(page)).toBe(0);

  // Returning keeps the half-filled form and offers the new pattern.
  // The manager is a PushScreen now, so it leaves by the nav bar's back.
  await page
    .getByRole("dialog", { name: "Oil patterns" })
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(page.getByPlaceholder("Ball choice, surface, carry…")).toHaveValue("keep me");
  // The pattern field suggests as you type, like the alley does. Typed only
  // once the manager has gone: as it leaves it hands focus back to the button
  // that opened it, which on a slow WebKit run landed after the typing and
  // closed the suggestions out from under the tap.
  await expect(page.getByRole("dialog", { name: "Oil patterns" })).toHaveCount(0);
  await page.locator("#oil-pattern").fill("navig");
  await page.getByRole("listbox").getByRole("button", { name: /Kegel Navigation/ }).click();
  await expect(page.locator("#oil-pattern")).toHaveValue("Kegel Navigation");

  await page.getByRole("button", { name: "Clear oil pattern" }).click();
  await expect(page.locator("#oil-pattern")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Clear oil pattern" })).toHaveCount(0);

  expect(await countSessions(page)).toBe(0);
});

/**
 * Regression: the visualizer opened from a pattern's page closed that page on
 * the way in, so its X landed on the list, one screen further back than the
 * bowler came from.
 */
test("closing the visualizer opened from a pattern comes back to that pattern", async ({ page }) => {
  await page.getByRole("button", { name: /Oil patterns/ }).first().click();
  await page.getByText("Chromium").first().click();
  const pattern = page.getByRole("dialog", { name: /Chromium/ });
  await expect(pattern).toBeVisible();

  await page.getByRole("button", { name: "Try in the line visualizer" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(pattern).toBeVisible();

  // The platform's back too, from the visualizer: one layer at a time.
  await page.getByRole("button", { name: "Try in the line visualizer" }).click();
  await expect(page.getByRole("button", { name: "Close", exact: true }).last()).toBeVisible();
  await page.goBack();
  await expect(pattern).toBeVisible();

  // And back from the pattern reaches the list, not past it.
  await page.goBack();
  await expect(pattern).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Oil patterns" })).toBeVisible();
});
