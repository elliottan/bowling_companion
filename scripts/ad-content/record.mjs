// Records the short vertical ad videos from the real app.
//
//   1. npm run dev
//   2. SHOTS_STATE=/tmp/headpin-state.json SHOTS_DIR=/tmp/shots npm run shots
//      (builds the same bowler the landing page screenshots use, and saves it)
//   3. ADS_STATE=/tmp/headpin-state.json ADS_OUT=/tmp/ads npm run ads:record
//
// Each video is the app running in scripts/ad-content/stage.html, a 1080 x
// 1920 frame with a caption and an end card, recorded by Playwright and then
// trimmed and encoded to H.264 by ffmpeg, which must be on the PATH.
//
// The app is driven, never mocked: an ad that shows a screen the app does not
// have is the one thing in this folder that would be a lie.
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.ADS_BASE ?? "http://localhost:5173";
const STATE = process.env.ADS_STATE;
const OUT = process.env.ADS_OUT ?? "ads-out";
if (!STATE) throw new Error("ADS_STATE must name a saved bowler (see the header).");

const browser = await chromium.launch(
  process.env.SHOTS_CHROMIUM ? { executablePath: process.env.SHOTS_CHROMIUM } : {}
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One video: a fresh context restored from the saved bowler, recording from the
 * first frame. `setup` gets the app to its opening screen and is trimmed off;
 * `scene` is what the viewer sees.
 */
async function record(name, { setup, scene }) {
  const raw = join(OUT, "raw", name);
  await mkdir(raw, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    storageState: STATE,
    colorScheme: "dark",
    recordVideo: { dir: raw, size: { width: 1080, height: 1920 } }
  });
  const page = await context.newPage();
  const started = Date.now();
  await page.goto(`${BASE}/scripts/ad-content/stage.html?src=/score`);
  const app = page.frameLocator("#app");

  /**
   * Tap something in the app, with a ring where the finger lands.
   *
   * The app is scaled up inside the stage, and Playwright places clicks in an
   * iframe as if it were not, so the point is worked out here instead: the
   * element's centre in the app, scaled, plus where the app sits on the stage.
   * Then a real mouse press goes there, which the pin deck's pointer handlers
   * need and a synthetic click would not reach.
   */
  async function tap(locator, pause = 700) {
    await locator.scrollIntoViewIfNeeded();
    const frame = await page.locator("#app").boundingBox();
    const scale = frame.width / 390;
    const [cx, cy] = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    });
    const x = frame.x + cx * scale;
    const y = frame.y + cy * scale;
    await page.evaluate(([px, py]) => window.tapAt(px, py), [x, y]);
    await page.mouse.click(x, y);
    await wait(pause);
  }
  const caption = (html) => page.evaluate((h) => window.caption(h), html);

  // The first tap can land before the app in the frame has finished
  // starting, and a tap on a screen still mounting does nothing. Wait for
  // the tab bar, then a beat for the first render to settle.
  await app.getByRole("navigation").first().waitFor();
  await wait(1200);
  await setup({ page, app, tap });
  await wait(600);
  const trimFrom = (Date.now() - started) / 1000;
  await scene({ page, app, tap, caption, wait });

  const video = page.video();
  await context.close();
  const webm = await video.path();
  const mp4 = join(OUT, `${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", trimFrom.toFixed(2), "-i", webm,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart",
    mp4
  ]);
  console.log("wrote", mp4);
}

await rm(join(OUT, "raw"), { recursive: true, force: true });

// 1. The line draws itself: the lane view, a board changed, a move tried.
await record("01-line", {
  async setup({ app, tap }) {
    await tap(app.getByRole("button", { name: "Line visualizer", exact: true }));
    await app.getByRole("button", { name: "Quick moves" }).waitFor();
  },
  async scene({ app, tap, caption, page, wait }) {
    await caption("Remember every <em>line</em> you threw.");
    await wait(2200);
    await caption("Change a board and <em>watch the line move</em>.");
    for (let i = 0; i < 3; i++) await tap(app.getByRole("button", { name: "Target right" }), 650);
    await wait(500);
    await caption("Try a <em>2-1 move</em> before you throw it.");
    await tap(app.getByRole("button", { name: "Quick moves" }), 800);
    await tap(app.getByRole("button", { name: /^Move 2-1 (in|out)$/ }).first(), 1300);
    await wait(900);
    await page.evaluate(() => window.endCard("Remember every <em>line</em> you threw."));
    await wait(3200);
  }
});

// 2. Tap the pins you left: a fresh game, two frames, the card filling in.
await record("02-pins", {
  async setup({ app, tap }) {
    await tap(app.getByRole("button", { name: "Start session" }).first());
    const sheet = app.getByRole("dialog", { name: "Start session" });
    await sheet.getByPlaceholder("Pinecrest Lanes").fill("Sunset Lanes");
    await tap(sheet.getByRole("button", { name: "Start session" }));
    const lanes = app.getByRole("dialog", { name: /lanes/i });
    await lanes.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    if (await lanes.count()) {
      await lanes.getByRole("textbox", { name: "First lane" }).fill("11");
      await lanes.getByRole("textbox", { name: "Second lane" }).fill("12");
      await tap(lanes.getByRole("button", { name: "Close" }));
    }
    await app.getByRole("button", { name: /^Next( \(|$)/ }).waitFor();
  },
  async scene({ app, tap, caption, page, wait }) {
    const next = () => app.getByRole("button", { name: /^Next( \(|$)/ });
    // A fresh rack reads as all down: tap the pins left standing. On the next
    // ball the leave reads as standing, and tapping it knocks it down.
    const pin = (n) => app.locator(`button[aria-label="Pin ${n} down"]:not([disabled])`);
    const knock = (n) => app.locator(`button[aria-label="Pin ${n} standing"]:not([disabled])`);

    await caption("<em>Tap the pins</em> you left.");
    await wait(1200);
    await tap(pin(10), 900);
    await tap(next(), 900);
    await caption("Headpin keeps <em>the score</em>.");
    await tap(knock(10), 700);
    await tap(next(), 1000);
    await tap(app.getByRole("button", { name: "Strike", exact: true }), 1100);
    await caption("It saves every shot, <em>frame by frame</em>.");
    await tap(pin(7), 800);
    await tap(next(), 900);
    await tap(knock(7), 700);
    await tap(next(), 1300);
    await page.evaluate(() => window.endCard("Tap the pins you left. <em>Headpin</em> keeps score."));
    await wait(3200);
  }
});

// 3. Know what worked: the stats, down to which ball carries.
await record("03-stats", {
  async setup({ app, tap }) {
    await tap(app.getByRole("navigation").getByRole("button", { name: "Stats" }));
    await app.getByText("Ball performance", { exact: false }).first().waitFor();
  },
  async scene({ caption, page, wait }) {
    await caption("Which ball <em>carries</em> best for you?");
    await wait(2200);
    await caption("Headpin counts it, <em>ball by ball</em>.");
    await page.mouse.move(540, 1300);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 60);
      await wait(70);
    }
    await wait(2400);
    await page.evaluate(() => window.endCard("Know what <em>worked</em> last time."));
    await wait(3200);
  }
});

await browser.close();
