import { expect, test } from "@playwright/test";
import { clearDatabase } from "./helpers";

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

test("a section pushed from a scrolled Settings has its own bar and back, not Settings'", async ({ page }) => {
  await clearDatabase(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  const row = page.getByRole("button", { name: /Appearance/ });
  await row.scrollIntoViewIfNeeded();
  // Scrolled far enough that Settings' own compact bar is showing.
  await expect(page.locator("[data-compact-title]")).toHaveCSS("opacity", "1");
  await row.click();

  const screen = page.getByRole("region", { name: "Appearance" });
  const back = screen.getByRole("button", { name: "Back" });
  await expect(back).toBeVisible();
  // Nothing of Settings' is painted over the section's back button. Its
  // compact bar lets taps through, which hid it from a hit test, so the probe
  // makes it hittable first: what is hit is then what is painted on top.
  const onTop = await back.evaluate((el) => {
    document.querySelectorAll<HTMLElement>("[data-compact-title]").forEach((b) => (b.style.pointerEvents = "auto"));
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit !== null && (el === hit || el.contains(hit));
  });
  expect(onTop).toBe(true);
  await page.evaluate(() =>
    document.querySelectorAll<HTMLElement>("[data-compact-title]").forEach((b) => (b.style.pointerEvents = ""))
  );
  await back.click();
  await expect(screen).toBeHidden();
});
