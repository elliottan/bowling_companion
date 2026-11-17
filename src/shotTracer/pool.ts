import type { Background } from "../lib/shotTrack/background";
import { lanesFrom, laneSteps, type LaneJob, type LanesFound } from "../lib/shotTrack/laneFind";
import { traceSteps, type TraceInput, type TraceJob, type TraceOutput } from "../lib/shotTrack/pipeline";
import type { GrayFrame } from "../lib/shotTrack/types";
import { joinBackground, rowBands, rowsOf } from "../lib/shotTrack/workers";
import { InlineWorker, type WorkerLike } from "./inlineWorker";
import type { PoolJob, PoolMessage, PoolRequest, SharedRef, WireFrame } from "./protocol";
import { faultNote, loadFailureNote, type LoadError } from "./workerFault";

/**
 * A few workers the tracer's work is shared among (`lib/shotTrack/workers.ts`
 * says how many). Started from the screen, never from another worker
 * (nested workers are not known to work in an iPhone's web view). The screen
 * keeps the frames; a job is sent copies of the frames it reads, so no
 * worker holds the whole clip but the one running the trace's last part.
 * Every job gives what it gives on one thread, and the results are put back
 * in the order the jobs were handed out, so the readings do not depend on
 * how many workers there are or which finishes first.
 *
 * A worker is sent nothing until it says it is ready. One that fails to load,
 * or is not ready in `READY_MS`, is replaced by an `InlineWorker` (its jobs
 * run on the screen's thread, the same code, the same readings), and the pool
 * notes why. One that fails after it was ready may have lost what it kept, so
 * the pool fails with a `WorkerCrash`, and the screen runs the whole search
 * or trace again on its own thread (`inlinePool`).
 */

/** How long a worker has to say it is ready before its jobs run on the screen's thread, milliseconds. */
export const READY_MS = 5000;

/** A worker failed after it was ready: what it kept may be lost, so the whole job is run again (`inlinePool`). */
export class WorkerCrash extends Error {}

/** Jobs sent to a worker before it finishes the one it is on, so it never waits for the next. */
const AHEAD = 2;
/** Frames sent ahead of what a registration pass has taken. */
const STREAM_AHEAD = 4;

interface Task {
  id: number;
  job: PoolJob;
  frames: WireFrame[];
  transfer: Transferable[];
  /** The worker it must run on (a lane search's later jobs), if any. */
  on?: number;
  /** A registration pass: alone on its worker, its frames sent as it takes them. */
  stream?: GrayFrame[];
  /** Shared pictures it names, sent to its worker first. */
  shares: { key: string; value: unknown }[];
  onProgress?: (stage: string, fraction: number) => void;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface Slot {
  worker: WorkerLike;
  /** It has said it is ready (an inline one is from the start): only then is it sent anything. */
  ready: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  running: Task[];
  /** Shared pictures this worker has. */
  has: Set<string>;
}

let nextId = 1;

/** A frame as sent: copied, unless `move` (the screen no longer needs it). */
export function wire(f: GrayFrame, index: number, move = false): WireFrame {
  const data = move && f.data.byteOffset === 0 && f.data.byteLength === f.data.buffer.byteLength ? f.data.buffer : f.data.slice().buffer;
  return { index, width: f.width, height: f.height, data: data as ArrayBuffer, t: f.t };
}

export class Pool {
  private readonly slots: Slot[];
  private readonly queue: Task[] = [];
  private readonly keys = new WeakMap<object, string>();
  private broken: Error | null = null;

  private readonly onNote: (text: string) => void;

  /**
   * `url`: where the workers are started from, for the details when one
   * fails to load; `onNote`: a line for the details block when one does.
   */
  constructor(size: number, start: () => WorkerLike, opts: { url?: string; readyMs?: number; onNote?: (text: string) => void } = {}) {
    this.onNote = opts.onNote ?? (() => {});
    const readyMs = opts.readyMs ?? READY_MS;
    const url = opts.url ?? "?";
    this.slots = Array.from({ length: Math.max(1, size) }, (_, n) => {
      const slot: Slot = { worker: null as unknown as WorkerLike, running: [], has: new Set(), ready: false, timer: undefined };
      let worker: WorkerLike;
      try {
        worker = start();
      } catch (e) {
        this.inline(slot, n, `could not be started: ${e instanceof Error ? e.message : String(e)}`);
        return slot;
      }
      slot.worker = worker;
      slot.ready = worker instanceof InlineWorker;
      worker.onmessage = (e: MessageEvent<PoolMessage>) => {
        const m = e.data;
        if (!slot.ready) this.becomeReady(slot);
        if (m.kind === "ready") return;
        if (m.kind === "error" && m.id === undefined) this.fail(new WorkerCrash(`worker ${n} threw while working: ${faultNote(m)}`));
        else this.answer(slot, m);
      };
      worker.onerror = (e) => {
        if (slot.worker !== worker) return;
        if (!slot.ready) this.inline(slot, n, loadFailureNote(e as LoadError, url));
        else this.fail(new WorkerCrash(`worker ${n} threw while working: ${(e as LoadError).message || "no message"}`));
      };
      if (!slot.ready) slot.timer = setTimeout(() => this.inline(slot, n, `never said it was ready in ${readyMs / 1000} s, from ${url}`), readyMs);
      return slot;
    });
  }

