// Captures the raw footage for the feature reel from the real app.
//
//   1. npm run dev
//   2. SHOTS_STATE=/tmp/headpin-state.json SHOTS_DIR=/tmp/shots npm run shots
//   3. REEL_STATE=/tmp/headpin-state.json REEL_OUT=/tmp/reel node scripts/ad-content/reel/capture.mjs
//
// Each take is the app at 390 x 844 in an iframe drawn twice its size, so the
// frames are 780 x 1688 and stay sharp when compose.mjs zooms in. Chrome's
// screencast saves a JPEG each time the screen changes (about 25 a second
// here), and every tap and every thing worth pointing at is written down as a
// "mark": a time and the boxes it covers, in the app's own pixels. compose.mjs
// cuts the takes and draws the camera, spotlights, circles and taps from the
// marks, so none of that is baked into the footage.
//
// The app is driven, never mocked: the reel shows only screens the app has.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { seedHistory as writeHistory } from "../history.mjs";

const BASE = process.env.REEL_BASE ?? "http://localhost:5173";
const STATE = process.env.REEL_STATE;
const OUT = process.env.REEL_OUT ?? "reel-out";
const ONLY = process.env.REEL_ONLY?.split(",");
if (!STATE) throw new Error("REEL_STATE must name a saved bowler (see the header).");

const SCALE = 2;
const W = 390;
const H = 844;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

const browser = await chromium.launch(
  process.env.SHOTS_CHROMIUM ? { executablePath: process.env.SHOTS_CHROMIUM } : {}
);

/** A fresh bowler from the saved state, with the app in a scaled iframe. */
async function open() {
  const context = await browser.newContext({
    viewport: { width: W * SCALE, height: H * SCALE },
    storageState: STATE,
    colorScheme: "dark"
  });
  const page = await context.newPage();
  // The frame must be same-site with the page around it, or the browser
  // partitions its storage and the app opens empty, without the saved bowler.
  await page.goto(`${BASE}/scripts/ad-content/stage.html`);
  await page.setContent(
    `<html><body style="margin:0;background:#0b1220;overflow:hidden">` +
      `<iframe id="app" src="${BASE}/score" style="border:0;width:${W}px;height:${H}px;` +
      `transform:scale(${SCALE});transform-origin:0 0"></iframe></body></html>`
  );
  const app = page.frameLocator("#app");
  await app.getByRole("navigation").first().waitFor();
  // The app reopens on the tab it was left on; every take starts from Home.
  current = page;
  await click(app.getByRole("navigation").getByRole("button", { name: "Home" }));
  await wait(1200);
  return { context, page, app };
}

/** The box around one or several locators, in the app's pixels. */
async function boxOf(things) {
  const rects = [];
  for (const thing of [things].flat()) {
    if (typeof thing.evaluate !== "function") {
      rects.push([thing.x, thing.y, thing.x + thing.w, thing.y + thing.h]);
      continue;
    }
    rects.push(
      await thing.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom];
      })
    );
  }
  const x = Math.min(...rects.map((r) => r[0]));
  const y = Math.min(...rects.map((r) => r[1]));
  const round = (v) => Math.round(v * 10) / 10;
  return {
    x: round(x),
    y: round(y),
    w: round(Math.max(...rects.map((r) => r[2])) - x),
    h: round(Math.max(...rects.map((r) => r[3])) - y)
  };
}

/**
 * One take: screencast frames plus marks. `run` drives the app with `tap`,
 * `type` and `mark`, all of which write marks.
 */
