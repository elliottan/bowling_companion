import { expect, test } from "@playwright/test";
import { clearDatabase } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearDatabase(page);
});

type Page = import("@playwright/test").Page;

async function openArsenal(page: Page) {
  await page.getByRole("button", { name: "Arsenal", exact: true }).click();
}

/** The row itself, not the drag handle that shares the ball's name. */
function ballRow(page: Page, name: string) {
  return page.locator("li").filter({ hasText: name }).getByRole("button").nth(1);
}

/**
 * The arsenal is the second most-used screen after the scorer and had no
 * coverage at all: adding, renaming and deleting a ball is the whole feature.
 */
test("adds a ball, edits it, and deletes it", async ({ page }) => {
  await openArsenal(page);
  await expect(page.getByText(/no balls yet/i)).toBeVisible();

  await page.getByRole("button", { name: "Add ball" }).first().click();
  await page.getByPlaceholder("e.g. Storm Phaze II").fill("Phaze II");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("Phaze II")).toBeVisible();

  // Tapping the row opens the editor: the row is the single tap target.
  await ballRow(page, "Phaze II").click();
  const name = page.getByPlaceholder("e.g. Storm Phaze II");
  await expect(name).toHaveValue("Phaze II");
  await name.fill("Phaze II Pearl");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Phaze II Pearl")).toBeVisible();

  // Delete lives inside the editor, behind a confirm (DESIGN-LANGUAGE §2).
  await ballRow(page, "Phaze II Pearl").click();
  await page.getByRole("button", { name: /delete/i }).first().click();
  await expect(page.getByRole("heading", { name: /Delete Phaze II Pearl\?/ })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText(/no balls yet/i)).toBeVisible();
});

test("a ball added in the arsenal is selectable on a shot", async ({ page }) => {
  await openArsenal(page);
  await page.getByRole("button", { name: "Add ball" }).first().click();
  await page.getByPlaceholder("e.g. Storm Phaze II").fill("Hy-Road");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Hy-Road")).toBeVisible();

  // The arsenal is a pushed screen: leave it by its back control, which
  // names the screen underneath (DESIGN-LANGUAGE 1).
  await page.getByRole("banner").getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Start new session" }).click();
  await page.getByPlaceholder("Orchid Bowl").fill("Arsenal Lanes");
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  // The chosen ball IS the control: it starts unset and opens the picker.
  await page.getByRole("button", { name: /Ball: none/ }).click();
  await page.getByRole("button", { name: /Hy-Road/ }).first().click();
  await expect(page.getByRole("button", { name: /Ball: Hy-Road/ })).toBeVisible();
});
