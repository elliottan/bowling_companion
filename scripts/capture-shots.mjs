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
 * Games as frames, not as a flat list of shots. A strike spends one shot and
 * everything else spends two, so a flat list has to be counted by hand, and one
 * entry too many means the last click finds no Next button because the game is
 * already over. Frames cannot drift that way.
 *
 * Each entry is the pins left standing after that shot, matching the data model
 * and e2e/helpers.ts.
 */
const X = [[]]; // strike
const SPARE = (leave) => [leave, []];
const OPEN = (leave, after = leave) => [leave, after];

/*
 * The ball table reports three first-ball rates, and all three fall out of what
 * the first ball leaves standing (isPocketHit, pins.ts). For one ball over ten
 * frames, with k strikes, p pocket leaves and n leaves that are not pocket:
 *
 *   pocket = (k + p) / 10     strike = k / 10     carry = k / (k + p)
 *
 * So the three columns are not free of each other, and a night where every
 * first ball found the pocket has carry equal to strike by definition. Each
 * night below is built to a different (k, p, n) and none of them is a clean
 * ten, which is what keeps the fifteen numbers in that table apart:
 *
 *   Zen Master     6 / 3 / 1    pocket 90  carry 67  strike 60
 *   Code Green     2 / 3 / 5    pocket 50  carry 40  strike 20
 *   Jackal Ghost   5 / 1 / 4    pocket 60  carry 83  strike 50
 *   Gem            3 / 4 / 3    pocket 70  carry 43  strike 30
 *   Phaze Crimson  7 / 1 / 2    pocket 80  carry 88  strike 70
 *
 * Pocket leaves keep the 1 and the 3 down and avoid the shapes the rule reads
 * as a miss. The 4-6, the 2-10, the 2-4-5 bucket, a lone 5 and anything with
 * the 3 up are the ones that are not pocket.
 *
 * The tenth is open every time on purpose: a strike or a spare there earns
 * another ball, and a game one shot short of finished is never counted, so it
 * would reach neither the stats nor the trend.
 */
const GAMES = [
  // Zen Master. 6 / 3 / 1.
  [X, X, SPARE([10]), X, SPARE([7]), X, X, OPEN([2, 4, 5], [5]), X, OPEN([6, 10], [10])],
  // Code Green. 2 / 3 / 5, the bad night.
  [
    SPARE([10]), OPEN([3, 6, 10], [10]), X, OPEN([2, 4, 5], [4, 5]), SPARE([7]),
    OPEN([4, 6], [6]), X, OPEN([5]), SPARE([6, 10]), OPEN([2, 10], [10])
  ],
  // Jackal Ghost. 5 / 1 / 4.
  [
    X, OPEN([3, 6, 10], [6, 10]), X, OPEN([2, 4, 5], [5]), X, SPARE([10]), X,
    OPEN([4, 6], [4]), X, OPEN([2, 10], [2])
  ],
  // Gem. 3 / 4 / 3.
  [
    X, SPARE([10]), OPEN([2, 10], [10]), SPARE([7]), OPEN([5]), X, SPARE([6, 10]),
    OPEN([4, 6], [6]), X, OPEN([8, 10], [10])
  ],
  // Phaze Crimson. 7 / 1 / 2. Last, because the scorer screenshot is taken on
  // the first ball of its tenth, and that ball leaves the 3-6-10.
  [X, X, SPARE([7]), X, X, OPEN([5]), X, X, X, OPEN([3, 6, 10], [10])]
];

const shotsOf = (game) => game.flat();

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
  // Three games in and the backup nudge turns from a prompt into a standing red
  // banner with no Later on it (ADR-067), which then sits across the top of the
  // screenshot. It is answered the way a bowler answers it: take the backup.
  const saveCopy = page.getByRole("button", { name: "Save a copy" });
  if (await saveCopy.count()) {
    const download = page.waitForEvent("download").catch(() => null);
    await saveCopy.first().click();
    await download;
    await settle(page);
  }

  for (const name of ["Later", "Dismiss share offer", "Got it"]) {
    const btn = page.getByRole("button", { name });
    if (await btn.count()) await btn.first().click().catch(() => {});
  }
  // The spare-line offer is a toast with only a close control.
  const toast = page.getByRole("button", { name: /Dismiss|Close/ }).last();
  if (await toast.count()) await toast.click().catch(() => {});
}

/**
 * Add one ball from the shipped catalog, with the catalog already open on its
 * list. Adding leaves you on the ball's own page, and leaving the catalog from
 * there reopens it on that same ball: the next search then reads as "already in
 * your arsenal" against the previous ball. So step back to the list first.
 */
