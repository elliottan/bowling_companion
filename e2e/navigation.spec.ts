import { expect, test } from "@playwright/test";
import { RECORD_SHOT, clearDatabase, openSessionForm, recordShot, startSession, seedFinishedSessions, openArsenalFromHome } from "./helpers";

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
  await page.goto("/app/?pro#/settings/arsenal");
  await page.getByRole("dialog", { name: "Arsenal" }).getByRole("button", { name: "Back", exact: true }).click();

  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Backup & restore" })).toHaveCount(0);
});

test("back from a catalog ball closes the ball, not the catalog, by either back", async ({ page }) => {
  await page.getByRole("button", { name: "Catalog" }).click();
  await expect(page).toHaveURL(/#\/home\/catalog$/);
  await page.getByPlaceholder("Search name, brand, coverstock…").fill("phaze");
  const ball = page.getByRole("button", { name: /Phaze/i }).first();

  // The platform back.
  await ball.click();
  // The detail is a place of its own, so it names the ball in the URL.
  await expect(page).toHaveURL(/#\/home\/catalog\/ball\/[a-z0-9-]+$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/home\/catalog$/);
  await expect(page.getByRole("dialog", { name: "Catalog" })).toBeVisible();

  // The in-app back control agrees. The nav-bar back control is the chevron
  // alone (DESIGN-LANGUAGE 1), and it closes one screen, not both: it goes
  // through history rather than popping state itself, so it cannot double up
  // with the platform gesture.
  await ball.click();
  await expect(page).toHaveURL(/#\/home\/catalog\/ball\/[a-z0-9-]+$/);
  await page.getByRole("button", { name: "Back", exact: true }).last().click();
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
  await expect(page.getByRole("button", { name: "Start scoring" })).toBeVisible();
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
  await page.getByRole("button", { name: "Add ball", exact: true }).first().click();
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
  await page.goto("/app?pro#/not-a-screen/nonsense");
  await expect(page.getByText(/score your first session/i)).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
});

test("back closes the oil pattern manager, not the session form under it", async ({ page }) => {
  await openSessionForm(page);
  await page.getByPlaceholder("League, practice, tournament…").fill("keep me");

  // The manager used to be a hand-rolled fixed overlay with no Escape and no
  // place on the back stack, so Android's back closed the form underneath and
  // took everything typed into it.
  await page.getByRole("button", { name: "Manage oil patterns" }).click();
  await expect(page.getByRole("dialog", { name: "Oil patterns" })).toBeVisible();

  await page.goBack();

  await expect(page.getByRole("dialog", { name: "Oil patterns" })).toHaveCount(0);
  await expect(page.getByPlaceholder("League, practice, tournament…")).toHaveValue("keep me");
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
  //
  // One finished game first: with nothing to read, Stats hides its share
  // (ADR-150), and it reads finished games only (ADR-216).
  await seedFinishedSessions(page, ["Push Lanes"]);
  await page.goto("/app/?pro#/home/game-plan");
  await expect(page.getByRole("dialog", { name: "Alley report" })).toBeVisible();

  await page.goto("/app/?pro#/home/game-plan/stats-push");

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
  // A perfect game, stored, so nothing is left to finish and the session is a
  // thing to read rather than a thing to bowl. Seeded rather than bowled: the
  // subject is where the session opens, and a game bowled through the scorer
  // is drawn finished a render before the score that makes it so is stored,
  // which a navigation straight after it could race.
  await seedFinishedSessions(page, ["Read Lanes"]);

  // Straight to History by URL, which starts the back stack fresh.
  await page.goto("/app/?pro#/history");
  await expect(page).toHaveURL(/#\/history$/);
  await page.getByRole("button", { name: /Read Lanes/ }).click();

  // Pushed over History, not loaded into the Active tab.
  await expect(page).toHaveURL(/#\/history\/session\/\d+$/);
  await expect(page.getByRole("dialog", { name: "Read Lanes", exact: true })).toBeVisible();

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
  await expect(page.getByRole("dialog", { name: "Read Lanes", exact: true })).toHaveCount(0);
});

test("the screen's own back, with the session sheet up, leaves cleanly", async ({ page }) => {
  await seedFinishedSessions(page, ["Chevron Lanes"]);

  await page.goto("/app/?pro#/history");
  await page.getByRole("button", { name: /Chevron Lanes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Session sheet" });
  await expect(sheet).toBeVisible();

  // The sheet leaves the header above it live, back chevron included. That
  // back used to pop only the sheet's history entry: the sheet closed, the
  // screen played its exit and stayed mounted, invisible, over History, and
  // nothing under it answered a tap again.
  await page.getByRole("dialog", { name: "Chevron Lanes", exact: true })
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.getByRole("dialog", { name: "Chevron Lanes", exact: true })).toHaveCount(0);
  await expect(sheet).toHaveCount(0);

  // And the screen underneath still works.
  await page.getByRole("button", { name: /Chevron Lanes/ }).click();
  await expect(page.getByRole("dialog", { name: "Chevron Lanes", exact: true })).toBeVisible();
});

test("share opens over the session sheet, and back closes one layer at a time", async ({ page }) => {
  await seedFinishedSessions(page, ["Layer Lanes"]);

  await page.goto("/app/?pro#/history");
  await page.getByRole("button", { name: /Layer Lanes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Session sheet" });
  await expect(sheet).toBeVisible();

  await page.getByRole("button", { name: "Share this session" }).click();
  const share = page.getByRole("dialog", { name: "Share image" });
  await expect(share).toBeVisible();
  // The card is drawn on a canvas and handed over as a blob; a preview that
  // never resolves would leave the user sharing something they cannot see.
  await expect(share.locator("img")).toHaveAttribute("src", /^blob:/);
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

test("the session sheet rises without overshooting its resting place", async ({ page }) => {
  await startSession(page, "Rise Lanes");
  await recordShot(page, []);
  await page.getByRole("button", { name: "Session stats", exact: true }).first().click();

  // Sample the panel's top edge every frame of the slide. Focus used to land on
  // its first button while it was still below the screen, which scrolled the
  // sheet's box to reveal it: the panel jumped past its resting place and
  // settled back, the bounce seen on iPhone.
  // The clock starts when the sheet is first in the page, not at the click: on a
  // loaded runner its chunk can take most of a fixed window to arrive, leaving
  // too few frames of the slide to judge it by.
  const samples = await page.evaluate(async () => {
    const tops: Array<{ top: number; scroll: number }> = [];
    const started = performance.now();
    let t0: number | null = null;
    while (performance.now() - started < 3000) {
      const root = document.querySelector('[aria-label="Session sheet"]') as HTMLElement | null;
      const panel = root?.firstElementChild as HTMLElement | null;
      if (root && panel) {
        t0 ??= performance.now();
        tops.push({ top: panel.getBoundingClientRect().top, scroll: root.scrollTop });
        if (performance.now() - t0 >= 450 && tops.length > 3) break;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return tops;
  });
  expect(samples.length).toBeGreaterThan(3);
  const rest = samples[samples.length - 1].top;
  for (const s of samples) {
    expect(s.scroll).toBe(0);
    expect(s.top).toBeGreaterThanOrEqual(rest - 1);
  }
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
