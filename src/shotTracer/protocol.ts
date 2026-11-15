import type { CalMark } from "../lib/shotTrack/calibrate";
import type { LaneEvidence } from "../lib/shotTrack/laneVerdict";
import type { FrameLane } from "../lib/shotTrack/laneTrack";
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
  /** The lane as found on many frames, each frame then traced on its own (`TraceInput.lanes`)... */
  lanes?: FrameLane[];
  /** ...or the four lines the bowler placed on `calibFrame`, as marks. */
  marks?: CalMark[];
  hand: Handedness;
}

export type TraceMessage =
  | { kind: "progress"; stage: string; fraction: number }
  | {
      kind: "done";
      result: TrackResult | TrackError;
      /** The lane mapping on `calibFrame` as traced, for drawing the lane and the path on it. */
      H: Mat3 | null;
      /** What the tracer learned about the lane, for `laneVerdict`. */
      evidence?: Pick<LaneEvidence, "kept" | "dropped" | "pinCheck">;
    };

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

/**
 * The frame the lane was found best on (an index in the clip) and its four
 * lines, the lane on every frame it was found on (`frameLanes`), and what the
 * finder knows about how sure it is; nulls when it was not found.
 */
export type FindMessage =
  | { frame: number; lines: MarkLines; lanes: FrameLane[]; evidence: Pick<LaneEvidence, "guess" | "support" | "pinsUsed" | "camera"> }
  | { frame: null; lines: null };
