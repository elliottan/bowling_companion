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
    await locator.first().scrollIntoViewIfNeeded();
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

// Playwright places a click in a scaled iframe as if it were not scaled, so
// every click, setup included, goes to the element's centre by hand.
let current = null;
async function click(locator) {
  await locator.first().scrollIntoViewIfNeeded();
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
    await lanes.getByRole("textbox", { name: "First lane" }).fill("11").catch(() => {});
    await lanes.getByRole("textbox", { name: "Second lane" }).fill("12").catch(() => {});
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

const clampTo = (v, a, b) => Math.min(b, Math.max(a, v));

// The layout of a ball, drawn on the ball: the three sliders that set it, each
// swung in turn, with the drawing moving under them.
await take("layouts", {
  async run({ page, app, tap, mark, wait }) {
    await tap(app.getByRole("button", { name: /^Layouts/ }), "tap-layouts", 900);
    await mark("top", { x: 0, y: 0, w: 390, h: 844 });
    // Scrolled so the first slider sits under the header, with the ball below.
    const first = app.getByRole("slider", { name: "Drilling angle" });
    await first.evaluate((el) => {
      const box = el.closest("div.rounded-xl, section") ?? el;
      const y = box.getBoundingClientRect().top;
      let s = el.parentElement;
      while (s && !(s.scrollHeight > s.clientHeight + 20 && getComputedStyle(s).overflowY !== "visible")) s = s.parentElement;
      (s ?? document.scrollingElement).scrollBy({ top: y - 120, behavior: "smooth" });
    });
    await wait(1000);
    await mark("sliders", { x: 0, y: 0, w: 390, h: 844 });
    const swing = async (name, by) => {
      const el = app.getByRole("slider", { name });
      const r = await boxOf(el);
      const [min, max, v0] = (await el.evaluate((n) => [n.min, n.max, n.value])).map(Number);
      const at = (v) => (r.x + 10 + ((v - min) / (max - min)) * (r.w - 20)) * SCALE;
      const y = (r.y + r.h / 2) * SCALE;
      const to = clampTo(v0 + by * (max - min), min, max);
      await mark(`drag-${name}`, el);
      await page.mouse.move(at(v0), y);
      await page.mouse.down();
      for (let k = 1; k <= 16; k++) {
        await page.mouse.move(at(v0 + (to - v0) * (1 - Math.pow(1 - k / 16, 2))), y);
        await wait(30);
      }
      await page.mouse.up();
      await wait(150);
    };
    await swing("Drilling angle", 0.3);
    await swing("Pin to PAP", -0.25);
    await swing("VAL angle", 0.3);
    await mark("dragged", { x: 0, y: 0, w: 390, h: 844 });
    await wait(700);
  }
});
/**
 * History with some weeks behind it. The saved bowler bowled five nights in
 * one sitting, one game most nights; a league bowler's list reads as weeks
 * apart, three or four games a night, each on a pattern. Game 1 of each night
 * stays as bowled; the games after it are written straight to the database
 * from these cards.
 */
const MORE_GAMES = [
  ["X 9/ X X 81 9/ X 7/ X X9/", "8/ X 9- X X 7/ 9/ X 81 X8/"],
  ["X X 9/ 8/ X 9- X X 7/ 9/X", "9/ 81 X X X 9/ 7/ X 9- XXX", "X 7/ 9- X 8/ X X 9/ 81 X9/"],
  ["9- X 8/ X 7/ X 9/ X X 9/8", "X X X 9/ X 81 X 9/ X XX8"],
  ["7/ 9/ X 81 X X 9- 8/ X 9/X", "X 9/ 9/ X 8- X X 7/ X 81", "8/ X X 9/ 81 X 9/ X X X9/"],
  ["X 9/ X 9- X 8/ X X 9/ X81", "9/ X X 8/ X 9- X 7/ X 9/9"]
];
const NIGHTS = [
  { date: "2026-09-16", lanes: ["3", "4"], pattern: /PBA Bear/ },
  { date: "2026-09-23", lanes: ["15", "16"], pattern: /PBA Chameleon/ },
  { date: "2026-09-30", lanes: ["23", "24"], pattern: /Mercury/ },
  { date: "2026-10-07", lanes: ["7", "8"], pattern: /PBA Cheetah/ },
  { date: "2026-10-14", lanes: ["11", "12"], pattern: /PBA Shark/ }
];

async function seedHistory(page, app) {
  const frame = page.frames().find((f) => f.url().includes("/score"));
  await frame.evaluate(
    async ({ more, nights }) => {
      const { db } = await import("/src/db/bowlingDb.ts");
      const { calculateGameScore, isStrike } = await import("/src/lib/scoring.ts");
      const { syncPatternCatalog } = await import("/src/services/patternCatalog.ts");
      await syncPatternCatalog().catch(() => {});
      const patterns = await db.oil_patterns.toArray();
      // Pins left by a count, in the order a right-hander's leaves fall.
      const ORDER = [10, 7, 4, 6, 2, 8, 3, 9, 5, 1];
      const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shotsOf = (token, ballId) => {
        const shots = [];
        let standing = ALL;
        for (const ch of token) {
          if (ch === "X" || ch === "/") standing = [];
          else if (ch !== "-") {
            const n = Number(ch);
            const from = standing.length === 10 ? ORDER.slice(0, 10).filter((p) => standing.includes(p)) : standing;
            standing = from.slice(0, from.length - n).sort((a, b) => a - b);
          }
          shots.push({ pins_standing: standing, ball_id: ballId });
          if (standing.length === 0) standing = ALL;
        }
        return shots;
      };
      const sessions = (await db.sessions.toArray()).sort((a, b) => a.id - b.id);
      for (const [i, s] of sessions.entries()) {
        const night = nights[i];
        if (!night) break;
        const games = (await db.games.where("session_id").equals(s.id).toArray()).sort((a, b) => a.game_number - b.game_number);
        const firstFrames = await db.frames.where("game_id").equals(games[0].id).toArray();
        const ballId = firstFrames[0]?.shots[0]?.ball_id;
        for (const g of games.slice(1)) {
          await db.frames.where("game_id").equals(g.id).delete();
          await db.games.delete(g.id);
        }
        for (const [k, card] of more[i].entries()) {
          const gameId = await db.games.add({ session_id: s.id, game_number: k + 2, lanes: night.lanes, start_lane: night.lanes[0] });
          const frames = card.split(" ").map((token, f) => {
            const shots = shotsOf(token, ballId);
            const fr = { game_id: gameId, frame_number: f + 1, shots };
            return { ...fr, is_strike: isStrike(fr), is_spare: !isStrike(fr) && shots.length > 1 && shots[1].pins_standing.length === 0 };
          });
          await db.frames.bulkAdd(frames);
          await db.games.update(gameId, { final_score: calculateGameScore(frames).total });
        }
        await db.games.update(games[0].id, { lanes: night.lanes, start_lane: night.lanes[0] });
        const pattern = patterns.find((p) => new RegExp(night.pattern).test(p.name));
        const date = s.date.length > 10 ? night.date + s.date.slice(10) : night.date;
        await db.sessions.update(s.id, { date, oil_pattern_id: pattern?.id });
      }
    },
    { more: MORE_GAMES, nights: NIGHTS.map((n) => ({ ...n, pattern: n.pattern.source })) }
  );
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

await browser.close();
