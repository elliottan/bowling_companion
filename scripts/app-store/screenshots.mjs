// The App Store screenshots, taken from the real app and then captioned.
//
//   1. npm run dev
//   2. SHOTS_STATE=/tmp/headpin-state.json SHOTS_DIR=/tmp/shots npm run shots
//   3. STORE_STATE=/tmp/headpin-state.json STORE_OUT=marketing/app-store/2026-10-27 \
//        node scripts/app-store/screenshots.mjs
//
// Two passes. The first drives the app at the 6.9 inch iPhone's size (440 x 956
// points at 3x, so 1320 x 2868 pixels, the size App Store Connect requires),
// with the phone's safe areas emulated so the app lays itself out around the
// status bar as it does on a phone, and the status bar drawn into that space.
// Those are the plain screenshots (`plain/`). The second sets each one in a
// phone under its caption (`frame.html`), at the same size (`captioned/`).
// Every set is also written at the 6.3 inch iPhone's 1206 x 2622
// (`plain-6.3/`, `captioned-6.3/`), which App Store Connect asks for as well.
// The two screens' shapes differ by under a pixel, so it is a resize.
//
// The captions are the plan in docs/APP-STORE-LISTING.md. A screen that shows
// Headpin Pro carries the Pro badge, since Apple asks that a screenshot say
// when what it features needs a purchase (App Review Guideline 2.3.2).
//
// The app is driven, never mocked: every screenshot is a screen the app has.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { seedHistory } from "../ad-content/history.mjs";
import { SCREEN, STORE_DPR, actAsIphoneApp, drawStatusBar, emulateSafeAreas, removeStatusBar } from "./iphone.mjs";

const BASE = process.env.STORE_BASE ?? "http://localhost:5173";
const STATE = process.env.STORE_STATE;
const OUT = resolve(process.env.STORE_OUT ?? "store-out");
const ONLY = process.env.STORE_ONLY?.split(",");
if (!STATE) throw new Error("STORE_STATE must name a saved bowler (see the header).");

// The 6.9 inch iPhone, shared with the landing page's pictures (iphone.mjs).
const W = SCREEN.width;
const H = SCREEN.height;
const DPR = STORE_DPR;

/**
 * The set, in the order the listing shows it: the first three are what a
 * bowler sees in search before scrolling, so they carry the pitch. `theme` is
 * the app's; the lane view paints its own dark frame either way.
 */
const SMALL = { width: 1206, height: 2622 };
const small = (png) => sharp(png).resize(SMALL.width, SMALL.height, { fit: "cover" }).png().toBuffer();

const SHOTS = [
  { name: "01-score", theme: "dark", h: "Score <em>every shot</em>.", sub: "Tap the pins you left. Unlimited games, free." },
  { name: "02-line", theme: "dark", h: "Remember every|<em>line</em> you threw.", sub: "Your line drawn over the oil, shot by shot." },
  { name: "03-arsenal", theme: "dark", h: "Your whole|<em>arsenal</em>, free.", sub: "Every ball you own, with no cap on the bag." },
  { name: "04-stats", theme: "dark", h: "Know what's|<em>working</em>.", sub: "Your average, pocket and spares, over time." },
  { name: "05-catalog", theme: "dark", h: "Over 800 balls,|<em>one tap</em>.", sub: "Specs and photos. Build your bag from them." },
  { name: "06-pattern", theme: "dark", h: "See the oil|<em>before you throw</em>.", sub: "Load tables and the oil drawn on the lane." },
  { name: "07-layout", theme: "dark", h: "See a layout|<em>before you drill it</em>.", sub: "Dual angle and Storm VLS, drawn from your PAP." },
  { name: "08-pro", theme: "dark", pro: true, h: "Go deeper|with <em>Pro</em>.", sub: "Carry, strike, ball by ball, alley by alley. One purchase, no subscription." },
  { name: "09-home", theme: "dark", h: "Works without|<em>a signal</em>.", sub: "No account to make. Built for the alley." },
  { name: "10-history", theme: "dark", h: "Every night,|<em>on your phone</em>.", sub: "Unlimited sessions. Back up any time, free." }
];
const wanted = (name) => !ONLY || ONLY.some((o) => name.includes(o));

