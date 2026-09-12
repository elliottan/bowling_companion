import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

// A short screen, so a handful of nights is enough to give the list something
// to scroll and to put the reader near the end of it while they do.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 420 } });

/** Mid-flight, a third of the way through the 0.4s slide. */
const MID_SLIDE = 140;
const AFTER_SLIDE = 600;

test("the header takes the list with it, and gives its space back exactly", async ({ page }) => {
  await clearDatabase(page);
  // Enough nights that the list can spare the header: it only goes away when
  // what is left to scroll without it is still worth more than the header.
  for (const alley of ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"]) {
    await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
    await startSession(page, `${alley} Lanes`);
    for (let i = 0; i < 12; i++) await recordShot(page, []);
  }
  await page.getByRole("button", { name: "History" }).click();

  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  const list = page.locator("div.overflow-y-auto").first();

  // Both boxes are read on one frame. Two round trips land milliseconds apart,
  // and mid-slide that is enough travel to look like the drift this is here to
  // rule out.
  async function geometry() {
    return page.evaluate(() => {
      const head = document.querySelector("h1")!.getBoundingClientRect();
      const box = document.querySelector("div.overflow-y-auto")!.getBoundingClientRect();
      return { heading: head.y, listTop: box.y, listBottom: box.bottom };
    });
  }

  const open = await geometry();

  // Far enough to earn the flip, and not so far that the shorter list this
  // leaves would have to pull the reader back: that list does not flip at all.
  await list.evaluate((el) => el.scrollBy(0, 60));
  await page.waitForTimeout(AFTER_SLIDE);
  const away = await geometry();

  // The header is gone and the list has the height it was holding. The bottom
  // edge does not move: the space comes off the top, not out of the screen.
  expect(away.heading).toBeLessThan(open.heading);
  expect(open.listTop - away.listTop).toBeCloseTo(open.heading - away.heading, 0);
  expect(away.listBottom).toBeCloseTo(open.listBottom, 0);

  // Reading on to the end does not bring it back. The height it handed over
  // leaves less to scroll, and the browser settling into the new end is not
  // the reader turning around.
  await list.evaluate((el) => el.scrollBy(0, 400));
  await page.waitForTimeout(AFTER_SLIDE);
  expect((await geometry()).heading).toBeCloseTo(away.heading, 0);

  // Coming back, the header and the list are one block: whatever one of them
  // has travelled part way through the slide, so has the other. They used to
  // move on two pipelines, and the list arrived somewhere the header had not.
  await list.evaluate((el) => el.scrollBy(0, -40));
  await page.waitForTimeout(MID_SLIDE);
  const mid = await geometry();
  expect(mid.heading - away.heading).toBeCloseTo(mid.listTop - away.listTop, 0);
  expect(mid.heading).toBeLessThan(open.heading);

  await page.waitForTimeout(AFTER_SLIDE);
  expect(await geometry()).toEqual(open);
});

test("a list too short to spare the header keeps it", async ({ page }) => {
  await clearDatabase(page);
  for (const alley of ["Alpha Lanes", "Alpha Lanes", "Alpha Lanes", "Beta Lanes"]) {
    await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
    await startSession(page, alley);
    for (let i = 0; i < 12; i++) await recordShot(page, []);
  }
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  // Applying a filter works both ends of the rule against the reader: the chips
  // make the header nearly twice as tall, and the filter is there to leave
  // fewer sessions under it. Flipping here would hand the list a height it
  // cannot use, and the browser would pull the content back to the new end,
  // which is the list lurching further than the finger asked for.
  await page.getByRole("button", { name: /^Filters/ }).tap();
  await page.getByLabel("Alley").selectOption("Alpha Lanes");
  await page.getByRole("dialog", { name: "Filters" }).getByRole("button", { name: "Close" }).tap();
  await expect(page.getByRole("dialog", { name: "Filters" })).toHaveCount(0);

  const headingY = () => page.evaluate(() => document.querySelector("h1")!.getBoundingClientRect().y);
  const at_rest = await headingY();

  for (const by of [120, 400, -40, -400]) {
    await page.evaluate(
      (d) => (document.querySelector("div.overflow-y-auto") as HTMLElement).scrollBy(0, d),
      by
    );
    await page.waitForTimeout(AFTER_SLIDE);
    expect(await headingY()).toBe(at_rest);
  }
});
