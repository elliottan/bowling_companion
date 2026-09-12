import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

// A short screen, so a handful of nights is enough to give the list something
// to scroll and to put the reader near the end of it while they do.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 420 } });

/** Mid-flight, a third of the way through the 0.4s slide. */
const MID_SLIDE = 140;
const AFTER_SLIDE = 600;

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

test("the header leaves and returns without moving the list", async ({ page }) => {
  await history(page, 5);

  const open = await geometry(page);

  // Down past the threshold. The header goes; the list has moved by the scroll
  // and by nothing else, and the scroller is the same height it always was.
  expect(await scrollBy(page, 60)).toBeCloseTo(open.scrollTop + 60, 0);
  await page.waitForTimeout(MID_SLIDE);
  const midOut = await geometry(page);
  expect(midOut.heading).toBeLessThan(open.heading);
  expect(midOut.content).toBeCloseTo(open.content - 60, 0);
  expect(midOut.viewport).toBeCloseTo(open.viewport, 0);

  await page.waitForTimeout(AFTER_SLIDE);
  const away = await geometry(page);
  expect(away.content).toBeCloseTo(open.content - 60, 0);
  expect(away.viewport).toBeCloseTo(open.viewport, 0);

  // Back up past the threshold. The header comes back over the list, which has
  // again moved by the scroll and by nothing else. This is the whole point: the
  // header used to hand its height to the list and take it back, so every flip
  // shoved the list by a header on top of what the reader was doing.
  expect(await scrollBy(page, -30)).toBeCloseTo(away.scrollTop - 30, 0);
  await page.waitForTimeout(MID_SLIDE);
  const midBack = await geometry(page);
  expect(midBack.heading).toBeGreaterThan(away.heading);
  expect(midBack.content).toBeCloseTo(away.content + 30, 0);
  expect(midBack.viewport).toBeCloseTo(open.viewport, 0);

  await page.waitForTimeout(AFTER_SLIDE);
  const back = await geometry(page);
  expect(back.heading).toBeCloseTo(open.heading, 0);
  expect(back.content).toBeCloseTo(away.content + 30, 0);
});

test("a filtered list is no different", async ({ page }) => {
  // Filters work both ends of the old rule against the reader: the chips make
  // the header nearly twice as tall, and the filter is there to leave fewer
  // sessions under it, so a flip used to move the list by half a screen.
  await history(page, 6);

  await page.getByRole("button", { name: /^Filters/ }).tap();
  await page.getByLabel("Alley").selectOption("Lane 6 Bowl");
  await page.getByRole("dialog", { name: "Filters" }).getByRole("button", { name: "Close" }).tap();
  await expect(page.getByRole("dialog", { name: "Filters" })).toHaveCount(0);

  let last = await geometry(page);
  for (const by of [40, 40, -40, -40]) {
    await scrollBy(page, by);
    await page.waitForTimeout(AFTER_SLIDE);
    const now = await geometry(page);
    // However the header answered that scroll, the list travelled the distance
    // the scroll actually covered and no more.
    expect(now.content).toBeCloseTo(last.content - (now.scrollTop - last.scrollTop), 0);
    expect(now.viewport).toBeCloseTo(last.viewport, 0);
    last = now;
  }
});

test("the top of the list is never hidden behind the header", async ({ page }) => {
  await history(page, 5);

  // The list runs under the header rather than starting below it, so what
  // guarantees the first card is readable is the space kept for the header at
  // the top of the list.
  const top = await page.evaluate((sel) => {
    const scroller = document.querySelector(sel) as HTMLElement;
    scroller.scrollTop = 0;
    const header = document.querySelector("h1")!.closest("div.collapsing-header")!;
    const card = scroller.querySelector("ul > li") as HTMLElement;
    return {
      headerBottom: header.getBoundingClientRect().bottom,
      cardTop: card.getBoundingClientRect().y
    };
  }, SCROLLER);
  expect(top.cardTop).toBeGreaterThanOrEqual(top.headerBottom - 1);
});
