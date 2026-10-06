// Renders the still ads from scripts/ad-content/still.html, one per ad and
// size, using the landing page's own screenshots (public/shots).
//
//   npm run dev, then: ADS_OUT=/tmp/ads npm run ads:stills
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.ADS_BASE ?? "http://localhost:5173";
const OUT = process.env.ADS_OUT ?? "ads-out";

/** The stills, in the order of the ad plan's creative table. */
const STILLS = [
  { name: "line", shot: "line", h: "Remember every <em>line</em> you threw.", sub: "Your shot on the lane, every time." },
  { name: "pins", shot: "scorer", h: "Tap the pins you left. <em>Done.</em>", sub: "Score, ball and boards for every shot." },
  { name: "stats", shot: "stats", h: "Know which ball <em>carries</em>.", sub: "Average, pocket and carry, ball by ball." },
  { name: "retarget", shot: "line", h: "You looked. <em>Keep your lines.</em>", sub: "Free bowling score keeper. No sign up." }
];

const browser = await chromium.launch(
  process.env.SHOTS_CHROMIUM ? { executablePath: process.env.SHOTS_CHROMIUM } : {}
);
await mkdir(OUT, { recursive: true });
for (const size of ["feed", "story"]) {
  const page = await browser.newPage({
    viewport: { width: 1080, height: size === "feed" ? 1350 : 1920 }
  });
  for (const s of STILLS) {
    const q = new URLSearchParams({ shot: s.shot, h: s.h, sub: s.sub, size });
    await page.goto(`${BASE}/scripts/ad-content/still.html?${q}`);
    await page.locator("#shot").evaluate((img) => img.decode());
    const file = join(OUT, `still-${s.name}-${size}.png`);
    await page.screenshot({ path: file });
    console.log("wrote", file);
  }
  await page.close();
}
await browser.close();
