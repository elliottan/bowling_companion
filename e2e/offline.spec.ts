import { expect, test } from "@playwright/test";
import { RECORD_SHOT, clearDatabase, recordShot, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/**
 * The whole pitch is that the app works on a lane with no signal. Nothing
 * tested it: every other spec runs online against the dev server, so a change
 * that made a screen depend on the network would have shipped green.
 *
 * The dev server has no service worker (see playwright.config.ts), so this
 * cannot check a cold offline boot; that is the manual check in
 * docs/DEPLOYMENT.md. What it does check is the part that is the app's own
 * doing: everything is on the device, so nothing a bowler does mid-session
 * needs the network.
 */
test("a session carries on with the network gone, and survives a reload", async ({
  page,
  context
}) => {
  await startSession(page, "Offline Lanes");
  await recordShot(page, []);

  await context.setOffline(true);

  // Frame 2: nine, then the spare. Both recorded with no network at all.
  await recordShot(page, [10]);
  await recordShot(page, []);
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toBeVisible();

  // Frame 1 = 10 + 9 + 1 = 20, so the score was computed on the device too.
  await expect(page.getByText("20").first()).toBeVisible();

  // Back online, then a full navigation rather than a reload: a reload issued
  // on the same tick the network comes back races Chromium's own abort of the
  // request it had already started offline.
  await context.setOffline(false);
  await page.goto(page.url());

  await expect(page.getByText("Offline Lanes")).toBeVisible();
  await expect(page.getByText("20").first()).toBeVisible();
});

test("the theme and the handedness stick across a reload", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Appearance/ }).first().click();

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  // Resolved before the first paint by the inline script in score/index.html,
  // which is the whole point of that script.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Preferences/ }).first().click();
  await page.getByRole("button", { name: "Left-handed" }).click();

  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Preferences/ }).first().click();
  await expect(page.getByRole("button", { name: "Left-handed" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
