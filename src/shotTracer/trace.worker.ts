/// <reference lib="webworker" />
import { trace } from "../lib/shotTrack/pipeline";
import type { GrayFrame } from "../lib/shotTrack/types";
import type { TraceMessage, TraceRequest } from "./protocol";

/** Runs the tracer on frames the screen read from a video (see `protocol.ts`). */
const post = (m: TraceMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (event: MessageEvent<TraceRequest>) => {
  const { width, height, frames, calibFrame, marks, hand } = event.data;
  const gray: GrayFrame[] = frames.map((f) => ({ width, height, data: new Uint8ClampedArray(f.data), t: f.t }));
  try {
    const out = trace({
      source: { count: gray.length, frame: (i) => gray[i] },
      calibFrame,
      calMarks: marks,
      hand,
      onProgress: (stage, fraction) => post({ kind: "progress", stage, fraction })
    });
    post({ kind: "done", result: out.result, H: out.debug.fit?.H ?? null });
  } catch (e) {
    post({ kind: "done", result: { ok: false, failure: "lane-not-found", detail: (e as Error).message }, H: null });
  }
};
