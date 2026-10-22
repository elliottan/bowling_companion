import { expect, test } from "@playwright/test";

// A short screen, so Settings has somewhere to scroll.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 420 } });

test("Settings' large title moves into the bar as the page scrolls (ADR-191)", async ({ page }) => {
  await page.goto("/app?pro#/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  const bar = page.locator("[data-compact-title]");
  // At the top the large title is the name, and the bar holds nothing.
  await expect(bar).toHaveCSS("opacity", "0");

  const scroll = (y: number) =>
    page.evaluate((top) => {
      const scroller = document.querySelector("[data-compact-title] ~ div.overflow-y-auto") as HTMLElement;
      scroller.scrollTop = top;
    }, y);
  await scroll(200);
  await expect(bar).toHaveCSS("opacity", "1");
  await scroll(0);
  await expect(bar).toHaveCSS("opacity", "0");
});
