import type { LaneEvidence } from "../lib/shotTrack/laneVerdict";
import type { FrameLane } from "../lib/shotTrack/laneTrack";
import type { ShotFound } from "../lib/shotTrack/shotStart";
import type { Mat3, TrackError, TrackResult } from "../lib/shotTrack/types";
import type { Handedness } from "../types/bowling";

/**
 * The messages between the shot tracer screen and its workers (Settings,
 * Labs). Finding the shot, the lane and the ball takes seconds to tens of
 * seconds on a phone, so it runs off the main thread; frames are transferred,
 * not copied, where the screen does not need them back.
 */

/**
 * The first look (`lib/shotTrack/shotStart.ts`): each small grey frame as
 * the screen draws it, then `done`.
 */
export type SearchRequest = { kind: "frame"; width: number; height: number; data: ArrayBuffer; t: number } | { kind: "done" };

/** Where the shot is, or null when no run of the ball up the lane was seen. */
export interface SearchMessage {
  found: ShotFound | null;
}

export interface TraceRequest {
  width: number;
  height: number;
  /** Grey frames, one byte a pixel, row-major, with their times in seconds. */
  frames: { data: ArrayBuffer; t: number }[];
  /** The frame the pictures are registered to: the one the lane was found best on. */
  calibFrame: number;
  /** The lane as found on many frames, each frame then traced on its own (`TraceInput.lanes`). */
  lanes: FrameLane[];
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
 * spread over the clip, copied (the screen keeps its own to trace), each with
 * its index in the clip.
 */
export interface FindRequest {
  width: number;
  height: number;
  frames: { data: ArrayBuffer; index: number }[];
}

/**
 * The frame the lane was found best on (an index in the clip), the lane on
 * every frame it was found on (`frameLanes`), and what the finder knows about
 * how sure it is; a null frame when it was not found.
 */
export type FindMessage =
  | { frame: number; lanes: FrameLane[]; evidence: Pick<LaneEvidence, "guess" | "support" | "pinsUsed" | "camera"> }
  | { frame: null };
