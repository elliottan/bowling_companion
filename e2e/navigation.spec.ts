import { expect, test } from "@playwright/test";
import { RECORD_SHOT, clearDatabase, recordShot, startSession, waitForScoresPersisted, openArsenalFromHome } from "./helpers";

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
  await page.getByRole("button", { name: /Backup & restore/ }).click();
  await expect(page).toHaveURL(/#\/settings\/backup$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole("dialog", { name: "Backup & restore" })).toHaveCount(0);
});

test("an overlay named like a Settings section is still the overlay", async ({ page }) => {
  // `#/settings/arsenal` used to read back as the Settings section "arsenal",
  // so backing out of the catalog landed on Backup & restore. Settings no
  // longer lists the arsenal (ADR-115), so the link is followed directly.
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.goto("/score/#/settings/arsenal");
  await page.getByRole("dialog", { name: "Arsenal" }).getByRole("button", { name: "Back", exact: true }).click();

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
  await page.getByRole("button", { name: "Back", exact: true }).last().click();

  // One screen closed, not both: the control goes through history rather than
  // popping state itself, so it cannot double up with the platform gesture.
  await expect(page).toHaveURL(/#\/home\/catalog$/);
  await expect(page.getByRole("dialog", { name: "Catalog" })).toBeVisible();
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
  await expect(page.getByRole("dialog", { name: "Catalog" })).toBeVisible();
});

test("a screen opened from the dashboard goes back to the dashboard", async ({ page }) => {
  await page.getByRole("button", { name: "Lane notes" }).click();

  // Pushed over the tab it was opened from, not a jump into Settings: the URL
  // says so, the tab bar still reads Home, and the back control does not name a
  // screen the user never visited.
  await expect(page).toHaveURL(/#\/home\/lanes$/);
  const bar = page.getByRole("dialog", { name: "Lane notes" });
  await expect(bar.getByRole("button", { name: "Back", exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole("button", { name: "Start session" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lane notes" })).toHaveCount(0);
});

test("the same screen reached from Settings pushes inside the tab", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Appearance/ }).click();

  await expect(page).toHaveURL(/#\/settings\/section\/appearance$/);
  await page.getByRole("region", { name: "Appearance" }).getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/#\/settings$/);
});

test("back closes the sheet in front before the screen behind it", async ({ page }) => {
  await openArsenalFromHome(page);
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
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toBeVisible();
});

test("an unreadable link opens the app rather than breaking it", async ({ page }) => {
  await page.goto("/score#/not-a-screen/nonsense");
  await expect(page.getByText(/score your first session/i)).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
});

test("back closes the oil pattern manager, not the session form under it", async ({ page }) => {
  await page.getByRole("button", { name: "Start session" }).first().click();
  await page.getByPlaceholder("Ball choice, surface, carry…").fill("keep me");

  // The manager used to be a hand-rolled fixed overlay with no Escape and no
  // place on the back stack, so Android's back closed the form underneath and
  // took everything typed into it.
  await page.getByRole("button", { name: "Manage oil patterns" }).click();
  await expect(page.getByRole("dialog", { name: "Oil patterns" })).toBeVisible();

  await page.goBack();

  await expect(page.getByRole("dialog", { name: "Oil patterns" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Ball choice, surface, carry…")).toHaveValue("keep me");
});

test("Stats opened from the alley report is a push, and back returns to it", async ({ page }) => {
  // Driven by URL rather than by tapping a callout: a callout needs six games
  // at one alley behind it, and what is under test here is the shape of the
  // hand-off, not the thresholds that produce one.
  //
  // Through the game plan rather than straight at the pair, because that is
  // what the hand-off does. A deep link lands the whole stack in one history
  // entry, so back would leave the app with nothing to return to, which is the
  // right behaviour for a link and the wrong test for a push.
  await page.goto("/score/#/home/game-plan");
  await expect(page.getByRole("dialog", { name: "Alley report" })).toBeVisible();

  await page.goto("/score/#/home/game-plan/stats-push");

  const stats = page.getByRole("dialog", { name: "Stats" });
  await expect(stats).toBeVisible();
  // Named exactly once. The nav bar carries the title, so the screen suppresses
  // the heading it wears as a tab: two of them read as two screens.
  await expect(stats.getByRole("heading", { name: "Stats", exact: true })).toHaveCount(1);
  // The controls that belong to the filter chips stay with them.
  await expect(stats.getByRole("button", { name: "Share these stats" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/home\/game-plan$/);
  await expect(page.getByRole("dialog", { name: "Alley report" })).toBeVisible();
});

/**
 * Which of the two a session opens as is read from the session, not chosen by
 * the list that holds it: one with a game still to finish is one you are
 * bowling, anything else is one you are reading (ADR-084).
 */
test("a finished session opened from History pushes, and back returns to History", async ({
  page
}) => {
  await startSession(page, "Read Lanes");
  // A perfect game, so nothing is left to finish and the session is a thing to
  // read rather than a thing to bowl.
  for (let i = 0; i < 12; i++) await recordShot(page, []);
  // Assert the precondition rather than assume it. The live-entry control going
  // away is how a finished game shows itself, and waiting for it is what makes
  // the read behind the tap below see a scored game: without this the loop can
  // return with the tenth frame still open, the session is then one you are
  // still bowling, and it correctly opens in the Active tab instead.
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toHaveCount(0);
  // And wait for the score to be stored, not merely drawn: the navigation
  // below is a fresh page load, and it would otherwise race the write that
  // makes this session one to read rather than one to bowl.
  await waitForScoresPersisted(page);

  // Straight to History by URL, which starts the back stack fresh: bowling the
  // game walked through the scorer and raised the backup and share prompts,
  // and each of those leaves entries of its own behind.
  await page.goto("/score/#/history");
  await expect(page).toHaveURL(/#\/history$/);
  await page.getByRole("button", { name: /Read Lanes/ }).click();

  // Pushed over History, not loaded into the Active tab.
  await expect(page).toHaveURL(/#\/history\/session\/\d+$/);
  await expect(page.getByRole("dialog", { name: "Session", exact: true })).toBeVisible();

  // A finished session lands with its panel already up, on its stats
  // (SessionHistory opens one with openStats), and back closes the sheet in
  // front before the screen behind it. So the first back is the panel's, not
  // the push's.
  const sheet = page.getByRole("dialog", { name: "Session sheet" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Stats" })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/#\/history\/session\/\d+$/);

  // The push's own back, which is what this test is about.
  await page.goBack();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.getByRole("dialog", { name: "Session", exact: true })).toHaveCount(0);
});

test("the screen's own back, with the session sheet up, leaves cleanly", async ({ page }) => {
  await startSession(page, "Chevron Lanes");
  for (let i = 0; i < 12; i++) await recordShot(page, []);
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toHaveCount(0);
  await waitForScoresPersisted(page);

  await page.goto("/score/#/history");
  await page.getByRole("button", { name: /Chevron Lanes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Session sheet" });
  await expect(sheet).toBeVisible();

  // The sheet leaves the header above it live, back chevron included. That
  // back used to pop only the sheet's history entry: the sheet closed, the
  // screen played its exit and stayed mounted, invisible, over History, and
  // nothing under it answered a tap again.
  await page.getByRole("dialog", { name: "Session", exact: true })
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.getByRole("dialog", { name: "Session", exact: true })).toHaveCount(0);
  await expect(sheet).toHaveCount(0);

  // And the screen underneath still works.
  await page.getByRole("button", { name: /Chevron Lanes/ }).click();
  await expect(page.getByRole("dialog", { name: "Session", exact: true })).toBeVisible();
});

test("share opens over the session sheet, and back closes one layer at a time", async ({ page }) => {
  await startSession(page, "Layer Lanes");
  for (let i = 0; i < 12; i++) await recordShot(page, []);
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toHaveCount(0);
  await waitForScoresPersisted(page);

  await page.goto("/score/#/history");
  await page.getByRole("button", { name: /Layer Lanes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Session sheet" });
  await expect(sheet).toBeVisible();

  await page.getByRole("button", { name: "Share this session" }).click();
  const share = page.getByRole("dialog", { name: "Share image" });
  await expect(share).toBeVisible();
  // On top: the share's own controls take the tap, not the sheet under it.
  await expect(share.getByRole("button").first()).toBeEnabled();
  await share.getByRole("button").first().click({ trial: true });
  await expect(sheet).toBeVisible();

  await page.goBack();
  await expect(share).toHaveCount(0);
  await expect(sheet).toBeVisible();

  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/#\/history\/session\/\d+$/);
});

test("a session with a game still to finish opens in the Active tab", async ({ page }) => {
  await startSession(page, "Bowling Lanes");
  await recordShot(page, []); // one frame, ten still to go

  await page.getByRole("navigation").getByRole("button", { name: "History" }).click();
  await page.getByRole("button", { name: /Bowling Lanes/ }).click();

  // The one place scoring happens, so the live-entry control is there.
  await expect(page).toHaveURL(/#\/session\/\d+$/);
  await expect(page.getByRole("button", { name: RECORD_SHOT })).toBeVisible();
});
