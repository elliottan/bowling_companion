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
// Voiceover: with ADS_TTS_PYTHON and ADS_TTS_MODELS set (see voice.py), every
// line in VOICE below is spoken first, and each caption that names one waits
// for the line before it to finish, so the video runs at the pace of the voice.
// The clips are then mixed under the picture. Without them the videos are
// silent, as feed video mostly plays anyway; the captions carry it either way.
//
// The app is driven, never mocked: an ad that shows a screen the app does not
// have is the one thing in this folder that would be a lie.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.ADS_BASE ?? "http://localhost:5173";
const STATE = process.env.ADS_STATE;
const OUT = process.env.ADS_OUT ?? "ads-out";
// ADS_ONLY=05-spares records just that one.
const ONLY = process.env.ADS_ONLY?.split(",");
if (!STATE) throw new Error("ADS_STATE must name a saved bowler (see the header).");

/**
 * What the voice says, per video, keyed by the caption it starts with.
 *
 * Written to be heard rather than read, so it is close to the caption but not
 * always the same words: "2-1" is said "two and one", the address is said
 * "dot app", and Kegel is left out because the voice says it wrong. "Head pin"
 * is two words because as one the voice swallows the p, and a listener hears
 * "Headbin".
 */
const VOICE = {
  "01-line": {
    remember: "Head pin remembers every line you throw.",
    board: "Change a board, and watch the line move.",
    move: "Try a two and one move, before you throw it.",
    end: "Head pin. It's free, at head pin dot app."
  },
  "05-spares": {
    most: "Which pin do you leave the most?",
    asks: "Head pin counts every leave, and asks you for a line.",
    stand: "Where you stand. Where you aim.",
    lane: "And there it is, on the lane.",
    end: "Your spare system, written down. Head pin, free at head pin dot app."
  }
};

/** Speaks every line once (voice.py skips a clip it already has) and returns
 *  { video: { key: { file, seconds } } }, or null when no voice is set up. */
function speakAll() {
  const python = process.env.ADS_TTS_PYTHON;
  if (!python || !process.env.ADS_TTS_MODELS) {
    console.log("no ADS_TTS_PYTHON / ADS_TTS_MODELS: recording without a voice");
    return null;
  }
  const dir = resolve(OUT, "voice");
  execFileSync("mkdir", ["-p", dir]);
  const style = `${process.env.ADS_TTS_VOICE ?? "af_heart"}@${process.env.ADS_TTS_SPEED ?? "1.0"}`;
  const jobs = [];
  for (const [video, lines] of Object.entries(VOICE)) {
    for (const [key, text] of Object.entries(lines)) {
      const hash = createHash("sha1").update(`${style}\n${text}`).digest("hex").slice(0, 12);
      jobs.push({ video, key, text, out: join(dir, `${hash}.wav`) });
    }
  }
  const stdout = execFileSync(python, [new URL("./voice.py", import.meta.url).pathname], {
    input: JSON.stringify(jobs.map(({ text, out }) => ({ text, out }))),
    encoding: "utf8",
    maxBuffer: 1 << 20
  });
  const seconds = Object.fromEntries(
    stdout.trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.out, r.seconds])
  );
  const voice = {};
  for (const j of jobs) (voice[j.video] ??= {})[j.key] = { file: j.out, seconds: seconds[j.out] };
  return voice;
}

