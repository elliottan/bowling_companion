import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

// A short screen, so three nights are enough to give the list something to
// scroll and to put the reader near the end of it while they do.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 420 } });

/** Mid-flight, a third of the way through the 0.4s slide. */
const MID_SLIDE = 140;
const AFTER_SLIDE = 600;

test("the header takes the list with it, and gives its space back exactly", async ({ page }) => {
  await clearDatabase(page);
  for (const alley of ["Alpha Lanes", "Beta Lanes", "Gamma Lanes"]) {
    await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
    await startSession(page, alley);
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

  await list.evaluate((el) => el.scrollBy(0, 200));
  await page.waitForTimeout(AFTER_SLIDE);
  const away = await geometry();

  // The header is gone and the list has the height it was holding. The bottom
  // edge does not move: the space comes off the top, not out of the screen.
  expect(away.heading).toBeLessThan(open.heading);
  expect(open.listTop - away.listTop).toBeCloseTo(open.heading - away.heading, 0);
  expect(away.listBottom).toBeCloseTo(open.listBottom, 0);

  // Near the end of a short list, the height the header just handed over
  // leaves less to scroll, and the browser pulls the position back to the new
  // end. That is not the reader turning around, so the header stays away.
  await page.waitForTimeout(AFTER_SLIDE);
  expect((await geometry()).heading).toBeCloseTo(away.heading, 0);

  // Coming back, the header and the list are one block: whatever one of them
  // has travelled part way through the slide, so has the other. They used to
  // move on two pipelines, and the list arrived somewhere the header had not.
  await list.evaluate((el) => el.scrollBy(0, -200));
  await page.waitForTimeout(MID_SLIDE);
  const mid = await geometry();
  expect(mid.heading - away.heading).toBeCloseTo(mid.listTop - away.listTop, 0);
  expect(mid.heading).toBeLessThan(open.heading);

  await page.waitForTimeout(AFTER_SLIDE);
  expect(await geometry()).toEqual(open);
});
