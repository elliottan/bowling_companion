import { apply } from "./homography";
import { pathU } from "./pathFit";
import type { Mat3, PathModel, Point } from "./types";

/**
 * What the app's shot tracer screen needs around the tracer (Settings, Labs):
 * the frames to read from a video, the band of a portrait picture to keep,
 * and the lane and the fitted path drawn back onto the picture. Pure, so the
 * screen holds no geometry of its own.
 */

/** The lane's four lines (its edges, the foul line, the back pin row), each by its two ends, in a frame's pixels. */
export type MarkLine = "left" | "right" | "foul" | "pinrow";
export type MarkLines = Record<MarkLine, [Point, Point]>;
export const MARK_LINES: MarkLine[] = ["left", "right", "foul", "pinrow"];

/**
 * How a video is read: the rate frames are looked for at, and the most frames
 * kept, four seconds at 60 frames a second and eight at 30 (the board at the
 * pins needs the 60: shot-01 read 14.8 at 30 and 19.2 at 60, by eye 19.4).
 */
export const READ_FPS = 60;
export const READ_MAX_FRAMES = 240;
/** The longest stretch of a video read, seconds: the most frames at 30 a second. */
export const READ_SECONDS = READ_MAX_FRAMES / 30;

/** The least a read is left to cover, seconds: from a release to the pins is about three. */
export const READ_AT_LEAST = 3;

/**
 * The stretch of a video of `duration` seconds to read from `start`: at most
 * `READ_SECONDS` long and inside the video. A start in the last
 * `READ_AT_LEAST` seconds is pulled back to leave that much.
 */
export function readWindow(duration: number, start: number): { from: number; to: number } {
  if (!(duration > 0)) return { from: 0, to: 0 };
  const from = Math.min(Math.max(0, Number.isFinite(start) ? start : 0), latestStart(duration));
  return { from, to: Math.min(duration, from + READ_SECONDS) };
}

/** The furthest a read can start in a video of `duration` seconds. */
export function latestStart(duration: number): number {
  return Math.max(0, duration - READ_AT_LEAST);
}

/**
 * The instants to look for frames at between `from` and `to` seconds, at
 * `fps`, at most `maxFrames` of them.
 */
export function frameTimes(from: number, to: number, fps: number, maxFrames: number): number[] {
  if (!(to > from) || !(fps > 0)) return [];
  const count = Math.min(maxFrames, Math.ceil((to - from) * fps - 1e-9));
  return Array.from({ length: count }, (_, i) => from + i / fps);
}

/**
 * How far a read has got, 0 to 1: the frames kept against the most kept, or
 * the time reached against the stretch, whichever is further. A 60 fps clip
 * fills its frames before the stretch ends, a 24 fps one the other way round.
 */
export function readProgress(frames: number, at: number, from: number, to: number, maxFrames: number): number {
  const byTime = to > from ? (at - from) / (to - from) : 1;
  return Math.min(1, Math.max(0, frames / maxFrames, byTime));
}

/**
 * Whether a frame shown at `at` seconds is kept: it is at least most of a
 * `READ_FPS` frame after the last kept. A frame seen twice (a paused video
 * presenting again, a clip slower than the reading rate) is kept once, and a
 * 120 fps clip is kept at 60, as its seeks were: the frames would otherwise
 * fill in two seconds, before the pins.
 */
export function isNewFrame(lastKept: number | undefined, at: number): boolean {
  return lastKept === undefined || at - lastKept > 0.75 / READ_FPS;
}

/**
 * The rows of a picture `height` pixels tall that a band (fractions of the
 * height, `laneBand`) keeps, whole and even pixels; all of them for no band.
 */
export function bandRows(height: number, band: { top: number; bottom: number } | null): { y: number; h: number } {
  if (!band || !(band.bottom > band.top)) return { y: 0, h: height };
  const y = Math.max(0, Math.min(height - 2, 2 * Math.floor((band.top * height) / 2)));
  const end = Math.min(height, 2 * Math.ceil((band.bottom * height) / 2));
  return { y, h: Math.max(2, end - y) };
}

