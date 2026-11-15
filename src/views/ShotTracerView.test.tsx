import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShotFound } from "../lib/shotTrack/shotStart";
import type { TrackResult } from "../lib/shotTrack/types";
import type { FindMessage, FindRequest, SearchRequest, TraceMessage, TraceRequest } from "../shotTracer/protocol";
import { ShotTracerView } from "./ShotTracerView";

const readVideoFrames = vi.hoisted(() => vi.fn());
const scanVideo = vi.hoisted(() => vi.fn());
vi.mock("../shotTracer/videoFrames", () => ({ readVideoFrames, scanVideo }));

/** A stand-in for the three workers: it records what it was sent and is answered by the test. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  readonly name: "search" | "find" | "trace";
  constructor(url: URL) {
    this.name = url.href.includes("search.worker") ? "search" : url.href.includes("find.worker") ? "find" : "trace";
    FakeWorker.all.push(this);
  }
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    act(() => this.onmessage?.({ data } as MessageEvent));
  }
}

const worker = (name: FakeWorker["name"]): FakeWorker | undefined => {
  const all = FakeWorker.all.filter((w) => w.name === name);
  return all[all.length - 1];
};
const searcher = () => worker("search");
const find = () => worker("find");
const trace = () => worker("trace");

const W = 8;
const H = 6;
const COUNT = 60;
const fakeVideo = () => ({
  width: W,
  height: H,
  gray: Array.from({ length: COUNT }, () => new Uint8ClampedArray(W * H).fill(100)),
  times: Array.from({ length: COUNT }, (_, i) => i / 30)
});

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

const LANES = [
  { frame: 0, H: [1, 0, 0, 0, 1, 0, 0, 0, 1], weight: 1, guess: false },
  { frame: 12, H: [1, 0, 0, 0, 1, 0, 0, 0, 1], weight: 2, guess: false }
] satisfies (FindMessage & { frame: number })["lanes"];

/** The finder's answer: the lane found best on frame 12, on two frames in all. */
const found = (evidence: Partial<(FindMessage & { frame: number })["evidence"]> = {}): FindMessage => ({
  frame: 12,
  lanes: LANES,
  evidence: { guess: null, support: { left: 0.6, right: 0.6 }, pinsUsed: 3, camera: 22, ...evidence }
});

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
    speed: metric(15.3)
  } as TrackResult["metrics"],
  motion: { v0: 0, w: 20, d: 0 },
  touchdownFrame: null,
  pinFrame: null
};
const done = (evidence?: (TraceMessage & { kind: "done" })["evidence"]): TraceMessage => ({
  kind: "done",
  result: TRACED,
  H: [0.2, 0, 0, 0, -0.08, 5.5, 0, 0, 1],
  evidence
});

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
  searcher()!.reply({ found: shot });
}

/** Picks a video, the shot is found, the video read and the lane search started. */
async function chooseVideo() {
  await searchFinds(SHOT);
  await waitFor(() => expect(find()).toBeTruthy());
}

