import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShotFound } from "../lib/shotTrack/shotStart";
import type { LanesFound } from "../lib/shotTrack/laneFind";
import type { TraceInput, TraceOutput } from "../lib/shotTrack/pipeline";
import type { Notes } from "../lib/shotTrack/notes";
import type { GrayFrame, Mat3, TrackError, TrackResult } from "../lib/shotTrack/types";
import type { FindMessage, SearchRequest } from "../shotTracer/protocol";
import { WorkerCrash } from "../shotTracer/pool";
import { SEEK_PARTS } from "../shotTracer/readShot";
import { ShotTracerView } from "./ShotTracerView";

const readVideoFrames = vi.hoisted(() => vi.fn());
const scanVideo = vi.hoisted(() => vi.fn());
vi.mock("../shotTracer/videoFrames", () => ({ readVideoFrames, scanVideo }));
/** The search for the ball in a part's frames (`findBall`): not seen unless a test says. */
const NOT_SEEN = { seen: null, earlier: null, candidates: 0, why: "no candidates" };
const ballSearch = vi.hoisted(() => vi.fn());
vi.mock("../lib/shotTrack/ballFind", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/shotTrack/ballFind")>()),
  findBall: ballSearch
}));

/** The pool's lane searches and traces, each answered by the test, and the pools made. */
const pooled = vi.hoisted(() => ({
  pools: [] as { size: number; terminated: boolean }[],
  finds: [] as { frames: GrayFrame[]; resolve: (v: unknown) => void; reject: (e: Error) => void }[],
  traces: [] as { frames: GrayFrame[]; input: Omit<TraceInput, "source">; resolve: (v: unknown) => void; reject: (e: Error) => void }[]
}));
/** The search on the screen's own thread (`ShotSearch`), when its worker fails: the frames it was given, and its answer. */
const mainSearch = vi.hoisted(() => ({ pushed: [] as { t: number; data: Uint8ClampedArray }[], answer: null as unknown }));
vi.mock("../lib/shotTrack/shotStart", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/shotTrack/shotStart")>()),
  ShotSearch: class {
    push(f: { t: number; data: Uint8ClampedArray }) {
      mainSearch.pushed.push(f);
    }
    finish() {
      return mainSearch.answer;
    }
  }
}));
vi.mock("../shotTracer/pool", () => ({
  WorkerCrash: class extends Error {},
  Pool: class {
    terminated = false;
    constructor(readonly size: number) {
      pooled.pools.push(this);
    }
    terminate() {
      this.terminated = true;
    }
  },
  findInPool: (_pool: unknown, frames: GrayFrame[]) => new Promise((resolve, reject) => pooled.finds.push({ frames, resolve, reject })),
  traceInPool: (_pool: unknown, frames: GrayFrame[], input: Omit<TraceInput, "source">) =>
    new Promise((resolve, reject) => pooled.traces.push({ frames, input, resolve, reject }))
}));

/**
 * A stand-in for the search worker: it records what it was sent and is
 * answered by the test. `mode`: says it is ready once started (as the real
 * one does), fails to load (an error event Safari leaves empty), never says
 * anything, or throws on its first frame.
 */
class FakeWorker {
  static all: FakeWorker[] = [];
  static mode: "ready" | "load" | "silent" | "throw" = "ready";
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
    const mode = FakeWorker.mode;
    setTimeout(() => {
      if (mode === "ready" || mode === "throw") this.onmessage?.({ data: { kind: "ready" } } as MessageEvent);
      if (mode === "load") this.onerror?.({ message: "", filename: "", lineno: 0, colno: 0 });
    }, 0);
  }
  postMessage(m: unknown) {
    this.posted.push(m);
    if (FakeWorker.mode === "throw" && (m as SearchRequest).kind === "frame" && this.posted.length === 1) {
      setTimeout(() => this.onmessage?.({ data: { kind: "error", message: "boom", at: "push@search.worker.js:1:2" } } as MessageEvent), 0);
    }
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    act(() => this.onmessage?.({ data } as MessageEvent));
  }
}

const searcher = (): FakeWorker | undefined => FakeWorker.all[FakeWorker.all.length - 1];
/** The latest lane search, answered as the finder would (`LanesFound`), or failed. */
const find = () => {
  const f = pooled.finds[pooled.finds.length - 1];
  return f && { ...f, reply: (answer: LanesFound) => act(() => f.resolve(answer)), fail: () => act(() => f.reject(new Error("worker 0: failed"))) };
};
/** The latest trace, answered with its output, or failed. */
const trace = () => {
  const t = pooled.traces[pooled.traces.length - 1];
  return t && { ...t, reply: (out: TraceOutput) => act(() => t.resolve(out)), fail: () => act(() => t.reject(new Error("worker 1: failed"))) };
};
const pools = () => pooled.pools;

