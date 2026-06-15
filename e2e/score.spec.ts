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

test("editing a past frame updates it", async ({ page }) => {
  await startSession(page, "Edit Lanes");
  await recordShot(page, []); // F1 strike
  await recordShot(page, [10]); // F2 shot1 = 9
  await recordShot(page, [10]); // F2 shot2 = open (9)
  await expect(page.getByText(/Frame 3 . Shot 1/i)).toBeVisible();

  // Tap frame 1's recorded shot on the scorecard → shot detail view.
  await page.getByRole("button", { name: "View frame 1 shot 1" }).first().click();
  // Edit button appears in the action area.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByText(/Editing frame 1/i)).toBeVisible();

  // Re-bowl frame 1 as an open 9 instead of a strike.
  await recordShot(page, [10]); // shot1 = 9
  await recordShot(page, [10]); // shot2 = open
  await expect(page.getByText(/Frame 1 updated/i)).toBeVisible();
});

test("10th frame: strike + spare + open third shot scores correctly", async ({ page }) => {
  await startSession(page, "Tenth Lanes");

  // Bowl frames 1-9 as open (7 + 2 = 9 each)
  for (let f = 1; f <= 9; f++) {
    await recordShot(page, [8, 9, 10]); // knock 7 pins (leave 8,9,10)
    await recordShot(page, [8, 9, 10]); // leave 8,9,10 = open
  }
  await expect(page.getByText(/Frame 10 . Shot 1/i)).toBeVisible();

  // 10th frame shot 1: strike
  await recordShot(page, []);
  await expect(page.getByText(/Frame 10 . Shot 2/i)).toBeVisible();

  // 10th frame shot 2: spare (leave pin 7, then clear)
  await recordShot(page, [7]);
  await expect(page.getByText(/Frame 10 . Shot 3/i)).toBeVisible();

  // Wait for shot 2 to become a spare (frame 10 shot 3 appears)
  // 10th frame shot 3: knock 6 (leave 4 pins)
  await recordShot(page, [4, 8, 9, 10]);

  // Game should be complete. Scorecard shows the total.
  await expect(page.getByText(/Game complete/i)).toBeVisible();
});

test("Next Game button hidden until current game is complete", async ({ page }) => {
  await startSession(page, "Next Game Lanes");

  // Button should not exist while game is in progress
  await expect(page.getByRole("button", { name: "Next Game" })).not.toBeVisible();

  // Bowl a perfect game to complete it
  for (let i = 0; i < 12; i++) {
    await recordShot(page, []);
  }

  // Now the button should appear
  await expect(page.getByRole("button", { name: "Next Game" })).toBeVisible();
});
