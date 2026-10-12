/**
 * Clear a white photo background that survived the normaliser, then re-render.
 *
 * Usage:
 *   npm run clear-background -- <ball-id> [<ball-id>…]
 *   npm run clear-background -- --min=170 <ball-id>   # also clear near-white grey
 *   npm run clear-background -- --circle <ball-id>    # and cut to the ball's circle
 *
 * `render.ts` trims a uniform border, which drops a white card around a ball
 * but not the white left in the corners of a square photo of a round ball, nor
 * a white crescent where an earlier circular cut sat off the ball's centre.
 * This clears exactly that: near-white pixels connected to the canvas edge or
 * to pixels already transparent, by flood fill. A white swirl or a glossy rim
 * inside the ball is not reached, because the ball's own edge is not white all
 * the way round. It is a per-ball repair rather than a step in every render
 * for that reason: on a white ball whose swirl touches the rim, a flood would
 * eat into the ball, so a human picks the balls and checks the contact sheet.
 *
 * Works from the ball's current `-full.webp`, since the original download is
 * not kept, and writes both sizes back through `renderBallImage`.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { FULL, THUMB, renderBallImage } from "./render.js";

/**
 * A pixel at least this bright in every channel, and this close to grey, is
 * background, not ball. The default takes white and near-white; a lower
 * `--min` also takes the light grey of a photo's drop shadow, which is only
 * safe on a ball with no light grey at its edge.
 */
export const DEFAULT_WHITE_MIN = 222;
const GREY_SPREAD = 28;

function isBackground(data: Buffer, i: number, whiteMin: number): boolean {
  if (data[i + 3] < 128) return true;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return Math.min(r, g, b) >= whiteMin && Math.max(r, g, b) - Math.min(r, g, b) <= GREY_SPREAD;
}

/**
 * Make every background pixel reachable from the edge or from transparency
 * transparent, and soften the one-pixel seam it leaves. Mutates `data`
 * (RGBA, `width` x `height`) and returns how many pixels it cleared.
 */
export function clearConnectedBackground(
  data: Buffer,
  width: number,
  height: number,
  whiteMin = DEFAULT_WHITE_MIN
): number {
  const n = width * height;
  const cleared = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!cleared[p] && isBackground(data, p * 4, whiteMin)) {
      cleared[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  // Transparent pixels anywhere are seeds too: an earlier cut may have left a
  // white band between its edge and the ball.
  for (let p = 0; p < n; p++) if (data[p * 4 + 3] < 128) seed(p);

  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % width;
    if (x > 0) seed(p - 1);
    if (x < width - 1) seed(p + 1);
    if (p >= width) seed(p - width);
    if (p < n - width) seed(p + width);
  }

  let count = 0;
  for (let p = 0; p < n; p++) {
    if (!cleared[p]) continue;
    if (data[p * 4 + 3] >= 128) count++;
    data[p * 4 + 3] = 0;
  }
  // A ball pixel touching the cleared area is half background after
  // compression; halving it stops a hard white fringe.
  for (let p = 0; p < n; p++) {
    if (cleared[p]) continue;
    const x = p % width;
    const touches =
      (x > 0 && cleared[p - 1]) || (x < width - 1 && cleared[p + 1]) ||
      (p >= width && cleared[p - width]) || (p < n - width && cleared[p + width]);
    if (touches) data[p * 4 + 3] = Math.round(data[p * 4 + 3] / 2);
  }
  return count;
}

/**
 * Clear everything outside the ball's circle. The circle is fitted to the
 * opaque pixels' left, right and top extremes, not the bottom, because a drop
 * shadow under a ball is what this is for and it hangs below the ball. Returns
 * how many pixels it cleared.
 */
export function clearOutsideCircle(data: Buffer, width: number, height: number): number {
  let left = width, right = -1, top = height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 128) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
    }
  }
  if (right < left) return 0;
  const r = (right - left + 1) / 2;
  const cx = left + r - 0.5;
  const cy = top + r - 0.5;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4 + 3;
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 0.5) {
        if (data[i] >= 128) count++;
        data[i] = 0;
      } else if (d > r - 0.5) {
        data[i] = Math.round(data[i] * (r + 0.5 - d));
      }
    }
  }
  return count;
}

async function clearBall(imgDir: string, id: string, whiteMin: number, circle: boolean): Promise<void> {
  const fullPath = resolve(imgDir, `${id}-full.webp`);
  const { data, info } = await sharp(fullPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = clearConnectedBackground(data, info.width, info.height, whiteMin);
  if (circle) count += clearOutsideCircle(data, info.width, info.height);
  const cleaned = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
  await renderBallImage(cleaned, THUMB.size, THUMB.quality, resolve(imgDir, `${id}-thumb.webp`));
  await renderBallImage(cleaned, FULL.size, FULL.quality, fullPath);
  const share = ((count / (info.width * info.height)) * 100).toFixed(1);
  console.log(`✓ ${id}: cleared ${count} background pixels (${share}% of the canvas)`);
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const minArg = process.argv.find((a) => a.startsWith("--min="));
  const whiteMin = minArg ? Number(minArg.slice("--min=".length)) : DEFAULT_WHITE_MIN;
  const circle = process.argv.includes("--circle");
  if (ids.length === 0) {
    console.error("Usage: npm run clear-background -- <ball-id> [<ball-id>…]");
    process.exit(1);
  }
  const imgDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../public/catalog/img");
  for (const id of ids) await clearBall(imgDir, id, whiteMin, circle);
  console.log("Now run npm run contact-sheet and look at these balls in both themes.");
}

if (process.argv[1] && process.argv[1].endsWith("clear-background.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