async function take(name, { setup, run }) {
  if (ONLY && !ONLY.includes(name)) return;
  const dir = join(OUT, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "frames"), { recursive: true });
  const { context, page, app } = await open();
  current = page;
  // A failed step leaves a picture of where it stopped.
  const failed = async (e) => {
    await page.screenshot({ path: join(OUT, `${name}-failed.png`) }).catch(() => {});
    throw e;
  };
  if (setup) await setup({ page, app }).catch(failed);

  const frames = [];
  const marks = [];
  const cdp = await context.newCDPSession(page);
  let i = 0;
  const writes = [];
  cdp.on("Page.screencastFrame", (f) => {
    const file = `f${String(i++).padStart(5, "0")}.jpg`;
    frames.push({ file, t: now() });
    writes.push(writeFile(join(dir, "frames", file), Buffer.from(f.data, "base64")));
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 88,
    maxWidth: W * SCALE,
    maxHeight: H * SCALE,
    everyNthFrame: 1
  });
  // Nothing changes on a still screen, so nudge one frame out at the start.
  await page.evaluate(() => (document.body.style.background = "#0b1221"));
  await wait(300);
  const t0 = now();

  async function mark(label, things, extra = {}) {
    const boxes = [];
    for (const t of [things ?? []].flat()) boxes.push(await boxOf(t));
    marks.push({ label, t: now() - t0, boxes, ...extra });
  }
  async function tap(locator, label = "tap", pause = 350) {
    await reveal(locator);
    const b = await boxOf(locator);
    const x = b.x + b.w / 2;
    const y = b.y + b.h / 2;
    marks.push({ label, t: now() - t0, boxes: [b], tap: { x, y } });
    await page.mouse.click(x * SCALE, y * SCALE);
    await wait(pause);
  }
  async function type(text, delay = 110) {
    await page.keyboard.type(text, { delay });
  }

  await run({ page, app, tap, type, mark, wait }).catch(failed);
  await wait(400);
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  await context.close();
  await writeFile(
    join(dir, "take.json"),
    JSON.stringify({ name, scale: SCALE, width: W, height: H, frames: frames.map((f) => ({ ...f, t: f.t - t0 })), marks }, null, 1)
  );
  console.log(`take ${name}: ${frames.length} frames, ${marks.length} marks, ${(now() - t0).toFixed(1)} s`);
}

// --- Shared setup -----------------------------------------------------------

/** Scrolls a control to the middle of the screen, if it is not on it. Scrolled
 *  only just into view, it would sit under the floating tab bar, and a tap there
 *  lands on a tab. */
async function reveal(locator) {
  await locator.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > innerHeight - 110) el.scrollIntoView({ block: "center" });
  });
}

// Playwright places a click in a scaled iframe as if it were not scaled, so
// every click, setup included, goes to the element's centre by hand.
let current = null;
async function click(locator) {
  await reveal(locator);
  const b = await boxOf(locator);
  await current.mouse.click((b.x + b.w / 2) * SCALE, (b.y + b.h / 2) * SCALE);
  await wait(250);
}

/** Back, through the banner's Back buttons. */
async function back(app, n = 1) {
  for (let i = 0; i < n; i++) {
    await click(app.getByRole("banner").getByRole("button", { name: "Back", exact: true }).last());
    await wait(450);
  }
}

/**
 * A spare ball and a line for the 10: Brunswick's TZone from the catalog,
 * picked on Spare lines, and a straight shot that makes the 10 for a
 * right-hander. The 10 sits on board 3.1 at 62.6 ft; laid down on 30 (stance
 * 36) over 23.5 at the arrows, a straight ball reaches about board 3.
 */
async function spareSystem(app) {
  await click(app.getByRole("button", { name: /^Ball catalog/ }));
  // The saved bowler's catalog can be older than the app's: let it sync first.
  await wait(500);
  await app.getByText(/Syncing catalog/).waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
  await app.getByPlaceholder("Search name, brand, coverstock…").fill("TZone");
  await click(app.getByRole("button", { name: /TZone/i }).first());
  await click(app.getByRole("button", { name: "Add to arsenal" }).first());
  await click(app.getByRole("dialog", { name: "Add to arsenal" }).getByRole("button", { name: "Add to arsenal" }));
  await wait(400);
  await back(app, 2);
  await click(app.getByRole("button", { name: "Spare lines", exact: true }));
  await click(app.getByText("Choose one"));
  await click(app.getByRole("dialog").last().getByRole("button", { name: /TZone/ }));
  await wait(400);
  await click(app.getByRole("button", { name: "Open spare line for pins 10" }).first());
  const sheet = app.getByRole("dialog").last();
  // A seeded leave opens to read; the pencil makes it a form.
  const edit = sheet.getByRole("button", { name: "Edit spare line" });
  if (await edit.count()) await click(edit);
  const boards = sheet.locator('input[type="number"]');
  await boards.nth(0).fill("36");
  await boards.nth(1).fill("23.5");
  await boards.nth(1).blur();
  await click(sheet.getByRole("button", { name: "Save spare line" }));
  // Saving leaves the sheet open to read; close it, then leave the screen.
  await wait(600);
  const close = app.getByRole("dialog").last().getByRole("button", { name: "Close" });
  if (await close.count()) await click(close);
  await wait(600);
  await back(app);
}

