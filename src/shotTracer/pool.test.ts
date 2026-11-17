import { describe, expect, it } from "vitest";
import { findLanes } from "../lib/shotTrack/laneFind";
import { trace } from "../lib/shotTrack/pipeline";
import { behindCamera, renderFrame, truthAt, type SyntheticShot } from "../lib/shotTrack/synthetic";
import { standardShot, syntheticSource } from "../lib/shotTrack/syntheticSource";
import type { GrayFrame } from "../lib/shotTrack/types";
import { InlineWorker, type WorkerLike } from "./inlineWorker";
import { findInPool, Pool, traceInPool, WorkerCrash } from "./pool";
import type { PoolMessage } from "./protocol";

/**
 * The pool on this thread (`InlineWorker`), and the pool when its workers
 * fail: whatever runs the jobs, and however many, the readings are the ones
 * `findLanes` and `trace` give on one thread.
 */

const spec = standardShot({ hand: "right", body: true, duration: 1.6 });
const src = syntheticSource(spec);
/** As the screen has them, a byte a pixel (the synthetic frames are float). */
const bytes = (f: GrayFrame): GrayFrame => ({ ...f, data: Uint8ClampedArray.from(f.data) });
const rendered: GrayFrame[] = Array.from({ length: src.count }, (_, i) => bytes(src.frame(i)));
/** Fresh copies: the trace's last job moves the frames it is handed. */
const frames = () => rendered.map((f) => ({ ...f, data: f.data.slice() }));
/** A house the finder finds the lane in (`laneFind.test.ts`), three of its frames. */
const house: SyntheticShot = {
  camera: behindCamera({ width: 960, height: 720, fill: 0.12, back: 25, side: 0.5, heightFt: 5, roll: -0.03 }),
  fps: 30, duration: 0.5, hand: "right", path: { u0: 24, a: 0.2, s: 36, L: 16, k: -0.025 },
  releaseT: 10, releaseV: -0.3, speedMph: 17, decel: -1.2, touchdownV: 1.2, loft: 0.15, noise: 2, seed: 3, pinMirror: true
};
const laneFrames = [0, 5, 10].map((i) => bytes(renderFrame(house, i)));
/** Fresh copies of the house's frames. */
const looked = () => laneFrames.map((f) => ({ ...f, data: f.data.slice() }));
const lanes = Array.from({ length: Math.floor(src.count / 6) }, (_, i) => ({ frame: 6 * i, H: truthAt(spec, 6 * i).H, weight: 1 }));
const input = { calibFrame: 30, lanes, hand: "right" as const };

/** A worker that never loads: an error event with nothing in it, as Safari gives; or (`fails` false) one that loads and never says so. */
class Unloadable implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent = 0;
  terminated = false;
  constructor(fails = true) {
    if (fails) setTimeout(() => this.onerror?.({ message: "", filename: "", lineno: 0, colno: 0 } as ErrorEvent), 0);
  }
  postMessage(): void {
    this.sent++;
  }
  terminate(): void {
    this.terminated = true;
  }
}

/** A real (inline) worker that says it is ready, then fails while working on its `after`th message. */
class Crashing implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private readonly inner = new InlineWorker();
  private seen = 0;
  constructor(
    private readonly after: number,
    private readonly how: "event" | "message"
  ) {
    this.inner.onmessage = (e) => this.onmessage?.(e);
    setTimeout(() => this.onmessage?.({ data: { kind: "ready" } satisfies PoolMessage } as MessageEvent), 0);
  }
  postMessage(m: unknown, transfer?: Transferable[]): void {
    if (++this.seen < this.after) return this.inner.postMessage(m, transfer);
    setTimeout(() => {
      if (this.how === "event") this.onerror?.({ message: "" } as ErrorEvent);
      else this.onmessage?.({ data: { kind: "error", message: "out of memory", at: "f@pool.worker.js:1:2" } satisfies PoolMessage } as MessageEvent);
    }, 0);
  }
  terminate(): void {
    this.inner.terminate();
  }
}

