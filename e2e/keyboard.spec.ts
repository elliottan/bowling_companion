import { expect, test, type Page } from "@playwright/test";
import { clearDatabase, seedFinishedSessions } from "./helpers";

/**
 * The web app's keyboard (ADR-255).
 *
 * Safari draws the on-screen keyboard over the page and shrinks only the
 * visual viewport, so a sheet fixed to the bottom stayed behind the keys with
 * the field that was tapped. No browser here raises a real keyboard, so the
 * visual viewport is stood in for, and shrunk by a keyboard's height when a
 * field takes focus, which is all the app reads.
 */

const KEYBOARD = 336;

/** A visual viewport the test can shrink, put in place before the app loads. */
async function standInViewport(page: Page) {
  await page.addInitScript(() => {
    const target = new EventTarget();
    const vv = Object.assign(target, {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1
    });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    (window as unknown as { __keyboard: (px: number) => void }).__keyboard = (px: number) => {
      vv.height = window.innerHeight - px;
      vv.dispatchEvent(new Event("resize"));
    };
  });
}

const raiseKeyboard = (page: Page) =>
  page.evaluate((px) => (window as unknown as { __keyboard: (px: number) => void }).__keyboard(px), KEYBOARD);
const lowerKeyboard = (page: Page) =>
  page.evaluate(() => (window as unknown as { __keyboard: (px: number) => void }).__keyboard(0));

test("a sheet rides up on the keyboard, and the field typed into stays above it", async ({ page }) => {
  await standInViewport(page);
  await clearDatabase(page);
  await seedFinishedSessions(page, ["Alpha Lanes", "Beta Lanes"]);
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("button", { name: /^Filters/ }).click();

  const sheet = page.getByRole("dialog", { name: "Filters" });
  const field = sheet.getByRole("combobox", { name: "Oil pattern" }).or(sheet.getByLabel("Oil pattern"));
  await field.first().focus();
  await raiseKeyboard(page);

  const visibleBottom = (page.viewportSize()?.height ?? 844) - KEYBOARD;
  // The field is wholly in the strip the keyboard leaves.
  await expect
    .poll(async () => (await field.first().boundingBox())!.y + (await field.first().boundingBox())!.height)
    .toBeLessThanOrEqual(visibleBottom);
  // And the sheet's panel ends above the keys rather than behind them.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Filters"]');
        const panel = dialog?.lastElementChild as HTMLElement | null;
        return panel ? panel.getBoundingClientRect().bottom : Infinity;
      })
    )
    .toBeLessThanOrEqual(visibleBottom);

  // The keyboard gone with the field left, the sheet settles back down.
  await field.first().blur();
  await lowerKeyboard(page);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--keyboard-inset").trim()))
    .toBe("0px");
});
