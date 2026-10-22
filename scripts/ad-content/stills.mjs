// Renders the still ads from scripts/ad-content/still.html, one per ad and
// size, using the landing page's own screenshots (public/shots).
//
//   npm run dev, then: ADS_OUT=/tmp/ads npm run ads:stills
//
// The oil pattern, spare line and arsenal stills show screens the landing page
// has no picture of (its arsenal is five balls). With ADS_STATE (the saved bowler, see record.mjs) they are taken
// from the app first and handed to the still as ?img=; without it they are
// skipped.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.ADS_BASE ?? "http://localhost:5173";
const OUT = process.env.ADS_OUT ?? "ads-out";
const STATE = process.env.ADS_STATE;

/** The stills, in the order of the ad plan's creative table. */
const STILLS = [
  { name: "line", shot: "line", h: "Remember every <em>line</em> you threw.", sub: "See your shot drawn on the lane." },
  { name: "pins", shot: "scorer", h: "Tap the pins you left. <em>Headpin does the math.</em>", sub: "Unlimited games, every ball and board." },
  // The ads show only what the free app has (ADR-154), so the bag stands in
  // for the stats screen, whose picture carries a Pro card.
  { name: "arsenal", img: "arsenal", h: "Your whole bag, <em>free</em>.", sub: "Every ball you own, with no limit." },
  { name: "retarget", shot: "line", h: "Back for another look? <em>It's free to download.</em>", sub: "Unlimited games. No account." },
  { name: "patterns", img: "pattern", h: "Know the pattern <em>before you bowl it</em>.", sub: "Every PBA animal pattern, on your phone." },
  { name: "spares", img: "spare", h: "Your spare system, <em>written down</em>.", sub: "Stance and target for every leave." }
];

const browser = await chromium.launch(
  process.env.SHOTS_CHROMIUM ? { executablePath: process.env.SHOTS_CHROMIUM } : {}
);
await mkdir(OUT, { recursive: true });

/** The two screens taken from the app, at the landing shots' 390 x 844 @2x. */
const taken = {};
if (STATE) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    storageState: STATE,
    colorScheme: "dark"
  });
  const app = await context.newPage();
  const home = async () => {
    await app.goto(`${BASE}/app?pro`);
    await app.getByRole("navigation").first().waitFor();
    await app.waitForTimeout(1000);
  };
  await home();
  await app.getByRole("button", { name: /Oil patterns/ }).first().click();
  await app.getByRole("searchbox").or(app.getByPlaceholder(/search/i)).first().fill("Shark");
  await app.getByText("2019 PBA Shark 48").first().click();
  await app.waitForTimeout(800);
  taken.pattern = await app.screenshot({ type: "png" });

  // A spare ball first, as the spares video does: TZone from the catalog,
  // picked on Spare lines. Then the line that makes the 7 (see record.mjs).
  await home();
  await app.getByRole("button", { name: /^Ball catalog/ }).click();
  await app.getByPlaceholder("Search name, brand, coverstock…").fill("TZone");
  await app.getByRole("button", { name: /TZone/i }).first().click();
  await app.getByRole("button", { name: "Add to arsenal" }).first().click();
  await app
    .getByRole("dialog", { name: "Add to arsenal" })
    .getByRole("button", { name: "Add to arsenal" })
    .click();
  // Back from the ball, then from the catalog. A fresh load would reopen the
  // ball, since the route is kept.
  await app.getByRole("banner").getByRole("button", { name: "Back", exact: true }).last().click();
  await app.getByRole("banner").getByRole("button", { name: "Back", exact: true }).first().click();
  await app.getByRole("button", { name: "Spare lines", exact: true }).click();
  await app.getByText("Choose one").click();
  await app.getByRole("dialog").last().getByRole("button", { name: /TZone/ }).click();
  await app.getByRole("button", { name: "Add", exact: true }).first().click();
  const boards = app.getByRole("dialog").last().locator('input[type="number"]');
  await boards.nth(0).fill("14");
  await boards.nth(1).fill("15");
  await boards.nth(1).blur();
  await app.waitForTimeout(600);
  taken.spare = await app.screenshot({ type: "png" });

  // The bag, filled out to a league bowler's: four more balls from the
  // catalog, then the arsenal from the balls beside Home's greeting.
  for (const [query, name] of [["Dynasty", /Black Widow 3\.0 Dynasty/], ["Hy-Road Pearl", /Hy-Road Pearl/], ["Summit Peak", /Summit Peak/], ["Idol Helios", /Idol Helios/]]) {
    await home();
    await app.getByRole("button", { name: /^Ball catalog/ }).click();
    await app.getByPlaceholder("Search name, brand, coverstock…").fill(query);
    await app.waitForTimeout(700);
    await app.getByRole("dialog", { name: "Catalog" }).getByRole("button", { name }).first().click();
    await app.getByRole("button", { name: "Add to arsenal" }).first().click();
    await app.getByRole("dialog", { name: "Add to arsenal" }).getByRole("button", { name: "Add to arsenal" }).click();
    await app.waitForTimeout(300);
  }
  await home();
  await app.getByRole("navigation").getByRole("button", { name: "Home" }).click();
  await app.getByRole("list", { name: "Your arsenal" }).getByRole("button").first().click();
  await app.waitForTimeout(800);
  taken.arsenal = await app.screenshot({ type: "png" });
  await context.close();
}

for (const size of ["feed", "story"]) {
  const page = await browser.newPage({
    viewport: { width: 1080, height: size === "feed" ? 1350 : 1920 }
  });
  await page.route("**/ad-shot/*", (route) =>
    route.fulfill({ contentType: "image/png", body: taken[route.request().url().split("/").pop()] })
  );
  for (const s of STILLS) {
    if (s.img && !taken[s.img]) continue;
    const q = new URLSearchParams({ h: s.h, sub: s.sub, size });
    if (s.img) q.set("img", `/ad-shot/${s.img}`);
    else q.set("shot", s.shot);
    await page.goto(`${BASE}/scripts/ad-content/still.html?${q}`);
    await page.locator("#shot").evaluate((img) => img.decode());
    const file = join(OUT, `still-${s.name}-${size}.png`);
    await page.screenshot({ path: file });
    console.log("wrote", file);
  }
  await page.close();
}
await browser.close();