  private becomeReady(slot: Slot) {
    slot.ready = true;
    clearTimeout(slot.timer);
    this.pump();
  }

  /** A worker that never got ready replaced by one on the screen's thread: it was sent nothing, so nothing is lost. */
  private inline(slot: Slot, n: number, why: string) {
    if (slot.ready || this.broken) return;
    clearTimeout(slot.timer);
    if (slot.worker) {
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.worker.terminate();
    }
    this.onNote(`worker ${n} ${why}; its jobs ran on the main thread`);
    const worker = new InlineWorker();
    worker.onmessage = (e: MessageEvent<PoolMessage>) => {
      const m = e.data;
      if (m.kind === "error" && m.id === undefined) this.fail(new WorkerCrash(`worker ${n} (main thread) failed: ${faultNote(m)}`));
      else if (m.kind !== "ready") this.answer(slot, m);
    };
    slot.worker = worker;
    slot.ready = true;
    this.pump();
  }

  get size(): number {
    return this.slots.length;
  }

  terminate(): void {
    for (const s of this.slots) {
      clearTimeout(s.timer);
      s.worker.terminate();
    }
    this.fail(new Error("stopped"));
  }

  /** A name for a large picture several jobs share: sent to each worker once. */
  share(value: object): SharedRef {
    let key = this.keys.get(value);
    if (!key) {
      key = `s${nextId++}`;
      this.keys.set(value, key);
    }
    return { shared: key };
  }

  /** Lets go of shared pictures and lane searches by name, in every worker. */
  forget(keys: string[]): void {
    for (const s of this.slots) {
      s.worker.postMessage({ kind: "forget", keys } satisfies PoolRequest);
      for (const k of keys) s.has.delete(k);
    }
  }

  run(
    job: PoolJob,
    opts: { frames?: WireFrame[]; transfer?: Transferable[]; on?: number; stream?: GrayFrame[]; shares?: { key: string; value: unknown }[]; onProgress?: (stage: string, fraction: number) => void } = {}
  ): Promise<unknown> {
    if (this.broken) return Promise.reject(this.broken);
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: nextId++, job, frames: opts.frames ?? [], transfer: opts.transfer ?? [], on: opts.on, stream: opts.stream, shares: opts.shares ?? [],
        onProgress: opts.onProgress, resolve, reject
      });
      this.pump();
    });
  }

  /** The worker a lane search's frame goes to: spread in turn. */
  slotFor(n: number): number {
    return n % this.slots.length;
  }

  private pump() {
    for (let k = 0; k < this.queue.length; ) {
      const t = this.queue[k];
      const slot = this.pick(t);
      if (!slot) {
        k++;
        continue;
      }
      this.queue.splice(k, 1);
      this.send(slot, t);
    }
  }

  private pick(t: Task): Slot | null {
    const free = (s: Slot) => s.ready && !s.running.some((r) => r.stream) && (t.stream ? !s.running.length : s.running.length < AHEAD);
    if (t.on !== undefined) return free(this.slots[t.on]) ? this.slots[t.on] : null;
    let best: Slot | null = null;
    for (const s of this.slots) if (free(s) && (!best || s.running.length < best.running.length)) best = s;
    return best;
  }

  private send(slot: Slot, t: Task) {
    for (const { key, value } of t.shares) {
      if (slot.has.has(key)) continue;
      slot.worker.postMessage({ kind: "share", key, value } satisfies PoolRequest);
      slot.has.add(key);
    }
    slot.running.push(t);
    // The frames sent are the screen's copies (or moved on purpose): moved, not copied again.
    const moved = new Set<Transferable>([...t.transfer, ...t.frames.map((f) => f.data)]);
    slot.worker.postMessage({ kind: "job", id: t.id, job: t.job, frames: t.frames } satisfies PoolRequest, [...moved]);
    if (t.stream) {
      (t as Task & { sent: number }).sent = 0;
      for (let k = 0; k < STREAM_AHEAD; k++) this.feed(slot, t);
    }
  }

  private feed(slot: Slot, t: Task) {
    const s = t as Task & { sent: number };
    if (!t.stream || s.sent >= t.stream.length) return;
    const frame = wire(t.stream[s.sent], s.sent);
    slot.worker.postMessage({ kind: "frame", id: t.id, frame } satisfies PoolRequest, [frame.data]);
    s.sent++;
  }

  private answer(slot: Slot, m: PoolMessage) {
    if (m.kind === "ready") return;
    const t = slot.running.find((r) => r.id === m.id);
    if (!t) return;
    if (m.kind === "took") {
      this.feed(slot, t);
      return;
    }
    if (m.kind === "progress") {
      t.onProgress?.(m.stage, m.fraction);
      return;
    }
    slot.running.splice(slot.running.indexOf(t), 1);
    if (m.kind === "done") t.resolve(m.result);
    else if (m.kind === "error") t.reject(new Error(faultNote(m)));
    this.pump();
  }

  private fail(e: Error) {
    this.broken ??= e;
    for (const s of this.slots) clearTimeout(s.timer);
    for (const s of this.slots) for (const t of s.running.splice(0)) t.reject(e);
    for (const t of this.queue.splice(0)) t.reject(e);
  }
}

