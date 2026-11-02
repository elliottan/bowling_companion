// The App Store screenshots, taken from the real app and then captioned.
//
//   1. npm run dev
//   2. SHOTS_STATE=/tmp/headpin-state.json SHOTS_DIR=/tmp/shots npm run shots
//   3. STORE_STATE=/tmp/headpin-state.json STORE_LOCALE=ja \
//        STORE_OUT=marketing/app-store/2026-11-02/ja node scripts/app-store/screenshots.mjs
//
// STORE_LOCALE is one of the app's languages (src/lib/i18n.ts), English when
// unset. The setup (the bowler's weeks of nights and the bigger bag) is done
// in English, then the app is switched to that language through its own
// setting, as a bowler would in Settings, and every screen is taken in it.
// The buttons the script presses are found by their names in that language,
// read from its catalog, so a run in Korean presses what a Korean bowler
// would. The captions are scripts/app-store/captions.mjs.
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
// The captions are the plan in docs/APP-STORE-LISTING.md, per language in
// captions.mjs. A screen that shows
// Headpin Pro carries the Pro badge, since Apple asks that a screenshot say
// when what it features needs a purchase (App Review Guideline 2.3.2).
//
// The app is driven, never mocked: every screenshot is a screen the app has.
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { seedHistory } from "../ad-content/history.mjs";
import { CAPTIONS } from "./captions.mjs";
import { SCREEN, STORE_DPR, actAsIphoneApp, drawStatusBar, emulateSafeAreas, removeStatusBar } from "./iphone.mjs";

const BASE = process.env.STORE_BASE ?? "http://localhost:5173";
const STATE = process.env.STORE_STATE;
const OUT = resolve(process.env.STORE_OUT ?? "store-out");
const ONLY = process.env.STORE_ONLY?.split(",");
const LOCALE = process.env.STORE_LOCALE ?? "en";
if (!STATE) throw new Error("STORE_STATE must name a saved bowler (see the header).");
if (!CAPTIONS[LOCALE]) throw new Error(`STORE_LOCALE ${LOCALE} has no captions in captions.mjs.`);

/**
 * The app's own words in a language, read from its catalog, so the script can
 * press a button by the name a bowler in that language sees. `say` is the
 * locale the app is in right now: English for the setup, then LOCALE.
 */