async function addCatalogBall(page, query) {
  const search = page.getByPlaceholder("Search name, brand, coverstock…");
  await search.fill(query);
  await page.getByRole("button", { name: new RegExp(query, "i") }).first().click();
  await page.getByRole("button", { name: "Add to my arsenal" }).click();
  await page.getByRole("button", { name: "Add to arsenal", exact: true }).click();
  await settle(page);
  // The ball's own header and the catalog's both carry a Back; the ball is the
  // one in front.
  await page.getByRole("banner").getByRole("button", { name: "Back" }).last().click();
  await settle(page);
}

/**
 * Fill the shot's Intended and Actual lines. The fields carry no aria-label,
 * only a title, and both sections render a target, so they are taken in DOM
 * order: Intended first, Actual second.
 */
async function fillLine(page, values) {
  const targets = page.locator('input[title="Target board (arrows)"]');
  const fields = [
    [page.locator('input[title="Stance board"]'), values.stance],
    [targets.nth(0), values.intendedTarget],
    [page.locator('input[title="Slide board"]'), values.slide],
    [targets.nth(1), values.actualTarget]
  ];

  // Twice, with a settle between. Choosing a ball seeds the line (ADR-052), and
  // that seed lands a tick later and overwrites whatever was typed before it:
  // the first pass loses, the second is what stays on screen.
  for (let pass = 0; pass < 2; pass++) {
    for (const [input, value] of fields) await input.fill(String(value));
    // Blur so the focus-reveal adjusters are not covering the panel.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await settle(page);
  }

  for (const [input, value] of fields) {
    const got = await input.inputValue();
    if (got !== String(value)) throw new Error(`line field settled on ${got}, wanted ${value}`);
  }
}

/**
 * Name the ball for this frame. The choice carries to the second shot of the
 * frame but not into the next one, so this is called per frame rather than per
 * game: without it the ball table reports one first ball per ball, and a rate
 * over a single throw is 0% or 100% and says nothing.
 */
async function chooseBall(page, name, decoy) {
  const sheet = page.getByRole("dialog", { name: "Choose ball" });
  const control = page.getByRole("button", { name: /^Ball: / });

  // Twice: the decoy, then the ball we want.
  //
  // A new shot *displays* the previous shot's ball, but that is a suggestion
  // and is not what gets saved. Picking the ball already on display changes
  // nothing, so nothing is written, and the shot is stored with no ball at all.
  // Only a real change is persisted, so the decoy makes the second pick one.
  //
  // Left as-is this reads as a mystery in the data rather than a bug: every
  // other first ball simply went missing, which halved the ball table and left
  // the rates sitting on three or four throws.
  for (const pick of [decoy, name]) {
    await control.click();
    await sheet.waitFor({ state: "visible" });
    await sheet.getByRole("button", { name: new RegExp(pick, "i") }).first().click();
    await sheet.waitFor({ state: "hidden" });
  }
}

/**
 * Fill in the lane pair the game asks for on its way in, rather than closing
 * the question. A session with no lanes set shows "Set lanes" where the lane
 * numbers belong, which on the landing page reads as a feature nobody filled
 * in.
 */
async function setLanes(page) {
  const dialog = page.getByRole("dialog", { name: /lanes/i });
  // Only the first game of a session is asked: the games after it inherit the
  // pair, so there is nothing to fill in and nothing to close. Waited for with
  // a short deadline rather than counted: on a new session the dialog arrives a
  // moment after the click, and a count taken right away sees none, returns,
  // and leaves it open across everything that follows.
  try {
    await dialog.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return;
  }
  await dialog.getByRole("textbox", { name: "First lane" }).fill("11");
  await dialog.getByRole("textbox", { name: "Second lane" }).fill("12");
  await dialog.getByRole("button", { name: "Close" }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function startSession(page, alley) {
  // A finished game leaves you on the Active tab; the start control is on Home.
  await page.getByRole("button", { name: "Home" }).last().click();
  await page.getByRole("button", { name: "Start new session" }).click();
  await page.getByPlaceholder("Orchid Bowl").fill(alley);
  await page.getByRole("button", { name: "Start session" }).click();
  await setLanes(page);
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
  // Recording a shot can leave the view scrolled down its own container, which
  // crops the header out of the picture. Put every scroller back to the top.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll("*").forEach((el) => {
      if (el.scrollTop) el.scrollTop = 0;
    });
  });
  const png = await page.screenshot();
  await writeFile(join(outDir, `${name}.webp`), await sharp(png).webp({ quality: 82 }).toBuffer());
  console.log("wrote", `${name}.webp`);
}

