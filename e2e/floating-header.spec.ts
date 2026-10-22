import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

// A short screen, so a handful of nights is enough to give the list something
// to scroll and to put the reader near the end of it while they do.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 420 } });

const SCROLLER = "div.overflow-y-auto";

/** Where the header is, and where the list under it has got to. Read on one
 *  frame: two round trips land milliseconds apart, and mid-slide that is
 *  enough travel to muddy exactly what these tests measure. */
async function geometry(page: Page) {
  return page.evaluate((sel) => {
    const scroller = document.querySelector(sel) as HTMLElement;
    const card = scroller.querySelector("ul > li") as HTMLElement;
    return {
      heading: document.querySelector("h1")!.getBoundingClientRect().y,
      // A node inside the list, in screen coordinates: this is what the reader
      // watches, and it must answer to the finger and to nothing else.
      content: card.getBoundingClientRect().y,
      scrollTop: scroller.scrollTop,
      viewport: scroller.getBoundingClientRect().height
    };
  }, SCROLLER);
}

/** Scrolls, and answers with where that left the scroller. The tests assert on
 *  that before they read the header: a fixture that did not scroll would
 *  otherwise read as a header that refused to move. */
async function scrollBy(page: Page, by: number) {
  return page.evaluate(
    ([sel, d]) => {
      const scroller = document.querySelector(sel as string) as HTMLElement;
      scroller.scrollBy(0, d as number);
      return scroller.scrollTop;
    },
    [SCROLLER, by] as const
  );
}

/**
 * A History with enough nights in it to scroll, landed on and settled.
 *
 * The settling is the point. The screen paints before the sessions arrive from
 * IndexedDB, with a skeleton standing in, and a skeleton is both shorter than
 * the list and made of the same `ul > li` the tests measure. Measuring one, or
 * scrolling a list that is not there yet, is measuring nothing: it read as a
 * header that would not move, on CI, where the runner gets there first.
 */
async function history(page: Page, nights: number) {
  await clearDatabase(page);
  for (let i = 0; i < nights; i++) {
    await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
    await startSession(page, `Lane ${i + 1} Bowl`);
    for (let shot = 0; shot < 12; shot++) await recordShot(page, []);
  }
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  // The last night bowled is the first card, so its arrival is the real list's.
  await expect(page.getByRole("button", { name: new RegExp(`Lane ${nights} Bowl`) })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((sel) => {
        const scroller = document.querySelector(sel) as HTMLElement;
        return scroller.scrollHeight - scroller.clientHeight;
      }, SCROLLER)
    )
    .toBeGreaterThan(120);
}

test("the header stays put while the list scrolls under it", async ({ page }) => {
  await history(page, 5);
  const open = await geometry(page);

  // Down, then further down, then back: the title never moves, and the list
  // moves by the scroll and by nothing else (ADR-185).
  for (const by of [60, 120, -40]) {
    const before = await geometry(page);
    expect(await scrollBy(page, by)).toBeCloseTo(before.scrollTop + by, 0);
    await page.waitForTimeout(150);
    const now = await geometry(page);
    expect(now.heading).toBeCloseTo(open.heading, 0);
    expect(now.content).toBeCloseTo(before.content - by, 0);
    expect(now.viewport).toBeCloseTo(open.viewport, 0);
  }
});

test("the list passes under the header rather than stopping at its edge", async ({ page }) => {
  await history(page, 5);
  await scrollBy(page, 200);
  await page.waitForTimeout(150);
  const { headerBottom, firstCardTop } = await page.evaluate((sel) => {
    const header = document.querySelector("[data-floating-header]") as HTMLElement;
    const card = (document.querySelector(sel) as HTMLElement).querySelector("ul > li") as HTMLElement;
    return {
      headerBottom: header.getBoundingClientRect().bottom,
      firstCardTop: card.getBoundingClientRect().top
    };
  }, SCROLLER);
  // The first card has scrolled up behind the header, where the frosted ground
  // shows it through; the scroller was not cut off at the header's foot.
  expect(firstCardTop).toBeLessThan(headerBottom);
});

test("the wash is always on, and at the top of the list it frosts nothing", async ({ page }) => {
  await history(page, 5);
  const ground = page.locator("[data-floating-header] .floating-header-ground");
  // Never keyed to the scroll, so it cannot be missing while the list moves.
  await expect(ground).toHaveCSS("opacity", "1");
  // At rest the first card sits below the wash in full, not behind its blur.
  const { groundBottom, firstCardTop } = await page.evaluate((sel) => {
    const g = document.querySelector("[data-floating-header] .floating-header-ground") as HTMLElement;
    const card = (document.querySelector(sel) as HTMLElement).querySelector("ul > li") as HTMLElement;
    return { groundBottom: g.getBoundingClientRect().bottom, firstCardTop: card.getBoundingClientRect().top };
  }, SCROLLER);
  expect(firstCardTop).toBeGreaterThanOrEqual(groundBottom - 0.5);
  await scrollBy(page, 120);
  await expect(ground).toHaveCSS("opacity", "1");
});