const voice = speakAll();

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
  if (ONLY && !ONLY.includes(name)) return;
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

  // The voice: a line starts with its caption, never over the line before it.
  const lines = voice?.[name] ?? {};
  const spoken = [];
  let voiceFreeAt = 0;
  async function speak(key) {
    const clip = key && lines[key];
    if (!clip) return;
    if (Date.now() < voiceFreeAt) await wait(voiceFreeAt - Date.now());
    spoken.push({ file: clip.file, at: (Date.now() - started) / 1000 });
    // A breath between lines, so they do not run together.
    voiceFreeAt = Date.now() + clip.seconds * 1000 + 250;
  }
  async function caption(html, key) {
    if (key && lines[key] && Date.now() < voiceFreeAt) await wait(voiceFreeAt - Date.now());
    await page.evaluate((h) => window.caption(h), html);
    await speak(key);
  }
  async function endCard(html, key) {
    if (key && lines[key] && Date.now() < voiceFreeAt) await wait(voiceFreeAt - Date.now());
    await page.evaluate((h) => window.endCard(h), html);
    await speak(key);
  }

  // The first tap can land before the app in the frame has finished
  // starting, and a tap on a screen still mounting does nothing. Wait for
  // the tab bar, then a beat for the first render to settle.
  await app.getByRole("navigation").first().waitFor();
  await wait(1200);
  await setup({ page, app, tap });
  await wait(600);
  const trimFrom = (Date.now() - started) / 1000;
  await scene({ page, app, tap, caption, endCard, wait });
  // The end card holds until its line has been said.
  if (Date.now() < voiceFreeAt) await wait(voiceFreeAt - Date.now() + 500);

  const video = page.video();
  await context.close();
  const webm = await video.path();
  const mp4 = join(OUT, `${name}.mp4`);
  const audio = [];
  if (spoken.length) {
    // Each clip delayed to where its caption appeared, mixed, padded to the
    // picture's length, and brought to the -16 LUFS that social feeds expect.
    for (const s of spoken) audio.push("-i", s.file);
    const delayed = spoken.map((s, i) => {
      const ms = Math.max(0, Math.round((s.at - trimFrom) * 1000));
      return `[${i + 1}:a]adelay=${ms}|${ms}[v${i}]`;
    });
    const mix =
      `${spoken.map((_, i) => `[v${i}]`).join("")}amix=inputs=${spoken.length}:normalize=0,` +
      "loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]";
    audio.push(
      "-filter_complex", [...delayed, mix].join(";"),
      "-map", "0:v", "-map", "[aout]",
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest"
    );
  }
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", trimFrom.toFixed(2), "-i", webm,
    ...audio,
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
  async scene({ app, tap, caption, endCard, wait }) {
    await caption("Remember every <em>line</em> you threw.", "remember");
    await wait(2200);
    await caption("Change a board and <em>watch the line move</em>.", "board");
    for (let i = 0; i < 3; i++) await tap(app.getByRole("button", { name: "Target right" }), 650);
    await wait(500);
    await caption("Try a <em>2-1 move</em> before you throw it.", "move");
    await tap(app.getByRole("button", { name: "Quick moves" }), 800);
    await tap(app.getByRole("button", { name: /^Move 2-1 (in|out)$/ }).first(), 1300);
    await wait(900);
    await endCard("Remember every <em>line</em> you threw.", "end");
    await wait(3200);
  }
});

// 5. Your spare system: the leave you miss most, a line saved for it, drawn.
//
// The saved bowler owns no spare ball, so the setup adds one from the catalog
// (Brunswick's TZone, a polyester ball many bowlers own) and picks it as the
// spare ball, so the screen opens with it chosen. The line is one that makes
// the 7: for a right-hander the 7 sits on board 36.9 at 62.6 ft, and a
// straight ball laid down on 8 (stance 14) over 15 at the arrows reaches 37.2
// there, a third of a board off the pin's centre.
await record("05-spares", {
  async setup({ app, tap }) {
    await tap(app.getByRole("button", { name: "Ball catalog", exact: true }));
    await app.getByPlaceholder("Search name, brand, coverstock…").fill("TZone");
    await tap(app.getByRole("button", { name: /TZone/i }).first());
    await tap(app.getByRole("button", { name: "Add to arsenal" }).first());
    await tap(
      app.getByRole("dialog", { name: "Add to arsenal" }).getByRole("button", { name: "Add to arsenal" })
    );
    // Back from the ball, then from the catalog, to Home.
    await tap(app.getByRole("banner").getByRole("button", { name: "Back", exact: true }).last());
    await tap(app.getByRole("banner").getByRole("button", { name: "Back", exact: true }).first());
    await tap(app.getByRole("button", { name: "Spare lines", exact: true }));
    await tap(app.getByText("Choose one"));
    await tap(app.getByRole("dialog").last().getByRole("button", { name: /TZone/ }));
    await app.getByText(/most often/).first().waitFor();
  },
  async scene({ app, tap, caption, endCard, wait }) {
    await caption("Which pin do you <em>leave most</em>?", "most");
    await wait(2200);
    await caption("Headpin counts it, <em>and asks for a line</em>.", "asks");
    await tap(app.getByRole("button", { name: "Add", exact: true }).first(), 900);
    const sheet = app.getByRole("dialog").last();
    const boards = sheet.locator('input[type="number"]');
    await caption("Where you stand. <em>Where you aim.</em>", "stand");
    await tap(boards.nth(0), 200);
    await boards.nth(0).pressSequentially("14", { delay: 160 });
    await tap(boards.nth(1), 200);
    await boards.nth(1).pressSequentially("15", { delay: 160 });
    await wait(900);
    await caption("And see it <em>on the lane</em>.", "lane");
    await tap(sheet.getByRole("button", { name: "View line on the lane" }), 2600);
    await endCard("Your spare system, <em>written down</em>.", "end");
    await wait(3200);
  }
});

await browser.close();
