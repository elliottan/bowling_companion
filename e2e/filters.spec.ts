import { expect, test } from "@playwright/test";
import { clearDatabase, recordShot, startSession } from "./helpers";

/** Two nights at two houses, so there is something to filter down to. */
async function twoNights(page: Parameters<typeof startSession>[0]) {
  await clearDatabase(page);
  for (const alley of ["Alpha Lanes", "Beta Lanes"]) {
    await page.getByRole("button", { name: "Home" }).click();
    await startSession(page, alley);
    for (let i = 0; i < 12; i++) await recordShot(page, []);
  }
  await page.getByRole("button", { name: "History" }).click();
}

async function applyLocation(page: Parameters<typeof startSession>[0], alley: string) {
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Location").selectOption(alley);
  await page
    .getByRole("dialog", { name: "Filters" })
    .getByRole("button", { name: "Close" })
    .click();
}

test("an applied filter comes off by its own chip", async ({ page }) => {
  await twoNights(page);
  await applyLocation(page, "Alpha Lanes");

  const chip = page.getByRole("button", { name: "Remove filter Alpha Lanes" });
  await expect(chip).toBeVisible();
  await expect(page.getByRole("button", { name: "Filters, 1 applied" })).toBeVisible();

  await chip.click();

  // The chip, the badge and the list all have to answer, not just the list:
  // the store took the write and the header used to go on rendering the old
  // value, so the chip stayed put and a second tap wrote the same value and
  // changed nothing at all.
  await expect(page.getByRole("button", { name: /^Remove filter/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Beta Lanes/ })).toBeVisible();
});

test("it still comes off after the filter sheet has been opened again", async ({ page }) => {
  await twoNights(page);
  await applyLocation(page, "Alpha Lanes");

  // Reopening must not drop what is applied, and must not leave the chip dead.
  // The wait lets the first sheet finish leaving: reopening mid-exit stacks two
  // instances of it, which is a race with the animation rather than with the
  // filter, and not what this test is about.
  await expect(page.getByRole("dialog", { name: "Filters" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Location")).toHaveValue("Alpha Lanes");
  await page
    .getByRole("dialog", { name: "Filters" })
    .getByRole("button", { name: "Close" })
    .click();

  await expect(page.getByRole("button", { name: "Remove filter Alpha Lanes" })).toBeVisible();
  await page.getByRole("button", { name: "Remove filter Alpha Lanes" }).click();
  await expect(page.getByRole("button", { name: /^Remove filter/ })).toHaveCount(0);
});

test("a sheet on its way out does not swallow the next tap", async ({ page }) => {
  await twoNights(page);
  await applyLocation(page, "Alpha Lanes");

  // No wait: the tap lands while the sheet is still fading. It used to hit the
  // leaving overlay for the length of the exit, so the first tap after closing
  // a sheet went nowhere.
  const blocking = await page.evaluate(() => {
    const chip = document.querySelector('button[aria-label^="Remove filter"]') as HTMLElement | null;
    if (!chip) return "no chip";
    const r = chip.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return chip.contains(hit) ? "reaches the chip" : (hit as HTMLElement)?.className ?? "unknown";
  });
  expect(blocking).toBe("reaches the chip");
});