const browser = await chromium.launch(
  process.env.SHOTS_CHROMIUM ? { executablePath: process.env.SHOTS_CHROMIUM } : {}
);
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  storageState: STATE,
  colorScheme: "dark",
  reducedMotion: "reduce",
  hasTouch: false
});
// The screens are the iPhone app's, not the web app's (iphone.mjs), and the
// catalogs and photos it fetches from headpin.app are answered here from the
// dev server.
await actAsIphoneApp(context);
await context.route("https://headpin.app/**", async (route) => {
  const url = new URL(route.request().url());
  route.fulfill({ response: await route.fetch({ url: `${BASE}${url.pathname}${url.search}` }) });
});
const page = await context.newPage();
await emulateSafeAreas(page);
const wait = (ms) => page.waitForTimeout(ms);

async function setTheme(theme) {
  await page.evaluate((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* the attribute is what the screenshot needs */
    }
    document.documentElement.dataset.theme = t;
  }, theme);
  await wait(300);
}

/** The app with every animation finished before it is drawn. */
async function quiet() {
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" }).catch(() => {});
}

/** The app, launched afresh: with Pro bought or not, from the Home tab. */
async function home(pro = false) {
  await page.evaluate((p) => localStorage.setItem("store-shots.pro", p ? "1" : "0"), pro).catch(() => {});
  await page.goto(`${BASE}/app`);
  await page.getByRole("navigation").first().waitFor();
  await quiet();
  await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
  await wait(600);
}

const back = (n = 1) =>
  (async () => {
    for (let i = 0; i < n; i++) {
      await page.getByRole("banner").getByRole("button", { name: "Back", exact: true }).last().click();
      await wait(450);
    }
  })();

const plain = {};
async function shoot(shot, { bar = shot.theme === "dark" ? "#fff" : "#0b1220" } = {}) {
  await wait(500);
  await drawStatusBar(page, bar);
  await wait(150);
  plain[shot.name] = await page.screenshot({ type: "png" });
  await writeFile(join(OUT, "plain", `${shot.name}.png`), plain[shot.name]);
  await writeFile(join(OUT, "plain-6.3", `${shot.name}.png`), await small(plain[shot.name]));
  console.log("took", shot.name);
  await removeStatusBar(page);
}
const shot = (name) => SHOTS.find((s) => s.name.endsWith(name));

/** Hides whatever the app offers between games: the backup nudge, the share
 *  offer, the spare-line toast. None of it is what a screenshot is about. */
async function dismissPrompts() {
  for (const name of ["Dismiss backup reminder", "Dismiss share offer", "Got it", "Dismiss tip", "Not now"]) {
    const btn = page.getByRole("button", { name });
    if (await btn.count()) await btn.first().click().catch(() => {});
  }
  const offer = page.getByText(/Save this as your line/).first();
  if (await offer.count()) {
    await offer.locator("xpath=ancestor::*[.//button][1]").getByRole("button").last().click().catch(() => {});
  }
}

async function addFromCatalog(query, name) {
  await page.getByRole("button", { name: /^Ball catalog/ }).click();
  await page.getByText(/Syncing catalog/).waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
  await page.getByPlaceholder("Search name, brand, coverstock…").fill(query);
  await wait(700);
  await page.getByRole("dialog", { name: "Catalog" }).getByRole("button", { name }).first().click();
  await page.getByRole("button", { name: "Add to arsenal" }).first().click();
  await page.getByRole("dialog", { name: "Add to arsenal" }).getByRole("button", { name: "Add to arsenal" }).click();
  await wait(400);
  await back(2);
}

await mkdir(join(OUT, "plain"), { recursive: true });
await mkdir(join(OUT, "captioned"), { recursive: true });
await mkdir(join(OUT, "plain-6.3"), { recursive: true });
await mkdir(join(OUT, "captioned-6.3"), { recursive: true });

