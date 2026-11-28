import { afterEach, describe, expect, it, vi } from "vitest";
import type { Sample, VideoTrack } from "../lib/shotTrack/mp4";
import { Notes } from "../lib/shotTrack/notes";
import { codecRead, codecScan, openCodec, type CodecVideo } from "./codecFrames";

// The decode bookkeeping, with a stand-in for the browser's `VideoDecoder`
// fed the sample table of the clip an iPhone stuck on (HEVC Main 8-bit,
// upright 1080 by 1920, B-frames, keyframes every 32 frames, a frame shown
// at the edit's very end): every frame comes out as Safari gives them, and
// each wait the browser could leave open (the file read, a frame's
// `copyTo`, a decoder that goes quiet, `isConfigSupported`) ends in an error
// that says what stalled.

const NODE_FS = "node:fs";
const NODE_URL = "node:url";
/** A fixture held in memory, its reads answered at once: a real read would race the fake clock. */
const inMemory = async (path: string): Promise<Blob> => {
  const bytes: Uint8Array = (await import(/* @vite-ignore */ NODE_FS)).readFileSync(path);
  return {
    size: bytes.length,
    slice: (a: number, b: number) => ({ arrayBuffer: () => Promise.resolve(new Uint8Array(bytes.subarray(a, b)).buffer) })
  } as unknown as Blob;
};
const fixture = async (name: string): Promise<string> =>
  (await import(/* @vite-ignore */ NODE_URL)).fileURLToPath(new URL(`../../scripts/shot-tracker/fixtures/${name}`, import.meta.url));

/** stuck-zoom.mp4's presentation times in decode order, 1/600 s (from its `stts`, `ctts` and edit list). */
const SHOWN = (() => {
  const out: number[] = [0];
  // Groups of four in decode order: P four on, B two on, b one on, b three on.
  for (let base = 0; out.length < 241; base += 80) out.push(base + 80, base + 40, base + 20, base + 60);
  // The encoder's clock slipped one unit at 4.13 s.
  return [...out.map((u) => (u >= 2480 ? u - 1 : u)), 4839, 4819];
})();
const KEYS = new Set([0, 29, 61, 93, 125, 157, 189, 221]);

/** A small stand-in for the clip's picture: the bookkeeping does not care how big it is. */
const W = 270;
const H = 480;

function stuckTrack(): VideoTrack {
  const samples: Sample[] = SHOWN.map((u, i) => ({ offset: 1000 + i * 100, size: 100, t: u / 600, duration: 20 / 600, key: KEYS.has(i) }));
  return {
    fourcc: "hvc1",
    codec: "hvc1.1.6.L120.B0",
    description: new Uint8Array(23),
    codedWidth: W,
    codedHeight: H,
    rotation: 0,
    width: W,
    height: H,
    bitDepth: 8,
    fullRange: false,
    duration: 4839 / 600,
    samples
  };
}

/** A file whose reads answer at once, or never. */
const file = (reads: "answer" | "never" = "answer"): Blob =>
  ({
    size: 1e6,
    slice: (a: number, b: number) => ({ arrayBuffer: () => (reads === "never" ? new Promise(() => {}) : Promise.resolve(new ArrayBuffer(b - a))) })
  }) as unknown as Blob;

interface Fake {
  /** How frames come out: in decode order at once (Safari), held and put in show order (a reordering decoder), or never. */
  output: "decode-order" | "show-order" | "none";
  /** Whether a frame's `copyTo` answers. */
  copy: "answer" | "never";
  /** Errors out when the first chunk it is given is a sync sample other than the first (an open GOP an iPhone cannot start from); `always` errors on every start. */
  refuse?: "mid-file" | "always";
}

