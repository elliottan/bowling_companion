// Landing page screenshots, taken from the real app.
// Run the dev server, then: npm run shots
//
// The landing page shows the app, so the pictures on it come from the app
// rather than from a mockup. A drawn approximation drifts from the product the
// moment either one changes, and it is the one thing on that page a visitor is
// asked to take on trust.
//
// Output is committed to public/shots/. Re-run when the UI changes.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "shots");
const BASE = process.env.SHOTS_BASE ?? "http://localhost:5173";

/**
 * Games as lists of shots, not frames: a strike spends one and everything else
 * spends two, so the length has to be exact. One entry too many and the last
 * click finds no Next button, because the game is already over.
 */
const GAMES = [
  // 226: strikes, a spare, one open frame.
  [[], [], [7], [], [], [10], [10], [], [], [], [], [4], [], []],
  // A quieter night, so the trend has somewhere to move.
  [[], [3, 6, 10], [], [7], [], [], [8, 10], [8, 10], [], [4, 7], [], [], [10], [10], [2, 8], [2, 8]],
  // Better again. The tenth is left open in each of these on purpose: a strike
  // or a spare there earns another ball, and a game one shot short of finished
  // is not counted, so it would never reach the stats or the trend.
  [[], [], [], [6, 10], [], [], [7], [], [], [], [5], [], [10], [10]]
];

/** Record one shot. `standingAfter` mirrors e2e/helpers.ts. */
async function recordShot(page, standingAfter) {
  const standing = new Set(standingAfter);
  for (let pin = 1; pin <= 10; pin++) {
    const sel = standing.has(pin)
      ? `button[aria-label="Pin ${pin} down"]:not([disabled])`
      : `button[aria-label="Pin ${pin} standing"]:not([disabled])`;
    const btn = page.locator(sel);
    if (await btn.count()) await btn.click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

/** Clear whatever prompt is up, so the shot is of the app and not of a dialog. */
async function dismissPrompts(page) {
  for (const name of ["Later", "Dismiss share offer", "Got it"]) {
    const btn = page.getByRole("button", { name });
    if (await btn.count()) await btn.first().click().catch(() => {});
  }
  // The spare-line offer is a toast with only a close control.
  const toast = page.getByRole("button", { name: /Dismiss|Close/ }).last();
  if (await toast.count()) await toast.click().catch(() => {});
}

async function startSession(page, alley) {
  // A finished game leaves you on the Active tab; the start control is on Home.
  await page.getByRole("button", { name: "Home" }).last().click();
  await page.getByRole("button", { name: "Start new session" }).click();
  await page.getByPlaceholder("Orchid Bowl").fill(alley);
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("dialog", { name: /lanes/i }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).waitFor();
}

/**
 * Screens push in with a transition, and a screenshot taken during one catches
 * a half-slid, half-faded frame. Motion is off for the whole run, so this only
 * has to outlast React settling.
 */
async function settle(page) {
  await page.waitForTimeout(500);
}

async function shoot(page, name) {
  await settle(page);
  const png = await page.screenshot();
  await writeFile(join(outDir, `${name}.webp`), await sharp(png).webp({ quality: 82 }).toBuffer());
  console.log("wrote", `${name}.webp`);
}

/** Pin the app's theme and reload so it resolves before the first paint. */
async function setTheme(page, theme) {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  await page.reload();
  await settle(page);
}

/**
 * Both themes of one screen. Dark screenshots on a cream page undercut the one
 * thing the landing page claims, so each screen is shot twice and the page
 * picks by prefers-color-scheme.
 *
 * A reload is safe here: the screen you are on is in the URL and the game is in
 * IndexedDB, so the app comes back exactly where it was.
 */
async function shootBothThemes(page, name) {
  await shoot(page, name);
  await setTheme(page, "light");
  await shoot(page, `${name}-light`);
  await setTheme(page, "dark");
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  reducedMotion: "reduce"
});
// reducedMotion covers what the app honours; this covers the rest.
await page.addStyleTag({
  content: "*,*::before,*::after{transition:none!important;animation:none!important}"
}).catch(() => {});

await mkdir(outDir, { recursive: true });

await page.goto(`${BASE}/score`);
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("BowlingCompanionDB");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    })
);
await page.reload();
await setTheme(page, "dark");
await page.getByRole("button", { name: "Set up a new book" }).click();
await page.getByRole("button", { name: "right-handed" }).click();

// Three nights, so the history has rows and the trend chart has a line rather
// than a single dot.
const alleys = ["Sunset Lanes", "Orchid Bowl", "Sunset Lanes"];
for (let i = 0; i < GAMES.length; i++) {
  await startSession(page, alleys[i]);
  const game = GAMES[i];

  if (i === GAMES.length - 1) {
    // The last night stops half way: a part-filled scorecard with the pin
    // input live is the screen this app actually is. A finished card is a table.
    for (const leave of game.slice(0, 7)) await recordShot(page, leave);
    await dismissPrompts(page);
    await shootBothThemes(page, "scorer");
    for (const leave of game.slice(7)) await recordShot(page, leave);
  } else {
    for (const leave of game) await recordShot(page, leave);
  }
  await dismissPrompts(page);
}

await page.getByRole("button", { name: "Stats" }).last().click();
await shootBothThemes(page, "stats");

await browser.close();