// --- Setup: weeks of league nights, and a bigger bag -----------------------

await home();
await seedHistory(page);
await home();
// A bowler with a name, so Home greets someone.
await page.getByRole("button", { name: "Add your name" }).click();
await page.locator("#bowler-name").fill("Sam");
await page.getByRole("button", { name: "Save name" }).click();
await wait(400);
for (const [query, name] of [["Dynasty", /Black Widow 3\.0 Dynasty/], ["Hy-Road Pearl", /Hy-Road Pearl/], ["Summit Peak", /Summit Peak/], ["Idol Helios", /Idol Helios/]]) {
  await addFromCatalog(query, name);
}

// --- The screens -------------------------------------------------------------

// Tonight's game, into the tenth: the card full of marks, the 10 pin left
// standing, the ball and the line with it.
if (wanted("score") || wanted("home")) {
  await setTheme("dark");
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: "Score", exact: true }).click();
  await page.getByRole("button", { name: "Start session" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Start session" });
  await sheet.getByPlaceholder("Pinecrest Lanes").fill("Sunset Lanes");
  await sheet.getByRole("button", { name: "Start session" }).click();
  const lanes = page.getByRole("dialog", { name: /lanes/i });
  await lanes.waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
  if (await lanes.count()) {
    await lanes.getByRole("textbox", { name: "First lane" }).fill("11").catch(() => {});
    await lanes.getByRole("textbox", { name: "Second lane" }).fill("12").catch(() => {});
    await lanes.getByRole("button", { name: "Close" }).click();
  }
  const RECORD = /^Next( \(|$)/;
  await page.getByRole("button", { name: RECORD }).waitFor();
  const pinDown = (n) => page.locator(`button[aria-label="Pin ${n} down"]:not([disabled])`);
  const strike = () => page.getByRole("button", { name: "Strike", exact: true }).click();
  const spare = async (pin) => {
    await pinDown(pin).click();
    await page.getByRole("button", { name: RECORD }).click();
    await page.getByRole("button", { name: "Spare", exact: true }).click();
  };
  for (const f of ["X", "X", 7, "X", 4, "X", "X", 10, "X"]) {
    if (f === "X") await strike();
    else await spare(f);
    await wait(200);
    await dismissPrompts();
  }
  await dismissPrompts();
  // The tenth's first ball: the Phaze Crimson, the line, the 10 left.
  await page.getByRole("button", { name: /^Ball: / }).click();
  await page.getByRole("dialog", { name: "Ball" }).getByRole("button", { name: /Phaze Crimson/i }).first().click();
  await wait(400);
  await page.locator('input[title="Stance board"]').first().fill("20");
  await page.locator('input[title="Target board (arrows)"]').first().fill("10");
  await page.locator('input[title="Target board (arrows)"]').first().blur();
  await pinDown(10).click();
  await dismissPrompts();
  await page.mouse.click(10, 10);
  if (wanted("score")) await shoot(shot("score"));
  if (wanted("home")) {
    await nav.getByRole("button", { name: "Home" }).click();
    await wait(600);
    await page.evaluate(() => document.querySelectorAll("*").forEach((el) => el.scrollTop && (el.scrollTop = 0)));
    // The backup reminder, put off as a bowler would: it is the app asking,
    // not the app.
    const later = page.getByRole("button", { name: "Later", exact: true });
    if (await later.count()) await later.first().click();
    await wait(300);
    await shoot(shot("home"));
  }
  await home();
}

// The line over a PBA pattern, from the pattern's own page.
// Drawn as a bowler with Pro sees them, with no lock over the controls:
// reading a line, a pattern or a layout is free (ADR-170), and the shot is about
// what is drawn, not the controls that move it.
if (wanted("line") || wanted("pattern")) {
  await home(true);
  await setTheme("dark");
  await page.getByRole("button", { name: /Oil patterns/ }).first().click();
  await page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first().fill("Shark");
  // Home's session tiles name their pattern too, under the pushed screen.
  await page.getByRole("dialog", { name: "Oil patterns" }).getByText("2019 PBA Shark 48").first().click();
  await wait(900);
  if (wanted("pattern")) await shoot(shot("pattern"));
  if (wanted("line")) {
    await page.getByRole("button", { name: "Try in the line visualizer" }).click();
    await wait(1500);
    await shoot(shot("line"), { bar: "#fff" });
  }
  await home();
}

if (wanted("arsenal")) {
  await setTheme("dark");
  await page.getByRole("list", { name: "Your arsenal" }).getByRole("button").first().click();
  await wait(700);
  await shoot(shot("arsenal"));
  await home();
}

// A ball's page in the catalog.
if (wanted("catalog")) {
  await setTheme("dark");
  await page.getByRole("button", { name: /^Ball catalog/ }).click();
  await page.getByText(/Syncing catalog/).waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
  await page.getByPlaceholder("Search name, brand, coverstock…").fill("Phaze Crimson");
  await wait(800);
  await page.getByRole("dialog", { name: "Catalog" }).getByRole("button", { name: /Phaze Crimson/i }).first().click();
  await wait(1500);
  await shoot(shot("catalog"));
  await home();
}

// The layout lab as it opens: the drilled ball first, then what it will do.
if (wanted("layout")) {
  await home(true);
  await setTheme("dark");
  await page.getByRole("button", { name: /^Layouts/ }).click();
  await wait(900);
  await shoot(shot("layout"));
  await home();
}

// Stats: the free numbers at the top, then the Pro cards.
if (wanted("stats") || wanted("pro")) {
  const nav = page.getByRole("navigation");
  if (wanted("stats")) {
    // With Pro, so no lock sits over the numbers: the caption names only the
    // free ones, and the Pro shot (08) is the one that sells the rest.
    await home(true);
    await setTheme("dark");
    await nav.getByRole("button", { name: "Stats" }).click();
    await wait(900);
    await shoot(shot("stats"));
  }
  if (wanted("pro")) {
    await home(true);
    await setTheme("dark");
    await nav.getByRole("button", { name: "Stats" }).click();
    await wait(900);
    await page.getByText("First ball", { exact: true }).first().evaluate((el) => (el.closest("section") ?? el).scrollIntoView({ block: "start" }));
    await page.evaluate(() => {
      // A little room above the card, under the status bar.
      const el = [...document.querySelectorAll("*")].find((n) => n.scrollTop > 0 && n.scrollHeight > n.clientHeight);
      if (el) el.scrollTop -= 12;
    });
    await wait(500);
    await shoot(shot("pro"));
  }
  await home();
}

// Every night, weeks of them, each with its pattern and its games.
if (wanted("history")) {
  await setTheme("dark");
  await page.getByRole("navigation").getByRole("button", { name: "History" }).click();
  await wait(800);
  await shoot(shot("history"));
  await home();
}

await context.close();

// --- Captioned --------------------------------------------------------------

const framer = await browser.newPage({ viewport: { width: W * DPR, height: H * DPR } });
await framer.route("**/store-shot/*", (route) =>
  route.fulfill({ contentType: "image/png", body: plain[decodeURIComponent(route.request().url().split("/").pop())] })
);
for (const [i, s] of SHOTS.entries()) {
  if (!plain[s.name]) continue;
  const q = new URLSearchParams({ h: s.h, sub: s.sub, img: `/store-shot/${encodeURIComponent(s.name)}`, n: String(i) });
  if (s.pro) q.set("pro", "1");
  await framer.goto(`${BASE}/scripts/app-store/frame.html?${q}`);
  await framer.evaluate(() => window.ready);
  const file = join(OUT, "captioned", `${s.name}.png`);
  const png = await framer.screenshot({ path: file });
  await writeFile(join(OUT, "captioned-6.3", `${s.name}.png`), await small(png));
  console.log("wrote", file);
}
await browser.close();
