import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

// A short screen, so a handful of nights is enough to give the list something
// to scroll and to put the reader near the end of it while they do.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 420 } });

/** Mid-flight, a third of the way through the 0.4s slide. */
const MID_SLIDE = 140;
const AFTER_SLIDE = 600;

/** Where the header is, and where the list under it has got to. Read on one
 *  frame: two round trips land milliseconds apart, and mid-slide that is
 *  enough travel to muddy exactly what these tests measure. */
async function geometry(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector("div.overflow-y-auto") as HTMLElement;
    const card = scroller.querySelector("ul > li") as HTMLElement;
    return {
      heading: document.querySelector("h1")!.getBoundingClientRect().y,
      // A node inside the list, in screen coordinates: this is what the reader
      // watches, and it must answer to the finger and to nothing else.
      content: card.getBoundingClientRect().y,
      scrollTop: scroller.scrollTop,
      viewport: scroller.getBoundingClientRect().height
    };
  });
}

function scrollBy(page: import("@playwright/test").Page, by: number) {
  return page.evaluate(
    (d) => (document.querySelector("div.overflow-y-auto") as HTMLElement).scrollBy(0, d),
    by
  );
}

async function threeNights(page: import("@playwright/test").Page, alleys: string[]) {
  await clearDatabase(page);
  for (const alley of alleys) {
    await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
    await startSession(page, alley);
    for (let i = 0; i < 12; i++) await recordShot(page, []);
  }
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
}

test("the header leaves and returns without moving the list", async ({ page }) => {
  await threeNights(page, ["Alpha Lanes", "Beta Lanes", "Gamma Lanes"]);

  const open = await geometry(page);

  // Down past the threshold. The header goes; the list has moved by the scroll
  // and by nothing else, and the scroller is the same height it always was.
  await scrollBy(page, 60);
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
  await scrollBy(page, -30);
  await page.waitForTimeout(MID_SLIDE);
  const midBack = await geometry(page);
  expect(midBack.heading).toBeGreaterThan(away.heading);
  expect(midBack.content).toBeCloseTo(away.content + 30, 0);
  expect(midBack.viewport).toBeCloseTo(open.viewport, 0);

  await page.waitForTimeout(AFTER_SLIDE);
  const back = await geometry(page);
  expect(back.heading).toBeCloseTo(open.heading, 0);
  expect(back.content).toBeCloseTo(away.content + 30, 0);
  expect(back.scrollTop).toBeCloseTo(30, 0);
});

test("a filtered list is no different", async ({ page }) => {
  // Filters work both ends of the old rule against the reader: the chips make
  // the header nearly twice as tall, and the filter is there to leave fewer
  // sessions under it, so a flip used to move the list by half a screen.
  await threeNights(page, ["Alpha Lanes", "Alpha Lanes", "Alpha Lanes", "Beta Lanes"]);

  await page.getByRole("button", { name: /^Filters/ }).tap();
  await page.getByLabel("Alley").selectOption("Alpha Lanes");
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
  await threeNights(page, ["Alpha Lanes", "Beta Lanes", "Gamma Lanes"]);

  // The list runs under the header rather than starting below it, so what
  // guarantees the first card is readable is the space kept for the header at
  // the top of the list.
  const top = await page.evaluate(() => {
    const scroller = document.querySelector("div.overflow-y-auto") as HTMLElement;
    scroller.scrollTop = 0;
    const header = document.querySelector("h1")!.closest("div.collapsing-header")!;
    const card = scroller.querySelector("ul > li") as HTMLElement;
    return {
      headerBottom: header.getBoundingClientRect().bottom,
      cardTop: card.getBoundingClientRect().y
    };
  });
  expect(top.cardTop).toBeGreaterThanOrEqual(top.headerBottom - 1);
});