/**
 * A band of the shown picture's rows (fractions of its height) as a rectangle
 * of a video frame's plane, `planeW` by `planeH` as stored, which is shown
 * turned `turn` degrees clockwise: the shown rows are the plane's rows, its
 * rows from the bottom, or its columns from the left (a quarter turn, as a
 * phone's portrait video is stored) or from the right.
 */
export function planeCrop(
  band: { top: number; bottom: number },
  planeW: number,
  planeH: number,
  turn: number
): { x: number; y: number; w: number; h: number } {
  const t = ((turn % 360) + 360) % 360;
  const across = t % 180 === 0 ? planeH : planeW;
  const rows = bandRows(across, band);
  const from = t === 0 || t === 90 ? rows.y : across - rows.y - rows.h;
  return t % 180 === 0 ? { x: 0, y: from, w: planeW, h: rows.h } : { x: from, y: 0, w: rows.h, h: planeH };
}

/** A picture's size scaled down to at most `maxPixels` pixels, whole pixels, never enlarged. */
export function scaledSize(width: number, height: number, maxPixels: number): { width: number; height: number } {
  const k = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * RGBA pixels to grey, one byte a pixel, as the video itself stores it: Rec.
 * 601 luma in video range, 16 for black to 235 for white, as a frame's own
 * luma plane is. The harness does not read that: ffmpeg's `-pix_fmt gray`
 * stretches the clips to 0 to 255 (measured on shot-01 and shot-06: grey =
 * 1.164 Y - 18.6), and the tracer's thresholds were set there. Kept in video
 * range all the same: on the six clips scaled as the app reads them, video
 * range read shot-03 and shot-05 right where the stretch did not, while at
 * full size the stretch did better on shot-03 to 05 (2026-11-14). Neither
 * wins outright. In a canvas, with the stretch, the ball was lost at 47 ft on
 * shot-01 where video range followed it to 58.
 */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8ClampedArray {
  return lumaOf(rgba, width, height, 4 * width, 0, false);
}

/**
 * `toGray` over four-byte pixels laid out `stride` bytes a row from `offset`,
 * red first or (`bgr`) blue first: a video frame copied out in RGBA or BGRA.
 */
export function lumaOf(
  px: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  stride: number,
  offset: number,
  bgr: boolean
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  const r = bgr ? 2 : 0;
  const b = bgr ? 0 : 2;
  for (let y = 0; y < height; y++) {
    const row = offset + y * stride;
    for (let x = 0; x < width; x++) {
      const k = row + 4 * x;
      out[y * width + x] = 16 + (219 / 255) * (0.299 * px[k + r] + 0.587 * px[k + 1] + 0.114 * px[k + b]);
    }
  }
  return out;
}

/**
 * A grey picture (`srcW` by `srcH`, `stride` bytes a row from `offset`: a
 * video frame's luma plane, which is already the video's own grey) scaled to
 * `dstW` by `dstH`, each pixel the average of the area it covers. A 4K frame
 * read at 960 wide is four source pixels to one, and sampling only some of
 * them would shimmer a ball three pixels across.
 */
export function resampleGray(
  src: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  stride: number,
  offset: number,
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  const across = areaWeights(srcW, dstW);
  const down = areaWeights(srcH, dstH);
  // Across first, into floats a source row each, then down a row at a time.
  const rows = new Float32Array(dstW * srcH);
  const aw = across.weights;
  for (let y = 0; y < srcH; y++) {
    const row = offset + y * stride;
    const to = y * dstW;
    for (let x = 0; x < dstW; x++) {
      const at = row + across.first[x];
      const w = x * across.taps;
      let sum = 0;
      for (let i = 0; i < across.taps; i++) sum += aw[w + i] * src[at + i];
      rows[to + x] = sum;
    }
  }
  const out = new Uint8ClampedArray(dstW * dstH);
  const acc = new Float32Array(dstW);
  for (let y = 0; y < dstH; y++) {
    acc.fill(0);
    for (let i = 0; i < down.taps; i++) {
      const w = down.weights[y * down.taps + i];
      if (w === 0) continue;
      const from = (down.first[y] + i) * dstW;
      for (let x = 0; x < dstW; x++) acc[x] += w * rows[from + x];
    }
    out.set(acc, y * dstW);
  }
  return out;
}

/**
 * For each of `dst` cells laid over `src` cells, the first source cell it
 * covers and how much of it and each of the next `taps - 1` (the rest zero),
 * summing to 1. Kept for the last few sizes: every frame of a read is one.
 */
function areaWeights(src: number, dst: number): { taps: number; first: Int32Array; weights: Float32Array } {
  const key = `${src}/${dst}`;
  const known = weightCache.get(key);
  if (known) return known;
  const k = src / dst;
  const taps = Math.min(src, Math.ceil(k) + 1);
  const first = new Int32Array(dst);
  const weights = new Float32Array(dst * taps);
  for (let i = 0; i < dst; i++) {
    const a = i * k;
    const b = Math.min(src, (i + 1) * k);
    first[i] = Math.min(Math.floor(a), Math.max(0, src - taps));
    for (let t = 0; t < taps; t++) {
      const j = first[i] + t;
      weights[i * taps + t] = Math.max(0, Math.min(b, j + 1) - Math.max(a, j)) / (b - a);
    }
  }
  const made = { taps, first, weights };
  if (weightCache.size > 8) weightCache.clear();
  weightCache.set(key, made);
  return made;
}
const weightCache = new Map<string, ReturnType<typeof areaWeights>>();

/** A grey picture `width` by `height` turned `degrees` clockwise (0, 90, 180 or 270). */
export function rotateGray(src: Uint8ClampedArray, width: number, height: number, degrees: number): Uint8ClampedArray {
  const turn = ((degrees % 360) + 360) % 360;
  if (turn === 0) return src;
  const out = new Uint8ClampedArray(width * height);
  // The turned picture is `height` wide for a quarter turn, `width` for a half.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = src[y * width + x];
      if (turn === 90) out[x * height + (height - 1 - y)] = v;
      else if (turn === 180) out[(height - 1 - y) * width + (width - 1 - x)] = v;
      else out[(width - 1 - x) * height + y] = v;
    }
  }
  return out;
}

