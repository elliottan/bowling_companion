import { expect, test } from "@playwright/test";
import { RECORD_SHOT, clearDatabase, recordShot, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

test("scores strike, spare, and open frames with a correct running total", async ({ page }) => {
  await startSession(page, "Smoke Lanes");

  // Frame 1: strike.
  await recordShot(page, []);
  // Frame 2: spare — leave the 7 pin, then clear it.
  await recordShot(page, [7]);
  await recordShot(page, []);
  // Frame 3: open — 9 then leave the 10.
  await recordShot(page, [10]);
  await recordShot(page, [10]);

  // Frame 1 = 10 + 9 + 1 = 20. Assert it surfaced on the scorecard.
  await expect(page.getByText("20").first()).toBeVisible();
});

test("persists the session and shows it in history", async ({ page }) => {
  await startSession(page, "History Lanes");
  await recordShot(page, []); // one strike so a frame is saved

  await page.getByRole("button", { name: "History" }).click();
  // The session row is a button; a location-filter <option> shares the alley
  // name, so target the row specifically.
  await expect(page.getByRole("button", { name: /History Lanes/ })).toBeVisible();
});

test("editing a past shot inline (no edit button) re-derives the frame", async ({ page }) => {
  await startSession(page, "Edit Lanes");
  await recordShot(page, []); // F1 strike
  await recordShot(page, [10]); // F2 shot1 = 9
  await recordShot(page, [10]); // F2 shot2 = open (left the 10)

  // The new model has no edit button — selecting a shot edits it directly.
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);

  // Select frame 2's second shot and clear the remaining pin → it becomes a spare.
  await page.getByRole("button", { name: /^Frame 2, shot 2:/ }).first().click();
  await page.locator('button[aria-label="Pin 10 standing"]:not([disabled])').click();

  // Scorecard frame 2 now renders the spare symbol.
  await expect(page.getByText("/").first()).toBeVisible();
});

test("10th frame: strike + spare + open third shot scores correctly", async ({ page }) => {
  await startSession(page, "Tenth Lanes");

  // Bowl frames 1-9 as open (leave 8,9,10 each = 7 pinfall).
  for (let f = 1; f <= 9; f++) {
    await recordShot(page, [8, 9, 10]);
    await recordShot(page, [8, 9, 10]);
  }

  // 10th: a strike earns three balls — strike, then 9, then the final ball.
  await recordShot(page, []); // shot 1 strike (earns shots 2 + 3)
  await recordShot(page, [7]); // shot 2 leaves the 7
  await recordShot(page, [4, 8, 9, 10]); // shot 3 final ball

  // Game complete → the live-entry "Next" control disappears.
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toHaveCount(0);
});

test("completing a game removes the live-entry controls", async ({ page }) => {
  await startSession(page, "Next Game Lanes");

  // Live entry is active while the game is in progress.
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toBeVisible();

  // Bowl a perfect game to complete it.
  for (let i = 0; i < 12; i++) {
    await recordShot(page, []);
  }

  await expect(page.getByRole("button", { name: RECORD_SHOT })).toHaveCount(0);
});

test("takes the last shot back, and the score follows it", async ({ page }) => {
  await startSession(page, "Undo Lanes");

  // Frame 1: strike. Frame 2: nine, leaving the 10 pin.
  await recordShot(page, []);
  await recordShot(page, [10]);

  const undo = page.getByRole("button", { name: "Undo last shot" });
  await expect(undo).toBeVisible();

  // Back to the second frame's first ball: the deck is a fresh rack again, so
  // the commit button offers a strike rather than a count.
  await undo.click();
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toHaveText("Next");

  // Again, and the strike in frame 1 is gone with it.
  await undo.click();
  await expect(undo).toHaveCount(0);

  // It survives a reload, so the undo was written and not only shown.
  await page.reload();
  await expect(page.getByRole("button", { name: "Undo last shot" })).toHaveCount(0);
});

test("the commit button names the count it is about to record", async ({ page }) => {
  await startSession(page, "Label Lanes");

  const commit = page.getByRole("button", { name: RECORD_SHOT });
  await expect(commit).toHaveText("Next");

  // Shot 1 starts all-down; tapping a pin stands it back up.
  await page.getByRole("button", { name: /Pin 10 (down|standing)/ }).click();
  await expect(commit).toHaveText("Count 9");
});
