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
 * How a video is read (Settings, Labs, the shot tracer): the stretch from just
 * before the ball crosses the foul line to just after it leaves the pin deck
 * (`shotWindow.ts`), however long that is, at `READ_FPS` frames a second where
 * the memory allows (the board at the pins needs the 60: shot-01 read 14.8 at
 * 30 and 19.2 at 60, by eye 19.4), and at the next rate down in
 * `READ_RATES` where it does not, rather than cutting the shot short.
 */
export const READ_FPS = 60;
export const READ_RATES = [60, 30, 20, 15];

/** The most pixels a frame is read at, 960 by 720: the far end of the lane keeps a ball of three or four pixels across. */
export const MAX_PIXELS = 960 * 720;

/**
 * The most bytes of frames one read keeps: 240 frames of 960 by 720 grey, 166
 * MB, what 0.112.0 held (four seconds at 60). The frames are the whole of the
 * read's memory and are held twice for a moment (the lane search gets copies
 * of a tenth of them; the tracer gets the rest moved, not copied), so this
 * keeps the peak under about 200 MB, well inside what a phone's browser gives
 * a page. A 17 mph shot (about 3.3 s with its margins) fits at 60; a 10 mph
 * one (about 5.4 s) is read at 30.
 */
export const READ_BUDGET = 240 * MAX_PIXELS;

/**
 * The frames a second a read of `seconds` keeps, frames `frameBytes` each,
 * within `budget`: the first of `READ_RATES` that fits, else as many as fit.
 */
export function keptFps(seconds: number, frameBytes: number, budget = READ_BUDGET): number {
  const most = Math.floor(budget / Math.max(1, frameBytes));
  if (!(seconds > 0)) return READ_FPS;
  for (const fps of READ_RATES) if (Math.ceil(seconds * fps - 1e-9) <= most) return fps;
  return Math.max(1, most) / seconds;
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
 * The first look's frames on a fixed grid (Settings, Labs; `scanVideo`): a
 * frame at `t` seconds is taken when it is at or past slot `next` of a grid
 * `fps` a second from the video's start (less `GRID_EARLY`, for a WebM's
 * times stored to the millisecond), and the slot after the one it is in is
 * the next wanted; null when it is not taken. Taking the first frame a fixed
 * time after the last one taken, as before, let one frame the browser passed
 * over shift every frame after it, and two looks at one video found the shot
 * 0.5 s apart.
 */
export const GRID_EARLY = 0.002;
export function gridSlot(t: number, next: number, fps: number): number | null {
  if (t < next / fps - GRID_EARLY) return null;
  return Math.floor((t + GRID_EARLY) * fps) + 1;
}

/** How far a read has got, 0 to 1: the time reached against the stretch. */
export function readProgress(at: number, from: number, to: number): number {
  const byTime = to > from ? (at - from) / (to - from) : 1;
  return Math.min(1, Math.max(0, byTime));
}

/**
 * The video's own step between frames, seconds, from the steps between frames
 * shown one after another: the smallest, averaged with those close to it. A
 * WebM stores times to the millisecond, so a 120 fps clip steps 8, 8, 9 ms,
 * and its step is their mean, not the smallest. A frame passed over makes a
 * step twice as long, which is left out. Within 10% of a camera's usual frame
 * rate (`USUAL_RATES`, the nearest) it is that rate's step exactly: in
 * Chromium the first steps of a 120 fps WebM read 125 fps one time and 111
 * another, and its frames were then counted wrong a few frames on. Null for
 * fewer than two steps.
 */
export function sourceStep(steps: readonly number[]): number | null {
  const ok = steps.filter((d) => d > 5e-4);
  if (ok.length < 2) return null;
  const least = Math.min(...ok);
  const near = ok.filter((d) => d < 1.45 * least);
  const mean = near.reduce((a, b) => a + b, 0) / near.length;
  const usual = USUAL_RATES.reduce((a, b) => (Math.abs(mean * b - 1) < Math.abs(mean * a - 1) ? b : a));
  return Math.abs(mean * usual - 1) < 0.1 ? 1 / usual : mean;
}

/** Frame rates phones and cameras record at. */
export const USUAL_RATES = [24, 25, 30, 48, 50, 60, 90, 100, 120, 240];

/**
 * Which of the frames a video shows a read keeps, so that two reads of the
 * same video keep the same frames however many the browser passes over: every
 * `m`th frame of the video (`m` = its frame rate over the rate kept, at least
 * 1), counted from the video's start, from `from` until `to`. Counted from the
 * start, not from `from`: a 120 fps video read at 60 keeps its even frames
 * wherever the read starts (two reads of IMG_1996 that started 8 ms apart kept
 * the odd frames on one and the even on the other, and read the laydown 18.7
 * and 23.4). A frame is judged by how
 * many of the video's own frames it is after the last one kept (its time over
 * `src`, rounded), not by its time alone: a frame shown late, or one in place
 * of another passed over, is not kept in its place. Each frame the read should
 * have kept and did not see is listed in `missing`, for the read to go back
 * for (`claimFrame`). Pure.
 */
export class FrameSlots {
  readonly step: number;
  readonly m: number;
  /** The instants of frames to keep that were passed over, seconds, in order. */
  readonly missing: number[] = [];
  private last: number;

