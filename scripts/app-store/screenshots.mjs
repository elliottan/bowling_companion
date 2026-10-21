// The App Store screenshots, taken from the real app and then captioned.
//
//   1. npm run dev
//   2. SHOTS_STATE=/tmp/headpin-state.json SHOTS_DIR=/tmp/shots npm run shots
//   3. STORE_STATE=/tmp/headpin-state.json STORE_OUT=marketing/app-store/2026-10-21 \
//        node scripts/app-store/screenshots.mjs
//
// Two passes. The first drives the app at the 6.9 inch iPhone's size (440 x 956
// points at 3x, so 1320 x 2868 pixels, the size App Store Connect requires),
// with the phone's safe areas emulated so the app lays itself out around the
// status bar as it does on a phone, and the status bar drawn into that space.
// Those are the plain screenshots (`plain/`). The second sets each one in a
// phone under its caption (`frame.html`), at the same size (`captioned/`).
//
// The captions are the plan in docs/APP-STORE-LISTING.md. A screen that shows
// Headpin Pro carries the Pro badge, since Apple asks that a screenshot say
// when what it features needs a purchase (App Review Guideline 2.3.2).
//
// The app is driven, never mocked: every screenshot is a screen the app has.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { seedHistory } from "../ad-content/history.mjs";

const BASE = process.env.STORE_BASE ?? "http://localhost:5173";
const STATE = process.env.STORE_STATE;
const OUT = resolve(process.env.STORE_OUT ?? "store-out");
const ONLY = process.env.STORE_ONLY?.split(",");
if (!STATE) throw new Error("STORE_STATE must name a saved bowler (see the header).");

// The 6.9 inch iPhone (16 Pro Max, 17 Pro Max) in points, and its safe areas.
const W = 440;
const H = 956;
const DPR = 3;
const INSETS = { top: 62, bottom: 34, left: 0, right: 0 };

/**
 * The set, in the order the listing shows it: the first three are what a
 * bowler sees in search before scrolling, so they carry the pitch. `theme` is
 * the app's; the lane view paints its own dark frame either way.
 */
