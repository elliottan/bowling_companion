import { expect, test } from "@playwright/test";

/**
 * The landing page is the one page every ad and every shared link opens, and
 * it carries no bundle, so nothing else in the suite renders it.
 */
test("every Open Headpin button goes to the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Remember every line you threw.");

  const ctas = page.getByRole("link", { name: "Open Headpin" });
  expect(await ctas.count()).toBeGreaterThanOrEqual(2);
  for (const href of await ctas.evaluateAll((els) => els.map((el) => el.getAttribute("href")))) {
    expect(href).toBe("/score");
  }
  // Not inside an in-app browser, so no notice about leaving one.
  await expect(page.locator("#inapp")).toBeHidden();
});

test.describe("inside Instagram's browser", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0"
  });

  /** That browser cannot add a page to the home screen, and scores kept there
   *  are not the ones Safari will open, so the page says how to get out. */
  test("says to open the page in a real browser", async ({ page }) => {
    await page.goto("/");
    const notice = page.locator("#inapp");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Instagram");
    await expect(notice).toContainText("Open in browser");
  });
});

test("the sticky bar appears once the hero's button scrolls away", async ({ page }) => {
  // The bar is a phone-width affordance; a wide window shows none.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const bar = page.locator("#sticky");
  await expect(bar).not.toHaveClass(/show/);
  await page.evaluate(() => window.scrollTo(0, 2000));
  await expect(bar).toHaveClass(/show/);
  await expect(bar.getByRole("link", { name: "Open Headpin" })).toHaveAttribute("href", "/score");
});
