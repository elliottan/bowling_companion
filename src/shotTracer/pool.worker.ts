/// <reference lib="webworker" />
import { runLaneJob, type LaneStore } from "../lib/shotTrack/laneFind";
import { resampleGray, rotateGray } from "../lib/shotTrack/marking";
import type { Background } from "../lib/shotTrack/background";
import { passOf, runTraceJob, type Aligned, type TraceJob } from "../lib/shotTrack/pipeline";
import type { GrayFrame } from "../lib/shotTrack/types";
import type { PoolJob, PoolMessage, PoolRequest, WireFrame } from "./protocol";

/**
 * One worker of the tracer's pool (`pool.ts`): runs the jobs it is sent on
 * the frames sent with them, each exactly as `trace` or `findLanes` would on
 * one thread. A registration pass is sent its frames one at a time and
 * says when it has taken each; a lane search keeps each frame's findings
 * here for that frame's later jobs.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: PoolMessage, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

const gray = (f: WireFrame): GrayFrame => ({ width: f.width, height: f.height, data: new Uint8ClampedArray(f.data), t: f.t });

/** Pictures sent once and named in later jobs (`SharedRef`). */
const shared = new Map<string, unknown>();
/** Each lane search's findings and frames, by its session. */
const searches = new Map<string, { store: LaneStore; frames: Map<number, GrayFrame> }>();
/** Frames on their way to a streamed job, and the job waiting for the next. */
const streams = new Map<number, { frames: GrayFrame[]; wake: (() => void) | null }>();

/** A job's large pictures put back in place of their names. */
function resolve(job: Record<string, unknown>): TraceJob {
  const out: Record<string, unknown> = { ...job };
  for (const k of ["bg0", "bg"]) {
    const v = out[k] as { shared?: string } | undefined;
    if (v && typeof v === "object" && typeof v.shared === "string") out[k] = shared.get(v.shared);
  }
  return out as unknown as TraceJob;
}

/**
 * The pictures in a result that are made for it alone, to move rather than
 * copy back. Nothing a worker keeps (a lane search's findings) is moved: it
 * would be emptied here.
 */
function movable(job: PoolJob, result: unknown): Transferable[] {
  if (job.kind === "gray") return [result as ArrayBuffer];
  if (job.kind !== "trace") return [];
  const kind = (job.job as { kind: string }).kind;
  const data = (f: GrayFrame | undefined) => (f ? [f.data.buffer as ArrayBuffer] : []);
  if (kind === "steady") return data(result as GrayFrame);
  if (kind === "median") return [...data(result as GrayFrame), (result as Background).spread.buffer as ArrayBuffer];
  if (kind === "align") return data((result as Aligned).steadied);
  return [];
}

async function run(id: number, request: Extract<PoolRequest, { kind: "job" }>): Promise<unknown> {
  const { job } = request;
  if (job.kind === "gray") {
    const g = rotateGray(resampleGray(new Uint8Array(job.luma), job.w, job.h, job.stride, job.offset, job.outW, job.outH), job.outW, job.outH, job.turn);
    return g.buffer;
  }
  if (job.kind === "lane") {
    let search = searches.get(job.session);
    if (!search) {
      search = { store: { per: new Map(), measured: new Map() }, frames: new Map() };
      searches.set(job.session, search);
    }
    for (const f of request.frames) search.frames.set(f.index, gray(f));
    return runLaneJob(job.job, search.frames.get(job.job.index)!, search.store);
  }
  const traceJob = resolve(job.job as Record<string, unknown>);
  if (job.stream && (traceJob.kind === "register" || traceJob.kind === "plane")) {
    const stream = streams.get(id) ?? { frames: [] as GrayFrame[], wake: null as (() => void) | null };
    streams.set(id, stream);
    try {
      const pass = passOf(traceJob);
      for (let k = 0; k < pass.frames.length; k++) {
        while (!stream.frames.length) await new Promise<void>((r) => (stream.wake = r));
        pass.feed(stream.frames.shift()!);
        post({ kind: "took", id });
      }
      return pass.result();
    } finally {
      streams.delete(id);
    }
  }
  const frames = new Map(request.frames.map((f) => [f.index, gray(f)]));
  const source = {
    count: Infinity,
    frame: (i: number) => {
      const f = frames.get(i);
      if (!f) throw new Error(`frame ${i} not sent`);
      return f;
    }
  };
  return runTraceJob(traceJob, source, (stage, fraction) => post({ kind: "progress", id, stage, fraction }));
}

scope.onmessage = (event: MessageEvent<PoolRequest>) => {
  const m = event.data;
  if (m.kind === "share") {
    shared.set(m.key, m.value);
    return;
  }
  if (m.kind === "forget") {
    for (const k of m.keys) {
      shared.delete(k);
      searches.delete(k);
    }
    return;
  }
  if (m.kind === "frame") {
    const stream = streams.get(m.id);
    if (!stream) return;
    stream.frames.push(gray(m.frame));
    stream.wake?.();
    stream.wake = null;
    return;
  }
  // A streamed job's frames may come before its job has started waiting for them.
  if (m.job.kind === "trace" && m.job.stream) streams.set(m.id, { frames: [], wake: null });
  run(m.id, m).then(
    (result) => post({ kind: "done", id: m.id, result }, movable(m.job, result)),
    (e: unknown) => post({ kind: "error", id: m.id, message: e instanceof Error ? e.message : String(e) })
  );
};
