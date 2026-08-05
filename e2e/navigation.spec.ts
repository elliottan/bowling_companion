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
  await page.getByRole("button", { name: "Arsenal", exact: true }).click();
  await expect(page).toHaveURL(/#\/home\/arsenal$/);

  await page.getByRole("button", { name: "Browse the catalog" }).click();
  await expect(page).toHaveURL(/#\/home\/arsenal\/catalog$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/home\/arsenal$/);
  await expect(page.getByRole("dialog", { name: "Ball Catalog" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Arsenal" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole("dialog", { name: "Arsenal" })).toHaveCount(0);
});

test("the in-app back control and the platform back agree", async ({ page }) => {
  await page.getByRole("button", { name: "Arsenal", exact: true }).click();
  await page.getByRole("button", { name: "Browse the catalog" }).click();

  // The nav-bar back control is the chevron alone (DESIGN-LANGUAGE 1).
  await page.getByRole("dialog", { name: "Ball Catalog" }).getByRole("button", { name: "Back" }).click();

  // One screen closed, not both: the control goes through history rather than
  // popping state itself, so it cannot double up with the platform gesture.
  await expect(page).toHaveURL(/#\/home\/arsenal$/);
  await expect(page.getByRole("dialog", { name: "Arsenal" })).toBeVisible();
});

test("a screen opened from the dashboard goes back to the dashboard", async ({ page }) => {
  await page.getByRole("button", { name: "Lane Notes" }).click();

  // Pushed over the tab it was opened from, not a jump into Settings: the URL
  // says so, the tab bar still reads Home, and the back control does not name a
  // screen the user never visited.
  await expect(page).toHaveURL(/#\/home\/lanes$/);
  const bar = page.getByRole("dialog", { name: "Lane Notes" });
  await expect(bar.getByRole("button", { name: "Back" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole("button", { name: "Start new session" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lane Notes" })).toHaveCount(0);
});

test("the same screen reached from Settings pushes inside the tab", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Lane Notes/ }).click();

  await expect(page).toHaveURL(/#\/settings\/lanes$/);
  await page.getByRole("region", { name: "Lane Notes" }).getByRole("button", { name: "Back" }).click();
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

  await page.getByRole("navigation").getByRole("button", { name: "Spares" }).click();
  await expect(page).toHaveURL(/#\/spares$/);

  // Back from a tab does not walk the tabs backwards.
  await page.goBack();
  await expect(page).not.toHaveURL(/#\/history$/);
});

test("a reload lands back on the screen you were on", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: "Spares" }).click();
  await expect(page).toHaveURL(/#\/spares$/);

  await page.reload();
  await expect(page).toHaveURL(/#\/spares$/);
  await expect(page.getByRole("heading", { name: "Spare Lines" })).toBeVisible();
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
  await expect(page.getByText(/no sessions yet/i)).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
});
