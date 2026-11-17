import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoarseFrame, ShotFound } from "../lib/shotTrack/shotStart";
import type { WorkerLike } from "./inlineWorker";
import type { SearchMessage, SearchRequest } from "./protocol";
import { SearchClient, type SearchLike } from "./searchClient";

const SHOT: ShotFound = { start: 1, release: 1.5, pinHit: 4, confidence: 0.8, run: [{ t: 1.5, x: 0.5, y: 0.7 }] };

/** A worker the test answers, with what it was sent (the frames' bytes read as they arrived). */
class Fake implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent: SearchRequest[] = [];
  terminated = false;
  postMessage(m: unknown): void {
    this.sent.push(m as SearchRequest);
  }
  terminate(): void {
    this.terminated = true;
  }
  say(m: SearchMessage) {
    this.onmessage?.({ data: m } as MessageEvent);
  }
}

/** A search that records the frames it was given. */
class Recording implements SearchLike {
  static last: Recording | null = null;
  frames: CoarseFrame[] = [];
  constructor(private readonly answer: () => ShotFound | null = () => SHOT) {
    Recording.last = this;
  }
  push(f: CoarseFrame) {
    this.frames.push(f);
  }
  finish() {
    return this.answer();
  }
}

const frame = (t: number): CoarseFrame => ({ width: 2, height: 2, data: new Uint8ClampedArray([t, t, t, t]), t });

function client(worker: Fake | (() => never), answer?: () => ShotFound | null) {
  const notes: string[] = [];
  const c = new SearchClient(typeof worker === "function" ? worker : () => worker, {
    url: "/assets/search.worker-x.js",
    makeSearch: () => new Recording(answer),
    note: (t) => notes.push(t),
    answerMs: 60_000
  });
  return { c, notes };
}

describe("the shot search, in its worker or on the screen's thread", () => {
  afterEach(() => {
    vi.useRealTimers();
    Recording.last = null;
  });

  it("sends the worker copies of the frames and takes its answer", async () => {
    const w = new Fake();
    const { c, notes } = client(w);
    w.say({ kind: "ready" });
    const f = frame(1);
    c.push(f);
    c.push(frame(2));
    expect(w.sent[0]).toMatchObject({ kind: "frame", width: 2, height: 2, t: 1 });
    // A copy went: the frame is still whole here.
    expect(f.data.byteLength).toBe(4);
    expect(new Uint8ClampedArray((w.sent[0] as { data: ArrayBuffer }).data)).toEqual(f.data);
    const done = c.finish();
    expect(w.sent[2]).toEqual({ kind: "done" });
    w.say({ kind: "found", found: SHOT });
    expect(await done).toEqual({ found: SHOT, fallback: null });
    expect(notes).toEqual(["2 frames sent"]);
    expect(Recording.last).toBeNull();
    c.stop();
    expect(w.terminated).toBe(true);
  });

  it("takes an answer that comes before it was asked for", async () => {
    const w = new Fake();
    const { c } = client(w);
    w.say({ kind: "found", found: null });
    expect(await c.finish()).toEqual({ found: null, fallback: null });
  });

  it("searches the same frames here when the worker fails to load, and says why", async () => {
    const w = new Fake();
    const { c, notes } = client(w);
    c.push(frame(1));
    w.onerror?.({ message: "", filename: "", lineno: 0, colno: 0 } as ErrorEvent);
    c.push(frame(2));
    for (let t = 3; t <= 20; t++) c.push(frame(t));
    expect(w.terminated).toBe(true);
    expect(await c.finish()).toEqual({ found: SHOT, fallback: "did not load" });
    expect(Recording.last!.frames.map((f) => f.t)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // Only the one frame before it failed went to the worker; no `done`.
    expect(w.sent).toHaveLength(1);
    expect(notes).toEqual([
      "did not load: no message (file none, line 0, column 0), from /assets/search.worker-x.js",
      "1 frames sent",
      "the search ran on the main thread because the worker did not load"
    ]);
  });

  it("searches here when the worker throws while working, by an error event or its own message", async () => {
    for (const how of ["event", "message"] as const) {
      const w = new Fake();
      const { c, notes } = client(w);
      w.say({ kind: "ready" });
      c.push(frame(1));
      const done = c.finish();
      if (how === "event") w.onerror?.({ message: "" } as ErrorEvent);
      else w.say({ kind: "error", message: "boom", at: "push@w.js:1:2" });
      expect(await done).toEqual({ found: SHOT, fallback: "threw" });
      expect(notes[1]).toBe(how === "event" ? "threw while working: no message" : "threw while working: boom; at push@w.js:1:2");
      expect(Recording.last!.frames.map((f) => f.t)).toEqual([1]);
    }
  });

  it("searches here when the worker never says it is ready", async () => {
    vi.useFakeTimers();
    const w = new Fake();
    const { c, notes } = client(w);
    c.push(frame(1));
    const done = c.finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await done).toEqual({ found: SHOT, fallback: "never got ready" });
    expect(notes).toEqual(["1 frames sent", "never said it was ready in 5 s, from /assets/search.worker-x.js", "the search ran on the main thread because the worker never got ready"]);
    // A late answer from it changes nothing.
    w.say({ kind: "found", found: null });
  });

  it("waits for a worker that is ready late, and gives a working one that never answers up as a video that couldn't be read", async () => {
    vi.useFakeTimers();
    const w = new Fake();
    const { c } = client(w);
    const done = c.finish().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(4000);
    w.say({ kind: "ready" });
    await vi.advanceTimersByTimeAsync(59_000);
    w.say({ kind: "ready" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(((await done) as Error).message).toBe("the search did not answer in 60 s");
    expect(Recording.last).toBeNull();
  });

  it("searches here when no worker can be started", async () => {
    const { c, notes } = client(() => {
      throw new Error("Worker is not defined");
    });
    c.push(frame(1));
    expect(await c.finish()).toEqual({ found: SHOT, fallback: "could not be started" });
    expect(notes[0]).toMatch(/^could not be started: Worker is not defined(; at .+)?$/);
    c.stop();
  });

  it("finds no shot, and says so, when the search fails here too", async () => {
    const w = new Fake();
    const { c, notes } = client(w, () => {
      throw new Error("too few frames");
    });
    w.onerror?.({ message: "" } as ErrorEvent);
    expect(await c.finish()).toEqual({ found: null, fallback: "did not load" });
    expect(notes[notes.length - 1]).toMatch(/^the search failed on the main thread too: too few frames(; at .+)?$/);
  });
});
