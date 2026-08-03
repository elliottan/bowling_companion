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
import sharp from "sharp";

import { slug } from "../normalize.js";
import type { RawBall } from "../types.js";
import type { Colorway } from "../../../src/types/catalog.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../");
const BALLS_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/balls.json");
const IMAGES_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/images.json");
const IMG_DIR = resolve(REPO_ROOT, "public/catalog/img");

/** Fraction of the square canvas the ball occupies; the rest is even margin. */
const BALL_FILL = 0.88;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Normalize one source photo to a square, transparent, evenly-margined webp.
 *
 * Sources are framed inconsistently — some arrive tight-cropped to the ball's
 * bounding box, others padded on a white card, others off-centre. Rendering
 * them as-is is what made the catalog look wonky, so every image goes through
 * the same three steps: trim to the ball's real bounds (dropping a white card
 * or transparent margin alike), scale it to a fixed fraction of the canvas, and
 * centre it on a transparent square. Transparent rather than white so the tile
 * reads correctly against either theme.
 */
async function renderBallImage(
  src: Buffer,
  size: number,
  quality: number,
  outPath: string
): Promise<void> {
  const trimmed = await sharp(src).ensureAlpha().trim({ threshold: 10 }).toBuffer();
  const inner = Math.round(size * BALL_FILL);
  // Two pipelines: sharp keeps only the last resize in a chain, and the scale
  // and the pad have to happen in that order.
  const scaled = await sharp(trimmed).resize(inner, inner, { fit: "inside" }).toBuffer();
  await sharp(scaled)
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .webp({ quality })
    .toFile(outPath);
}

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
  await renderBallImage(img, 160, 80, resolve(IMG_DIR, `${id}-thumb.webp`));
  await renderBallImage(img, 800, 82, resolve(IMG_DIR, `${id}-full.webp`));

  const images: Record<string, { imageThumb: string; imageFull: string }> = existsSync(IMAGES_JSON)
    ? JSON.parse(readFileSync(IMAGES_JSON, "utf-8"))
    : {};
  images[id] = {
    imageThumb: `/catalog/img/${id}-thumb.webp`,
    imageFull: `/catalog/img/${id}-full.webp`,
  };
  writeFileSync(IMAGES_JSON, JSON.stringify(images, null, 2) + "\n");

  console.log(`✓ ${ball.brand} ${ball.name} → ${id}`);
  console.log(`  ${images[id].imageThumb}`);
  console.log(`  ${images[id].imageFull}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
