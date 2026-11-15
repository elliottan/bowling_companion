import {
  frameTimes,
  droppedBetween,
  isNewFrame,
  lumaOf,
  median,
  playbackRateFor,
  READ_FPS,
  READ_MAX_FRAMES,
  readProgress,
  readWindow,
  resampleGray,
  rotateGray,
  scaledSize,
  slowerRate,
  toGray
} from "../lib/shotTrack/marking";

/**
 * Frames read out of a video file in the browser, for the shot tracer
 * (Settings, Labs): a stretch of the file from a start time the bowler chose,
 * at most `MAX_PIXELS` a frame and kept in grey, up to `READ_MAX_FRAMES`
 * frames or `READ_SECONDS` (`lib/shotTrack/marking.ts`).
 *
 * The stretch is read by playing it. Where the browser has
 * `requestVideoFrameCallback`, each frame it presents is kept as it comes, at
 * its own time (`mediaTime`), so a 60 fps clip is read at 60 and a 30 fps one
 * at 30, in about the time the stretch lasts. Seeking a frame at a time (the
 * fallback, and how it was first read) decodes from the last keyframe on every
 * seek: 240 of them took 39 seconds for a 4 second clip in desktop Chromium,
 * and minutes for a 4K phone clip.
 *
 * A frame is taken as the decoder gave it where the browser can copy it out
 * (`VideoFrame`): its luma plane is the video's own grey, read in under a
 * millisecond, where drawing it to a canvas took 36 (and so lost two frames
 * in three at 60 fps). Anything else (a flipped or stretched frame, a pixel
 * format not handled here) is drawn to a canvas, as before.
 *
 * Playback that will not start, stops coming or runs past its time hands over
 * to the seek loop where it got to, so the read always ends. Needs a real
 * browser's decoder, so it is not unit tested; the pure parts are in
 * `marking.ts`.
 */

/** 960 by 720: the far end of the lane keeps a ball of three or four pixels across. */
export const MAX_PIXELS = 960 * 720;

export interface VideoFrames {
  width: number;
  height: number;
  /** Grey frames, one byte a pixel. */
  gray: Uint8ClampedArray[];
  times: number[];
}

interface FrameMeta {
  mediaTime: number;
}
type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: FrameMeta) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** Whether the browser says which frame it shows (not every one does, whatever the types say). */
function hasFrameCallback(video: FrameVideo): boolean {
  return typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === "function";
}

/** An event on the video (true), its error (rejects), or neither within `ms` (false). */
function once(target: EventTarget, name: string, ms = 10000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      target.removeEventListener(name, ok);
      target.removeEventListener("error", bad);
    };
    const ok = () => {
      done();
      resolve(true);
    };
    const bad = () => {
      done();
      reject(new Error(`video ${name} failed`));
    };
    const timer = setTimeout(() => {
      done();
      resolve(false);
    }, ms);
    target.addEventListener(name, ok);
    target.addEventListener("error", bad);
  });
}

/**
 * Seeks and waits for the frame, and says which frame came: its own time where
 * the browser reports it (`requestVideoFrameCallback`), or else the time asked.
 * The time asked is a little past the frame's start, since a seek to exactly a
 * frame's edge lands on either side of it: on a 60 fps clip read at 30, the
 * steps between frames ran 1, 2, 3, 1, 2, 3 source frames and the speed read
 * 20% fast. A seek to where the video already is fires no event on some
 * browsers, so the wait gives up after a second and takes what is there.
 */
async function seekTo(video: FrameVideo, t: number): Promise<number> {
  if (Math.abs(video.currentTime - t) < 1e-4) return t;
  const presented = hasFrameCallback(video)
    ? new Promise<number>((resolve) => video.requestVideoFrameCallback!((_, meta) => resolve(meta.mediaTime)))
    : once(video, "seeked").then(() => t);
  video.currentTime = t;
  return Promise.race([presented, new Promise<number>((resolve) => setTimeout(() => resolve(t), 1000))]);
}

