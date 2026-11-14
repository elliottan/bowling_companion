/// <reference lib="webworker" />
import { findLane, markLinesOf } from "../lib/shotTrack/laneFind";
import type { GrayFrame } from "../lib/shotTrack/types";
import type { FindMessage, FindRequest } from "./protocol";

/** Finds the lane on frames the screen read from a video (see `protocol.ts`). */
const post = (m: FindMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (event: MessageEvent<FindRequest>) => {
  const { width, height, frames } = event.data;
  const gray: GrayFrame[] = frames.map((f) => ({ width, height, data: new Uint8ClampedArray(f.data), t: 0 }));
  try {
    const found = findLane(gray);
    post(found ? { frame: frames[found.index].index, lines: markLinesOf(found) } : { frame: null, lines: null });
  } catch {
    post({ frame: null, lines: null });
  }
};
