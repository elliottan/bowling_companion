/// <reference lib="webworker" />
import { findLanes, frameLanes, markLinesOf } from "../lib/shotTrack/laneFind";
import type { GrayFrame } from "../lib/shotTrack/types";
import type { FindMessage, FindRequest } from "./protocol";

/**
 * Finds the lane on frames the screen read from a video (see `protocol.ts`):
 * on every frame given, so the tracer can take each frame's lane from the
 * found frames near it, and the best of them to show and to correct.
 */
const post = (m: FindMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (event: MessageEvent<FindRequest>) => {
  const { width, height, frames } = event.data;
  const gray: GrayFrame[] = frames.map((f) => ({ width, height, data: new Uint8ClampedArray(f.data), t: 0 }));
  try {
    const all = findLanes(gray);
    const best = all.best;
    if (!best) {
      post({ frame: null, lines: null });
      return;
    }
    post({
      frame: frames[best.index].index,
      lines: markLinesOf(best),
      lanes: frameLanes(all, (i) => frames[i].index),
      evidence: { guess: best.guess, support: best.support, pinsUsed: best.pinsUsed, camera: best.camera }
    });
  } catch {
    post({ frame: null, lines: null });
  }
};