/** How far past a frame's start each seek aims, seconds: a quarter of a 60 fps frame. */
const SEEK_INTO = 1 / 240;

/** Playback that shows no new frame for this long has stalled, milliseconds. */
const STALL_MS = 2000;
/** The first frame may take longer: the decoder starts up. */
const FIRST_FRAME_MS = 4000;
/**
 * The rate playback starts at. It only slows from there: when a frame goes
 * by unkept (`droppedBetween`), and to what the frames kept so far say this
 * phone can keep up with (`playbackRateFor`). In desktop Chromium with every
 * core busy, shot-01 dropped 27 of its first 267 frames at 1, 2 at a half and
 * none at a quarter; a half reads the four seconds in eight.
 */
const START_RATE = 0.5;
/** Frames kept between each new choice of rate. */
const RATE_EVERY = 8;

interface Reading {
  video: FrameVideo;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Each frame kept, by its place; null where its copy failed. */
  gray: (Uint8ClampedArray | null)[];
  times: number[];
  /** Frames copied out and still being turned to grey, in order. */
  pending: Promise<void>;
  /** Whether frames are copied out of the decoder (`VideoFrame`), drawn to the canvas, or not yet known. */
  planes: boolean | undefined;
  /** Milliseconds each recent frame took to keep. */
  cost: number[];
  from: number;
  to: number;
  onProgress: (fraction: number) => void;
}

interface Frame {
  format: string | null;
  visibleRect: { width: number; height: number } | null;
  rotation?: number;
  flip?: boolean;
  allocationSize(): number;
  copyTo(dest: Uint8Array): Promise<{ offset: number; stride: number }[]>;
  close(): void;
}
type FrameCtor = new (source: HTMLVideoElement) => Frame;

const LUMA_FIRST = new Set(["I420", "I420A", "I422", "I444", "NV12"]);
const FOUR_BYTE = new Set(["RGBA", "RGBX", "BGRA", "BGRX"]);

/**
 * Whether this frame can be read from its own planes: a format handled here,
 * no flip, a turn of a quarter, and the shape the video element shows.
 */
function planesFit(f: Frame, video: HTMLVideoElement): boolean {
  if (!f.format || !(LUMA_FIRST.has(f.format) || FOUR_BYTE.has(f.format)) || f.flip || !f.visibleRect) return false;
  const turn = f.rotation ?? 0;
  if (turn % 90 !== 0) return false;
  const quarter = turn % 180 !== 0;
  const w = quarter ? f.visibleRect.height : f.visibleRect.width;
  const h = quarter ? f.visibleRect.width : f.visibleRect.height;
  return Math.abs(w / h - video.videoWidth / video.videoHeight) < 0.01;
}

/** Turns a frame copied out of the decoder into the grey picture the tracer reads. */
function planeGray(
  r: Reading,
  f: { format: string; w: number; h: number; turn: number },
  buf: Uint8Array,
  layout: { offset: number; stride: number }
): Uint8ClampedArray {
  const quarter = f.turn % 180 !== 0;
  const outW = quarter ? r.height : r.width;
  const outH = quarter ? r.width : r.height;
  let grey: Uint8ClampedArray;
  if (LUMA_FIRST.has(f.format)) {
    grey = resampleGray(buf, f.w, f.h, layout.stride, layout.offset, outW, outH);
  } else {
    // An RGB frame is in full range like a canvas: to the video's grey first.
    const luma = lumaOf(buf, f.w, f.h, layout.stride, layout.offset, f.format.startsWith("B"));
    grey = resampleGray(luma, f.w, f.h, f.w, 0, outW, outH);
  }
  return rotateGray(grey, outW, outH, f.turn);
}

/** Draws the video's current frame to the canvas and keeps it in grey. */
function drawn(r: Reading): Uint8ClampedArray {
  r.ctx.drawImage(r.video, 0, 0, r.width, r.height);
  return toGray(r.ctx.getImageData(0, 0, r.width, r.height).data, r.width, r.height);
}

