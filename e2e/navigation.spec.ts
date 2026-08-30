import { expect, test } from "@playwright/test";
import { clearDatabase, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/**
 * The browser's back is the app's only back (see `lib/useHistoryRoute.ts`), so
 * these drive the real thing: `page.goBack()` is the same event Android's
 * hardware back and iOS's left-edge swipe deliver.
 */
test("the platform back button pops one screen at a time", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Arsenal/ }).click();
  await expect(page).toHaveURL(/#\/settings\/arsenal$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole("dialog", { name: "Arsenal" })).toHaveCount(0);
});

test("an overlay named like a Settings section is still the overlay", async ({ page }) => {
  // `#/settings/arsenal` used to read back as the Settings section "arsenal",
  // so backing out of the catalog landed on Backup & restore.
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Arsenal/ }).click();
  await page.getByRole("dialog", { name: "Arsenal" }).getByRole("button", { name: "Back" }).click();

  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Backup & restore" })).toHaveCount(0);
});

test("the in-app back control and the platform back agree", async ({ page }) => {
  await page.getByRole("button", { name: "Catalog" }).click();
  await page.getByPlaceholder("Search name, brand, coverstock…").fill("phaze");
  await page.getByRole("button", { name: /Phaze/i }).first().click();
  await expect(page).toHaveURL(/#\/home\/catalog\/ball\/[a-z0-9-]+$/);

  // The nav-bar back control is the chevron alone (DESIGN-LANGUAGE 1).
  await page.getByRole("button", { name: "Back" }).last().click();

  // One screen closed, not both: the control goes through history rather than
  // popping state itself, so it cannot double up with the platform gesture.
  await expect(page).toHaveURL(/#\/home\/catalog$/);
  await expect(page.getByRole("dialog", { name: "Ball catalog" })).toBeVisible();
});

test("back from a catalog ball closes the ball, not the catalog", async ({ page }) => {
  await page.getByRole("button", { name: "Catalog" }).click();
  await expect(page).toHaveURL(/#\/home\/catalog$/);

  await page.getByPlaceholder("Search name, brand, coverstock…").fill("phaze");
  await page.getByRole("button", { name: /Phaze/i }).first().click();
  // The detail is a place of its own, so it names the ball in the URL.
  await expect(page).toHaveURL(/#\/home\/catalog\/ball\/[a-z0-9-]+$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/home\/catalog$/);
  await expect(page.getByRole("dialog", { name: "Ball catalog" })).toBeVisible();
});

test("a screen opened from the dashboard goes back to the dashboard", async ({ page }) => {
  await page.getByRole("button", { name: "Lane notes" }).click();

  // Pushed over the tab it was opened from, not a jump into Settings: the URL
  // says so, the tab bar still reads Home, and the back control does not name a
  // screen the user never visited.
  await expect(page).toHaveURL(/#\/home\/lanes$/);
  const bar = page.getByRole("dialog", { name: "Lane notes" });
  await expect(bar.getByRole("button", { name: "Back" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole("button", { name: "Start new session" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lane notes" })).toHaveCount(0);
});

test("the same screen reached from Settings pushes inside the tab", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Lane notes/ }).click();

  await expect(page).toHaveURL(/#\/settings\/section\/lanes$/);
  await page.getByRole("region", { name: "Lane notes" }).getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/#\/settings$/);
});

test("back closes the sheet in front before the screen behind it", async ({ page }) => {
  await page.getByRole("button", { name: "Arsenal", exact: true }).click();
  await page.getByRole("button", { name: "Add ball" }).first().click();
  const editor = page.getByPlaceholder("e.g. Storm Phaze II");
  await expect(editor).toBeVisible();

  // The sheet is the layer the user sees, so it is what back closes; the
  // arsenal underneath, and the URL, stay put.
  await page.goBack();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Arsenal" })).toBeVisible();
  await expect(page).toHaveURL(/#\/home\/arsenal$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
});

test("a tab switch does not stack history, so back still leaves the app", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: "History" }).click();
  await expect(page).toHaveURL(/#\/history$/);

  await page.getByRole("navigation").getByRole("button", { name: "Stats" }).click();
  await expect(page).toHaveURL(/#\/stats$/);

  // Back from a tab does not walk the tabs backwards.
  await page.goBack();
  await expect(page).not.toHaveURL(/#\/history$/);
});

test("a reload lands back on the screen you were on", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: "Stats" }).click();
  await expect(page).toHaveURL(/#\/stats$/);

  await page.reload();
  await expect(page).toHaveURL(/#\/stats$/);
  await expect(page.getByRole("heading", { name: "Stats", exact: true })).toBeVisible();
});

test("a session survives a reload, and the URL names it", async ({ page }) => {
  await startSession(page, "Route Lanes");
  await expect(page).toHaveURL(/#\/session\/\d+$/);
  const url = page.url();

  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
});

test("an unreadable link opens the app rather than breaking it", async ({ page }) => {
  await page.goto("/#/not-a-screen/nonsense");
  await expect(page.getByText(/score your first night/i)).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
});