class FakeFrame {
  readonly format = "NV12";
  readonly codedWidth = W;
  readonly codedHeight = H;
  readonly displayWidth = W;
  readonly displayHeight = H;
  readonly visibleRect = { x: 0, y: 0, width: W, height: H };
  readonly colorSpace = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false };
  closed = false;
  constructor(
    readonly timestamp: number,
    private readonly copy: Fake["copy"]
  ) {}
  allocationSize() {
    return W * H * 1.5;
  }
  copyTo(buf: Uint8Array) {
    if (this.copy === "never") return new Promise(() => {});
    buf.fill(100, 0, W * H);
    return Promise.resolve([
      { offset: 0, stride: W },
      { offset: W * H, stride: W }
    ]);
  }
  close() {
    this.closed = true;
  }
}

/** Installs a stand-in `VideoDecoder` behaving as `fake` says; returns the frames it made. */
function installDecoder(fake: Fake, supported: "yes" | "never" = "yes"): FakeFrame[] {
  const made: FakeFrame[] = [];
  class FakeDecoder {
    state = "unconfigured";
    decodeQueueSize = 0;
    private held: number[] = [];
    constructor(private readonly init: { output: (f: FakeFrame) => void; error: (e: unknown) => void }) {}
    static isConfigSupported() {
      return supported === "never" ? new Promise(() => {}) : Promise.resolve({ supported: true });
    }
    configure() {
      this.state = "configured";
    }
    private emit(t: number) {
      const f = new FakeFrame(t, fake.copy);
      made.push(f);
      this.init.output(f);
    }
    private started = false;
    decode(chunk: { timestamp: number }) {
      if (!this.started) {
        this.started = true;
        if (fake.refuse === "always" || (fake.refuse === "mid-file" && chunk.timestamp > 0)) {
          queueMicrotask(() => this.init.error(new Error("Decoder failure")));
          return;
        }
      }
      if (fake.output === "none") {
        this.decodeQueueSize++;
        return;
      }
      this.decodeQueueSize++;
      queueMicrotask(() => {
        this.decodeQueueSize--;
        if (fake.output === "decode-order") return this.emit(chunk.timestamp);
        // Held until two after it are in, then the earliest shown goes.
        this.held.push(chunk.timestamp);
        this.held.sort((a, b) => a - b);
        if (this.held.length > 2) this.emit(this.held.shift()!);
      });
    }
    flush() {
      if (fake.output === "none") return new Promise(() => {});
      return new Promise<void>((resolve) =>
        queueMicrotask(() => {
          for (const t of this.held.splice(0)) this.emit(t);
          resolve();
        })
      );
    }
    close() {
      this.state = "closed";
    }
  }
  vi.stubGlobal("VideoDecoder", FakeDecoder);
  vi.stubGlobal("VideoFrame", FakeFrame);
  vi.stubGlobal("EncodedVideoChunk", class {
    readonly timestamp: number;
    constructor(init: { timestamp: number }) {
      this.timestamp = init.timestamp;
    }
  });
  return made;
}

const codec = (reads: "answer" | "never" = "answer"): CodecVideo => ({ file: file(reads), track: stuckTrack(), config: { codec: "hvc1.1.6.L120.B0", hardwareAcceleration: "prefer-hardware" } });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the first look by decoding, on the stuck clip's frames", () => {
  for (const output of ["decode-order", "show-order"] as const) {
    it(`gets every grid frame in time order when frames come out in ${output}`, async () => {
      const made = installDecoder({ output, copy: "answer" });
      const times: number[] = [];
      const progress: number[] = [];
      const scanned = await codecScan(codec(), (f) => times.push(f.t), (p) => progress.push(p));
      expect(made).toHaveLength(243);
      expect(made.every((f) => f.closed)).toBe(true);
      // Every other frame of 30 a second, from the first to the one shown at the edit's end.
      expect(times).toHaveLength(122);
      expect(times[0]).toBe(0);
      expect(times.slice(1).every((t, i) => t > times[i])).toBe(true);
      expect(progress[progress.length - 1]).toBe(1);
      expect(scanned).toMatchObject({ width: W, height: H, via: "WebCodecs hvc1.1.6.L120.B0 prefer-hardware" });
    });
  }

  it("reads a stretch of it, every frame from its keyframe", async () => {
    installDecoder({ output: "decode-order", copy: "answer" });
    const read = await codecRead(codec(), { from: 2, to: 3, fps: 30, band: null }, () => {});
    expect(read.gray).toHaveLength(30);
    expect(read.times[0]).toBeCloseTo(2, 6);
  });
});

