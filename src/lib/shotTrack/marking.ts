import { apply } from "./homography";
import { namedLine, type CalMark } from "./calibrate";
import { pathU } from "./pathFit";
import type { Mat3, PathModel, Point } from "./types";

/**
 * What the app's shot tracer screen needs around the tracer (Settings, Labs):
 * the four lines a bowler drags onto one frame, turned into calibration marks,
 * the frames to read from a video, and the fitted path drawn back onto the
 * picture. Pure, so the screen holds no geometry of its own.
 */

/** The lines the bowler places, each by its two ends, in the frame's pixels. */
export type MarkLine = "left" | "right" | "foul" | "pinrow";
export type MarkLines = Record<MarkLine, [Point, Point]>;
export const MARK_LINES: MarkLine[] = ["left", "right", "foul", "pinrow"];

/**
 * A first guess for a lane filmed from behind the bowler: the foul line low in
 * the picture, the back pin row a third of the way down, the edges joining
 * them. The bowler drags each end onto the lane.
 */
export function defaultMarkLines(width: number, height: number): MarkLines {
  const foulY = 0.82 * height;
  const pinY = 0.38 * height;
  // The ends start apart, so each can be picked up on its own: the edges stop
  // short of the pins, and the pin row runs wide (it is straight across the
  // whole house, so its ends can sit on any lane).
  return {
    left: [{ x: 0.44 * width, y: pinY + 0.1 * height }, { x: 0.28 * width, y: foulY - 0.04 * height }],
    right: [{ x: 0.56 * width, y: pinY + 0.1 * height }, { x: 0.72 * width, y: foulY - 0.04 * height }],
    foul: [{ x: 0.32 * width, y: foulY }, { x: 0.68 * width, y: foulY }],
    pinrow: [{ x: 0.36 * width, y: pinY }, { x: 0.64 * width, y: pinY }]
  };
}

/**
 * The lines as the tracer's calibration marks: each end is a point known to
 * lie on that lane line (an edge, the foul line, the back pin row).
 */
export function toCalMarks(lines: MarkLines): CalMark[] {
  return MARK_LINES.map((label) => {
    const lane = namedLine(label)!;
    return { kind: "line", label, axis: lane.axis, value: lane.value, at: lines[label].map((p) => ({ ...p })) };
  });
}

/**
 * The instants to read from a video of `duration` seconds at `fps`, at most
 * `maxFrames` of them from the start.
 */
export function frameTimes(duration: number, fps: number, maxFrames: number): number[] {
  if (!(duration > 0) || !(fps > 0)) return [];
  const count = Math.min(maxFrames, Math.floor(duration * fps));
  return Array.from({ length: count }, (_, i) => i / fps);
}

/** A picture's size scaled down to at most `maxPixels` pixels, whole pixels, never enlarged. */
export function scaledSize(width: number, height: number, maxPixels: number): { width: number; height: number } {
  const k = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * RGBA pixels to grey, one byte a pixel, as the video itself stores it: Rec.
 * 601 luma in video range, 16 for black to 235 for white. The tracer's
 * thresholds were set on clips read that way (ffmpeg's grey); a browser's
 * canvas stretches the video to 0 to 255, and with that stretch the ball was
 * lost at 47 ft on shot-01 where the video's own grey follows it to 58.
 */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const k = 4 * i;
    out[i] = 16 + (219 / 255) * (0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2]);
  }
  return out;
}

/** The fitted path in the picture through the lane mapping `H`, a point a foot from `from` to `to` feet. */
export function pathInPicture(H: Mat3, path: PathModel, from: number, to: number): Point[] {
  const out: Point[] = [];
  const end = Math.min(to, 60);
  for (let v = Math.max(0, from); v <= end + 1e-9; v += 1) out.push(apply(H, { x: pathU(path, v), y: v }));
  return out;
}
