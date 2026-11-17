import { bandRows, FrameSlots, gridSlot, MAX_PIXELS, scaledSize, sourceStep } from "./marking";
import { decodeSpan, shownTimes, spanStamps, type Sample, type VideoTrack } from "./mp4";
import { COARSE_FPS } from "./shotStart";

/**
 * Which of a video file's frames the shot tracer's reader turns to gray, from
 * the file's own sample table (`mp4.ts`): the first look's frames on the
 * `COARSE_FPS` grid (`scanPick`) and a read's frames on `FrameSlots`
 * (`readPick`). The browser's decoder (`shotTracer/codecFrames.ts`) and the
 * harness's ffmpeg (`scripts/shot-tracker/app-read.ts`) both choose by these,
 * so the harness reads the frames the app reads, to the frame. Pure.
 */

/** The first look's frames: their stamps (`stampOf`) in the order shown, and how many shown frames fall between grid slots. */
export interface ScanPick {
  span: { first: number; last: number };
  order: number[];
  offGrid: number;
}

/** The first look over the whole video, `duration` seconds; null when the track shows no frame. */
export function scanPick(samples: readonly Sample[], duration: number): ScanPick | null {
  const span = decodeSpan(samples, 0, duration);
  if (!span) return null;
  const order: number[] = [];
  let next = 0;
  let offGrid = 0;
  for (const stamp of spanStamps(samples, span.first, span.last)) {
    const t = stamp / 1e6;
    if (t < -1e-6) continue;
    const after = gridSlot(t, next, COARSE_FPS);
    if (after === null) {
      offGrid++;
      continue;
    }
    next = after;
    order.push(stamp);
  }
  return { span, order, offGrid };
}

/** The plan of one read: from `from` to `to` seconds, `fps` kept a second, of a portrait picture only `band`, carrying on from a frame an earlier part kept (`after`). */
export interface PickPlan {
  from: number;
  to: number;
  fps: number;
  band: { top: number; bottom: number } | null;
  after?: { t: number; src: number };
}

/** What a read keeps, and how big. */
export interface ReadPick {
  from: number;
  to: number;
  /** The shown picture's rows kept (`bandRows`), and the band they are as fractions of its height. */
  rows: { y: number; h: number };
  band: { top: number; bottom: number };
  /** The size each kept frame is turned to, shown (after its turn). */
  width: number;
  height: number;
  /** The video's own step between frames, seconds, and the kept frames' step. */
  src: number;
  step: number;
  /** Frames on the grid the file does not have. */
  missing: number;
  /** The samples to decode, in decode order, inclusive; null when the stretch shows no frame. */
  span: { first: number; last: number } | null;
  /** The stamps kept, each to its place in the read. */
  wanted: Map<number, number>;
}

/** The frames `plan` keeps of `track`: every `m`th of the video from its start (`FrameSlots`), at most `MAX_PIXELS` each. */
export function readPick(track: Pick<VideoTrack, "samples" | "duration" | "width" | "height">, plan: PickPlan): ReadPick {
  const from = Math.max(0, Math.min(plan.from, track.duration));
  const to = Math.min(track.duration, plan.to);
  const rows = bandRows(track.height, plan.band);
  const { width, height } = scaledSize(track.width, rows.h, MAX_PIXELS);
  const shown = shownTimes(track.samples, from, to);
  const steps = shown.slice(1).map((t, i) => t - shown[i]);
  const src = plan.after?.src ?? sourceStep(steps) ?? 1 / plan.fps;
  const slots = new FrameSlots(from, to, plan.fps, src, plan.after?.t);
  const span = decodeSpan(track.samples, from - 0.25 * src, to);
  // The frames to keep, chosen over the file's own frame times in the order
  // shown, as the decoder would hand them out.
  const wanted = new Map<number, number>();
  if (span) for (const stamp of spanStamps(track.samples, span.first, span.last)) if (slots.offer(stamp / 1e6)) wanted.set(stamp, wanted.size);
  slots.close();
  const band = { top: rows.y / track.height, bottom: (rows.y + rows.h) / track.height };
  return { from, to, rows, band, width, height, src, step: slots.step, missing: slots.missing.length, span, wanted };
}

/** A frame time stored to the millisecond can be this much under the grid instant it is on. */
const GRID_EARLY = 0.002;

/**
 * The frames of a read on a grid `every` seconds apart counted from the
 * video's start, not from the read's: of `times` (a read's frames, seconds,
 * in order, kept every `step`), the first at or after each grid instant and
 * less than `step` past it. Two reads of one video that start at different
 * times choose the same frames where they overlap. Choosing every `n`th frame
 * of the read, as the lane search and the empty lane did, chose other frames
 * for every other start, and the trace's readings moved with them (shot-04
 * read from five starts: the arrows from 4.8 to 9.9). Pure.
 */
export function gridFrames(times: readonly number[], every: number, step: number): number[] {
  const out: number[] = [];
  let last = -Infinity;
  times.forEach((t, i) => {
    const slot = Math.floor((t + GRID_EARLY) / every);
    if (slot === last || t + GRID_EARLY - slot * every >= step) return;
    out.push(i);
    last = slot;
  });
  return out;
}

/** The step between a read's frames, seconds: the median of the steps (a frame passed over makes one step two). */
export function readStep(times: readonly number[]): number {
  const steps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  return steps.length ? steps[steps.length >> 1] : 1 / 60;
}

/**
 * How far apart the frames the lane is looked for on are, seconds
 * (`gridFrames`): about 24 over a shot read whole, as before.
 */
export const LANE_EVERY = 0.15;
/** And on the read's first part, which only says where the shot is: about 8 over its 1.6 s. */
export const FIRST_LANE_EVERY = 0.2;
