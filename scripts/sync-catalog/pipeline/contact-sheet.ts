/**
 * Stage 4 review, one page of every catalog image at grid size.
 *
 * Usage:
 *   npm run contact-sheet          # every ball that has an image
 *   npm run contact-sheet -- --ids storm-bionic-2026,storm-alpha-crux-2026
 *
 * A bad alpha cut, a ball that is really a box shot, a render sitting 20% small
 * in its canvas: all instantly obvious to an eye and invisible to any assertion
 * worth writing. So the image stage ends here rather than in a test. The page
 * flips between light and dark because the canvases are transparent, and a cut
 * that looks clean on white can show a white halo on black.
 *
 * The sheet is a local review artefact and is gitignored.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { slug } from "../normalize.js";
import type { RawBall } from "../types.js";
import type { ImageEntry } from "./render.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SYNC_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(SYNC_ROOT, "../../");
const BALLS_JSON = resolve(SYNC_ROOT, "data/balls.json");
const IMAGES_JSON = resolve(SYNC_ROOT, "data/images.json");
const OUT = resolve(SYNC_ROOT, "contact-sheet.html");

function ballId(b: RawBall): string {
  const year = b.releaseDate ? parseInt(b.releaseDate.slice(0, 4), 10) : null;
  return slug(b.brand, b.name, year);
}

function main(): void {
  const idsArg = process.argv.indexOf("--ids");
  const only = idsArg >= 0 ? new Set((process.argv[idsArg + 1] ?? "").split(",")) : null;

  const balls: RawBall[] = JSON.parse(readFileSync(BALLS_JSON, "utf-8"));
  const images: Record<string, ImageEntry> = existsSync(IMAGES_JSON)
    ? JSON.parse(readFileSync(IMAGES_JSON, "utf-8"))
    : {};

  const withImage = balls.filter((b) => images[ballId(b)] && (!only || only.has(ballId(b))));
  const missing = balls.filter((b) => !images[ballId(b)]);

  // Inlined rather than linked: the sheet is meant to be opened from anywhere,
  // mailed to yourself, or dropped into a preview pane, and a relative path out
  // of scripts/sync-catalog/ survives none of that. Thumbs are ~5 KB each.
  const inline = (webPath: string) =>
    `data:image/webp;base64,${readFileSync(resolve(REPO_ROOT, "public", webPath.replace(/^\//, ""))).toString("base64")}`;

  const tiles = withImage
    .map((b) => {
      const id = ballId(b);
      return `<figure><img src="${inline(images[id].imageThumb)}" alt="${b.name}" width="160" height="160"><figcaption>${b.brand} ${b.name}<br><small>${id}</small></figcaption></figure>`;
    })
    .join("\n");

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Catalog contact sheet</title>
<style>
  :root { color-scheme: light; --bg:#fff; --fg:#111; --tile:#f4f4f5; }
  body.dark { color-scheme: dark; --bg:#0b0b0c; --fg:#eee; --tile:#1c1c1f; }
  body { background:var(--bg); color:var(--fg); font:14px/1.4 system-ui, sans-serif; margin:24px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; }
  figure { margin:0; text-align:center; background:var(--tile); border-radius:12px; padding:12px; }
  img { display:block; margin:0 auto; }
  small { opacity:.6; }
  button { font:inherit; padding:6px 12px; border-radius:999px; cursor:pointer; }
  ul { columns:3; }
</style>
<h1>Catalog contact sheet</h1>
<p><button onclick="document.body.classList.toggle('dark')">Toggle dark</button>
   ${withImage.length} with image, ${missing.length} without.</p>
<div class="grid">
${tiles}
</div>
<h2>No image (${missing.length})</h2>
<ul>${missing.map((b) => `<li>${b.brand} ${b.name}</li>`).join("")}</ul>
`;

  writeFileSync(OUT, html);
  console.log(`\n=== Contact sheet ===`);
  console.log(`  ${withImage.length} tile(s), ${missing.length} without an image`);
  console.log(`  Wrote ${OUT.replace(REPO_ROOT + "/", "")}`);
}

main();
