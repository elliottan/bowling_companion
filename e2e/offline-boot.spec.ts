import { expect, test } from "@playwright/test";
import { dismissHandednessModal, recordShot, startSession } from "./helpers";

/**
 * The cold start with no signal, which is the whole pitch: the app opened on a
 * lane where the phone has no network, from nothing but what the service worker
 * stored on an earlier visit.
 *
 * The rest of the suite runs against the dev server, which has no service
 * worker, so this one runs against the production build under `vite preview`
 * (the `offline-boot` project in playwright.config.ts). It was the manual check
 * in docs/DEPLOYMENT.md until this ran.
 *
 * Offline here is real: an address no cache can hold is asserted to fail, so a
 * pass cannot be the network quietly answering after all.
 */
test("opens with no network from what the service worker stored, and scores a game", async ({ page, context }) => {
  // The visit that installs the worker. `ready` resolves once it is active,
  // which for a precaching worker is after the precache has been written.
  await page.goto("/app/?pro");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A page is controlled from its next load.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  expect(
    await page.evaluate(() =>
      fetch(`/robots.txt?nocache=${Math.random()}`).then(
        () => "answered",
        () => "unreachable"
      )
    )
  ).toBe("unreachable");

  // The cold start itself.
  await page.reload();
  await dismissHandednessModal(page);

  // And the screens a night at the lanes needs, each of them a chunk that has
  // to have been precached, not only the shell: the session form, the lanes
  // sheet and the scorer.
  await startSession(page, "No Signal Lanes");
  await recordShot(page, []);
  await recordShot(page, [10]);
  await recordShot(page, []);
  await expect(
    page.getByRole("button", { name: /^Frame 1, shot 1: strike, running total 20$/ }).first()
  ).toBeVisible();
});