describe("ShotTracerView", () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.stubGlobal("Worker", FakeWorker);
    // jsdom draws nothing; the picture's effect only needs a null context.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(console, "info").mockImplementation(() => {});
    readVideoFrames.mockReset();
    readVideoFrames.mockResolvedValue(fakeVideo());
    scanVideo.mockReset();
    scanning({ width: 1920, height: 1080, duration: 30 });
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

  it("reads from just before the shot it found, with no trim step, and stops the search", async () => {
    await chooseVideo();
    expect(readVideoFrames).toHaveBeenCalledTimes(1);
    expect(readVideoFrames.mock.calls[0][2]).toBe(11.4);
    // A landscape video is read whole.
    expect(readVideoFrames.mock.calls[0][3]).toBeNull();
    expect(searcher()!.terminated).toBe(true);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("reads only the lane's band of a portrait video, round where the ball's run starts", async () => {
    scanning({ width: 1080, height: 1920, duration: 30 });
    await searchFinds({ ...SHOT, run: [{ t: 12, x: 0.5, y: 0.45 }] });
    await waitFor(() => expect(find()).toBeTruthy());
    const band = readVideoFrames.mock.calls[0][3];
    expect(band.top).toBeCloseTo(0.15, 9);
    expect(band.bottom).toBeCloseTo(0.59, 9);
  });

  it("reads the sample clips' band when the run's is much the same", async () => {
    scanning({ width: 1080, height: 1920, duration: 30 });
    await chooseVideo();
    expect(readVideoFrames.mock.calls[0][3]).toEqual({ top: 0.3, bottom: 0.72 });
  });

  it("reads a short video from its start when no shot is found in it", async () => {
    scanning({ width: 1920, height: 1080, duration: 4.65 });
    await searchFinds(null);
    await waitFor(() => expect(find()).toBeTruthy());
    expect(readVideoFrames.mock.calls[0][2]).toBe(0);
  });

  it("says the shot couldn't be found in a long video, what to try, and offers another", async () => {
    await searchFinds(null);
    expect((await screen.findByRole("alert")).textContent).toBe("The shot couldn't be found in this video.");
    expect(screen.getByText(/Film from behind the bowler, with the whole lane in view from the foul line to the pins/)).toBeTruthy();
    expect(readVideoFrames).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Another video" }));
    expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
  });

  it("says a video is unreadable when the first look cannot read it", async () => {
    scanVideo.mockRejectedValue(new Error("no"));
    pickFile();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be read/);
    expect(readVideoFrames).not.toHaveBeenCalled();
  });

  it("says a video is unreadable when too little of it could be read", async () => {
    readVideoFrames.mockResolvedValue({ ...fakeVideo(), gray: [], times: [] });
    await searchFinds(SHOT);
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be read/);
  });

  it("looks for the lane on copies of about 24 frames spread over the clip", async () => {
    await chooseVideo();
    expect(screen.getByText("Finding the lane…")).toBeTruthy();
    const request = find()!.posted[0] as FindRequest;
    // 60 frames, so every 2nd: 30 of them, each with its clip index.
    expect(request.frames.map((f) => f.index)).toEqual(Array.from({ length: 30 }, (_, i) => i * 2));
    expect(request.frames[0].data.byteLength).toBe(W * H);
  });

  it("traces straight away with the found lanes", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(screen.getByText("Tracing the shot…")).toBeTruthy());
    expect(find()!.terminated).toBe(true);
    const request = trace()!.posted[0] as TraceRequest;
    expect(request.calibFrame).toBe(12);
    expect(request.lanes).toEqual(LANES);
    expect(request.hand).toBe("right");
  });

  it("shows the readings with the lane drawn on the picture, and no doubt when the lane is sure", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply({ kind: "progress", stage: "ball", fraction: 0.5 });
    trace()!.reply(done({ kept: 3, dropped: 1, pinCheck: 0.2 }));
    expect(await screen.findByText("Board 23.8")).toBeTruthy();
    expect(screen.getByText("Board 7.7 at 43 ft")).toBeTruthy();
    // The touchdown beside the laydown: where the ball first touches the lane.
    expect(screen.getByText("Touchdown")).toBeTruthy();
    expect(screen.getByText("Board 23 at 2 ft")).toBeTruthy();
    expect(screen.getByText("15.3 mph")).toBeTruthy();
    // Both edges, the foul line and the pin row, under the path.
    const lane = screen.getByTestId("lane-lines");
    expect(lane.querySelectorAll("line")).toHaveLength(4);
    // Then the ring on the foul line that marks the laydown, and the path from it.
    expect(lane.nextElementSibling?.tagName).toBe("circle");
    expect(lane.parentElement?.querySelector("polyline")).toBeTruthy();
    expect(screen.queryByText(/The lane may be off/)).toBeNull();
    expect(screen.getByRole("button", { name: "Another video" })).toBeTruthy();
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
    trace()!.reply({ kind: "done", result: { ok: false, failure: "ball-not-found", detail: "" }, H: null });
    expect((await screen.findByRole("alert")).textContent).toBe("The ball couldn't be followed down the lane.");
    expect(screen.getByText(/hold the phone still/)).toBeTruthy();
  });

  it("says when the camera moves too much, or the tracer could not work the lane out", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply({ kind: "done", result: { ok: false, failure: "too-shaky", detail: "" }, H: null });
    expect((await screen.findByRole("alert")).textContent).toBe("The camera moves too much to follow the lane.");
  });

  it("says the video couldn't be read when the tracer itself fails", async () => {
    await chooseVideo();
    find()!.reply(found());
    await waitFor(() => expect(trace()).toBeTruthy());
    act(() => trace()!.onerror?.());
    expect((await screen.findByRole("alert")).textContent).toBe("This video couldn't be read.");
  });

  it("says the lane couldn't be found, with no lines to drag, when the finder misses it", async () => {
    await chooseVideo();
    find()!.reply({ frame: null } satisfies FindMessage);
    expect((await screen.findByRole("alert")).textContent).toBe("The lane couldn't be found in this video.");
    expect(trace()).toBeUndefined();
    expect(screen.queryByRole("button", { name: /Trace the shot/ })).toBeNull();
  });

  it("tries the sample clips' band of a portrait video when the run's band holds no lane", async () => {
    scanning({ width: 1080, height: 1920, duration: 30 });
    await searchFinds({ ...SHOT, run: [{ t: 12, x: 0.5, y: 0.95 }] });
    await waitFor(() => expect(find()).toBeTruthy());
    act(() => find()!.onerror?.());
    await waitFor(() => expect(readVideoFrames).toHaveBeenCalledTimes(2));
    expect(readVideoFrames.mock.calls[1][3]).toEqual({ top: 0.3, bottom: 0.72 });
    await waitFor(() => expect(FakeWorker.all.filter((w) => w.name === "find")).toHaveLength(2));
    find()!.reply({ frame: null } satisfies FindMessage);
    expect((await screen.findByRole("alert")).textContent).toBe("The lane couldn't be found in this video.");
  });

  it("stops the lane search when the screen closes", async () => {
    const view = pickFile();
    await waitFor(() => expect(searcher()?.posted.some((m) => (m as SearchRequest).kind === "done")).toBe(true));
    searcher()!.reply({ found: SHOT });
    await waitFor(() => expect(find()).toBeTruthy());
    view.unmount();
    expect(find()!.terminated).toBe(true);
  });

  it("drops a search's late answer once another video is chosen", async () => {
    await searchFinds(null);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Another video" }));
    const first = searcher()!;
    expect(first.terminated).toBe(true);
    first.reply({ found: SHOT });
    expect(readVideoFrames).not.toHaveBeenCalled();
  });
});
