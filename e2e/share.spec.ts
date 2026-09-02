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

test("shares a session as a picture, from the session header", async ({ page }) => {
  await startSession(page, "Sunset Lanes");
  await bowlAGame(page);

  await page.getByRole("button", { name: "Share this session" }).click();

  const dialog = page.getByRole("dialog", { name: "Share image" });
  await expect(dialog).toBeVisible();

  // The card is drawn on a canvas and handed over as a blob; a preview that
  // never resolves would leave the user sharing something they cannot see.
  const img = dialog.locator("img");
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", /^blob:/);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
});

test("offers to share once a game is finished, and takes no for an answer", async ({ page }) => {
  await startSession(page, "Sunset Lanes");
  await bowlAGame(page);

  // The backup prompt outranks the share offer, so the offer is not up yet.
  await expect(page.getByText("Share the session?")).toHaveCount(0);
  await page.getByRole("button", { name: "Dismiss backup reminder" }).click();

  await expect(page.getByText("Share the session?")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss share offer" }).click();
  await expect(page.getByText("Share the session?")).toHaveCount(0);
});

test("shares the stats currently on screen, filters and all", async ({ page }) => {
  await startSession(page, "Sunset Lanes");
  await bowlAGame(page);

  await page.getByRole("button", { name: "Stats" }).last().click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Share these stats" }).click();

  const dialog = page.getByRole("dialog", { name: "Share image" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toHaveAttribute("src", /^blob:/);
});