const SHOTS = [
  { name: "01-score", theme: "light", h: "Score <em>every shot</em>.", sub: "Tap the pins you left. Unlimited games, free." },
  { name: "02-line", theme: "dark", h: "Remember every|<em>line</em> you threw.", sub: "Your line drawn over the oil, shot by shot." },
  { name: "03-arsenal", theme: "dark", h: "Your whole|<em>arsenal</em>, free.", sub: "Every ball you own, with no cap on the bag." },
  { name: "04-stats", theme: "light", h: "Know what's|<em>working</em>.", sub: "Average, high game, strike and spare rates." },
  { name: "05-catalog", theme: "dark", h: "Hundreds of balls,|<em>one tap</em>.", sub: "Specs and photos. Build your bag from them." },
  { name: "06-pattern", theme: "dark", h: "See the oil|<em>before you throw</em>.", sub: "Load tables and the oil drawn on the lane." },
  { name: "07-layout", theme: "light", h: "See a layout|<em>before you drill it</em>.", sub: "Dual angle and Storm VLS, drawn from your PAP." },
  { name: "08-pro", theme: "dark", pro: true, h: "Go deeper|with <em>Pro</em>.", sub: "Pocket, carry, leaves, ball by ball. One purchase, no subscription." },
  { name: "09-home", theme: "light", h: "Works without|<em>a signal</em>.", sub: "No account to make. Built for the alley." },
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
// The screens are the iPhone app's, not the web app's: the page is told it is
// inside the app, as Capacitor's native side tells it (ADR-155), so it shows
// the app's own copy (no "this browser may clear your scores"), sells Pro
// through the store plugin, and fetches photos and catalogs from headpin.app,
// which is answered here from the dev server. The store plugin answers as
// StoreKit would, at the US price: Pro owned for the screen that shows it,
// not owned for the rest, so a free screen shows exactly what a free download
// does. Every other plugin is missing, and the app falls back as it does when
// one is (the tab bar is then the page's own, ADR-161).
await context.addInitScript(() => {
  const owned = localStorage.getItem("store-shots.pro") === "1";
  const ids = owned ? ["app.headpin.pro"] : [];
  const answers = {
    HeadpinStore: {
      product: { id: "app.headpin.pro", name: "Headpin Pro", price: "$9.99" },
      entitlements: { ids },
      restore: { ids },
      removeListener: {}
    }
  };
  const methods = (names) => names.map((name) => ({ name, rtype: name === "addListener" ? "callback" : "promise" }));
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    PluginHeaders: [{ name: "HeadpinStore", methods: methods(["product", "purchase", "entitlements", "restore", "addListener", "removeListener"]) }],
    nativePromise: (plugin, method) =>
      answers[plugin]?.[method] ? Promise.resolve(answers[plugin][method]) : Promise.reject(new Error(`${plugin}.${method} is not in the screenshot bridge`)),
    nativeCallback: () => Promise.resolve("store-shots"),
    convertFileSrc: (path) => path
  };
});
await context.route("https://headpin.app/**", async (route) => {
  const url = new URL(route.request().url());
  route.fulfill({ response: await route.fetch({ url: `${BASE}${url.pathname}${url.search}` }) });
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
const wait = (ms) => page.waitForTimeout(ms);

// The status bar, drawn where the phone's own would be: the time on the left,
// signal, Wi-Fi and a full battery on the right. A screenshot taken on a phone
// carries neither the Dynamic Island nor the home indicator, so neither is here.
const ICONS = `<svg viewBox="0 0 78 13" width="78" height="13" fill="currentColor"><rect x="0" y="8" width="3.2" height="4.5" rx="1"/><rect x="4.7" y="6" width="3.2" height="6.5" rx="1"/><rect x="9.4" y="3.5" width="3.2" height="9" rx="1"/><rect x="14.1" y="1" width="3.2" height="11.5" rx="1"/><path d="M31 2.6a10 10 0 0 1 7 2.9l1.3-1.3A11.9 11.9 0 0 0 31 .7a11.9 11.9 0 0 0-8.3 3.5L24 5.5a10 10 0 0 1 7-2.9Zm0 3.7a6.3 6.3 0 0 1 4.4 1.8l1.3-1.3A8.1 8.1 0 0 0 31 4.4a8.1 8.1 0 0 0-5.7 2.4l1.3 1.3A6.3 6.3 0 0 1 31 6.3Zm0 3.7c.7 0 1.3.3 1.8.7L31 12.5l-1.8-1.8c.5-.4 1.1-.7 1.8-.7Z"/><rect x="50.5" y="0.5" width="24" height="12" rx="3.6" fill="none" stroke="currentColor" stroke-opacity="0.4"/><rect x="52.5" y="2.5" width="20" height="8" rx="2"/><path d="M76 4.2v4.6a2.5 2.5 0 0 0 0-4.6Z" fill-opacity="0.45"/></svg>`;
async function statusBar(colour) {
  await page.evaluate(
    ({ icons, colour, top }) => {
      document.getElementById("store-status-bar")?.remove();
      const bar = document.createElement("div");
      bar.id = "store-status-bar";
      bar.innerHTML = `<span>9:41</span>${icons}`;
      Object.assign(bar.style, {
        position: "fixed", left: "0", right: "0", top: "0", height: `${top}px`, zIndex: "2147483647",
        pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 30px 0 52px", boxSizing: "border-box", color: colour,
        font: "600 17px/1 Inter, system-ui, sans-serif", letterSpacing: "-0.01em"
      });
      document.body.appendChild(bar);
    },
    { icons: ICONS, colour, top: INSETS.top }
  );
}

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
  await page.goto(`${BASE}/score`);
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
  await statusBar(bar);
  await wait(150);
  plain[shot.name] = await page.screenshot({ type: "png" });
  await writeFile(join(OUT, "plain", `${shot.name}.png`), plain[shot.name]);
  console.log("took", shot.name);
  await page.evaluate(() => document.getElementById("store-status-bar")?.remove());
}
const shot = (name) => SHOTS.find((s) => s.name.endsWith(name));

/** Hides whatever the app offers between games: the backup nudge, the share
 *  offer, the spare-line toast. None of it is what a screenshot is about. */
async function dismissPrompts() {
  for (const name of ["Dismiss backup reminder", "Dismiss share offer", "Got it", "Not now"]) {
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
  await setTheme("light");
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
    await shoot(shot("home"));
  }
  await home();
}

// The line over a PBA pattern, from the pattern's own page.
if (wanted("line") || wanted("pattern")) {
  await setTheme("dark");
  await page.getByRole("button", { name: /Oil patterns/ }).first().click();
  await page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first().fill("Shark");
  await page.getByText("2019 PBA Shark 48").first().click();
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
  await setTheme("light");
  await page.getByRole("button", { name: /^Layouts/ }).click();
  await wait(900);
  await shoot(shot("layout"));
  await home();
}

// Stats: the free numbers at the top, then the Pro cards.
if (wanted("stats") || wanted("pro")) {
  const nav = page.getByRole("navigation");
  if (wanted("stats")) {
    await setTheme("light");
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
  await framer.screenshot({ path: file });
  console.log("wrote", file);
}
await browser.close();
