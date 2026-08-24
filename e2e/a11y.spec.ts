import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/**
 * The design language enforces tap targets and icon-button labels structurally,
 * but nothing checked contrast, landmarks or ARIA validity. Axe does, on the
 * screens as they actually render, in both themes.
 *
 * Scoped to WCAG A/AA: those are the failures that make the app unusable for
 * someone, rather than best-practice advice.
 */
/**
 * Scanning mid-transition reports the blended colours of a fading-in screen as
 * contrast failures (ink at 3.39:1 on white, which it never actually is), so
 * every scan waits for the animations to finish first.
 */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running")
  );
}

async function scan(page: Page) {
  await settle(page);
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

async function expectNoViolations(page: Page) {
  const { violations } = await scan(page);
  expect(
    violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
    "axe violations"
  ).toEqual([]);
}

test("the dashboard is accessible in both themes", async ({ page }) => {
  await expectNoViolations(page);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expectNoViolations(page);
});

test("the scorer is accessible mid-game", async ({ page }) => {
  await startSession(page, "Axe Lanes");
  await recordShot(page, [10]); // an open frame leaves the pin grid mid-state
  await expectNoViolations(page);
});

test("the arsenal, spares and settings screens are accessible", async ({ page }) => {
  await page.getByRole("button", { name: "Spare lines" }).first().click();
  await expectNoViolations(page);

  // The spare cards are where the pin numbers live, and they are the smallest
  // text in the app, so they get checked in the dark palette too.
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoViolations(page);
  await page.emulateMedia({ colorScheme: "light" });

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await expectNoViolations(page);

  await page.getByRole("button", { name: "Arsenal" }).first().click();
  await expectNoViolations(page);
});
