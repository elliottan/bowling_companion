/// <reference lib="webworker" />
import { trace } from "../lib/shotTrack/pipeline";
import type { GrayFrame } from "../lib/shotTrack/types";
import type { TraceMessage, TraceRequest } from "./protocol";

/** Runs the tracer on frames the screen read from a video (see `protocol.ts`). */
const post = (m: TraceMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (event: MessageEvent<TraceRequest>) => {
  const { width, height, frames, calibFrame, lanes, hand } = event.data;
  const gray: GrayFrame[] = frames.map((f) => ({ width, height, data: new Uint8ClampedArray(f.data), t: f.t }));
  try {
    const out = trace({
      source: { count: gray.length, frame: (i) => gray[i] },
      calibFrame,
      // The found lanes, each frame traced on its own.
      lanes,
      hand,
      onProgress: (stage, fraction) => post({ kind: "progress", stage, fraction })
    });
    const lanesUsed = out.debug.lanes;
    post({
      kind: "done",
      result: out.result,
      // The calibration frame's mapping as traced: the found lanes' blend there.
      H: out.debug.H0 ?? null,
      evidence: {
        kept: lanesUsed?.kept.length,
        dropped: lanesUsed?.dropped.length,
        pinCheck: out.debug.calibration?.pinError ?? null
      }
    });
  } catch (e) {
    post({ kind: "done", result: { ok: false, failure: "lane-not-found", detail: (e as Error).message }, H: null });
  }
};