describe("a read from a sync sample the decoder cannot start at", () => {
  const plan = { from: 2, to: 3, fps: 30, band: null };

  it("decodes from the start instead, with the same frames, and says so", async () => {
    installDecoder({ output: "decode-order", copy: "answer" });
    const good = await codecRead(codec(), plan, () => {});
    installDecoder({ output: "decode-order", copy: "answer", refuse: "mid-file" });
    const notes = new Notes();
    const progress: number[] = [];
    const read = await codecRead(codec(), plan, (p) => progress.push(p), notes);
    expect(read.gray).toHaveLength(good.gray.length);
    expect(read.times).toEqual(good.times);
    expect(read.gray).toEqual(good.gray);
    expect(notes.get("read")).toMatch(/decoding from \d\.\d\d s failed \(.*Decoder failure.*\), decoded from the start instead/);
    // A decode of the whole file is slow in a test.
  }, 30000);

  it("throws when the decode from the start fails too", async () => {
    installDecoder({ output: "decode-order", copy: "answer", refuse: "always" });
    const notes = new Notes();
    await expect(codecRead(codec(), plan, () => {}, notes)).rejects.toThrow(/Decoder failure/);
    expect(notes.get("read")).toMatch(/decoded from the start instead/);
  });
});

describe("a wait the browser never ends, ended", () => {
  /** Runs `p` under fake timers (and a fake clock) until it settles. */
  async function settle<T>(p: Promise<T>): Promise<T> {
    let done = false;
    p.then(
      () => (done = true),
      () => (done = true)
    );
    for (let i = 0; i < 400 && !done; i++) await vi.advanceTimersByTimeAsync(100);
    return p;
  }

  it("a frame's copyTo", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    installDecoder({ output: "decode-order", copy: "never" });
    await expect(settle(codecScan(codec(), () => {}, () => {}))).rejects.toThrow(/turning the frame at 0\.000 s to gray \(NV12, copyTo\) stalled: no answer in 5 s \(\d+ of 243 fed/);
  });

  it("a decoder that takes the frames and gives nothing back", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    installDecoder({ output: "none", copy: "answer" });
    await expect(settle(codecScan(codec(), () => {}, () => {}))).rejects.toThrow(/decoder stalled after 0 frames \(6 of 243 fed, 0 out, queue 6/);
  });

  it("a decoder that gives nothing back and never finishes its flush", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    installDecoder({ output: "none", copy: "answer" });
    const cv = codec();
    // Four frames, fewer than the queue holds: all fed, then only the flush is waited on.
    cv.track = { ...cv.track, samples: cv.track.samples.slice(0, 4) };
    await expect(settle(codecScan(cv, () => {}, () => {}))).rejects.toThrow(/decoder stalled after 0 frames \(4 of 4 fed/);
  });

  it("a read of the file", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    installDecoder({ output: "decode-order", copy: "answer" });
    await expect(settle(codecScan(codec("never"), () => {}, () => {}))).rejects.toThrow(/reading \d+ bytes of the file stalled: no answer in 10 s \(0 of 243 fed/);
  });

  it("isConfigSupported, and the moov read, each end with the reason the video is played instead", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    installDecoder({ output: "decode-order", copy: "answer" }, "never");
    const real = await inMemory(await fixture("clips/shot-01.mp4"));
    await expect(settle(openCodec(real))).resolves.toMatch(/^codec avc1\.\w+: isConfigSupported prefer-hardware stalled: no answer in 5 s$/);
    await expect(settle(openCodec(file("never")))).resolves.toBe("container: reading the file's moov stalled: no answer in 10 s");
  });
});
