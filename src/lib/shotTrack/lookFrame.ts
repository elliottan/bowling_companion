import { toFullRange, type GrayRange } from "./grayRange";
import { planeGray } from "./marking";

/**
 * The first look's frames out of a decoded video frame, the same way on every
 * browser (2026-11-17). Until then an 8-bit frame was drawn to a canvas and
 * its RGB taken back, and how a browser draws a `VideoFrame` (its turn, its
 * size, its scaling) is the browser's own: on the owner's iPhone the look
 * found no run on the lane in IMG_1996, which desktop Chromium traces. Now
 * every frame whose format has a luma plane is built from that plane, as the
 * shot's read and the harness build theirs; a canvas is left only for a
 * frame with no format to read, and then drawn turned only as far as the
 * browser has not turned it already. Pure: the browser calls are in
 * `shotTracer/codecFrames.ts`.
 */

/** Formats whose first plane is luma, one byte a sample. */
const LUMA_8 = new Set(["I420", "I420A", "I422", "I422A", "I444", "I444A", "NV12"]);
/** Formats whose first plane is luma, two bytes a sample, by their bits. */
const LUMA_16: Record<string, number> = {
  I420P10: 10,
  I420AP10: 10,
  I422P10: 10,
  I422AP10: 10,
  I444P10: 10,
  I444AP10: 10,
  I420P12: 12,
  I422P12: 12,
  I444P12: 12,
  P010: 10
};

/** The bits a luma sample of a frame in `format` has, or null where the format has no luma plane to copy (RGB, or none given). */
export function lumaBits(format: string | null | undefined): number | null {
  if (!format) return null;
  if (LUMA_8.has(format)) return 8;
  return LUMA_16[format] ?? null;
}

/**
 * A look frame `width` by `height` (as shown) from a frame's luma plane: the
 * plane `w` by `h` as stored (`bits` a sample, `stride` bytes a row from
 * `offset`), averaged down to the look's size, turned `turn` degrees clockwise
 * as the track's matrix says, and brought to full range from `range`. The
 * same gray the shot's read and the harness's look make (`planeGray`,
 * `toFullRange`).
 */
export function lookGray(
  buf: Uint8Array,
  bits: number,
  offset: number,
  stride: number,
  w: number,
  h: number,
  width: number,
  height: number,
  turn: number,
  range: GrayRange
): Uint8ClampedArray {
  const quarter = ((turn % 180) + 180) % 180 !== 0;
  return toFullRange(planeGray(buf, bits, offset, stride, w, h, quarter ? height : width, quarter ? width : height, turn), range);
}

/** What a decoded frame says of itself, as the WebCodecs `VideoFrame` has it (only what is read here). */
export interface FrameShape {
  format: string | null;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  visibleRect: { x: number; y: number; width: number; height: number } | null;
  colorSpace?: { primaries?: string | null; transfer?: string | null; matrix?: string | null; fullRange?: boolean | null } | null;
  /** Newer WebCodecs: the turn a browser applies when it draws the frame. */
  rotation?: number;
  flip?: boolean;
}

/** A turn in degrees as 0, 90, 180 or 270. */
const norm = (deg: number) => ((Math.round(deg / 90) * 90) % 360 + 360) % 360;

/**
 * How far to turn a frame drawn to a canvas, given that the track says it is
 * shown turned `turn` degrees clockwise: the browser may have turned it
 * already. A frame with a `rotation` is drawn turned by it (newer WebCodecs),
 * so only the rest is ours; a frame whose display size is its visible size
 * across the other way, for a quarter turn, was turned by the decoder; else
 * the whole turn is ours. `why` says which, for the details.
 */
export function drawnTurn(f: FrameShape, turn: number): { turn: number; why: string } {
  const t = norm(turn);
  if (typeof f.rotation === "number" && norm(f.rotation) !== 0) {
    const rest = norm(t - f.rotation);
    return { turn: rest, why: `frame rotation ${norm(f.rotation)}, ${rest} left of the track's ${t}` };
  }
  const w = f.visibleRect?.width ?? f.codedWidth;
  const h = f.visibleRect?.height ?? f.codedHeight;
  const across = w !== h && Math.abs(f.displayWidth - h) <= 2 && Math.abs(f.displayHeight - w) <= 2;
  if (t % 180 !== 0 && across) return { turn: 0, why: `display ${f.displayWidth}x${f.displayHeight} already turned from ${w}x${h}` };
  return { turn: t, why: `turned ${t} as the track says` };
}

/** A decoded frame as a line of the details: its sizes, format, colour and any turn of its own. */
export function frameNote(f: FrameShape): string {
  const r = f.visibleRect;
  const c = f.colorSpace;
  const range = typeof c?.fullRange === "boolean" ? (c.fullRange ? "full" : "limited") : "range ?";
  const turned = [typeof f.rotation === "number" ? `rotation ${f.rotation}` : "", typeof f.flip === "boolean" ? `flip ${f.flip}` : ""].filter(Boolean).join(", ");
  return (
    `coded ${f.codedWidth}x${f.codedHeight}, display ${f.displayWidth}x${f.displayHeight}, visible ${r ? `${r.x},${r.y} ${r.width}x${r.height}` : "?"}, ` +
    `${f.format ?? "no format"}, color ${c ? `${c.primaries ?? "?"}/${c.transfer ?? "?"}/${c.matrix ?? "?"} ${range}` : "?"}` +
    (turned ? `, ${turned}` : "")
  );
}

/** The mean of the absolute differences of two pictures of one size: how far a canvas's frame is from the plane's. */
export function meanAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (!n) return Number.NaN;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

/**
 * For each of `fractions` of a video `duration` seconds long, the frame among
 * `times` (in order) nearest it: the look's frames shown on the end screens.
 * One frame is given once; an empty list for no frames.
 */
export function glimpseIndices(times: readonly number[], duration: number, fractions: readonly number[] = [0.25, 0.5, 0.75]): number[] {
  if (!times.length) return [];
  const out: number[] = [];
  for (const f of fractions) {
    const at = f * duration;
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - at) < Math.abs(times[best] - at)) best = i;
    if (!out.includes(best)) out.push(best);
  }
  return out;
}
