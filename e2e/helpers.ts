import type { Page } from "@playwright/test";

/** The scorer's commit button reads "Next", with what it would record
 *  bracketed under it; the accessible name reads "Next (Strike)". */
export const RECORD_SHOT = /^Next( \(|$)/;

/**
 * The first-run screen owns the viewport until handedness is stored, and after
 * any DB wipe it comes back. Walk it: start fresh, then right-handed.
 */
export async function dismissHandednessModal(page: Page) {
  // Scoped to the first run: Settings answers the hand on its own list, so a
  // reload while Settings is up has a second Right-handed button behind it.
  const firstRun = page.getByRole("dialog", { name: "Set up Headpin" });
  await firstRun.getByRole("button", { name: "Start fresh" }).click();
  await firstRun.getByRole("button", { name: "right-handed" }).click();
  await firstRun.getByRole("button", { name: "Next", exact: true }).click();
}

/**
 * Wipe IndexedDB so each test starts from an empty database.
 *
 * The delete is retried if the page navigates under it. A cold Vite dev server
 * that discovers a dependency late re-optimizes and reloads the page on its
 * own, shortly after `goto` resolves, which destroys the evaluate's context.
 * vite.config.ts pre-bundles the one dependency that did this; the retry keeps
 * the next one from turning into a flaky first test.
 */
export async function clearDatabase(page: Page) {
  await page.goto("/app?pro");
  for (let attempt = 1; ; attempt++) {
    try {
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase("BowlingCompanionDB");
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
      });
      break;
    } catch (error) {
      if (attempt >= 3 || !String(error).includes("Execution context was destroyed")) throw error;
      await page.waitForLoadState("load");
    }
  }
  await page.reload();
  await dismissHandednessModal(page);
}

/**
 * Open the start-session form from Home or the Score tab, whichever is up.
 *
 * Home opens it from its floating button once there are sessions, and from
 * "Start scoring" on a device that has never scored (ADR-215). The Score tab's
 * own "Start session" opens it too.
 */
export async function openSessionForm(page: Page) {
  await page.getByRole("button", { name: /^(Start session|Start scoring)$/ }).first().click();
}

/** Fill the start-session form and submit. Lands on the active scorer. */
export async function startSession(page: Page, alley: string) {
  // "Start session" opens the sheet, and the sheet's commit carries the same
  // label, so the commit is clicked inside the sheet.
  await openSessionForm(page);
  const sheet = page.getByRole("dialog", { name: "Start session" });
  await sheet.getByPlaceholder("Pinecrest Lanes").fill(alley);
  await sheet.getByRole("button", { name: "Start session" }).click();
  // A new game opens the lane editor (lanes unset); dismiss it. Lanes save as
  // they are typed, so the dialog's only control is its close.
  await page.getByRole("dialog", { name: /lanes/i }).getByRole("button", { name: "Close" }).click();
  // The scorer is up once the live-entry action buttons render.
  await page.getByRole("button", { name: RECORD_SHOT }).waitFor();
}

/**
 * Record one shot. `standingAfter` is the set of pin numbers LEFT STANDING
 * after the shot — [] means a strike/clear. Mirrors the data model.
 *
 * Works for both the inverted shot-1 model (pins start down, tap to stand)
 * and the pins-up shot-2+ model (remaining pins start standing, tap to knock):
 * - Pins in standingAfter that are currently "down" get clicked (to mark standing).
 * - Pins NOT in standingAfter that are currently "standing" and enabled get clicked
 *   (to knock them down).
 */
export async function recordShot(page: Page, standingAfter: number[]) {
  // The deck is read in one round trip rather than ten: a pin's state does not
  // change when another pin is tapped, so what needs a tap is known up front.
  // A strike on a fresh rack (pins start down) taps nothing at all.
  const toTap = await page.evaluate((standing) => {
    const want = new Set(standing);
    const taps: string[] = [];
    for (let pin = 1; pin <= 10; pin++) {
      const label = want.has(pin) ? `Pin ${pin}, down` : `Pin ${pin}, standing`;
      if (document.querySelector(`button[aria-label="${label}"]:not([disabled])`)) taps.push(label);
    }
    return taps;
  }, standingAfter);
  for (const label of toTap) {
    await page.locator(`button[aria-label="${label}"]:not([disabled])`).click();
  }
  await page.getByRole("button", { name: RECORD_SHOT }).click();
}

/**
 * Write finished sessions straight into the database, one perfect game each,
 * and reload so the app reads them. For a test whose subject is a list, a
 * filter or a screen that reads a finished session, not the bowling: bowling
 * twelve balls through the scorer per night is what the scoring specs test,
 * and it was the bulk of these specs' running time.
 *
 * Listed oldest first, so the last alley is the most recent night and the
 * first card in History. Stored the way the scorer stores them: the session
 * row, one game with its lanes, ten frames and the final score
 * (`calculateGameScore`, the app's own engine, so the total cannot drift from
 * what the scorer would have written).
 */
export async function seedFinishedSessions(page: Page, alleys: string[]) {
  await page.evaluate(async (names) => {
    // A source module the dev server serves, untyped here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = new Function("p", "return import(p)") as (p: string) => Promise<any>;
    const repo = await load("/src/services/bowlingRepository.ts");
    const { db } = await load("/src/db/bowlingDb.ts");
    const { calculateGameScore } = await load("/src/lib/scoring.ts");
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (let i = 0; i < names.length; i++) {
      const date = dayKey(new Date(Date.now() - (names.length - 1 - i) * 86_400_000));
      const sessionId = await repo.createSession({ date, alley_name: names[i] });
      const gameId = Number(await db.games.add({ session_id: sessionId, game_number: 1, lanes: ["11", "12"], start_lane: "11" }));
      const frames = Array.from({ length: 10 }, (_, f) => ({
        game_id: gameId,
        frame_number: f + 1,
        shots: Array.from({ length: f === 9 ? 3 : 1 }, () => ({ pins_standing: [] })),
        is_strike: true,
        is_spare: false
      }));
      await db.frames.bulkAdd(frames);
      await db.games.update(gameId, { final_score: calculateGameScore(frames).total });
    }
  }, alleys);
  await page.reload();
}

/**
 * Take the download path rather than the share sheet.
 *
 * `shareBackup` prefers `navigator.share` where the browser can share a file,
 * which is the right destination on a phone and is what a WebKit run gets.
 * Playwright cannot complete an OS share sheet, so a test that wants the file
 * on disk asks for the fallback. The share branch itself is unit-tested
 * (`canShareBackupFile`).
 */
export async function preferDownloadOverShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
}

/**
 * Open the arsenal from Home: one row named Arsenal, with the balls or, for an
 * empty bag, "Add balls to your bag" under the name (ADR-245).
 */
export async function openArsenalFromHome(page: Page) {
  await page.getByRole("button", { name: /^Arsenal/ }).click();
}