/** `findLanes` on `frames` with its per-frame jobs shared among the pool. */
export async function findInPool(pool: Pool, frames: GrayFrame[]): Promise<LanesFound> {
  const session = `lane${nextId++}`;
  const steps = laneSteps(frames.length, frames[0].width, frames.length);
  try {
    let next = steps.next();
    while (!next.done) {
      const results = await Promise.all(
        next.value.map((job: LaneJob) =>
          pool.run(
            { kind: "lane", session, job },
            // The frame goes with its first job, and its later jobs to the same worker.
            { on: pool.slotFor(job.index), frames: job.kind === "lanes" ? [wire(frames[job.index], job.index)] : [] }
          )
        )
      );
      next = steps.next(results);
    }
    return lanesFrom(next.value.attempts, next.value.camera);
  } finally {
    pool.forget([session]);
  }
}

/**
 * `trace` with its jobs shared among the pool: the two directions of each
 * registration side by side, every frame's steadying and candidates spread
 * over the workers, the medians a band of rows each, and the last part on
 * one worker, which is handed the frames (the screen's own are moved, so it
 * must not need them after).
 */
export async function traceInPool(pool: Pool, frames: GrayFrame[], input: Omit<TraceInput, "source">): Promise<TraceOutput> {
  const source = { count: frames.length, frame: (i: number) => frames[i] };
  const steps = traceSteps({ ...input, source });
  const shared: string[] = [];
  const ref = (value: Background) => {
    const r = pool.share(value);
    if (!shared.includes(r.shared)) shared.push(r.shared);
    return { ref: r, share: { key: r.shared, value } };
  };
  const one = (job: TraceJob): Promise<unknown> => {
    switch (job.kind) {
      case "register":
      case "plane": {
        const order = [job.calibFrame, ...(job.kind === "register" ? job.frames : job.geos.map((g) => g.index))];
        return pool.run({ kind: "trace", job, stream: true }, { stream: order.map((i) => frames[i]) });
      }
      case "steady":
        return pool.run({ kind: "trace", job, stream: false }, { frames: [wire(frames[job.index], job.index)] });
      case "median": {
        // A band of rows to each worker: the median is pixel by pixel.
        const { height } = job.frames[0];
        return Promise.all(
          rowBands(height, pool.size).map(([a, b]) => {
            const band = job.frames.map((f) => rowsOf(f, a, b));
            return pool.run({ kind: "trace", job: { kind: "median", frames: band }, stream: false }, { transfer: band.map((f) => f.data.buffer as ArrayBuffer) });
          })
        ).then((parts) => joinBackground(parts as Background[]));
      }
      case "align": {
        // The steadied picture the screen has (a frame of the empty lane's
        // sample) is moved there: the medians that read it are done.
        const { bg0, bg, picture, ...rest } = job;
        const a = ref(bg0 as Background);
        const b = bg ? ref(bg) : null;
        const sent = picture;
        return pool.run(
          { kind: "trace", job: { ...rest, bg0: a.ref, ...(b ? { bg: b.ref } : {}), ...(sent ? { picture: sent } : {}) }, stream: false },
          { frames: [wire(frames[job.index], job.index)], shares: b ? [a.share, b.share] : [a.share], transfer: sent ? [sent.data.buffer as ArrayBuffer] : [] }
        );
      }
      case "tail": {
        const moved = frames.map((f, i) => wire(f, i, true));
        return pool.run({ kind: "trace", job, stream: false }, { frames: moved, transfer: moved.map((f) => f.data), onProgress: input.onProgress });
      }
    }
  };
  try {
    let next = steps.next();
    while (!next.done) next = steps.next(await Promise.all(next.value.map(one)));
    return next.value;
  } finally {
    pool.forget(shared);
  }
}