  /**
   * @param after the time of a frame already kept on this read's grid (a read
   *   in parts), which then carries on from it; else from the first slot at or
   *   after `from`
   */
  constructor(
    readonly from: number,
    readonly to: number,
    fps: number,
    readonly src: number,
    after?: number
  ) {
    this.m = Math.max(1, Math.round(1 / (fps * src)));
    this.step = this.m * src;
    this.last = after ?? Math.ceil((from - 0.25 * src) / this.step) * this.step - this.step;
  }

  /** Whether a frame shown at `t` seconds is kept. Frames must come in time order. */
  offer(t: number): boolean {
    if (t < this.from - 0.25 * this.src || t >= this.to - 0.25 * this.src) return false;
    const n = Math.round((t - this.last) / this.src);
    if (n < this.m) return false;
    const whole = Math.floor(n / this.m);
    const on = n % this.m === 0;
    for (let j = 1; j < (on ? whole : whole + 1); j++) this.missing.push(this.last + j * this.step);
    if (!on) {
      this.last += whole * this.step;
      return false;
    }
    this.last = t;
    return true;
  }

  /** The read stopped: the frames after the last one kept, to `to`, are missing too. */
  close(): void {
    for (let g = this.last + this.step; g < this.to - 0.25 * this.src; g += this.step) this.missing.push(g);
    this.last = Infinity;
  }
}

/**
 * Which of `instants` (frames to keep, seconds) a frame shown at `t` is: the
 * index of the one within 0.4 of a video frame `src`, or -1.
 */
export function claimFrame(instants: readonly number[], t: number, src: number): number {
  let best = -1;
  for (let i = 0; i < instants.length; i++) {
    if (Math.abs(instants[i] - t) <= 0.4 * src && (best < 0 || Math.abs(instants[i] - t) < Math.abs(instants[best] - t))) best = i;
  }
  return best;
}

/**
 * Missing frames (seconds, in order) gathered into stretches to read again:
 * those no more than `join` seconds apart go together, each stretch from a
 * little before its first to a little after its last.
 */
export function missingRuns(instants: readonly number[], src: number, join: number): { from: number; to: number; instants: number[] }[] {
  const out: { from: number; to: number; instants: number[] }[] = [];
  for (const t of instants) {
    const run = out[out.length - 1];
    if (run && t - run.instants[run.instants.length - 1] <= join) {
      run.instants.push(t);
      run.to = t + 0.5 * src;
    } else out.push({ from: t - 0.5 * src, to: t + 0.5 * src, instants: [t] });
  }
  return out;
}

/**
 * The frames of a read kept at a lower rate: of `times` (seconds, kept every
 * `step` seconds, on a grid from the video's start as `FrameSlots` keeps
 * them), every `k`th, counted from the video's start too.
 */
export function thinFrames(times: readonly number[], step: number, k: number): number[] {
  if (k <= 1 || !times.length) return times.map((_, i) => i);
  const out: number[] = [];
  times.forEach((t, i) => {
    if (Math.round(t / step) % k === 0) out.push(i);
  });
  return out;
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
 * The playback rate to read at: slow enough that the video shows no more than
 * `SHOWN_PER_SECOND` frames a second (`src` its own step; the browser hands
 * over at most one frame a screen refresh, 60 a second, and passes over the
 * rest: a 120 fps clip read at a half lost a fifth of its frames in
 * Chromium, and one in eight came out a frame later than the time it was
 * announced at), and that each frame kept (`step` apart) is kept with time to
 * spare, given the milliseconds each has taken; never faster than real time
 * and never slower than `MIN_RATE`.
 */
export const MIN_RATE = 0.0625;
export const SHOWN_PER_SECOND = 30;
export function playbackRateFor(msPerFrame: number, src = 1 / READ_FPS, step = 1 / READ_FPS): number {
  const shown = SHOWN_PER_SECOND * src;
  const busy = msPerFrame > 0 ? (0.6 * step * 1000) / msPerFrame : Infinity;
  return Math.min(1, Math.max(MIN_RATE, Math.min(shown, busy)));
}

/** The next rate down, for frames passed over, no slower than `MIN_RATE`. */
export function slowerRate(rate: number): number {
  return Math.max(MIN_RATE, rate * 0.5);
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

/**
 * A frame's luma plane, as copied out of a decoder, to the read's grey: the
 * crop `w` by `h` from byte `offset`, `stride` bytes a row, `bits` a sample
 * (two bytes, little-endian, past 8, brought to 8 with video range kept: 64
 * to 940 is 16 to 235), resampled to `outW` by `outH` (`resampleGray`) and
 * then turned `turn` degrees (`rotateGray`): for a quarter turn `outW` and
 * `outH` are the picture's before turning.
 */
export function planeGray(buf: Uint8Array, bits: number, offset: number, stride: number, w: number, h: number, outW: number, outH: number, turn: number): Uint8ClampedArray {
  let src = buf;
  let rowBytes = stride;
  let from = offset;
  if (bits > 8) {
    const shift = bits - 8;
    const eight = new Uint8Array(w * h);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let y = 0; y < h; y++) {
      const row = offset + y * stride;
      for (let x = 0; x < w; x++) eight[y * w + x] = Math.min(255, dv.getUint16(row + 2 * x, true) >> shift);
    }
    src = eight;
    rowBytes = w;
    from = 0;
  }
  return rotateGray(resampleGray(src, w, h, rowBytes, from, outW, outH), outW, outH, turn);
}