describe("the tracer's pool", () => {
  const alone = findLanes(laneFrames);
  const traced = trace({ ...input, source: { count: rendered.length, frame: (i) => rendered[i] } });

  it("finds the lane on the screen's thread exactly as one thread does, with one inline worker or three", async () => {
    expect(alone.best).not.toBeNull();
    for (const size of [1, 3]) {
      const pool = new Pool(size, () => new InlineWorker());
      expect(await findInPool(pool, looked())).toEqual(alone);
      pool.terminate();
    }
  });

  // A whole trace each, so one test a pool size: on CI under coverage the two
  // together ran past 30 s.
  it.each([1, 2])("traces on the screen's thread exactly as one thread does, with %i inline workers", async (size) => {
    expect(traced.result.ok).toBe(true);
    const pool = new Pool(size, () => new InlineWorker());
    const out = await traceInPool(pool, frames(), input);
    expect(out.result).toEqual(traced.result);
    expect(out.debug.H0).toEqual(traced.debug.H0);
    pool.terminate();
  }, 60_000);

  it("runs a worker's jobs on the screen's thread when it fails to load, sends it nothing, and says why", async () => {
    const notes: string[] = [];
    const started: Unloadable[] = [];
    const pool = new Pool(
      2,
      () => {
        const w = new Unloadable();
        started.push(w);
        return w;
      },
      { url: "/assets/pool.worker-x.js", onNote: (t) => notes.push(t) }
    );
    expect(await findInPool(pool, looked())).toEqual(alone);
    const out = await traceInPool(pool, frames(), input);
    expect(out.result).toEqual(traced.result);
    expect(started.every((w) => w.sent === 0 && w.terminated)).toBe(true);
    expect(notes).toEqual([0, 1].map((n) => `worker ${n} did not load: no message (file none, line 0, column 0), from /assets/pool.worker-x.js; its jobs ran on the main thread`));
    pool.terminate();
  }, 30_000);

  it("runs a worker's jobs on the screen's thread when it never says it is ready", async () => {
    const notes: string[] = [];
    const pool = new Pool(1, () => new Unloadable(false), { url: "/w.js", readyMs: 20, onNote: (t) => notes.push(t) });
    expect(await findInPool(pool, looked())).toEqual(alone);
    expect(notes).toEqual(["worker 0 never said it was ready in 0.02 s, from /w.js; its jobs ran on the main thread"]);
    pool.terminate();
  });

  it("runs a worker's jobs on the screen's thread when it cannot be started", async () => {
    const notes: string[] = [];
    const pool = new Pool(
      1,
      () => {
        throw new Error("Worker is not defined");
      },
      { onNote: (t) => notes.push(t) }
    );
    expect(await findInPool(pool, looked())).toEqual(alone);
    expect(notes).toEqual(["worker 0 could not be started: Worker is not defined; its jobs ran on the main thread"]);
    pool.terminate();
  });

  it("fails the whole job with a WorkerCrash when a worker fails after it was ready, by an error event or its own message", async () => {
    for (const [how, said] of [
      ["event", "worker 0 threw while working: no message"],
      ["message", "worker 0 threw while working: out of memory; at f@pool.worker.js:1:2"]
    ] as const) {
      const pool = new Pool(1, () => new Crashing(2, how));
      const failed = await findInPool(pool, looked()).catch((e: unknown) => e);
      expect(failed).toBeInstanceOf(WorkerCrash);
      expect((failed as Error).message).toBe(said);
      // Broken for good: later jobs fail at once.
      await expect(pool.run({ kind: "lane", session: "x", job: { kind: "lanes", index: 0 } })).rejects.toBe(failed);
      pool.terminate();
    }
  });

  it("fails one job, not the pool, when the job itself throws", async () => {
    const pool = new Pool(1, () => new InlineWorker());
    const failed = await pool.run({ kind: "trace", job: { kind: "steady", index: 3 }, stream: false }).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(Error);
    expect(failed).not.toBeInstanceOf(WorkerCrash);
    expect(await findInPool(pool, looked())).toEqual(alone);
    pool.terminate();
  });
});