const W = 8;
const H = 6;
/** What the reader gives for a plan: a frame every `1 / fps` seconds of the stretch, with their own times. */
const fakeVideo = (plan: { from: number; to: number; fps: number }) => {
  const count = Math.max(0, Math.ceil((plan.to - plan.from) * plan.fps - 1e-9));
  return {
    width: W,
    height: H,
    gray: Array.from({ length: count }, () => new Uint8ClampedArray(W * H).fill(100)),
    times: Array.from({ length: count }, (_, i) => plan.from + i / plan.fps),
    src: 1 / plan.fps,
    step: 1 / plan.fps,
    missing: 0
  };
};
/** The plan of the `n`th read. */
const plan = (n: number) => readVideoFrames.mock.calls[n][2] as { from: number; to: number; fps: number; band: unknown; after?: { t: number; src: number } };

/** The first look: two small frames, then the video's size and length. */
function scanning(video: { width: number; height: number; duration: number }) {
  scanVideo.mockImplementation(async (_f: Blob, onFrame: (f: unknown) => void, onProgress: (x: number) => void) => {
    onFrame({ width: 4, height: 2, data: new Uint8ClampedArray(8), t: 0 });
    onProgress(0.5);
    onFrame({ width: 4, height: 2, data: new Uint8ClampedArray(8), t: 0.1 });
    return video;
  });
}

const SHOT: ShotFound = { start: 11.4, release: 12, pinHit: 14.6, confidence: 0.9, run: [{ t: 12, x: 0.5, y: 0.6 }] };

const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** The frames on a 0.15 s grid are searched (from 11.7 s, every 9th of 204): the search's frames 0 and 2 are the read's 6 and 24. */
const LANES = [
  { frame: 6, H: I, weight: 1, guess: false },
  { frame: 24, H: I, weight: 2, guess: false }
] satisfies (FindMessage & { frame: number })["lanes"];

/** The finder's answer: the lane found best on the search's third frame, on two frames in all. */
const found = (evidence: Partial<(FindMessage & { frame: number })["evidence"]> = {}): LanesFound => {
  const e = { guess: null, support: { left: 0.6, right: 0.6 }, pinsUsed: 3, camera: 22, ...evidence };
  const lane = (index: number) => ({ index, H: I, ...e });
  return {
    lanes: [{ found: lane(0), quality: 1 }, { found: lane(2), quality: 2 }],
    best: lane(2),
    camera: 22
  } as unknown as LanesFound;
};
/** The finder found no lane. */
const NONE: LanesFound = { lanes: [], best: null, camera: NaN };

const metric = (value: number | null) => ({ value, state: value === null ? ("not-seen" as const) : ("measured" as const) });
/** A traced shot, its lane mapping the picture's pixels as boards and feet. */
const TRACED: TrackResult = {
  ok: true,
  hand: "right",
  sightings: [],
  path: { kind: "hook", u0: 20, a: 0, s: 30, L: 20, k: 0 },
  from: 0,
  to: 60,
  rms: 0.2,
  metrics: {
    laydown: metric(23.8),
    touchdown: metric(23),
    touchdownFeet: metric(2),
    arrows: metric(16.9),
    breakpoint: metric(7.7),
    breakpointFeet: metric(43),
    pins: metric(16.7),
    speed: metric(15.3),
    launchSpeed: metric(17.4),
    entrySpeed: metric(14.6)
  } as TrackResult["metrics"],
  motion: { v0: 0, w: 20, d: 0 },
  touchdownFrame: null,
  pinFrame: null
};
/** The tracer's output: `result`, the calibration frame's mapping, and what it learned of the lane. */
const out = (result: TrackResult | TrackError, evidence?: { kept: number; dropped: number; pinCheck: number | null }, H0: Mat3 | null = [0.2, 0, 0, 0, -0.08, 5.5, 0, 0, 1]) =>
  ({
    result,
    debug: {
      H0,
      lanes: evidence && { kept: Array(evidence.kept).fill({}), dropped: Array(evidence.dropped).fill({}), checks: [] },
      calibration: evidence && { pinError: evidence.pinCheck }
    }
  }) as unknown as TraceOutput;
const done = (evidence?: { kept: number; dropped: number; pinCheck: number | null }) => out(TRACED, evidence);

function pickFile() {
  const view = render(<ShotTracerView handedness="right" onBack={vi.fn()} />);
  const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  fireEvent.change(input, { target: { files: [new File(["x"], "shot.mp4", { type: "video/mp4" })] } });
  return view;
}

/** Picks a video and answers the search with `shot`. */
async function searchFinds(shot: ShotFound | null) {
  pickFile();
  await waitFor(() => expect(searcher()?.posted.some((m) => (m as SearchRequest).kind === "done")).toBe(true));
  searcher()!.reply({ kind: "found", found: shot });
}

