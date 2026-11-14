import type { CalMark } from "../lib/shotTrack/calibrate";
import type { MarkLines } from "../lib/shotTrack/marking";
import type { Mat3, TrackError, TrackResult } from "../lib/shotTrack/types";
import type { Handedness } from "../types/bowling";

/**
 * The messages between the shot tracer screen and the worker that traces
 * (Settings, Labs). The tracer takes tens of seconds on a phone, so it runs
 * off the main thread; the frames are transferred, not copied.
 */

export interface TraceRequest {
  width: number;
  height: number;
  /** Grey frames, one byte a pixel, row-major, with their times in seconds. */
  frames: { data: ArrayBuffer; t: number }[];
  calibFrame: number;
  marks: CalMark[];
  hand: Handedness;
}

export type TraceMessage =
  | { kind: "progress"; stage: string; fraction: number }
  | { kind: "done"; result: TrackResult | TrackError; H: Mat3 | null };

/**
 * Finding the lane with no marks (`lib/shotTrack/laneFind.ts`): a few frames
 * spread over the clip, copied (the screen keeps its own to show), each with
 * its index in the clip.
 */
export interface FindRequest {
  width: number;
  height: number;
  frames: { data: ArrayBuffer; index: number }[];
}

/** The frame the lane was found on (an index in the clip) and its four lines, or null for both. */
export interface FindMessage {
  frame: number | null;
  lines: MarkLines | null;
}