function readCatalog(locale) {
  const text = readFileSync(new URL(`../../src/locales/${locale}/messages.po`, import.meta.url), "utf8");
  const words = new Map();
  for (const entry of text.split(/\n\n+/)) {
    const field = (name) => {
      const m = entry.match(new RegExp(`^${name} "((?:[^"\\\\]|\\\\.)*)"$`, "m"));
      return m ? m[1].replace(/\\"/g, '"') : null;
    };
    const id = field("msgid");
    if (id) words.set(`${field("msgctxt") ?? ""}\u0004${id}`, field("msgstr") || id);
  }
  return words;
}
const catalogs = { en: readCatalog("en"), [LOCALE]: readCatalog(LOCALE) };
let say = "en";
/** A message in the app's current language, with its placeholders filled. */
function tr(id, vars = {}, context = "") {
  let text = catalogs[say].get(`${context}\u0004${id}`) ?? id;
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A message as a pattern: a placeholder left unfilled matches anything. With
 *  `start`, the name only has to begin with it. */
function trPattern(id, vars = {}, { start = false, context = "" } = {}) {
  const parts = tr(id, vars, context).split(/\{[^}]+\}/).map(escape);
  return new RegExp(`^${parts.join(".+?")}${start ? "" : "$"}`);
}

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
// STORE_FORMAT=jpeg writes the sets as JPEG (quality 92, no chroma subsampling),
// a seventh of the PNG's size and indistinguishable at the store's sizes: the
// form a set is committed in, eight languages of it. App Store Connect takes
// either, and neither carries an alpha channel, which it refuses.
const JPEG = process.env.STORE_FORMAT === "jpeg";
async function save(dir, name, png) {
  const file = join(OUT, dir, `${name}.${JPEG ? "jpg" : "png"}`);
  const body = JPEG ? await sharp(png).jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer() : png;
  await writeFile(file, body);
  return file;
}

const SHOTS = [
  { name: "01-score", theme: "dark" },
  { name: "02-line", theme: "dark" },
  { name: "03-arsenal", theme: "dark" },
  { name: "04-stats", theme: "dark" },
  { name: "05-catalog", theme: "dark" },
  { name: "06-pattern", theme: "dark" },
  { name: "07-layout", theme: "dark" },
  { name: "08-pro", theme: "dark", pro: true },
  { name: "09-home", theme: "dark" },
  { name: "10-history", theme: "dark" }
].map((shot) => ({ ...shot, ...CAPTIONS[LOCALE][shot.name] }));
const wanted = (name) => !ONLY || ONLY.some((o) => name.includes(o));

const browser = await chromium.launch(
  process.env.SHOTS_CHROMIUM ? { executablePath: process.env.SHOTS_CHROMIUM } : {}
);
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  storageState: STATE,
  locale: LOCALE,
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
// The setup runs in English whatever the browser's language, until the switch
// below writes the language setting itself.
await context.addInitScript(() => {
  try {
    if (!localStorage.getItem("language")) localStorage.setItem("language", "en");
  } catch {
    /* the app falls back to the browser's language */
  }
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
  await page.getByRole("navigation").getByRole("button", { name: tr("Home") }).click();
  await wait(600);
}

const back = (n = 1) =>
  (async () => {
    for (let i = 0; i < n; i++) {
      const name = new RegExp(`^(${escape(tr("Back"))}|${escape(tr("Back", {}, "navigation"))})$`);
      await page.getByRole("banner").getByRole("button", { name }).last().click();
      await wait(450);
    }
  })();

const plain = {};
async function shoot(shot, { bar = shot.theme === "dark" ? "#fff" : "#0b1220" } = {}) {
  await wait(500);
  await drawStatusBar(page, bar);
  await wait(150);
  plain[shot.name] = await page.screenshot({ type: "png" });
  await save("plain", shot.name, plain[shot.name]);
  await save("plain-6.3", shot.name, await small(plain[shot.name]));
  console.log("took", shot.name);
  await removeStatusBar(page);
}
const shot = (name) => SHOTS.find((s) => s.name.endsWith(name));

/** Hides whatever the app offers between games: the backup nudge, the share
 *  offer, the spare-line toast. None of it is what a screenshot is about. */
async function dismissPrompts() {
  for (const id of ["Dismiss backup reminder", "Dismiss share offer", "Got it", "Dismiss tip", "Not now"]) {
    const btn = page.getByRole("button", { name: tr(id), exact: true });
    if (await btn.count()) await btn.first().click().catch(() => {});
  }
  const offer = page.getByText(trPattern("Save this as your line for {leave}")).first();
  if (await offer.count()) {
    await offer.locator("xpath=ancestor::*[.//button][1]").getByRole("button").last().click().catch(() => {});
  }
}

/** The catalog, its search filled in, once it has synced. */
async function openCatalog(query) {
  await page.getByRole("button", { name: trPattern("Ball catalog", {}, { start: true }) }).click();
  await page.getByText(tr("Syncing catalog…")).waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
  await page.getByPlaceholder(tr("Search name, brand, coverstock…")).fill(query);
}

async function addFromCatalog(query, name) {
  await openCatalog(query);
  await wait(700);
  await page.getByRole("dialog", { name: tr("Catalog") }).getByRole("button", { name }).first().click();
  await page.getByRole("button", { name: tr("Add to arsenal") }).first().click();
  await page.getByRole("dialog", { name: tr("Add to arsenal") }).getByRole("button", { name: tr("Add to arsenal") }).click();
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

// The bowler's language, picked as Settings picks it: the setting, then a
// reload. Everything from here is on screens in that language.
if (LOCALE !== "en") {
  await page.evaluate((locale) => localStorage.setItem("language", locale), LOCALE);
  say = LOCALE;
  await home();
}

// --- The screens -------------------------------------------------------------

// Tonight's game, into the tenth: the card full of marks, the 10 pin left
// standing, the ball and the line with it.
if (wanted("score") || wanted("home")) {
  await setTheme("dark");
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: tr("Score"), exact: true }).click();
  await page.getByRole("button", { name: tr("Start session") }).first().click();
  const sheet = page.getByRole("dialog", { name: tr("Start session") });
  await sheet.getByPlaceholder("Pinecrest Lanes").fill("Sunset Lanes");
  await sheet.getByRole("button", { name: tr("Start session") }).click();
  const lanes = page.getByRole("dialog", { name: trPattern("Game {gameNumber} lanes") });
  await lanes.waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
  if (await lanes.count()) {
    await lanes.getByRole("textbox", { name: tr("First lane") }).fill("11").catch(() => {});
    await lanes.getByRole("textbox", { name: tr("Second lane") }).fill("12").catch(() => {});
    await lanes.getByRole("button", { name: tr("Close") }).click();
  }
  // "Next", or "Next (Strike)" with what it would record under it.
  const RECORD = new RegExp(`^(${escape(tr("Next"))}$|${trPattern("Next ({nextOutcome})").source.slice(1)})`);
  await page.getByRole("button", { name: RECORD }).waitFor();
  const pinDown = (n) => page.locator(`button[aria-label="${tr("Pin {pin}, down", { pin: n })}"]:not([disabled])`);
  const strike = () => page.getByRole("button", { name: tr("Strike"), exact: true }).click();
  const spare = async (pin) => {
    await pinDown(pin).click();
    await page.getByRole("button", { name: RECORD }).click();
    await page.getByRole("button", { name: tr("Spare"), exact: true }).click();
  };
  for (const f of ["X", "X", 7, "X", 4, "X", "X", 10, "X"]) {
    if (f === "X") await strike();
    else await spare(f);
    await wait(200);
    await dismissPrompts();
  }
  await dismissPrompts();
  // The tenth's first ball: the Phaze Crimson, the line, the 10 left.
  await page.getByRole("button", { name: trPattern("Ball: {name}. Tap to change", {}, { start: true }) }).click();
  await page.getByRole("dialog", { name: tr("Ball") }).getByRole("button", { name: /Phaze Crimson/i }).first().click();
  await wait(400);
  const stanceBoard = page.locator(`input[title="${tr("{field} board", { field: tr("Stance") })}"]`).first();
  const targetBoard = page.locator(`input[title="${tr("Target board (arrows)")}"]`).first();
  await stanceBoard.fill("20");
  await targetBoard.fill("10");
  await targetBoard.blur();
  await pinDown(10).click();
  await dismissPrompts();
  await page.mouse.click(10, 10);
  if (wanted("score")) await shoot(shot("score"));
  if (wanted("home")) {
    await nav.getByRole("button", { name: tr("Home") }).click();
    await wait(600);
    await page.evaluate(() => document.querySelectorAll("*").forEach((el) => el.scrollTop && (el.scrollTop = 0)));
    // The backup reminder, put off as a bowler would: it is the app asking,
    // not the app.
    const later = page.getByRole("button", { name: tr("Later"), exact: true });
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
  // The Tools row, by its title and the line under it: in Chinese the title
  // alone (油型) is in half the buttons on Home.
  await page.getByRole("button", { name: new RegExp(`${escape(tr("Oil patterns"))}.*${escape(tr("Look up a pattern's length and oil"))}`) }).first().click();
  await page.getByRole("searchbox").or(page.getByPlaceholder(tr("Search patterns"))).first().fill("Shark");
  // Home's session tiles name their pattern too, under the pushed screen.
  await page.getByRole("dialog", { name: tr("Oil patterns") }).getByText("2019 PBA Shark 48").first().click();
  await wait(900);
  if (wanted("pattern")) await shoot(shot("pattern"));
  if (wanted("line")) {
    await page.getByRole("button", { name: tr("Try in the line visualizer") }).click();
    await wait(1500);
    await shoot(shot("line"), { bar: "#fff" });
  }
  await home();
}

if (wanted("arsenal")) {
  await setTheme("dark");
  await page.getByRole("list", { name: tr("Your arsenal") }).getByRole("button").first().click();
  await wait(700);
  await shoot(shot("arsenal"));
  await home();
}

// A ball's page in the catalog.
if (wanted("catalog")) {
  await setTheme("dark");
  await openCatalog("Phaze Crimson");
  await wait(800);
  await page.getByRole("dialog", { name: tr("Catalog") }).getByRole("button", { name: /Phaze Crimson/i }).first().click();
  await wait(1500);
  await shoot(shot("catalog"));
  await home();
}

// The layout lab as it opens: the drilled ball first, then what it will do.
if (wanted("layout")) {
  await home(true);
  await setTheme("dark");
  await page.getByRole("button", { name: trPattern("Layouts", {}, { start: true }) }).click();
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
    await nav.getByRole("button", { name: tr("Stats") }).click();
    await wait(900);
    await shoot(shot("stats"));
  }
  if (wanted("pro")) {
    await home(true);
    await setTheme("dark");
    await nav.getByRole("button", { name: tr("Stats") }).click();
    await wait(900);
    await page.getByText(tr("First ball"), { exact: true }).first().evaluate((el) => (el.closest("section") ?? el).scrollIntoView({ block: "start" }));
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
  await page.getByRole("navigation").getByRole("button", { name: tr("History") }).click();
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
  const q = new URLSearchParams({ h: s.h, sub: s.sub, img: `/store-shot/${encodeURIComponent(s.name)}`, n: String(i), lang: LOCALE });
  if (s.pro) q.set("pro", "1");
  await framer.goto(`${BASE}/scripts/app-store/frame.html?${q}`);
  await framer.evaluate(() => window.ready);
  const png = await framer.screenshot();
  const file = await save("captioned", s.name, png);
  await save("captioned-6.3", s.name, await small(png));
  console.log("wrote", file);
}
await browser.close();
