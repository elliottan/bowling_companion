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

  // The count is paginated ("50 balls"), so it says "N of M" once filtered.
  await expect(page.getByText(/^\d+ balls$/)).toBeVisible();

  await page.getByRole("button", { name: /^Filters/ }).click();
  // The brand chips live in the filters panel; the card headers say "STORM" too.
  await page.getByRole("button", { name: "Roto Grip", exact: true }).click();
  // The active-filter chips show while the panel is closed, so the narrowing
  // state stays legible without the panel covering the results.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByRole("button", { name: "Remove filter: Roto Grip" })).toBeVisible();

  const count = page.getByText(/^\d+ balls? of \d+$/);
  await expect(count).toBeVisible();
  const [shown, total] = (await count.innerText()).match(/\d+/g)!.map(Number);
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(total);
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