/** The lane looked for on the read's first part, to say where the shot ends: answered, and the rest read. */
async function firstFind(answer: LanesFound = NONE) {
  await waitFor(() => expect(find()).toBeTruthy());
  find()!.reply(answer);
  await waitFor(() => expect(pooled.finds).toHaveLength(2));
}

/**
 * Answers the lane search on each part the ball is then looked for in with
 * `answer`, until the screen says how it ended; how many parts were read.
 */
async function answerParts(answer: LanesFound): Promise<number> {
  let answered = 1;
  for (;;) {
    await waitFor(() => expect(pooled.finds.length > answered || !!screen.queryByRole("alert")).toBe(true));
    if (screen.queryByRole("alert")) return answered;
    find()!.reply(answer);
    answered++;
  }
}

/** Picks a video, the shot is found, the video read and the lane search started. */
async function chooseVideo() {
  await searchFinds(SHOT);
  await firstFind();
}

describe("ShotTracerView", () => {
  beforeEach(() => {
    FakeWorker.all = [];
    FakeWorker.mode = "ready";
    mainSearch.pushed.length = 0;
    mainSearch.answer = SHOT;
    pooled.pools.length = 0;
    pooled.finds.length = 0;
    pooled.traces.length = 0;
    vi.stubGlobal("Worker", FakeWorker);
    // jsdom draws nothing; the picture's effect only needs a null context.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(console, "info").mockImplementation(() => {});
    readVideoFrames.mockReset();
    readVideoFrames.mockImplementation(async (_f: Blob, _p: unknown, p: { from: number; to: number; fps: number }) => fakeVideo(p));
    scanVideo.mockReset();
    scanning({ width: 1920, height: 1080, duration: 30 });
    ballSearch.mockReset();
    ballSearch.mockReturnValue(NOT_SEEN);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens on recording or choosing a video, and says nothing of lines to drag", () => {
    render(<ShotTracerView handedness="right" onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Record a shot/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
    expect(screen.getByText(/the shot is found in it/)).toBeTruthy();
    expect(screen.queryByText(/lines|drag|slide|move/i)).toBeNull();
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].getAttribute("capture")).toBe("environment");
    expect(inputs[1].accept).toBe("video/*");
  });

  it("looks for the shot first, the small frames going to the search as they come", async () => {
    let finish!: (v: unknown) => void;
    scanVideo.mockImplementation(async (_f: Blob, onFrame: (f: unknown) => void, onProgress: (x: number) => void) => {
      onFrame({ width: 4, height: 2, data: new Uint8ClampedArray(8), t: 0.25 });
      onProgress(0.4);
      return new Promise((r) => (finish = r));
    });
    pickFile();
    expect(await screen.findByText("Looking for the shot…")).toBeTruthy();
    await waitFor(() => expect(searcher()?.posted).toHaveLength(1));
    expect(searcher()!.posted[0]).toMatchObject({ kind: "frame", width: 4, height: 2, t: 0.25 });
    expect(readVideoFrames).not.toHaveBeenCalled();
    await act(async () => finish({ width: 1920, height: 1080, duration: 30 }));
    await waitFor(() => expect(searcher()!.posted[searcher()!.posted.length - 1]).toEqual({ kind: "done" }));
  });

  it("reads from just before the shot it found to when the ball has left the deck, with no trim step", async () => {
    await searchFinds(SHOT);
    await waitFor(() => expect(find()).toBeTruthy());
    expect(readVideoFrames).toHaveBeenCalledTimes(1);
    // The first part, at 60 a second; a landscape video is read whole.
    expect(plan(0)).toMatchObject({ from: 11.6, fps: 60, band: null });
    expect(plan(0).to).toBeCloseTo(13.2, 9);
    expect(searcher()!.terminated).toBe(true);
    // The lane looked for on a few of its frames.
    expect(find()!.frames.length).toBeLessThanOrEqual(10);
    find()!.reply(NONE);
    // No lane there: the window ends where the pins were seen hit, and the rest is read to it.
    await waitFor(() => expect(readVideoFrames).toHaveBeenCalledTimes(2));
    expect(plan(1).from).toBeCloseTo(13.2, 9);
    expect(plan(1).to).toBeCloseTo(14.6 + 0.4, 9);
    expect(plan(1).fps).toBe(60);
    expect(plan(1).after?.t).toBeCloseTo(11.6 + 95 / 60, 9);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("traces the frames from the first part's start to the end, each with its own time", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    const t = trace()!.frames.map((f) => f.t);
    expect(t[0]).toBeCloseTo(11.6, 9);
    expect(t[t.length - 1]).toBeLessThan(15);
    expect(t.slice(1).every((x, i) => x > t[i])).toBe(true);
  });

  it("reads only the lane's band of a portrait video: the clips' own, then round where the run starts", async () => {
    scanning({ width: 1080, height: 1920, duration: 30 });
    await searchFinds({ ...SHOT, run: [{ t: 12, x: 0.5, y: 0.45 }] });
    await waitFor(() => expect(find()).toBeTruthy());
    expect(plan(0).band).toEqual({ top: 0.3, bottom: 0.72 });
    find()!.reply(NONE);
    await waitFor(() => expect(readVideoFrames).toHaveBeenCalledTimes(2));
    const band = plan(1).band as { top: number; bottom: number };
    expect(band.top).toBeCloseTo(0.15, 9);
    expect(band.bottom).toBeCloseTo(0.59, 9);
  });

  it("reads the sample clips' band when the run's is much the same", async () => {
    scanning({ width: 1080, height: 1920, duration: 30 });
    await chooseVideo();
    expect(plan(0).band).toEqual({ top: 0.3, bottom: 0.72 });
  });

  it("reads a short video whole when no shot is found in it", async () => {
    scanning({ width: 1920, height: 1080, duration: 4.65 });
    await searchFinds(null);
    await waitFor(() => expect(find()).toBeTruthy());
    expect(readVideoFrames).toHaveBeenCalledTimes(1);
    expect(plan(0)).toMatchObject({ from: 0, to: 4.65 });
    // 4.65 s does not fit at 60: read at 30.
    expect(plan(0).fps).toBe(30);
  });

  it("says the shot couldn't be found when the first look only guessed and the lane shows no ball on it", async () => {
    await searchFinds({ ...SHOT, guessed: true });
    await waitFor(() => expect(find()).toBeTruthy());
    // The lane is found, but the run (one point) goes nowhere up it, and no ball is seen in the part.
    find()!.reply(found());
    // The video is then looked through a part at a time, the lane found on each and no ball seen.
    const parts = await answerParts(found());
    expect((await screen.findByRole("alert")).textContent).toBe("The shot couldn't be found in this video.");
    expect(parts).toBeGreaterThan(1);
    expect(readVideoFrames).toHaveBeenCalledTimes(parts);
    expect(readVideoFrames.mock.calls.length).toBeLessThanOrEqual(1 + SEEK_PARTS);
    expect(ballSearch).toHaveBeenCalledTimes(parts);
    expect(screen.getByTestId("tracer-details").textContent).toContain("looked again");
    expect(trace()).toBeUndefined();
  });

  it("shows under the details the first part's frame the lane was found on, with the lane drawn", async () => {
    await searchFinds({ ...SHOT, guessed: true });
    await waitFor(() => expect(find()).toBeTruthy());
    find()!.reply(found());
    await answerParts(found());
    await screen.findByRole("alert");
    const seen = screen.getByTestId("tracer-seen");
    // The look's frame, then the first part's best frame (the search's third, the read's 24th: 11.6 s + 24 / 60).
    expect(seen.querySelectorAll("canvas")).toHaveLength(2);
    expect(within(seen).getByText("0.1 s")).toBeTruthy();
    expect(within(seen).getByText("12 s")).toBeTruthy();
    expect(within(seen).getAllByTestId("lane-lines")).toHaveLength(1);
  });

  it("puts in the details what the first look wrote of the frames it was given", async () => {
    scanVideo.mockImplementation(async (_f: Blob, onFrame: (f: unknown) => void, _p: unknown, notes: Notes) => {
      notes.set("frame", "coded 1920x1088, display 1920x1080, visible 0,0 1920x1080, NV12, color bt709/bt709/bt709 full");
      notes.set("look", "2 of 2 grid frames, planes NV12 full 2");
      notes.set("look check", "#0 canvas diff 1.9, upside down 80.2 (turned 90 as the track says)");
      onFrame({ width: 4, height: 2, data: new Uint8ClampedArray(8), t: 0 });
      return { width: 1080, height: 1920, duration: 30 };
    });
    await searchFinds(null);
    const details = (await screen.findByTestId("tracer-details")).textContent!;
    expect(details).toContain("frame: coded 1920x1088, display 1920x1080, visible 0,0 1920x1080, NV12, color bt709/bt709/bt709 full");
    expect(details).toContain("look: 2 of 2 grid frames, planes NV12 full 2");
    expect(details).toContain("look check: #0 canvas diff 1.9, upside down 80.2 (turned 90 as the track says)");
  });

  it("says the shot couldn't be found in a long video, what to try, and offers another", async () => {
    await searchFinds(null);
    expect((await screen.findByRole("alert")).textContent).toBe("The shot couldn't be found in this video.");
    expect(screen.getByText(/Film from behind the bowler, with the whole lane in view from the foul line to the pins/)).toBeTruthy();
    expect(readVideoFrames).not.toHaveBeenCalled();
    // What the tracer did, for a screenshot from the phone.
    const details = screen.getByTestId("tracer-details").textContent!;
    expect(details).toMatch(/^Details: app: Headpin /);
    expect(details).toContain("search: no run found; read from nowhere s");
    expect(details).toMatch(/times: look [\d.]+, read 0\.0, lane 0\.0, trace 0\.0 s/);
    // And what it saw: the look's frame nearest a quarter, a half and three quarters (here the last of two), with no lane.
    const seen = screen.getByTestId("tracer-seen");
    expect(within(seen).getByText(/^What the tracer saw: the first look/)).toBeTruthy();
    expect(within(seen).getAllByText("0.1 s")).toHaveLength(1);
    expect(seen.querySelectorAll("canvas")).toHaveLength(1);
    expect(within(seen).queryByTestId("lane-lines")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Another video" }));
    expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
  });

  it("says a video is unreadable when the first look cannot read it, and what the reader said", async () => {
    scanVideo.mockRejectedValue(new Error("playback: no data after 10 s (WebCodecs codec hvc1.2.4.L150.B0 not supported)"));
    pickFile();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be read/);
    // The reason under the sentence, not in it.
    expect(screen.getByText("Details: playback: no data after 10 s (WebCodecs codec hvc1.2.4.L150.B0 not supported)")).toBeTruthy();
    expect(readVideoFrames).not.toHaveBeenCalled();
  });

  it("says a video is unreadable when too little of it could be read, and how it was read", async () => {
    readVideoFrames.mockImplementation(async (_f: Blob, _p: unknown, p: { from: number; to: number; fps: number }) => ({ ...fakeVideo(p), gray: [], times: [], via: "WebCodecs vp09" }));
    await searchFinds(SHOT);
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be read/);
    expect(screen.getByText("Details: only 0 frames read (WebCodecs vp09)")).toBeTruthy();
    expect(screen.getByTestId("tracer-details").textContent).toContain("search: release 12.00 s, pins 14.60 s, confidence 0.90, 1 run");
  });

  it("looks for the lane every 0.15 s of the video, in a pool of workers", async () => {
    await chooseVideo();
    expect(screen.getByText("Finding the lane…")).toBeTruthy();
    const { frames } = find()!;
    // 11.6 to 15.0 s at 60: 204 frames, of which those on a grid of 0.15 s from
    // the video's start (11.7 s on), every 9th, each with its own time.
    expect(frames.map((f) => Math.round((f.t - 11.6) * 60))).toEqual(Array.from({ length: 22 }, (_, i) => 6 + i * 9));
    expect(frames[0].data.byteLength).toBe(W * H);
    // In a pool of workers, one fewer than the cores reported, at most four.
    expect(pools()).toHaveLength(1);
    expect(pools()[0].size).toBe(Math.min(4, Math.max(1, navigator.hardwareConcurrency - 1)));
  });

  it("traces straight away with the found lanes", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(screen.getByText("Tracing the shot…")).toBeTruthy());
    const { input } = trace()!;
    expect(input.calibFrame).toBe(24);
    expect(input.lanes).toEqual(LANES);
    expect(input.hand).toBe("right");
    // The setting stands only where the video cannot tell whose hand it was.
    expect(input.handFromVideo).toBe(true);
  });

  it("shows the readings with the lane drawn on the picture, and no doubt when the lane is sure", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    act(() => trace()!.input.onProgress?.("ball", 0.5));
    trace()!.reply(done({ kept: 3, dropped: 1, pinCheck: 0.2 }));
    expect(await screen.findByText("Board 23.8")).toBeTruthy();
    expect(screen.getByText("Board 7.7 at 43 ft")).toBeTruthy();
    // The touchdown beside the laydown: where the ball first touches the lane.
    expect(screen.getByText("Touchdown")).toBeTruthy();
    expect(screen.getByText("Board 23 at 2 ft")).toBeTruthy();
    // Two speeds, at the foul line and at the pins, in place of one.
    expect(screen.getByText("Launch speed")).toBeTruthy();
    expect(screen.getByText("17.4 mph")).toBeTruthy();
    expect(screen.getByText("Entry speed")).toBeTruthy();
    expect(screen.getByText("14.6 mph")).toBeTruthy();
    expect(screen.queryByText("15.3 mph")).toBeNull();
    // Both edges, the foul line and the pin row, under the path.
    const lane = screen.getByTestId("lane-lines");
    expect(lane.querySelectorAll("line")).toHaveLength(4);
    // Then the ring on the foul line that marks the laydown, and the path from it.
    expect(lane.nextElementSibling?.tagName).toBe("circle");
    expect(lane.parentElement?.querySelector("polyline")).toBeTruthy();
    expect(screen.queryByText(/The lane may be off/)).toBeNull();
    expect(screen.getByRole("button", { name: "Another video" })).toBeTruthy();
    // How it was read and how long each stage took, for runs on a phone.
    expect(screen.getByText(/^Read by \?\. Looking [\d.]+ s, reading [\d.]+ s, lane [\d.]+ s, tracing [\d.]+ s\.$/)).toBeTruthy();
    expect(screen.getByTestId("tracer-details").textContent).toMatch(/lane: found on 2 of 22, best frame 24[\s\S]*trace: 0 sightings, 0\.0 to 60\.0 ft/);
  });

  it("says which hand the boards are counted from, from the video, with no switch", async () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ v: 1 + i, u: 24 + 0.2 * (1 + i), w: 1, t: 0.5 + i * 0.05 }));
    const readOff = {
      path: { kind: "hook" as const, u0: 24, a: 0.2, s: 50, L: 5, k: 0 }, seen: pts.map((p) => p.v), points: pts, touchdown: 1,
      motion: { v0: -10, w: 20, d: 0 }, tFirst: 0.5, tLast: 1.05, speedMeasured: false
    };
    const handFound = { hand: "left" as const, by: "video" as const, confidence: 1, cues: [{ name: "release" as const, vote: -1, boards: -12.3 }] };
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(out({ ...TRACED, hand: "left", readOff, handFound }));
    const hand = await screen.findByTestId("tracer-hand");
    expect(hand.textContent).toBe("Left-handed (from the video)");
    // The bowler is never asked: no switch on the result.
    expect(screen.queryByRole("button", { name: "Left-handed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Right-handed" })).toBeNull();
    expect(screen.getByText("Board 23.8")).toBeTruthy();
    // The cues stay in the details.
    expect(screen.getByTestId("tracer-details").textContent).toMatch(/hand: left from the video, confidence 1\.00; release -12\.3 boards \(-1\.00\)/);
  });

  it("says in one line when the video showed no cue and the setting was used", async () => {
    const handFound = { hand: "right" as const, by: "setting" as const, confidence: 0, cues: [] };
    const readOff = { path: TRACED.path, seen: [1, 30], touchdown: 1, motion: TRACED.motion, tFirst: 0, tLast: 2, speedMeasured: false };
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(out({ ...TRACED, readOff, handFound }));
    expect((await screen.findByTestId("tracer-hand")).textContent).toBe("Hand not clear in the video: counted as right-handed, the app's setting");
    expect(screen.queryByRole("button", { name: "Left-handed" })).toBeNull();
  });

  it("says a left-handed setting the same way", async () => {
    const handFound = { hand: "left" as const, by: "setting" as const, confidence: 0, cues: [] };
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(out({ ...TRACED, hand: "left", handFound }));
    expect((await screen.findByTestId("tracer-hand")).textContent).toBe("Hand not clear in the video: counted as left-handed, the app's setting");
  });

  it("shows no hand line for a trace that did not read the hand", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(done());
    expect(await screen.findByText("Board 23.8")).toBeTruthy();
    expect(screen.queryByTestId("tracer-hand")).toBeNull();
  });

  it("says the lane may be off when the found lanes disagree, with nothing to move", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(done({ kept: 1, dropped: 19, pinCheck: null }));
    expect(await screen.findByText("The lane may be off. Check its lines on the picture.")).toBeTruthy();
    // The readings are still shown, not blocked.
    expect(screen.getByText("Board 23.8")).toBeTruthy();
    expect(screen.queryByText(/move/i)).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).not.toContain("Move the lines and trace again");
  });

  it("says the entry speed was not seen when the ball was not followed to the pins", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    const metrics = { ...TRACED.metrics, entrySpeed: { value: null, state: "missing" as const } };
    trace()!.reply(out({ ...TRACED, metrics }));
    const row = (await screen.findByText("Entry speed")).closest("div")!;
    expect(row.textContent).toContain("Not seen");
    expect(row.textContent).not.toContain("mph");
    expect(screen.getByText("17.4 mph")).toBeTruthy();
  });

  it("says the lane may be off when the finder guessed the foul line", async () => {
    await chooseVideo();
    find()!.reply(found({ guess: { foul: "typical-camera" } }));
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(done());
    expect(await screen.findByText(/The lane may be off/)).toBeTruthy();
  });

  it("says when the ball couldn't be followed, and what to try", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(out({ ok: false, failure: "ball-not-found", detail: "" }, undefined, null));
    expect((await screen.findByRole("alert")).textContent).toBe("The ball couldn't be followed down the lane.");
    expect(screen.getByText(/hold the phone still/)).toBeTruthy();
  });

  it("says when the camera moves too much, or the tracer could not work the lane out", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(out({ ok: false, failure: "too-shaky", detail: "" }, undefined, null));
    expect((await screen.findByRole("alert")).textContent).toBe("The camera moves too much to follow the lane.");
  });

  it("says the video couldn't be read when the tracer itself fails", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.fail();
    expect((await screen.findByRole("alert")).textContent).toBe("This video couldn't be read.");
  });

  it("says the lane couldn't be found, with no lines to drag, when the finder misses it", async () => {
    await chooseVideo();
    find()!.reply(NONE);
    expect((await screen.findByRole("alert")).textContent).toBe("The lane couldn't be found in this video.");
    expect(trace()).toBeUndefined();
    expect(screen.queryByRole("button", { name: /Trace the shot/ })).toBeNull();
    expect(screen.getByTestId("tracer-details").textContent).toContain("lane: not found on 204 frames");
  });

  it("goes straight to the run's band when the first part of the clips' band holds no lane", async () => {
    scanning({ width: 1080, height: 1920, duration: 30 });
    await searchFinds({ ...SHOT, run: [{ t: 12, x: 0.5, y: 0.95 }] });
    await waitFor(() => expect(find()).toBeTruthy());
    find()!.reply(NONE);
    // Nothing more of the first band is read: the second band's first part next.
    expect(plan(0).band).toEqual({ top: 0.3, bottom: 0.72 });
    await waitFor(() => expect(readVideoFrames).toHaveBeenCalledTimes(2));
    expect((plan(1).band as { bottom: number }).bottom).toBe(1);
    expect(plan(1).fps).toBe(60);
    expect(plan(1).from).toBeCloseTo(11.6, 9);
    // The last band: on to the end however its first part went, then the lane on the whole.
    await waitFor(() => expect(pooled.finds).toHaveLength(2));
    find()!.reply(NONE);
    await waitFor(() => expect(pooled.finds).toHaveLength(3));
    expect(readVideoFrames).toHaveBeenCalledTimes(3);
    find()!.reply(NONE);
    expect((await screen.findByRole("alert")).textContent).toBe("The lane couldn't be found in this video.");
  });

  it("reads on from the ball seen in the first part, with no other part read", async () => {
    // Seen crossing the foul line at 12.4 s at 24 ft/s.
    ballSearch.mockReturnValue({ seen: { foul: 12.4, speed: 24, sightings: [] }, earlier: null, candidates: 30, why: "30 sightings" });
    await searchFinds(SHOT);
    await waitFor(() => expect(find()).toBeTruthy());
    find()!.reply(found());
    await waitFor(() => expect(readVideoFrames).toHaveBeenCalledTimes(2));
    // The rest from the first part's end to the deck end at that speed.
    expect(plan(1).from).toBeCloseTo(13.2, 9);
    expect(plan(1).to).toBeGreaterThan(12.4 + 62 / 24);
    expect(ballSearch).toHaveBeenCalledTimes(1);
  });

  it("tries the next band when the lane is found on the first part but not on the whole read", async () => {
    ballSearch.mockReturnValue({ seen: { foul: 12.4, speed: 24, sightings: [] }, earlier: null, candidates: 30, why: "30 sightings" });
    scanning({ width: 1080, height: 1920, duration: 30 });
    await searchFinds({ ...SHOT, run: [{ t: 12, x: 0.5, y: 0.95 }] });
    await waitFor(() => expect(find()).toBeTruthy());
    find()!.reply(found());
    await waitFor(() => expect(pooled.finds).toHaveLength(2));
    find()!.fail();
    await waitFor(() => expect(readVideoFrames).toHaveBeenCalledTimes(3));
    expect(plan(0).band).toEqual({ top: 0.3, bottom: 0.72 });
    expect((plan(2).band as { bottom: number }).bottom).toBe(1);
  });

  it("says the video couldn't be read when the shot search never answers, rather than waiting for ever", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      pickFile();
      await waitFor(() => expect(searcher()?.posted.some((m) => (m as SearchRequest).kind === "done")).toBe(true));
      expect(screen.getByText("Looking for the shot…")).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be read/);
      expect(searcher()!.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes a lane search that never answers for a lane not found", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await searchFinds(SHOT);
      await waitFor(() => expect(find()).toBeTruthy());
      find()!.reply(NONE);
      await waitFor(() => expect(pooled.finds).toHaveLength(2));
      const stuck = pools()[pools().length - 1];
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      expect((await screen.findByRole("alert")).textContent).toBe("The lane couldn't be found in this video.");
      expect(stuck.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the lane search when the screen closes", async () => {
    const view = pickFile();
    await waitFor(() => expect(searcher()?.posted.some((m) => (m as SearchRequest).kind === "done")).toBe(true));
    searcher()!.reply({ kind: "found", found: SHOT });
    await waitFor(() => expect(find()).toBeTruthy());
    view.unmount();
    expect(pools()[0].terminated).toBe(true);
  });

  it("drops a search's late answer once another video is chosen", async () => {
    await searchFinds(null);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Another video" }));
    const first = searcher()!;
    expect(first.terminated).toBe(true);
    first.reply({ kind: "found", found: SHOT });
    expect(readVideoFrames).not.toHaveBeenCalled();
  });
  /** The lane found, the shot traced: the details block of the result screen. */
  async function traceToEnd(): Promise<string> {
    await firstFind();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(done());
    expect(await screen.findByText("Board 23.8")).toBeTruthy();
    return screen.getByTestId("tracer-details").textContent!;
  }

  it("searches on the screen's own thread with the same frames when the search worker never loads, and says why", async () => {
    FakeWorker.mode = "load";
    pickFile();
    const details = await traceToEnd();
    // The frames the worker was sent, kept and searched here, in order.
    expect(mainSearch.pushed.map((f) => f.t)).toEqual([0, 0.1]);
    expect(mainSearch.pushed.every((f) => f.data.byteLength === 8)).toBe(true);
    expect(details).toMatch(
      /search worker: 2 frames sent; did not load: no message \(file none, line 0, column 0\), from \S*search\.worker\S*; the search ran on the main thread because the worker did not load/
    );
    expect(details).toContain("search: release 12.00 s, pins 14.60 s, confidence 0.90");
    expect(searcher()!.terminated).toBe(true);
  });

  it("searches on the screen's own thread when the search worker throws while working, and says what it threw", async () => {
    FakeWorker.mode = "throw";
    pickFile();
    const details = await traceToEnd();
    expect(mainSearch.pushed.map((f) => f.t)).toEqual([0, 0.1]);
    expect(details).toContain(
      "search worker: 2 frames sent; threw while working: boom; at push@search.worker.js:1:2; the search ran on the main thread because the worker threw"
    );
    expect(details).toContain("search: release 12.00 s");
  });

  it("searches on the screen's own thread when the search worker never says it is ready", async () => {
    FakeWorker.mode = "silent";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      pickFile();
      await waitFor(() => expect(searcher()?.posted).toHaveLength(2));
      expect(find()).toBeUndefined();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_100);
      });
      const details = await traceToEnd();
      expect(mainSearch.pushed.map((f) => f.t)).toEqual([0, 0.1]);
      expect(details).toMatch(/search worker: 2 frames sent; never said it was ready in 5 s, from \S*search\.worker\S*; the search ran on the main thread because the worker never got ready/);
      expect(details).toContain("search: release 12.00 s");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not search on the screen's own thread when the worker answers", async () => {
    await searchFinds(SHOT);
    await waitFor(() => expect(find()).toBeTruthy());
    expect(mainSearch.pushed).toHaveLength(0);
  });

  it("runs the lane search again on the screen's own thread when a pool worker fails while working", async () => {
    await searchFinds(SHOT);
    await waitFor(() => expect(find()).toBeTruthy());
    const first = pooled.finds[0];
    act(() => first.reject(new WorkerCrash("worker 0 threw while working: no message")));
    await waitFor(() => expect(pooled.finds).toHaveLength(2));
    // The same frames, in a pool of one on this thread; the broken pool stopped.
    expect(pooled.finds[1].frames.map((f) => f.t)).toEqual(first.frames.map((f) => f.t));
    expect(pools()).toHaveLength(2);
    expect(pools()[0].terminated).toBe(true);
    expect(pools()[1].size).toBe(1);
    find()!.reply(NONE);
    await waitFor(() => expect(pooled.finds).toHaveLength(3));
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply(done());
    expect(await screen.findByText("Board 23.8")).toBeTruthy();
    expect(screen.getByTestId("tracer-details").textContent).toContain(
      "pool: worker 0 threw while working: no message; the lane search ran again on the main thread"
    );
  });

  it("runs the trace again on the screen's own thread when a pool worker fails while working", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    const first = pooled.traces[0];
    act(() => first.reject(new WorkerCrash("worker 1 threw while working: no message")));
    await waitFor(() => expect(pooled.traces).toHaveLength(2));
    expect(pooled.traces[1].frames.map((f) => f.t)).toEqual(first.frames.map((f) => f.t));
    expect(pooled.traces[1].input.calibFrame).toBe(24);
    expect(pools()[pools().length - 1].size).toBe(1);
    trace()!.reply(done());
    expect(await screen.findByText("Board 23.8")).toBeTruthy();
    expect(screen.getByTestId("tracer-details").textContent).toContain("pool: worker 1 threw while working: no message; the trace ran again on the main thread");
  });

  it("says the video couldn't be read when a pool worker fails after the frames went to it", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    const first = pooled.traces[0];
    // The last job moves the frames to its worker: the screen has them no more.
    for (const f of first.frames) structuredClone(f.data.buffer, { transfer: [f.data.buffer as ArrayBuffer] });
    act(() => first.reject(new WorkerCrash("worker 1 threw while working: no message")));
    expect((await screen.findByRole("alert")).textContent).toBe("This video couldn't be read.");
    expect(pooled.traces).toHaveLength(1);
  });
});
