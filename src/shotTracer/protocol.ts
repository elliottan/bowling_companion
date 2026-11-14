import type { CalMark } from "../lib/shotTrack/calibrate";
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
