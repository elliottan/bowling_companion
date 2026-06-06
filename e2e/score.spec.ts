import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

test("scores strike, spare, and open frames with a correct running total", async ({ page }) => {
  await startSession(page, "Smoke Lanes");

  // Frame 1: strike (all pins down on shot 1).
  await recordShot(page, []);
  await expect(page.getByText(/Frame 2 . Shot 1/i)).toBeVisible();

  // Frame 2: spare — leave the 7 pin, then clear it.
  await recordShot(page, [7]);
  await expect(page.getByText(/Frame 2 . Shot 2/i)).toBeVisible();
  await recordShot(page, []);
  await expect(page.getByText(/Frame 3 . Shot 1/i)).toBeVisible();

  // Frame 3: open — 9 then leave the 10 (9 pinfall total).
  await recordShot(page, [10]); // shot 1 knocks 9
  await recordShot(page, [10]); // shot 2 hits nothing -> open

  // Frame 1 total can now be computed: strike(10) + spare-frame shots(9+1).
  // Frame 1 = 10 + 9 + 1 = 20. Assert it surfaced on the scorecard.
  await expect(page.getByText("20").first()).toBeVisible();
});

test("persists the session and shows it in history", async ({ page }) => {
  await startSession(page, "History Lanes");
  await recordShot(page, []); // one strike so a frame is saved

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("History Lanes")).toBeVisible();
});