/** Keeps the frame the video is showing, at `at` seconds. */
function keep(r: Reading, at: number): void {
  const started = performance.now();
  const index = r.times.length;
  r.times.push(at);
  r.gray.push(null);
  const Ctor = (globalThis as { VideoFrame?: FrameCtor }).VideoFrame;
  let frame: Frame | null = null;
  if (Ctor && r.planes !== false) {
    try {
      frame = new Ctor(r.video);
      if (r.planes === undefined) r.planes = planesFit(frame, r.video);
      if (!r.planes) {
        frame.close();
        frame = null;
      }
    } catch {
      frame?.close();
      frame = null;
      r.planes = false;
    }
  }
  if (!frame) {
    r.gray[index] = drawn(r);
    r.cost.push(performance.now() - started);
    return;
  }
  const f = frame;
  const shape = { format: f.format!, w: f.visibleRect!.width, h: f.visibleRect!.height, turn: f.rotation ?? 0 };
  const buf = new Uint8Array(f.allocationSize());
  // Copied at once, so the decoder has its frame back; turned to grey in order.
  const copied = f.copyTo(buf).finally(() => f.close());
  const before = performance.now() - started;
  r.pending = r.pending.then(async () => {
    try {
      const layout = await copied;
      const t0 = performance.now();
      r.gray[index] = planeGray(r, shape, buf, layout[0]);
      r.cost.push(before + performance.now() - t0);
    } catch {
      // That frame is lost; the next is drawn instead.
      r.planes = false;
    }
  });
}

/**
 * Plays the stretch and keeps each frame presented. Resolves when it is read,
 * or when playback will not start, stalls or overruns; the caller seeks for
 * what is left.
 */
async function readByPlaying(r: Reading): Promise<boolean> {
  const video = r.video;
  const request = video.requestVideoFrameCallback!.bind(video);
  let handle = 0;
  let stall: ReturnType<typeof setTimeout> | undefined;
  let finish!: (whole: boolean) => void;
  const finished = new Promise<boolean>((resolve) => (finish = resolve));
  let over = false;
  // The clip's own step between frames kept, seconds, as far as seen.
  let shortest = Infinity;
  // Whether it read to the end (of the stretch, the video or the frames kept).
  const stop = (whole: boolean) => {
    if (over) return;
    over = true;
    clearTimeout(stall);
    clearTimeout(overrun);
    video.cancelVideoFrameCallback?.(handle);
    video.removeEventListener("ended", ended);
    video.pause();
    finish(whole);
  };
  const ended = () => stop(true);
  const stalled = () => stop(false);
  const watch = (ms: number) => {
    clearTimeout(stall);
    stall = setTimeout(stalled, ms);
  };
  const onFrame = (_: number, meta: FrameMeta) => {
    if (over) return;
    const at = meta.mediaTime;
    if (at >= r.to - 1e-4) return stop(true);
    // The frame the seek lands on may start a little before the time asked.
    const prev = r.times[r.times.length - 1];
    if (at >= r.from - 0.05 && isNewFrame(prev, at)) {
      if (prev !== undefined) {
        shortest = Math.min(shortest, at - prev);
        // A frame went by unkept: slower, so the rest are not.
        if (droppedBetween(at - prev, shortest)) video.playbackRate = slowerRate(video.playbackRate);
      }
      keep(r, at);
      r.onProgress(readProgress(r.times.length, at, r.from, r.to, READ_MAX_FRAMES));
      if (r.times.length >= READ_MAX_FRAMES) return stop(true);
      if (r.times.length % RATE_EVERY === 0) {
        video.playbackRate = Math.min(video.playbackRate, playbackRateFor(median(r.cost.slice(-2 * RATE_EVERY))));
      }
      watch(STALL_MS);
    }
    handle = request(onFrame);
  };
  // However the frames come, it ends: the stretch at the slowest rate, and a margin.
  const overrun = setTimeout(stalled, ((r.to - r.from) / 0.25) * 1000 + FIRST_FRAME_MS);
  video.addEventListener("ended", ended);
  watch(FIRST_FRAME_MS);
  // Asked before the seek, so the frame the seek lands on is kept too.
  handle = request(onFrame);
  if (Math.abs(video.currentTime - r.from) > 1e-4) {
    video.currentTime = r.from;
    await once(video, "seeked", FIRST_FRAME_MS).catch(() => false);
  }
  video.playbackRate = START_RATE;
  try {
    if (!over) await video.play();
  } catch {
    stalled();
  }
  return finished;
}

