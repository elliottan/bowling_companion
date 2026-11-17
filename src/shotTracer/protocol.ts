import type { LaneJob } from "../lib/shotTrack/laneFind";
import type { LaneEvidence } from "../lib/shotTrack/laneVerdict";
import type { FrameLane } from "../lib/shotTrack/laneTrack";
import type { ShotFound } from "../lib/shotTrack/shotStart";

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

/**
 * A worker's own failure, posted instead of thrown (`workerFault.ts`): an
 * error a worker throws reaches the screen as an ErrorEvent that Safari
 * leaves empty, so the worker says what went wrong itself.
 */
export interface WorkerFault {
  message: string;
  /** The first line of its stack, where one was given. */
  at?: string;
}

/**
 * The search worker's messages: `ready` once it has loaded, then where the
 * shot is (null when no run of the ball up the lane was seen), or what went
 * wrong.
 */
export type SearchMessage = { kind: "ready" } | { kind: "found"; found: ShotFound | null } | ({ kind: "error" } & WorkerFault);

/**
 * The frame the lane was found best on (an index in the clip), the lane on
 * every frame it was found on (`frameLanes`), and what the finder knows about
 * how sure it is; a null frame when it was not found.
 */
export type FindMessage =
  | { frame: number; lanes: FrameLane[]; evidence: Pick<LaneEvidence, "guess" | "support" | "pinsUsed" | "camera"> }
  | { frame: null };

/**
 * The pool of workers the tracer's work is shared among (`pool.ts`,
 * `pool.worker.ts`). Frames stay with the screen; each job is sent the
 * frames it reads, copied, or (a registration pass) is sent them one at a
 * time as it asks for them.
 */
export interface WireFrame {
  index: number;
  width: number;
  height: number;
  data: ArrayBuffer;
  t: number;
}

/** An object sent to a worker once and named in jobs after (the empty lane). */
export interface SharedRef {
  shared: string;
}

export type PoolJob =
  /** A tracer job (`TraceJob`), with its large shared pictures named by `SharedRef`; `stream`: its frames come one at a time. */
  | { kind: "trace"; job: unknown; stream: boolean }
  /** A lane search job (`LaneJob`) of search `session`: a frame's later jobs run where its first did. */
  | { kind: "lane"; session: string; job: LaneJob }
  /** A frame's luma, cropped, turned to the read's grey: resampled to `outW` by `outH`, then turned. */
  | { kind: "gray"; luma: ArrayBuffer; w: number; h: number; stride: number; offset: number; outW: number; outH: number; turn: number };

export type PoolRequest =
  | { kind: "job"; id: number; job: PoolJob; frames: WireFrame[] }
  | { kind: "frame"; id: number; frame: WireFrame }
  | { kind: "share"; key: string; value: unknown }
  | { kind: "forget"; keys: string[] };

export type PoolMessage =
  /** The worker has loaded and takes jobs. */
  | { kind: "ready" }
  | { kind: "done"; id: number; result: unknown }
  /** A job failed (`id`), or the worker itself did, outside any one job (no `id`). */
  | ({ kind: "error"; id?: number } & WorkerFault)
  | { kind: "progress"; id: number; stage: string; fraction: number }
  /** A streamed job took a frame: the next can be sent. */
  | { kind: "took"; id: number };
