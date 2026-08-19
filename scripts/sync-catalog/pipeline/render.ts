/**
 * Shared image normalisation for every catalog image source.
 *
 * Sources are framed inconsistently, some arrive tight-cropped to the ball's
 * bounding box, others padded on a white card, others off-centre. Rendering
 * them as-is is what made the catalog look wonky, so every image goes through
 * the same three steps regardless of where it came from: trim to the ball's
 * real bounds (dropping a white card or a transparent margin alike), scale it
 * to a fixed fraction of the canvas, and centre it on a transparent square.
 * Transparent rather than white so the tile reads against either theme, and
 * fixed fraction so no ball renders larger than its neighbour in the grid.
 *
 * TOKEN-SAFE: image bytes never enter a model context.
 */
import { resolve } from "node:path";
import sharp from "sharp";

/** Fraction of the square canvas the ball occupies; the rest is even margin. */
export const BALL_FILL = 0.88;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

export const THUMB = { size: 160, quality: 80 };
export const FULL = { size: 800, quality: 82 };

export interface ImageEntry {
  imageThumb: string;
  imageFull: string;
}

export async function renderBallImage(
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

/** Write both sizes for a ball id and return the images.json entry. */
export async function renderBallPair(
  src: Buffer,
  id: string,
  imgDir: string
): Promise<ImageEntry> {
  await renderBallImage(src, THUMB.size, THUMB.quality, resolve(imgDir, `${id}-thumb.webp`));
  await renderBallImage(src, FULL.size, FULL.quality, resolve(imgDir, `${id}-full.webp`));
  return {
    imageThumb: `/catalog/img/${id}-thumb.webp`,
    imageFull: `/catalog/img/${id}-full.webp`,
  };
}
