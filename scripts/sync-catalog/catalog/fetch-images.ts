/**
 * Phase 6 — ball hero images from Storm ad-sheet PDFs.
 *
 * Usage:
 *   npm run fetch-images
 *
 * For each ball in data/balls.json, derive its ad-sheet / tech-data PDF URL on
 * the Storm CDN (naming is inconsistent, so several candidates are probed via
 * HEAD), download the first hit, carve out the largest embedded JPEG (the ball
 * hero render — DCTDecode streams are stored as literal JPEG, so no poppler is
 * needed), and resize to webp thumb + full under public/catalog/img/.
 *
 * Writes a sidecar data/images.json: { [ballId]: { imageThumb, imageFull } }
 * that build.ts merges into the catalog. balls.json stays free of binary refs.
 *
 * Storm ad sheets are single-color, so the hero is a per-BALL image reused across
 * colorways (per the Phase 6 probe: no per-colorway source exists). Non-Storm
 * brands use chaotic filenames and are skipped (placeholder fallback remains).
 *
 * TOKEN-SAFE: image bytes never enter a model context. Deterministic, no LLM.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { slug } from "../normalize.js";
import type { RawBall } from "../types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../");
const BALLS_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/balls.json");
const IMAGES_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/images.json");
const DENYLIST_JSON = resolve(REPO_ROOT, "scripts/sync-catalog/data/image-denylist.json");
const IMG_DIR = resolve(REPO_ROOT, "public/catalog/img");

const CDN = "https://stormproducts.nyc3.cdn.digitaloceanspaces.com/product_pages/Balls";
const BRAND_FOLDER: Record<string, string> = {
  Storm: "Storm",
  "Roto Grip": "Roto_Grip",
  "900 Global": "900_Global",
  Motiv: "Motiv",
};

interface ImageEntry {
  imageThumb: string;
  imageFull: string;
}

// ---------------------------------------------------------------------------
// Candidate ad-sheet / tech PDF URLs for a ball (Storm naming is inconsistent).
// ---------------------------------------------------------------------------
function candidateUrls(brand: string, name: string): string[] {
  const brandFolder = BRAND_FOLDER[brand];
  if (!brandFolder) return [];
  const folder = name.replace(/\//g, "").replace(/ /g, "_");
  const noSpace = name.replace(/[/ ]/g, "");
  const base = `${CDN}/${brandFolder}/${folder}/`;
  const files = [
    `Storm_adsheet_${noSpace}-nobleed.pdf`,
    `${name} Tech Data Final.pdf`,
    `${name} Tech Data.pdf`,
    `Storm_${name}_Tech Data.pdf`,
    `Storm_${noSpace}_Design Intent.pdf`,
    `${noSpace} Tech Data Final.pdf`,
  ];
  return files.map((f) => encodeURI(base + f));
}

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status === 200;
  } catch {
    return false;
  }
}

// Carve embedded JPEGs (SOI FFD8 … first EOI FFD9), largest first. Byte-pattern
// carving yields some false spans, so callers validate each with sharp.
function carveJpegs(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      for (let j = i + 2; j < buf.length - 1; j++) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
          out.push(Buffer.from(buf.subarray(i, j + 2)));
          i = j + 1;
          break;
        }
      }
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Resize the first JPEG candidate that sharp accepts and that looks like a
 * square-ish ball render. Returns true on success. */
async function writeWebp(candidates: Buffer[], thumbPath: string, fullPath: string): Promise<boolean> {
  for (const jpeg of candidates) {
    try {
      const meta = await sharp(jpeg).metadata();
      // Ball renders are large and roughly square; skip thin banners/logos.
      if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) continue;
      const ratio = meta.width / meta.height;
      if (ratio < 0.7 || ratio > 1.4) continue;
      await sharp(jpeg).resize(160, 160, { fit: "inside" }).webp({ quality: 80 }).toFile(thumbPath);
      await sharp(jpeg).resize(800, 800, { fit: "inside" }).webp({ quality: 82 }).toFile(fullPath);
      return true;
    } catch {
      // invalid carve — try next candidate
    }
  }
  return false;
}

async function main(): Promise<void> {
  const balls: RawBall[] = JSON.parse(readFileSync(BALLS_JSON, "utf-8"));
  mkdirSync(IMG_DIR, { recursive: true });
  const images: Record<string, ImageEntry> = existsSync(IMAGES_JSON)
    ? JSON.parse(readFileSync(IMAGES_JSON, "utf-8"))
    : {};
  // Ball ids whose ad-sheet carve was bad (wrong crop, dark/colored background,
  // or not the ball). Never re-fetched — they keep the placeholder. Curated by
  // hand after review; a direct clean image can still be set via add-ball-image.
  const denylist: string[] = existsSync(DENYLIST_JSON)
    ? JSON.parse(readFileSync(DENYLIST_JSON, "utf-8"))
    : [];

  let hits = 0;
  const misses: string[] = [];

  for (const ball of balls) {
    const releaseYear = ball.releaseDate ? parseInt(ball.releaseDate.slice(0, 4), 10) : null;
    const id = slug(ball.brand, ball.name, releaseYear);
    if (images[id] || denylist.includes(id)) continue; // already fetched or denied

    let pdfUrl: string | null = null;
    for (const url of candidateUrls(ball.brand, ball.name)) {
      if (await headOk(url)) {
        pdfUrl = url;
        break;
      }
    }
    if (!pdfUrl) {
      misses.push(`${ball.brand} ${ball.name}`);
      continue;
    }

    let ok = false;
    try {
      const pdf = Buffer.from(await (await fetch(pdfUrl)).arrayBuffer());
      const candidates = carveJpegs(pdf);
      ok = await writeWebp(
        candidates,
        resolve(IMG_DIR, `${id}-thumb.webp`),
        resolve(IMG_DIR, `${id}-full.webp`)
      );
    } catch {
      ok = false;
    }
    if (!ok) {
      misses.push(`${ball.brand} ${ball.name} (no usable image)`);
      continue;
    }

    images[id] = {
      imageThumb: `/catalog/img/${id}-thumb.webp`,
      imageFull: `/catalog/img/${id}-full.webp`,
    };
    hits++;
    console.log(`  ✓ ${ball.brand} ${ball.name}`);
  }

  writeFileSync(IMAGES_JSON, JSON.stringify(images, null, 2) + "\n");
  console.log(`\n=== Summary ===`);
  console.log(`  Images fetched: ${hits}`);
  console.log(`  Total in index: ${Object.keys(images).length}`);
  console.log(`  Misses (${misses.length}): ${misses.join(", ")}`);
  console.log(`  Wrote ${IMAGES_JSON}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
