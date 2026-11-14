import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FindMessage, FindRequest } from "../shotTracer/protocol";
import { ShotTracerView } from "./ShotTracerView";

const readVideoFrames = vi.hoisted(() => vi.fn());
vi.mock("../shotTracer/videoFrames", () => ({ readVideoFrames }));

/** A stand-in for the two workers: it records what it was sent and is answered by the test. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  readonly name: "find" | "trace";
  constructor(url: URL) {
    this.name = url.href.includes("find.worker") ? "find" : "trace";
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

const find = () => FakeWorker.all.find((w) => w.name === "find");
const trace = () => FakeWorker.all.find((w) => w.name === "trace");

const W = 8;
const H = 6;
const COUNT = 60;
const fakeVideo = () => ({
  width: W,
  height: H,
  gray: Array.from({ length: COUNT }, () => new Uint8ClampedArray(W * H).fill(100)),
  times: Array.from({ length: COUNT }, (_, i) => i / 30)
});

const FOUND_LINES = {
  left: [{ x: 1, y: 5 }, { x: 3, y: 1 }],
  right: [{ x: 7, y: 5 }, { x: 5, y: 1 }],
  foul: [{ x: 1, y: 5 }, { x: 7, y: 5 }],
  pinrow: [{ x: 3, y: 1 }, { x: 5, y: 1 }]
};

async function chooseVideo() {
  render(<ShotTracerView handedness="right" onBack={vi.fn()} />);
  const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  fireEvent.change(input, { target: { files: [new File(["x"], "shot.mp4", { type: "video/mp4" })] } });
  await waitFor(() => expect(find()).toBeTruthy());
}

describe("ShotTracerView", () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.stubGlobal("Worker", FakeWorker);
    // jsdom draws nothing; the picture's effect only needs a null context.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    readVideoFrames.mockReset();
    readVideoFrames.mockResolvedValue(fakeVideo());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens on recording or choosing a video", () => {
    render(<ShotTracerView handedness="right" onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Record a shot/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].getAttribute("capture")).toBe("environment");
    expect(inputs[1].accept).toBe("video/*");
  });

  it("looks for the lane on copies of about 24 frames spread over the clip", async () => {
    await chooseVideo();
    expect(screen.getByText("Finding the lane…")).toBeTruthy();
    const request = find()!.posted[0] as FindRequest;
    // 60 frames, so every 2nd: 30 of them, each with its clip index.
    expect(request.frames.map((f) => f.index)).toEqual(Array.from({ length: 30 }, (_, i) => i * 2));
    expect(request.frames[0].data.byteLength).toBe(W * H);
  });

  it("traces straight away when the lane is found, with no mark step", async () => {
    await chooseVideo();
    const msg: FindMessage = { frame: 12, lines: FOUND_LINES as FindMessage["lines"] };
    find()!.reply(msg);
    await waitFor(() => expect(screen.getByText("Tracing the shot…")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Trace the shot/ })).toBeNull();
    expect(find()!.terminated).toBe(true);
    const request = trace()!.posted[0] as { calibFrame: number };
    expect(request.calibFrame).toBe(12);
  });

  it("asks for the lines when the lane is not found", async () => {
    await chooseVideo();
    find()!.reply({ frame: null, lines: null } satisfies FindMessage);
    await waitFor(() => expect(screen.getByRole("button", { name: /Trace the shot/ })).toBeTruthy());
    expect(screen.getByText("The lane couldn't be found on its own. Drag the lines onto it.")).toBeTruthy();
    expect(trace()).toBeUndefined();
  });

  it("asks for the lines when the finder fails", async () => {
    await chooseVideo();
    act(() => find()!.onerror?.());
    await waitFor(() => expect(screen.getByRole("button", { name: /Trace the shot/ })).toBeTruthy());
    expect(screen.getByText(/couldn't be found on its own/)).toBeTruthy();
  });

  it("moves the lines again without searching a second time", async () => {
    await chooseVideo();
    find()!.reply({ frame: 12, lines: FOUND_LINES as FindMessage["lines"] });
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply({ kind: "done", result: { ok: false, failure: "ball-not-found" }, H: null });
    fireEvent.click(await screen.findByRole("button", { name: /Move the lines and trace again/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Trace the shot/ })).toBeTruthy());
    expect(FakeWorker.all.filter((w) => w.name === "find")).toHaveLength(1);
    expect(screen.queryByText(/couldn't be found on its own/)).toBeNull();
    expect(screen.getByText("Frame 13 of 60")).toBeTruthy();
  });

  it("stops the search when the screen closes", async () => {
    const { unmount } = render(<ShotTracerView handedness="right" onBack={vi.fn()} />);
    const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
    fireEvent.change(input, { target: { files: [new File(["x"], "shot.mp4")] } });
    await waitFor(() => expect(find()).toBeTruthy());
    unmount();
    expect(find()!.terminated).toBe(true);
  });
});
