/**
 * Shared image normalisation for every catalog image source.
 *
 * Sources disagree on everything around the ball: some arrive on a white card,
 * some as a cut-out with a light fringe or a dark ring left by the cut, some
 * with a floor shadow under the ball, some with a bite taken out of a glossy
 * rim by an earlier background repair. Side by side in the grid that reads as
 * photos gathered from different places, so every photo is given the same
 * house treatment whatever it came from (ADR-169):
 *
 *  1. Find the ball. Background is whatever is transparent, or close to the
 *     border's own colour and connected to the border.
 *  2. Fit the ball's circle to the sides and top of its outline, never the
 *     bottom, where a shadow hangs, and refit without the points that miss,
 *     so a bitten rim or a stray speck cannot pull it.
 *  3. Cut a hair inside that circle (`RIM_INSET`), which drops a fringe, a
 *     ring or a shadow along with the background. A pixel past the cut, or a
 *     hole inside it, takes the colour of the ball just inside the rim.
 *  4. Scale the square to each size, and draw the edge there as an exact
 *     anti-aliased circle touching the canvas, so every ball has the same
 *     silhouette at the same size, and give it the same gentle edge shade.
 *
 * The ball fills its canvas edge to edge: `CatalogBallImage` crops a `bare`
 * photo to `rounded-full`, and the placeholder silhouette is drawn the same
 * size, so a margin would read as a smaller ball.
 *
 * Only the ground around the ball and its outermost rim change. Nothing is
 * mirrored, recoloured or retouched inside the ball, because the logo and the
 * colourway on it are how a bowler recognises their own ball.
 *
 * TOKEN-SAFE: image bytes never enter a model context.
 */
import { resolve } from "node:path";
import sharp from "sharp";

export const THUMB = { size: 160, quality: 80 };
export const FULL = { size: 800, quality: 82 };

/** Share of the fitted radius cut away at the rim, to drop a fringe or ring. */
export const RIM_INSET = 0.015;
/** The edge shade: how much the outermost `width` of the radius darkens, at most. */
export const EDGE_SHADE = { depth: 0.18, width: 0.07 };
/**
 * Which treatment a photo had. `rerender-images` re-renders entries below
 * this from their current full photo, the only copy kept, so a change to the
 * treatment has to allow for the previous one already being in that photo.
 */
export const NORMALISER = 2;

/** A border colour this close in every channel is background. */
const BACKGROUND_TOLERANCE = 34;
const OPAQUE = 200;

export interface ImageEntry {
  imageThumb: string;
  imageFull: string;
  /** The `NORMALISER` it was rendered with; absent means before ADR-169. */
  normaliser?: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/**
 * Background pixels: transparent ones and, when the photo has an opaque
 * backdrop (most of its border is opaque), those within tolerance of the
 * backdrop's colour (the border's median) and connected to the border. A
 * cut-out's own transparency is trusted as it is: flooding a white ground
 * there would eat into a white ball whose swirl reaches the rim.
 */
export function backgroundMask(data: Buffer, width: number, height: number): Uint8Array {
  const n = width * height;
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const opaque = border.filter((p) => data[p * 4 + 3] >= 128);
  const median = (c: number) => {
    const v = opaque.map((p) => data[p * 4 + c]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const bg = opaque.length >= border.length / 2 ? [median(0), median(1), median(2)] : null;
  const isBackground = (p: number) => {
    const i = p * 4;
    if (data[i + 3] < 128) return true;
    return (
      bg !== null &&
      Math.abs(data[i] - bg[0]) <= BACKGROUND_TOLERANCE &&
      Math.abs(data[i + 1] - bg[1]) <= BACKGROUND_TOLERANCE &&
      Math.abs(data[i + 2] - bg[2]) <= BACKGROUND_TOLERANCE
    );
  };

  const mask = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!mask[p] && isBackground(p)) {
      mask[p] = 1;
      stack.push(p);
    }
  };
  for (const p of border) seed(p);
  for (let p = 0; p < n; p++) if (data[p * 4 + 3] < 128) seed(p);
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % width;
    if (x > 0) seed(p - 1);
    if (x < width - 1) seed(p + 1);
    if (p >= width) seed(p - width);
    if (p < n - width) seed(p + width);
  }
  return mask;
}

/** Least-squares circle through points (Kåsa), or null if they are degenerate. */
function leastSquaresCircle(xs: number[], ys: number[]): Circle | null {
  const m = xs.length;
  if (m < 3) return null;
  let mx = 0, my = 0;
  for (let k = 0; k < m; k++) {
    mx += xs[k];
    my += ys[k];
  }
  mx /= m;
  my /= m;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (let k = 0; k < m; k++) {
    const u = xs[k] - mx, v = ys[k] - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const a = (suuu + suvv) / 2, b = (svvv + svuu) / 2;
  const uc = (a * svv - b * suv) / det;
  const vc = (b * suu - a * suv) / det;
  return { cx: mx + uc, cy: my + vc, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / m) };
}

/**
 * The ball's circle, from the outline of the foreground (`mask` 0). Starts
 * from the foreground's centroid and area, then fits to the outline points
 * near that circle and above its lower part, three times with a narrower band,
 * so the bottom (a shadow), a bite in the rim and a speck all drop out.
 * Coordinates are pixel centres. Null when there is no ball to find.
 */
