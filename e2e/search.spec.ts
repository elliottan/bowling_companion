import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

// The search over everything (ADR-247): opened from Home, a result pushed over
// it, and back coming home to the results as they were typed.
test.use({ hasTouch: true, isMobile: true });

test("finds an alley's sessions, opens History on them, and comes back", async ({ page }) => {
  await clearDatabase(page);
  for (const alley of ["Alpha Lanes", "Beta Lanes"]) {
    await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
    await startSession(page, alley);
    for (let i = 0; i < 12; i++) await recordShot(page, []);
  }
  await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();

  await page.getByRole("button", { name: "Search", exact: true }).tap();
  const field = page.getByRole("searchbox", { name: "Search Headpin" });
  await expect(field).toBeFocused();
  await field.fill("beta");

  await page.getByRole("button", { name: /Sessions at Beta Lanes/ }).tap();
  const history = page.getByRole("dialog", { name: "History" });
  await expect(history.getByText("Beta Lanes").first()).toBeVisible();
  await expect(history.getByText("Alpha Lanes")).toHaveCount(0);

  await page.goBack();
  await expect(field).toHaveValue("beta");
  await expect(page.getByRole("dialog", { name: "History" })).toHaveCount(0);
});

test("answers a bowling word with what it means", async ({ page }) => {
  await clearDatabase(page);
  await page.getByRole("button", { name: "Search", exact: true }).tap();
  await page.getByRole("searchbox", { name: "Search Headpin" }).fill("brooklyn");
  const row = page.getByRole("button", { name: /^Brooklyn/ });
  await expect(row).toContainText("crosses over the headpin");
  await row.tap();
  await expect(page.getByRole("heading", { name: "The pocket, a Brooklyn and other strike words" })).toBeVisible();
});