/**
 * Seeks a frame at a time from where the reading got to. Drawn, not copied:
 * a frame copied from a paused video after a seek was the first frame again
 * in Chromium, every time.
 */
async function readBySeeking(r: Reading): Promise<void> {
  await r.pending;
  r.planes = false;
  const last = r.times[r.times.length - 1];
  const start = last === undefined ? r.from : last + 1 / READ_FPS;
  const times = frameTimes(start, r.to, READ_FPS, 2 * (READ_MAX_FRAMES - r.times.length));
  for (let i = 0; i < times.length && r.times.length < READ_MAX_FRAMES; i++) {
    const at = await seekTo(r.video, Math.min(times[i] + SEEK_INTO, r.video.duration));
    r.onProgress(readProgress(r.times.length, times[i], r.from, r.to, READ_MAX_FRAMES));
    if (!isNewFrame(r.times[r.times.length - 1], at)) continue;
    keep(r, at);
    await r.pending;
  }
}

/**
 * Reads the frames of `file` from `start` seconds. `onProgress` is told how
 * far it has got, 0 to 1 and never backwards.
 */
export async function readVideoFrames(file: Blob, onProgress: (fraction: number) => void, start = 0): Promise<VideoFrames> {
  const url = URL.createObjectURL(file);
  const video: FrameVideo = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  let reached = 0;
  const progress = (f: number) => {
    if (f > reached) onProgress((reached = f));
  };
  const began = performance.now();
  try {
    if (!(await once(video, "loadedmetadata"))) throw new Error("no metadata");
    if (video.readyState < 2 && !(await once(video, "loadeddata"))) throw new Error("no data");
    // iOS Safari draws nothing from a video that has never played.
    try {
      await video.play();
      video.pause();
    } catch {
      // Autoplay refused: seeking still decodes on the browsers that refuse it.
    }
    const { width, height } = scaledSize(video.videoWidth, video.videoHeight, MAX_PIXELS);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no canvas");
    const { from, to } = readWindow(video.duration, start);
    const r: Reading = {
      video,
      ctx,
      width,
      height,
      gray: [],
      times: [],
      pending: Promise.resolve(),
      planes: undefined,
      cost: [],
      from,
      to,
      onProgress: progress
    };
    const whole = hasFrameCallback(video) ? await readByPlaying(r) : false;
    await r.pending;
    const played = r.times.length;
    const copied = r.planes === true;
    if (!whole) {
      // Copied frames of an HDR clip are brighter than drawn ones (the canvas
      // tone-maps it): one read is all one or all the other.
      if (copied) {
        r.times = [];
        r.gray = [];
      }
      await readBySeeking(r);
    }
    const gray: Uint8ClampedArray[] = [];
    const times: number[] = [];
    r.gray.forEach((g, i) => {
      if (g) {
        gray.push(g);
        times.push(r.times[i]);
      }
    });
    console.info(
      `Shot tracer: read ${gray.length} frames (${played} while playing, ${copied ? "copied" : "drawn"}) ` +
        `from ${from.toFixed(2)} s to ${(times[times.length - 1] ?? from).toFixed(2)} s ` +
        `in ${((performance.now() - began) / 1000).toFixed(1)} s, rate ${video.playbackRate}`
    );
    return { width, height, gray, times };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** A video's length in seconds, as its metadata says (`Infinity` or `NaN` when it does not know). */
export async function videoDuration(file: Blob): Promise<number> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.src = url;
  try {
    if (!(await once(video, "loadedmetadata"))) return Number.NaN;
    return video.duration;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