const RECORD = /^Next( \(|$)/;
/** A fresh rack reads as all down: tap the pins left standing. */
const pinDown = (app, n) => app.locator(`button[aria-label="Pin ${n} down"]:not([disabled])`);

/** A session at Sunset Lanes with frames 1 to 7 bowled: X X 9/ X 8/ X X. */
async function sessionToFrame8(app) {
  const nav = app.getByRole("navigation");
  await click(nav.getByRole("button", { name: "Home" }));
  // Home's empty state skips the form (ADR-150): with no session yet, the
  // form is opened from the Score tab instead.
  const start = app.getByRole("button", { name: /^(Start session|Start scoring)$/ }).first();
  await start.waitFor();
  if ((await start.textContent())?.includes("Start scoring")) {
    await click(nav.getByRole("button", { name: "Score", exact: true }));
  }
  await click(app.getByRole("button", { name: "Start session" }).first());
  const sheet = app.getByRole("dialog", { name: "Start session" });
  await sheet.getByPlaceholder("Pinecrest Lanes").fill("Sunset Lanes");
  await click(sheet.getByRole("button", { name: "Start session" }));
  const lanes = app.getByRole("dialog", { name: /lanes/i });
  await lanes.waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
  if (await lanes.count()) {
    // One lane, not a pair: a strike ball carries from the last frame on its
    // own lane (ADR-151), and the carry beat wants the frame just bowled.
    await lanes.getByRole("textbox", { name: "First lane" }).fill("11").catch(() => {});
    await click(lanes.getByRole("button", { name: "Close" }));
  }
  await app.getByRole("button", { name: RECORD }).waitFor();
  const strike = () => click(app.getByRole("button", { name: "Strike", exact: true }));
  const spare = async (pin) => {
    await click(pinDown(app, pin));
    await click(app.getByRole("button", { name: RECORD }));
    await click(app.getByRole("button", { name: "Spare", exact: true }));
  };
  for (const f of ["X", "X", 7, "X", 4, "X", "X"]) {
    if (f === "X") await strike();
    else await spare(f);
    await wait(250);
  }
  // The scorer offers to save a line for a spare made in setup. Not the
  // story here, and it would sit over the bottom of every shot.
  await wait(400);
  const offer = app.getByText(/Save this as your line/).first();
  if (await offer.count()) {
    const dismiss = offer.locator("xpath=ancestor::*[.//button][1]").getByRole("button").last();
    await click(dismiss);
  }
}

// --- Takes ------------------------------------------------------------------

// The game: frames 8 to 10, the way a bowler uses it, then the session stats.
await take("game", {
  async setup({ app }) {
    await spareSystem(app);
    await sessionToFrame8(app);
    await wait(600);
  },
  async run({ app, tap, type, mark, wait }) {
    const ball = app.getByRole("button", { name: /^Ball: / });
    const stance = app.locator('input[title="Stance board"]').first();
    const target = app.locator('input[title="Target board (arrows)"]').first();
    const strike = app.getByRole("button", { name: "Strike", exact: true });
    const spareBtn = app.getByRole("button", { name: "Spare", exact: true });
    const next = app.getByRole("button", { name: RECORD });
    const frame = (n) =>
      app
        .locator(`button[aria-label^="Frame ${n}, shot"], button[aria-label="Go to live entry frame ${n}"]`)
        .first()
        .locator("xpath=../..");
    const lineBox = () => [stance, target];

    await mark("scorer", { x: 0, y: 0, w: 390, h: 640 });
    // The scorer's three cards, for framing a shot on a card's own edges.
    await mark("card", app.locator('button[aria-label="Go to live entry frame 8"]').first().locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]"));
    await mark("deck", app.locator('button[aria-label="Pin 1 down"]').first().locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]"));
    await mark("panel", stance.locator("xpath=ancestor::div[contains(@class,'divide-y')][1]"));
    await mark("intended", stance.locator("xpath=ancestor::div[contains(@class,'py-1')][1]"));
    // Frame 8, half done, held long enough to be seen whole before the camera
    // goes in on the Ball button.
    await wait(1800);
    await mark("ball", ball);
    await wait(900);
    await tap(ball, "tap-ball", 200);
    // The picker slides up: mark its rows once it has stopped.
    const picker = app.getByRole("dialog", { name: "Ball" });
    const pick = picker.getByRole("button", { name: /Phaze Crimson/i }).first();
    await wait(650);
    await mark("picker", picker);
    await mark("pick", pick);
    await wait(350);
    await tap(pick, "tap-pick", 600);
    await mark("line", lineBox());
    await tap(stance, "tap-stance", 150);
    await type("20");
    await tap(target, "tap-target", 150);
    await type("10");
    await wait(300);
    await mark("line-set", lineBox());
    // A beat on the eye before it is tapped, so it can be lit first.
    const eye = app.getByRole("button", { name: "View intended line" });
    await wait(300);
    await mark("eye", eye);
    await wait(800);
    await tap(eye, "tap-eye", 300);
    await mark("lane-open", { x: 0, y: 0, w: 390, h: 844 });
    await wait(1600);
    await mark("lane-held", { x: 0, y: 0, w: 390, h: 844 });
    await tap(app.getByRole("dialog", { name: /visualizer/i }).getByRole("button", { name: "Close" }), "tap-close", 500);
    // A beat on the whole scorer before the tap, so the camera can pull back
    // to show where Strike is and then go in on it.
    await mark("strike-wide", [strike, frame(8), ...lineBox()]);
    await wait(1200);
    await mark("strike", [strike, frame(8)]);
    await wait(500);
    await tap(strike, "tap-strike", 700);
    await mark("frame8", frame(8));
    await wait(500);

    // Frame 9: the line carried over, a 2-1 move, then the 10.
    await mark("carry", [ball, ...lineBox()]);
    await wait(1500);
    await tap(stance, "tap-stance2", 450);
    const move = app.getByRole("button", { name: "Move 2-1 in" });
    await mark("moves", [move, stance]);
    await wait(300);
    await tap(move, "tap-move", 600);
    await mark("moved", lineBox());
    await wait(500);
    await stance.first().blur();
    await wait(400);
    await mark("ten", pinDown(app, 10));
    await tap(pinDown(app, 10), "tap-ten", 400);
    await tap(next, "tap-next", 700);
    await mark("spare-set", [ball, ...lineBox()]);
    await wait(900);
    await mark("spare", [spareBtn, frame(9)]);
    await tap(spareBtn, "tap-spare", 700);
    await mark("frame9", frame(9));
    await wait(500);

    // The tenth: three strikes.
    for (let i = 0; i < 3; i++) {
      await mark(`tenth-${i}`, [strike, frame(10)]);
      await tap(strike, `tap-tenth-${i}`, 550);
    }
    await mark("frame10", frame(10));
    await wait(900);

    // The numbers across every night, down to which ball carries.
    const statsTab = app.getByRole("navigation").getByRole("button", { name: "Stats" });
    await mark("stats-btn", statsTab);
    await tap(statsTab, "tap-stats", 1000);
    await mark("stats", { x: 0, y: 0, w: 390, h: 844 });
    await wait(600);
    const balls = app.getByText("Balls", { exact: true }).first();
    await balls.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    await wait(1300);
    await mark("balls", balls.locator("xpath=ancestor::section[1] | ancestor::div[contains(@class,'rounded')][1]").last());
    await wait(600);
    await mark("stats-end", { x: 0, y: 0, w: 390, h: 844 });
    await wait(600);
  }
});

// An oil pattern, then the line drawn over it.
await take("patterns", {
  async run({ app, tap, type, mark, wait }) {
    await tap(app.getByRole("button", { name: /Oil patterns/ }).first(), "tap-patterns", 700);
    const search = app.getByRole("searchbox").or(app.getByPlaceholder(/search/i)).first();
    await tap(search, "tap-search", 200);
    await type("Shark", 90);
    await wait(400);
    await tap(app.getByText("2019 PBA Shark 48").first(), "tap-shark", 900);
    await mark("graph", app.getByText("Oil on the lane", { exact: false }).first().locator("xpath=.."));
    await wait(1200);
    await tap(app.getByRole("button", { name: "Try in the line visualizer" }), "tap-try", 1800);
    await mark("oil-lane", { x: 0, y: 0, w: 390, h: 844 });
    await wait(800);
  }
});

// Spare lines: the leave you have most, the grid of leaves.
await take("spares", {
  async setup({ app }) {
    await spareSystem(app);
  },
  async run({ app, tap, mark, wait }) {
    await tap(app.getByRole("button", { name: "Spare lines", exact: true }), "tap-spares", 900);
    await mark("nudge", app.getByText(/most often/).first().locator("xpath=../.."));
    await wait(900);
    await tap(app.getByRole("button", { name: "Open spare line for pins 10" }).first(), "tap-ten", 1200);
    await mark("ten-line", { x: 0, y: 300, w: 390, h: 544 });
    await wait(800);
  }
});

// The ball catalog: search, a ball's page.
await take("catalog", {
  async run({ page, app, tap, type, mark, wait }) {
    await tap(app.getByRole("button", { name: /^Ball catalog/ }), "tap-catalog", 900);
    await mark("list", { x: 0, y: 0, w: 390, h: 844 });
    await wait(300);
    // A thumb's flick down the list: the wheel in small steps, easing off.
    await mark("scroll", { x: 0, y: 0, w: 390, h: 844 });
    await page.mouse.move(195 * SCALE, 560 * SCALE);
    for (let k = 0; k < 40; k++) {
      await page.mouse.wheel(0, 70 * (1 - k / 48));
      await wait(30);
    }
    await mark("scrolled", { x: 0, y: 0, w: 390, h: 844 });
    await wait(500);
    const search = app.getByPlaceholder("Search name, brand, coverstock…");
    await tap(search, "tap-search", 200);
    await type("Phaze", 90);
    // The list filters a moment after the last key: tap once it has settled.
    await wait(1100);
    // Scoped to the catalog: the bag under it has a Phaze Crimson button too.
    await tap(app.getByRole("dialog", { name: "Catalog" }).getByRole("button", { name: /Phaze Crimson/i }).first(), "tap-ball", 1200);
    await mark("ball", { x: 0, y: 0, w: 390, h: 844 });
    await wait(800);
  }
});

/** The weeks of history (../history.mjs), then the app reloaded onto them. */
async function seedHistory(page, app) {
  const frame = page.frames().find((f) => f.url().includes("/score"));
  await writeHistory(frame);
  await frame.evaluate(() => location.reload());
  await wait(1500);
  await app.getByRole("navigation").first().waitFor();
  await wait(800);
}

// History: every night, kept on the phone.
await take("history", {
  async setup({ page, app }) {
    await seedHistory(page, app);
  },
  async run({ app, tap, mark, wait }) {
    await tap(app.getByRole("navigation").getByRole("button", { name: "History" }), "tap-history", 900);
    await mark("list", { x: 0, y: 0, w: 390, h: 844 });
    await wait(1200);
  }
});

// The arsenal: every ball the bowler owns, from the balls beside the greeting
// on Home (Home has no Arsenal button).
await take("arsenal", {
  async setup({ app }) {
    // A league bowler's bag is bigger than the saved bowler's five.
    for (const [query, name] of [["Dynasty", /Black Widow 3\.0 Dynasty/], ["Hy-Road Pearl", /Hy-Road Pearl/], ["Summit Peak", /Summit Peak/], ["Idol Helios", /Idol Helios/]]) {
      await click(app.getByRole("button", { name: /^Ball catalog/ }));
      await wait(500);
      await app.getByText(/Syncing catalog/).waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
      await app.getByPlaceholder("Search name, brand, coverstock…").fill(query);
      await wait(700);
      await click(app.getByRole("dialog", { name: "Catalog" }).getByRole("button", { name }).first());
      await click(app.getByRole("button", { name: "Add to arsenal" }).first());
      await click(app.getByRole("dialog", { name: "Add to arsenal" }).getByRole("button", { name: "Add to arsenal" }));
      await wait(400);
      await back(app, 2);
    }
    await wait(800);
  },
  async run({ app, tap, mark, wait }) {
    await mark("home", { x: 0, y: 0, w: 390, h: 844 });
    await wait(500);
    await tap(app.getByRole("list", { name: "Your arsenal" }).getByRole("button").first(), "tap-arsenal", 900);
    await mark("list", { x: 0, y: 0, w: 390, h: 844 });
    await wait(1400);
  }
});

// Stats across the weeks of history: the average and the trend at the top.
await take("stats", {
  async setup({ page, app }) {
    await seedHistory(page, app);
  },
  async run({ app, tap, mark, wait }) {
    await tap(app.getByRole("navigation").getByRole("button", { name: "Stats" }), "tap-stats", 1200);
    await mark("top", { x: 0, y: 0, w: 390, h: 844 });
    const average = app.getByText("Average", { exact: true }).first().locator("xpath=ancestor::section[1] | ancestor::div[contains(@class,'rounded')][1]").last();
    await mark("average", average);
    await mark("trend", app.getByText("Your score per finished game.").first().locator("xpath=ancestor::*[contains(@class,'rounded-xl')][1]"));
    await wait(1600);
  }
});

await browser.close();