/**
 * Flip the theme in place. It is the data-theme attribute that selects the
 * colour tokens, so setting it is enough, and reloading to let the pre-paint
 * script do it is not: a shot is not saved until Next, so a reload on the
 * scorer throws away the pins, the ball and the line that the screenshot is
 * there to show. The stored value is written too, so anything that reads the
 * preference agrees with what is on screen.
 */
async function setTheme(page, theme) {
  await page.evaluate((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* private mode: the attribute below is what the screenshot needs */
    }
    document.documentElement.dataset.theme = t;
  }, theme);
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
await page.getByRole("button", { name: "Start fresh" }).click();
await page.getByRole("button", { name: "right-handed" }).click();

// Real balls, so the arsenal is a screen with something on it and the shot
// panel has a ball to name.
await page.getByRole("button", { name: "Catalog", exact: true }).click();
// Only some of the catalog carries artwork, and a list of grey placeholders is
// a worse advert than no list. These five all have a real image.
for (const q of ["Phaze Crimson", "Gem", "Jackal Ghost", "Zen Master", "Code Green"]) {
  await addCatalogBall(page, q);
}
await page.getByRole("banner").getByRole("button", { name: "Back" }).first().click();

await page.getByRole("button", { name: "Arsenal", exact: true }).click();
await shootBothThemes(page, "arsenal");
await page.getByRole("banner").getByRole("button", { name: "Back" }).first().click();

await page.getByRole("button", { name: "Line", exact: true }).click();
// One theme only: the lane view paints its own wood and sky rather than the
// app's colour tokens, so both themes render the identical picture.
await shoot(page, "line");
await page.getByRole("button", { name: "Close" }).first().click();

// Five nights: the trend chart is a line with somewhere to go, not two dots.
const alleys = ["Sunset Lanes", "Orchid Bowl", "Sunset Lanes", "Pin Deck", "Sunset Lanes"];
// A different ball each night, so the ball table compares balls rather than
// reporting one. The last night takes Phaze Crimson because that night is the
// one the scorer screenshot is taken on.
const ballOfNight = ["Zen Master", "Code Green", "Jackal Ghost", "Gem", "Phaze Crimson"];
if (ballOfNight.length !== GAMES.length) throw new Error("a night needs a ball");
/** Any ball but this night's own: chooseBall needs a real change to save. */
const decoyFor = (i) => ballOfNight[(i + 1) % ballOfNight.length];
for (let i = 0; i < GAMES.length; i++) {
  await startSession(page, alleys[i]);
  const game = GAMES[i];

  if (i === GAMES.length - 1) {
    // The last night runs three games rather than one, so the game bar above
    // the card reads as a night out instead of a single game. They are the same
    // card each time, which leaves this ball's three rates exactly where they
    // were designed: the extra games repeat the distribution rather than
    // dilute it.
    for (let g = 0; g < 3; g += 1) {
      if (g > 0) {
        await page.getByRole("button", { name: "New game" }).click();
        // A new game asks for its lanes the same way a new session does.
        await setLanes(page);
        await page.getByRole("button", { name: "Next", exact: true }).waitFor();
      }
      const upTo = g === 2 ? 9 : 10;
      for (const frame of game.slice(0, upTo)) {
        await chooseBall(page, ballOfNight[i], decoyFor(i));
        for (const leave of frame) await recordShot(page, leave);
      }
      if (g < 2) await dismissPrompts(page);
    }

    // Stop on the first ball of the tenth. Nine frames are filled in, so the
    // card reads as a game rather than a stub, and the shot itself is still
    // open: pins standing, the line written down, a ball named.
    await chooseBall(page, ballOfNight[i], decoyFor(i));
    const [tenthFirst] = game[9];
    for (const pin of tenthFirst) {
      const btn = page.locator(`button[aria-label="Pin ${pin} down"]:not([disabled])`);
      if (await btn.count()) await btn.click();
    }
    await fillLine(page, { stance: 24, intendedTarget: 10, slide: 23.5, actualTarget: 11 });
    await dismissPrompts(page);
    await shootBothThemes(page, "scorer");

    // Finish the frame so the game counts: two shots, left open.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await recordShot(page, game[9][1]);
  } else {
    for (const frame of game) {
      await chooseBall(page, ballOfNight[i], decoyFor(i));
      for (const leave of frame) await recordShot(page, leave);
    }
  }
  await dismissPrompts(page);
}

await page.getByRole("button", { name: "Stats" }).last().click();
await shootBothThemes(page, "stats");

await browser.close();
