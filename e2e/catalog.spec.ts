import { expect, test } from "@playwright/test";
import { clearDatabase } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

/**
 * The catalog is the one screen fed by a shipped data file rather than by the
 * user, so a broken fetch or a schema change shows up here first. This walks
 * the path a user takes through it: search, clear, then narrow by brand.
 */
test("searches the catalog and narrows it by brand", async ({ page }) => {
  await page.getByRole("button", { name: "Catalog" }).click();

  const search = page.getByPlaceholder("Search name, brand, coverstock…");
  await expect(search).toBeVisible();

  await search.fill("phaze");
  await expect(page.getByRole("button", { name: /Phaze/i }).first()).toBeVisible();

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");

  await page.getByRole("button", { name: /^Filters/ }).click();
  // The brand chips live in the filters sheet; the card headers say "STORM" too.
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet.getByRole("button", { name: "Roto Grip", exact: true }).click();
  // The sheet applies as it goes, so it is left with Done, and the Filters
  // button lit with its count is what shows the narrowing.
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toHaveCount(0);
  const filters = page.getByRole("button", { name: /^Filters/ });
  await expect(filters).toHaveAttribute("aria-pressed", "true");
  await expect(filters).toContainText("1");

  // Every ball left in the list is a Roto Grip.
  const rows = page.locator("ul > li > button");
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allTextContents()) expect(text).toContain("Roto Grip");
});

/**
 * MOTIV's licence asks that a ball listing link to their own page for any ball
 * that has one, so a reader can check the specs against the source. That makes
 * the link a term of the agreement rather than a nicety, and worth a test that
 * fails if it is ever quietly dropped.
 */
test("a MOTIV ball links to MOTIV's own product page", async ({ page }) => {
  await page.getByRole("button", { name: "Catalog" }).click();
  await page.getByPlaceholder("Search name, brand, coverstock…").fill("Jackal Ghost V2");
  await page.getByRole("button", { name: /Jackal Ghost V2/i }).first().click();

  const link = page.getByRole("link", { name: /View on Motiv/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /^https:\/\/www\.motivbowling\.com\/products\/balls\//);
  // Opens away from the app, and without handing the opened page a reference
  // back to this one.
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("renders the catalog a page at a time, and grows as you scroll", async ({ page }) => {
  await page.getByRole("button", { name: "Catalog" }).click();
  await expect(page.getByPlaceholder("Search name, brand, coverstock…")).toBeVisible();

  // The results list, not the filter chips above it.
  const rows = page.getByRole("list").last().locator("> li");
  // Every ball used to be in the DOM at once, photo and all.
  await expect.poll(async () => rows.count()).toBeGreaterThan(0);
  const first = await rows.count();
  expect(first).toBeLessThanOrEqual(40);

  // The app shell is `fixed inset-0` with its own scroller, so the document
  // does not scroll and mobile WebKit has no wheel either. Bringing the last
  // rendered row into view moves whichever container actually scrolls, which
  // is what the sentinel below it is watching.
  await rows.last().scrollIntoViewIfNeeded();
  await expect.poll(async () => rows.count()).toBeGreaterThan(first);
});

/**
 * A ball opened from another's Same core row goes over that ball (ADR-257):
 * the first ball stays drawn beneath while the second slides in, and back
 * returns to it, never through the list.
 */
test("a ball opened from another's row stacks on it, and back returns to it", async ({ page }) => {
  await page.getByRole("button", { name: "Catalog" }).click();
  await page.getByPlaceholder("Search name, brand, coverstock…").fill("PhysiX Ignition");
  await page.getByRole("button", { name: /PhysiX Ignition/ }).first().click();
  const first = page.getByRole("dialog", { name: "PhysiX Ignition" });
  await expect(first).toBeVisible();

  const core = first.getByRole("region", { name: /^Same core/ });
  const next = core.getByRole("listitem").first();
  const nextName = (await next.locator("span span").last().innerText()).trim();
  await next.getByRole("button").click();

  const second = page.getByRole("dialog", { name: nextName });
  await expect(second).toBeVisible();
  // The first ball is still there underneath, so a drag back uncovers it.
  await expect(first).toHaveCount(1);

  await page.goBack();
  await expect(second).toHaveCount(0);
  await expect(first).toBeVisible();
  await expect(first.getByRole("region", { name: /^Same core/ })).toBeVisible();
});
