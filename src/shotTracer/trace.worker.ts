/// <reference lib="webworker" />
import { trace } from "../lib/shotTrack/pipeline";
import type { GrayFrame } from "../lib/shotTrack/types";
import type { TraceMessage, TraceRequest } from "./protocol";

/** Runs the tracer on frames the screen read from a video (see `protocol.ts`). */
const post = (m: TraceMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (event: MessageEvent<TraceRequest>) => {
  const { width, height, frames, calibFrame, lanes, marks, hand } = event.data;
  const gray: GrayFrame[] = frames.map((f) => ({ width, height, data: new Uint8ClampedArray(f.data), t: f.t }));
  try {
    const out = trace({
      source: { count: gray.length, frame: (i) => gray[i] },
      calibFrame,
      // Found lanes, each frame traced on its own; or the lines the bowler placed.
      ...(lanes?.length ? { lanes } : { calMarks: marks ?? [] }),
      hand,
      onProgress: (stage, fraction) => post({ kind: "progress", stage, fraction })
    });
    const lanesUsed = out.debug.lanes;
    post({
      kind: "done",
      result: out.result,
      // The calibration frame's mapping as traced: the fit of the marks, or the
      // found lanes' blend there (`debug.fit` is null with lanes).
      H: out.debug.H0 ?? out.debug.fit?.H ?? null,
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
