/**
 * Attach a directly-linked product image to a catalog ball.
 *
 * Usage:
 *   npm run add-ball-image -- <sku-or-name> <image-url>
 *   npm run add-ball-image -- BBMGWL https://…/big_BBMGWL.png
 *
 * Looks up the ball in data/balls.json by colorway SKU or exact name, downloads
 * the image (PNG/JPG/WEBP — a direct image URL, NOT a PDF), resizes to webp
 * thumb + full under public/catalog/img/, and records it in data/images.json
 * (the sidecar build.ts merges). Used by the `add-ball-manual` skill for quick
 * manual catalog additions.
 *
 * TOKEN-SAFE: image bytes never enter a model context.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { slug } from "../normalize.js";
import { renderBallPair, type ImageEntry } from "../pipeline/render.js";
import type { RawBall } from "../types.js";
import type { Colorway } from "../../../src/types/catalog.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../");
const BALLS_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/balls.json");
const IMAGES_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/images.json");
const IMG_DIR = resolve(REPO_ROOT, "public/catalog/img");

function ballId(b: RawBall): string {
  const year = b.releaseDate ? parseInt(b.releaseDate.slice(0, 4), 10) : null;
  return slug(b.brand, b.name, year);
}

async function main(): Promise<void> {
  const [key, url] = process.argv.slice(2);
  if (!key || !url) {
    console.error("Usage: npm run add-ball-image -- <sku-or-name> <image-url>");
    process.exit(1);
  }

  const balls: RawBall[] = JSON.parse(readFileSync(BALLS_JSON, "utf-8"));
  const ball = balls.find(
    (b) =>
      b.name.toLowerCase() === key.toLowerCase() ||
      (b.colorways as Colorway[] | undefined)?.some((c) => c.sku.toLowerCase() === key.toLowerCase())
  );
  if (!ball) {
    console.error(`No ball in balls.json with name/SKU "${key}". Add the spec entry first.`);
    process.exit(1);
  }

  const id = ballId(ball);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to download image: HTTP ${res.status}`);
    process.exit(1);
  }
  const img = Buffer.from(await res.arrayBuffer());

  mkdirSync(IMG_DIR, { recursive: true });
  const entry = await renderBallPair(img, id, IMG_DIR);

  const images: Record<string, ImageEntry> = existsSync(IMAGES_JSON)
    ? JSON.parse(readFileSync(IMAGES_JSON, "utf-8"))
    : {};
  images[id] = entry;
  writeFileSync(IMAGES_JSON, JSON.stringify(images, null, 2) + "\n");

  console.log(`✓ ${ball.brand} ${ball.name} → ${id}`);
  console.log(`  ${images[id].imageThumb}`);
  console.log(`  ${images[id].imageFull}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