/**
 * The playback rate to read at, given the milliseconds each frame kept has
 * taken: slow enough that a 60 fps clip shows a new frame no faster than they
 * are kept, with a margin, never faster than real time and never slower than
 * `MIN_RATE`. A frame the reader is too busy for is skipped by the browser,
 * so on a slow phone this is the difference between every frame and half.
 */
export const MIN_RATE = 0.25;
export function playbackRateFor(msPerFrame: number): number {
  if (!(msPerFrame > 0)) return 1;
  return Math.min(1, Math.max(MIN_RATE, (0.7 * (1000 / READ_FPS)) / msPerFrame));
}

/**
 * Whether a step of `step` seconds between two frames kept passed over one:
 * longer than the clip's own step (the shortest seen) by half again, less a
 * little for a clip whose steps wobble.
 */
export function droppedBetween(step: number, shortest: number): boolean {
  return Number.isFinite(shortest) && step > 1.4 * shortest;
}

/** The next rate down after a dropped frame, no slower than `MIN_RATE`. */
export function slowerRate(rate: number): number {
  return Math.max(MIN_RATE, rate * 0.75);
}

/** The middle value of a few numbers (the upper middle of an even count). */
export function median(xs: readonly number[]): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** The fitted path in the picture through the lane mapping `H`, a point a foot from `from` to `to` feet. */
export function pathInPicture(H: Mat3, path: PathModel, from: number, to: number): Point[] {
  const out: Point[] = [];
  const end = Math.min(to, 60);
  for (let v = Math.max(0, from); v <= end + 1e-9; v += 1) out.push(apply(H, { x: pathU(path, v), y: v }));
  return out;
}