export function fitBallCircle(mask: Uint8Array, width: number, height: number): Circle | null {
  let area = 0, sx = 0, sy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) continue;
      area++;
      sx += x + 0.5;
      sy += y + 0.5;
    }
  }
  if (area < 50) return null;
  let circle: Circle = { cx: sx / area, cy: sy / area, r: Math.sqrt(area / Math.PI) };

  const ox: number[] = [], oy: number[] = [];
  const fg = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !mask[y * width + x];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!fg(x, y)) continue;
      if (!fg(x - 1, y) || !fg(x + 1, y) || !fg(x, y - 1) || !fg(x, y + 1)) {
        ox.push(x + 0.5);
        oy.push(y + 0.5);
      }
    }
  }

  for (const band of [0.15, 0.05, 0.02]) {
    const xs: number[] = [], ys: number[] = [];
    for (let k = 0; k < ox.length; k++) {
      if (oy[k] > circle.cy + 0.4 * circle.r) continue;
      if (Math.abs(Math.hypot(ox[k] - circle.cx, oy[k] - circle.cy) - circle.r) > band * circle.r) continue;
      xs.push(ox[k]);
      ys.push(oy[k]);
    }
    const next = leastSquaresCircle(xs, ys);
    if (!next) break;
    circle = next;
  }
  // Outline pixels are the ball's own outermost ones, whose centres sit half
  // a pixel inside its edge.
  return { ...circle, r: circle.r + 0.5 };
}

/**
 * The opaque square of side `2r` (rounded) centred on the circle, with the
 * rim cut `RIM_INSET` inside it. A pixel past the cut, or one the source left
 * transparent inside it, takes the first solid ball pixel found walking in
 * towards the centre from just inside the cut, so the edge drawn later at
 * each size blends into the ball's own colour rather than a fringe.
 */
export function cutToCircle(
  data: Buffer,
  width: number,
  height: number,
  circle: Circle
): { data: Buffer; size: number } {
  const r = circle.r * (1 - RIM_INSET);
  const size = Math.max(1, Math.round(2 * r));
  const out = Buffer.alloc(size * size * 4);
  const half = size / 2;
  // Source pixel under a point given relative to the circle's centre.
  const at = (dx: number, dy: number): number => {
    const x = Math.floor(circle.cx + dx), y = Math.floor(circle.cy + dy);
    if (x < 0 || y < 0 || x >= width || y >= height) return -1;
    return (y * width + x) * 4;
  };
  const solid = (i: number) => i >= 0 && data[i + 3] >= OPAQUE;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i + 0.5 - half, dy = j + 0.5 - half;
      const d = Math.hypot(dx, dy);
      let src = d < r - 1 ? at(dx, dy) : -1;
      if (!solid(src)) {
        src = -1;
        const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
        for (let s = Math.min(d, r - 1.5); s >= 0; s -= 1) {
          const k = at(ux * s, uy * s);
          if (solid(k)) {
            src = k;
            break;
          }
        }
      }
      const o = (j * size + i) * 4;
      if (src >= 0) {
        out[o] = data[src];
        out[o + 1] = data[src + 1];
        out[o + 2] = data[src + 2];
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, size };
}

/**
 * Draw the edge on a ball that fills its `size` square: alpha is the share of
 * each pixel inside the circle, and the outer `EDGE_SHADE.width` of the radius
 * darkens towards the rim, easing in. Mutates RGBA `data`.
 */
export function finishEdge(data: Buffer, size: number): void {
  const r = size / 2;
  const { depth, width } = EDGE_SHADE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      const t = Math.min(1, Math.max(0, (d / r - (1 - width)) / width));
      const shade = 1 - depth * t * t;
      data[i] = Math.round(data[i] * shade);
      data[i + 1] = Math.round(data[i + 1] * shade);
      data[i + 2] = Math.round(data[i + 2] * shade);
      data[i + 3] = Math.round(data[i + 3] * Math.min(1, Math.max(0, r - d + 0.5)));
    }
  }
}

/** A photo, cut to its ball: an opaque square PNG the ball fills, before the edge is drawn. */
export async function normaliseBall(src: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const circle = fitBallCircle(backgroundMask(data, info.width, info.height), info.width, info.height);
  if (!circle) throw new Error("no ball found in the image");
  const cut = cutToCircle(data, info.width, info.height, circle);
  return sharp(cut.data, { raw: { width: cut.size, height: cut.size, channels: 4 } }).png().toBuffer();
}

/** Render a normalised ball (`normaliseBall`) at one size. */
export async function renderBallImage(
  ball: Buffer,
  size: number,
  quality: number,
  outPath: string
): Promise<void> {
  const data = await sharp(ball).resize(size, size, { fit: "fill", kernel: "lanczos3" }).ensureAlpha().raw().toBuffer();
  finishEdge(data, size);
  await sharp(data, { raw: { width: size, height: size, channels: 4 } })
    .webp({ quality, smartSubsample: true })
    .toFile(outPath);
}

/** Write both sizes for a file stem and return the images.json entry. */
export async function renderBallPair(
  src: Buffer,
  id: string,
  imgDir: string
): Promise<ImageEntry> {
  const ball = await normaliseBall(src);
  await renderBallImage(ball, THUMB.size, THUMB.quality, resolve(imgDir, `${id}-thumb.webp`));
  await renderBallImage(ball, FULL.size, FULL.quality, resolve(imgDir, `${id}-full.webp`));
  return {
    imageThumb: `/catalog/img/${id}-thumb.webp`,
    imageFull: `/catalog/img/${id}-full.webp`,
    normaliser: NORMALISER,
  };
}
