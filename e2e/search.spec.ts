import { expect, test } from "@playwright/test";
import { clearDatabase, seedFinishedSessions } from "./helpers";

// The search over everything (ADR-247): opened from Home, a result pushed over
// it, and back coming home to the results as they were typed.
test.use({ hasTouch: true, isMobile: true });

test("finds an alley's sessions, opens History on them, and comes back", async ({ page }) => {
  await clearDatabase(page);
  await seedFinishedSessions(page, ["Alpha Lanes", "Beta Lanes"]);

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
  await expect(row).toContainText("crosses to the other side of the headpin");
  await row.tap();
  await expect(page.getByRole("heading", { name: "Bowling terms", level: 1 })).toBeVisible();
  await expect(page.locator("#term-brooklyn")).toBeInViewport();
});
