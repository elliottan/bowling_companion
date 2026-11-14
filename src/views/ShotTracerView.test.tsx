import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FindMessage, FindRequest } from "../shotTracer/protocol";
import { ShotTracerView } from "./ShotTracerView";

const readVideoFrames = vi.hoisted(() => vi.fn());
const videoDuration = vi.hoisted(() => vi.fn());
vi.mock("../shotTracer/videoFrames", () => ({ readVideoFrames, videoDuration }));

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

function pickFile() {
  render(<ShotTracerView handedness="right" onBack={vi.fn()} />);
  const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  fireEvent.change(input, { target: { files: [new File(["x"], "shot.mp4", { type: "video/mp4" })] } });
}

async function chooseVideo() {
  pickFile();
  await waitFor(() => expect(find()).toBeTruthy());
}

/** A long video: the trim step, its start moved to `start` seconds, then read. */
async function trimVideo(start: number) {
  videoDuration.mockResolvedValue(30);
  pickFile();
  const slider = await screen.findByRole("slider");
  fireEvent.change(slider, { target: { value: String(start) } });
  fireEvent.click(screen.getByRole("button", { name: "Trace from here" }));
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
    videoDuration.mockReset();
    videoDuration.mockResolvedValue(4.65);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:shot");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
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

  it("reads a short video from its start, with no trim step", async () => {
    await chooseVideo();
    expect(readVideoFrames).toHaveBeenCalledTimes(1);
    expect(readVideoFrames.mock.calls[0][2]).toBe(0);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("asks where the shot starts in a long video, showing the video, then reads from there", async () => {
    videoDuration.mockResolvedValue(30);
    pickFile();
    const slider = await screen.findByRole("slider");
    expect(readVideoFrames).not.toHaveBeenCalled();
    expect(screen.getByText(/Slide to just before the release/)).toBeTruthy();
    expect(screen.getByLabelText("The video").tagName).toBe("VIDEO");
    expect(screen.getByLabelText("The video").getAttribute("src")).toBe("blob:shot#t=0.001");
    // The latest start leaves three seconds to read.
    expect(slider.getAttribute("max")).toBe("27");
    expect(screen.getByText("Shot starts at 0 s of 30 s")).toBeTruthy();
    fireEvent.change(slider, { target: { value: "10.5" } });
    expect(screen.getByText("Shot starts at 10.5 s of 30 s")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trace from here" }));
    await waitFor(() => expect(find()).toBeTruthy());
    expect(readVideoFrames.mock.calls[0][2]).toBe(10.5);
  });

  it("seeks the video to the start as the slider moves", async () => {
    videoDuration.mockResolvedValue(30);
    pickFile();
    const slider = await screen.findByRole("slider");
    const video = screen.getByLabelText("The video") as HTMLVideoElement;
    Object.defineProperty(video, "readyState", { value: 4 });
    fireEvent.change(slider, { target: { value: "12" } });
    expect(video.currentTime).toBe(12);
  });

  it("goes back to the choice from the trim step, and says when the video will not play", async () => {
    videoDuration.mockResolvedValue(30);
    pickFile();
    await screen.findByRole("slider");
    fireEvent.click(screen.getByRole("button", { name: "Another video" }));
    expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
    fireEvent.change(input, { target: { files: [new File(["y"], "long.mp4")] } });
    fireEvent.error(await screen.findByLabelText("The video"));
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't be read/);
  });

  it("says a video is unreadable when its length cannot be read", async () => {
    videoDuration.mockRejectedValue(new Error("no"));
    pickFile();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be read/);
    expect(readVideoFrames).not.toHaveBeenCalled();
  });

  it("traces again from the same start", async () => {
    await trimVideo(8);
    find()!.reply({ frame: 12, lines: FOUND_LINES as FindMessage["lines"] });
    await waitFor(() => expect(trace()).toBeTruthy());
    trace()!.reply({ kind: "done", result: { ok: false, failure: "ball-not-found" }, H: null });
    fireEvent.click(await screen.findByRole("button", { name: /Move the lines and trace again/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Trace the shot/ })).toBeTruthy());
    expect(readVideoFrames).toHaveBeenCalledTimes(2);
    expect(readVideoFrames.mock.calls[1][2]).toBe(8);
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
