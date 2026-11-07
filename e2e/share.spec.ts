import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/** Bowl a full game so the session has a finished game to share. */
async function bowlAGame(page: Parameters<typeof recordShot>[0]) {
  await recordShot(page, []);
  await recordShot(page, [7]);
  await recordShot(page, []);
  await recordShot(page, [10]);
  await recordShot(page, [10]);
  for (let i = 0; i < 9; i++) await recordShot(page, []);
}

/**
 * What a game ending in a browser tab raises, in order, and the two pictures it
 * can be shared as. One game bowled for all of it: each step reads the same
 * finished game, and bowling it once per step was most of these tests' time.
 */
test("a finished game asks for a copy, then offers a share, and shares as a picture", async ({ page }) => {
  await startSession(page, "Sunset Lanes");

  // Nothing to lose yet: the session exists but no game is finished, and
  // asking now would train the user to ignore the prompt (ADR-068).
  await expect(page.getByText("Save a copy")).toHaveCount(0);

  await bowlAGame(page);

  // Playwright is a browser tab, never standalone, so the tab policy applies:
  // one unsaved session is enough.
  await expect(page.getByText("Saved on this phone only.", { exact: false })).toBeVisible();
  // The backup prompt outranks the share offer, so the offer is not up yet.
  await expect(page.getByText("Share the session?")).toHaveCount(0);

  // The close is the only dismissal now; while it is merely due, closing it
  // snoozes exactly as Later did (ADR-073).
  await page.getByRole("button", { name: "Dismiss backup reminder" }).click();
  await expect(page.getByText("Save a copy")).toHaveCount(0);

  // Then the share offer, which takes no for an answer.
  await expect(page.getByText("Share the session?")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss share offer" }).click();
  await expect(page.getByText("Share the session?")).toHaveCount(0);

  // The session, as a picture, from its header. The card is drawn on a canvas
  // and handed over as a blob; a preview that never resolves would leave the
  // user sharing something they cannot see.
  await page.getByRole("button", { name: "Share this session" }).click();
  const dialog = page.getByRole("dialog", { name: "Share image" });
  await expect(dialog).toBeVisible();
  const img = dialog.locator("img");
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", /^blob:/);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);

  // The stats on screen, filters and all. The share is the Stats header's one
  // action now, not an entry in a menu.
  await page.getByRole("button", { name: "Stats" }).last().click();
  await page.getByRole("button", { name: "Share these stats" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toHaveAttribute("src", /^blob:/);
});
