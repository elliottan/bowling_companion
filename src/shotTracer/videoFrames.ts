import { COARSE_FPS, COARSE_WIDTH, type CoarseFrame } from "../lib/shotTrack/shotStart";
import {
  bandRows,
  claimFrame,
  FrameSlots,
  frameTimes,
  gridSlot,
  lumaOf,
  MAX_PIXELS,
  median,
  missingRuns,
  planeCrop,
  playbackRateFor,
  readProgress,
  resampleGray,
  rotateGray,
  scaledSize,
  slowerRate,
  sourceStep,
  toGray
} from "../lib/shotTrack/marking";
import { lumaRange, toFullRange } from "../lib/shotTrack/grayRange";
import { grayStats, type Notes } from "../lib/shotTrack/notes";
import { within } from "../lib/shotTrack/stall";
import { codecRead, codecScan, dropCodec, openCodec, reasonOf } from "./codecFrames";

/**
 * Frames read out of a video file in the browser, for the shot tracer
 * (Settings, Labs): a stretch of the file (`ReadPlan`; where it starts and
 * ends is `lib/shotTrack/shotWindow.ts`), at most `MAX_PIXELS` a frame and kept
 * in gray, at the rate the plan asks for. A portrait video is cropped to the
 * band of its height the lane is in before it is scaled (`laneBand`), so the
 * lane reaches the finder at close to the video's own scale: a 1080 by 1920
 * original is read at 940 by 735 of its middle rather than 624 by 1109 of the
 * whole, ceiling and approach floor included, on which the lane was not found.
 *
 * Decoded first (`codecFrames.ts`, WebCodecs): the file's own frames as fast
 * as the decoder goes. Where the browser has no `VideoDecoder`, the file is
 * not an MP4 or MOV this reader knows, the decoder will not take its stream or
 * fails part way, the video is played instead, as below, and the reason is
 * carried in `via` (or in the error, when playing fails too) for the screen's
 * details line.
 *
 * Played: where the browser has
 * `requestVideoFrameCallback`, each frame it presents is offered as it comes,
 * at its own time (the copy's `timestamp`, else `mediaTime`), never an assumed
 * even spacing. Which frames are kept is fixed by the video's own frames, not
 * by which ones the browser happened to hand over (`FrameSlots`): every `m`th
 * of them from the start. A frame the browser passed over is found from the
 * gap in the media times and read again by going back to it and playing that
 * stretch more slowly (`refill`), so two reads of one video keep the same
 * frames. Before this, a 120 fps phone video read at 60 kept 237 frames over
 * 4.6 s, where there are 276, and its laydown read 18.7 one time and 27.3
 * another. Seeking a frame at a time (the
 * fallback, and how it was first read) decodes from the last keyframe on every
 * seek: 240 of them took 39 seconds for a 4 second clip in desktop Chromium,
 * and minutes for a 4K phone clip.
 *
 * A frame is taken as the decoder gave it where the browser can copy it out
 * (`VideoFrame`): its luma plane is the video's own gray, read in under a
 * millisecond, where drawing it to a canvas took 36. Anything else (a flipped
 * or stretched frame, a pixel format not handled here) is drawn to a canvas,
 * as before.
 *
 * Playback that will not start at all hands over to the seek loop, so the read
 * always ends. Needs a real browser's decoder, so it is not unit tested; the
 * pure parts are in `marking.ts` and `mp4.ts`.
 */

export interface VideoFrames {
  width: number;
  height: number;
  /** Grey frames, one byte a pixel. */
  gray: Uint8ClampedArray[];
  /** Each frame's own time in the video, seconds. */
  times: number[];
  /** The video's own step between frames, seconds, when it was seen. */
  src: number | null;
  /** The step between the frames kept, seconds. */
  step: number;
  /** Frames the read should have kept and could not get, after going back for them. */
  missing: number;
  /** How the frames were read, for the details line: `WebCodecs <codec> ...`, or `playback (...)` and why not decoded. */
  via?: string;
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
      const error = (target as HTMLVideoElement).error;
      reject(new Error(error ? `video error ${error.code}${error.message ? `: ${error.message}` : ""}` : `video ${name} failed`));
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
/** The longest a played frame's copy (`copyTo`) may take, milliseconds. */
const COPY_MS = 5000;
/**
 * The rate playback starts at, before the video's own frame rate is known:
 * a 120 fps clip shows 30 frames a second at it, which the browser hands over
 * whole (`playbackRateFor`). It only slows from there.
 */
const START_RATE = 0.25;
/** The steps between frames shown that a read learns the video's own step from (`sourceStep`). */
const STEPS_TO_LEARN = 8;
/** A copied frame's own time is taken over the announced one only this near it, seconds. */
const OWN_TIME_WITHIN = 0.05;
/** Frames kept between each new choice of rate. */
const RATE_EVERY = 8;
/** How far before a stretch each pass starts playing, seconds: the frames before it say where the video's frames fall. */
const PREROLL = 0.1;
/** Passes over the frames the first one missed, each at half the rate of the one before. */
const REFILL_PASSES = 3;

/** What one read of a stretch asks for. */
export interface ReadPlan {
  from: number;
  to: number;
  /** Frames a second to keep (`keptFps`). */
  fps: number;
  /** The band of a portrait picture's height to keep (`laneBand`), null for all of it. */
  band: { top: number; bottom: number } | null;
  /** A read in parts: a frame the part before kept, and the video's own step, which this part carries on from. */
  after?: { t: number; src: number };
}

interface Reading {
  video: FrameVideo;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** The rows of the shown picture kept, `videoHeight` pixels. */
  rows: { y: number; h: number };
  /** Each frame kept, by its place; null where its copy failed or it was let go. */
  gray: (Uint8ClampedArray | null)[];
  times: number[];
  /** Frames kept before the video's step was known, let go once it was. */
  dropped: Set<number>;
  /** Frames copied out and still being turned to grey, in order. */
  pending: Promise<void>;
  /** Whether frames are copied out of the decoder (`VideoFrame`), drawn to the canvas, or not yet known. */
  planes: boolean | undefined;
  /** Milliseconds each recent frame took to keep. */
  cost: number[];
  plan: ReadPlan;
  /** Which frames to keep, once the video's step is known. */
  slots: FrameSlots | null;
  /** The times of the frames shown before then. */
  early: number[];
  /** Frames shown whose copy came out at another time than announced (`VideoFrame.timestamp`). */
  late: number;
  onProgress: (fraction: number) => void;
}

interface Frame {
  format: string | null;
  visibleRect: { width: number; height: number } | null;
  rotation?: number;
  flip?: boolean;
  /** Microseconds into the video: the frame's own time. */
  timestamp?: number | null;
  /** What the decoder says of its color; `fullRange` is the luma's range (`grayRange.ts`). */
  colorSpace?: { fullRange?: boolean | null } | null;
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

/** Turns a frame copied out of the decoder into the gray picture the tracer reads. */
function planeGray(
  r: Reading,
  f: { format: string; w: number; h: number; turn: number; fullRange: boolean | null },
  buf: Uint8Array,
  layout: { offset: number; stride: number }
): Uint8ClampedArray {
  const quarter = f.turn % 180 !== 0;
  const outW = quarter ? r.height : r.width;
  const outH = quarter ? r.width : r.height;
  // The band kept, in the plane's own (unturned) pixels.
  const c = planeCrop({ top: r.rows.y / r.video.videoHeight, bottom: (r.rows.y + r.rows.h) / r.video.videoHeight }, f.w, f.h, f.turn);
  let gray: Uint8ClampedArray;
  if (LUMA_FIRST.has(f.format)) {
    // In the range the video was recorded in: brought to full range.
    gray = toFullRange(resampleGray(buf, c.w, c.h, layout.stride, layout.offset + c.y * layout.stride + c.x, outW, outH), lumaRange(f.fullRange, null));
  } else {
    // An RGB frame is in full range like a canvas.
    const luma = lumaOf(buf, c.w, c.h, layout.stride, layout.offset + c.y * layout.stride + 4 * c.x, f.format.startsWith("B"));
    gray = resampleGray(luma, c.w, c.h, c.w, 0, outW, outH);
  }
  return rotateGray(gray, outW, outH, f.turn);
}

/** Draws the video's current frame to the canvas and keeps it in grey. */
function drawn(r: Reading): Uint8ClampedArray {
  r.ctx.drawImage(r.video, 0, r.rows.y, r.video.videoWidth, r.rows.h, 0, 0, r.width, r.height);
  return toGray(r.ctx.getImageData(0, 0, r.width, r.height).data, r.width, r.height);
}

/**
 * The frame the video is showing, copied out of the decoder where it can be
 * (`VideoFrame`), with its own time. The time the browser announces a frame
 * at is not always the frame a copy gets: at a half, one copy in eight of a
 * 120 fps clip was the next frame. Null where frames are drawn instead.
 */
function grab(r: Reading): Frame | null {
  const Ctor = (globalThis as { VideoFrame?: FrameCtor }).VideoFrame;
  if (!Ctor || r.planes === false) return null;
  let frame: Frame | null = null;
  try {
    frame = new Ctor(r.video);
    if (r.planes === undefined) r.planes = planesFit(frame, r.video);
    if (r.planes) return frame;
    frame.close();
  } catch {
    frame?.close();
    r.planes = false;
  }
  return null;
}

/** Keeps a frame at `at` seconds: the one copied out (`grab`), or else drawn from the video now. */
function keep(r: Reading, at: number, frame: Frame | null): number {
  const started = performance.now();
  const index = r.times.length;
  r.times.push(at);
  r.gray.push(null);
  if (!frame) {
    r.gray[index] = drawn(r);
    r.cost.push(performance.now() - started);
    return index;
  }
  const f = frame;
  const shape = { format: f.format!, w: f.visibleRect!.width, h: f.visibleRect!.height, turn: f.rotation ?? 0, fullRange: f.colorSpace?.fullRange ?? null };
  const buf = new Uint8Array(f.allocationSize());
  // Copied at once, so the decoder has its frame back; turned to grey in order.
  // Bounded: a copy that never ends would hold every wait on `r.pending`, and the screen, for ever; it is lost and drawn instead.
  const copied = within(f.copyTo(buf), COPY_MS, "copying a played frame").finally(() => f.close());
  const before = performance.now() - started;
  r.pending = r.pending.then(async () => {
    try {
      const layout = await copied;
      if (r.dropped.has(index)) return;
      const t0 = performance.now();
      r.gray[index] = planeGray(r, shape, buf, layout[0]);
      r.cost.push(before + performance.now() - t0);
    } catch {
      // That frame is lost; the next is drawn instead.
      r.planes = false;
    }
  });
  return index;
}

/**
 * Plays from a little before `from` and offers each frame shown to `judge`,
 * by its own time; a frame judged kept is kept, and the last one ends the
 * pass. Resolves true when a frame at or past `to` is shown or the last is
 * kept, false when playback will not start, stalls, runs past its time or
 * ends.
 */
async function playPass(r: Reading, from: number, to: number, rate: number, judge: (t: number) => "keep" | "skip" | "last"): Promise<boolean> {
  const video = r.video;
  const request = video.requestVideoFrameCallback!.bind(video);
  let handle = 0;
  let stall: ReturnType<typeof setTimeout> | undefined;
  let finish!: (whole: boolean) => void;
  const finished = new Promise<boolean>((resolve) => (finish = resolve));
  let over = false;
  let last = -Infinity;
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
  const ended = () => stop(false);
  const stalled = () => stop(false);
  const watch = (ms: number) => {
    clearTimeout(stall);
    stall = setTimeout(stalled, ms);
  };
  const onFrame = (_: number, meta: FrameMeta) => {
    if (over) return;
    const frame = grab(r);
    // The copy's own time where it is near the announced one: a browser that
    // stamps its copies some other way (from zero, or not at all) is not trusted.
    const own = frame?.timestamp;
    const near = typeof own === "number" && Number.isFinite(own) && Math.abs(own / 1e6 - meta.mediaTime) < OWN_TIME_WITHIN;
    const at = near ? own / 1e6 : meta.mediaTime;
    if (near && Math.abs(at - meta.mediaTime) > 1e-4) r.late++;
    if (at <= last + 1e-5) {
      // The same frame shown again.
      frame?.close();
      handle = request(onFrame);
      return;
    }
    last = at;
    if (at >= to - 1e-4) {
      frame?.close();
      return stop(true);
    }
    const said = judge(at);
    if (said === "skip") frame?.close();
    else keep(r, at, frame);
    if (said === "last") return stop(true);
    watch(STALL_MS);
    handle = request(onFrame);
  };
  // However the frames come, it ends: the stretch at the slowest rate, and a margin.
  const overrun = setTimeout(stalled, ((to - from + PREROLL) / Math.min(rate, START_RATE)) * 1000 + FIRST_FRAME_MS);
  video.addEventListener("ended", ended);
  watch(FIRST_FRAME_MS);
  // Asked before the seek, so the frame the seek lands on is offered too.
  handle = request(onFrame);
  const start = Math.max(0, from - PREROLL);
  if (Math.abs(video.currentTime - start) > 1e-4) {
    video.currentTime = start;
    await once(video, "seeked", FIRST_FRAME_MS).catch(() => false);
  }
  video.playbackRate = rate;
  try {
    // Or the pass's own end: a play that never settles must not hold it once its timers have stopped it.
    if (!over) await Promise.race([video.play(), finished]);
  } catch {
    stalled();
  }
  return finished;
}

/**
 * The first pass over the stretch: every frame shown is offered to the grid
 * of frames to keep (`FrameSlots`), which is laid once the video's own step
 * is known from the first few frames shown (until then each is kept, and those
 * off the grid let go). The rate slows to what the video's frame rate and the
 * cost of keeping a frame allow, and further when frames are passed over.
 */
async function firstPass(r: Reading): Promise<boolean> {
  const { from, to, fps, after } = r.plan;
  let rate = after ? playbackRateFor(0, after.src, after.src * Math.max(1, Math.round(1 / (fps * after.src)))) : START_RATE;
  const lay = (src: number) => {
    r.slots = new FrameSlots(from, to, fps, src, after?.t);
    // Those kept before the grid was known, judged again.
    r.times.forEach((t, i) => {
      if (!r.slots!.offer(t)) {
        r.dropped.add(i);
        r.gray[i] = null;
      }
    });
    rate = Math.min(rate, playbackRateFor(0, src, r.slots.step));
    r.video.playbackRate = rate;
  };
  if (after) r.slots = new FrameSlots(from, to, fps, after.src, after.t);
  let missed = 0;
  let slowed = false;
  return playPass(r, from, to, rate, (t) => {
    r.onProgress(0.85 * readProgress(t, from, to));
    if (!r.slots) {
      r.early.push(t);
      const steps = r.early.slice(1).map((x, i) => x - r.early[i]);
      const src = steps.length >= STEPS_TO_LEARN ? sourceStep(steps) : null;
      if (src === null) return t >= from - 0.004 ? "keep" : "skip";
      lay(src);
    }
    const slots = r.slots!;
    if (!slots.offer(t)) return "skip";
    if (slots.missing.length > missed) {
      // Frames went by unkept: slower, once. Halving at every gap, as at
      // first, slowed IMG_1996's reads to a sixteenth, 19 to 29 s where 7 to
      // 10 do; the frames passed over are read again after (`refill`)
      // whatever the rate.
      missed = slots.missing.length;
      if (!slowed) rate = slowerRate(rate);
      slowed = true;
      r.video.playbackRate = rate;
    }
    const kept = r.times.length - r.dropped.size + 1;
    if (kept % RATE_EVERY === 0) {
      rate = Math.min(rate, playbackRateFor(median(r.cost.slice(-2 * RATE_EVERY)), slots.src, slots.step));
      r.video.playbackRate = rate;
    }
    return "keep";
  });
}

/**
 * Goes back for the frames the first pass missed, by playing each stretch of
 * them again at half the rate, then a quarter: the frames are the same
 * whichever were passed over the first time, so two reads keep the same
 * frames. Returns how many are still missing after the last pass.
 */
async function refill(r: Reading): Promise<{ passes: number; left: number }> {
  const slots = r.slots;
  if (!slots) return { passes: 0, left: 0 };
  let wanted = [...slots.missing];
  const total = wanted.length;
  let found = 0;
  let rate = r.video.playbackRate;
  let passes = 0;
  for (; passes < REFILL_PASSES && wanted.length; passes++) {
    rate = slowerRate(rate);
    const still: number[] = [];
    for (const run of missingRuns(wanted, slots.src, 0.25)) {
      const left = [...run.instants];
      await playPass(r, run.from, run.to, rate, (t) => {
        const k = claimFrame(left, t, slots.src);
        if (k < 0) return "skip";
        left.splice(k, 1);
        r.onProgress(0.85 + 0.15 * (++found / Math.max(1, total)));
        return left.length ? "keep" : "last";
      });
      still.push(...left);
    }
    wanted = still;
  }
  await r.pending;
  return { passes, left: wanted.length };
}

/**
 * Seeks a frame at a time from where the reading got to. Drawn, not copied:
 * a frame copied from a paused video after a seek was the first frame again
 * in Chromium, every time.
 */
async function readBySeeking(r: Reading): Promise<void> {
  await r.pending;
  r.planes = false;
  const { from, to, fps } = r.plan;
  const kept = r.times.filter((_, i) => !r.dropped.has(i));
  const last = kept[kept.length - 1];
  const start = last === undefined ? from : last + 1 / fps;
  const times = frameTimes(start, to, fps, 4000);
  for (const want of times) {
    const at = await seekTo(r.video, Math.min(want + SEEK_INTO, r.video.duration));
    r.onProgress(readProgress(want, from, to));
    const prev = r.times[r.times.length - 1];
    if (prev !== undefined && at - prev <= 0.75 / fps) continue;
    keep(r, at, null);
    await r.pending;
  }
}

/**
 * Reads the frames of `file` the plan asks for: from `from` to `to` seconds,
 * `fps` a second, of a portrait video only the band of its height in `band`
 * (fractions, `laneBand`). Each frame carries its own time in the video.
 * `onProgress` is told how far it has got, 0 to 1 and never backwards.
 */
export async function readVideoFrames(file: Blob, onProgress: (fraction: number) => void, plan: ReadPlan, notes?: Notes): Promise<VideoFrames> {
  let reached = 0;
  const progress = (f: number) => {
    if (f > reached) onProgress((reached = f));
  };
  const codec = await openCodec(file);
  let why = typeof codec === "string" ? codec : "";
  if (typeof codec !== "string") {
    try {
      return await codecRead(codec, plan, progress, notes);
    } catch (e) {
      why = `failed: ${reasonOf(e)}`;
      notes?.add("read", `decoding failed (${reasonOf(e)}), played instead`);
      dropCodec(file, why);
      console.info(`Shot tracer: decoding failed (${reasonOf(e)}); playing the video instead`);
    }
  }
  try {
    const read = await playRead(file, progress, plan);
    notes?.add("read", `playback ${plan.from.toFixed(2)} to ${plan.to.toFixed(2)} s at ${plan.fps} fps: ${read.gray.length} frames, ${read.missing} missing, ${read.width}x${read.height}${read.gray[0] ? `, gray ${grayStats(read.gray[0])}` : ""}`);
    return { ...read, via: `playback (WebCodecs ${why})` };
  } catch (e) {
    throw new Error(`playback: ${reasonOf(e)} (WebCodecs ${why})`);
  }
}

/**
 * Loads the video and has it ready to give frames. iOS Safari loads no frame
 * (and, in a detached element, at times not even the metadata) until the
 * video is played, whatever `preload` says, so it is played muted and inline
 * at once rather than after `loadeddata`, which there never came: every phone
 * video ended on "couldn't be read" after a 10 s wait. Then paused and put back
 * at the start. Rejects with a short reason.
 */
async function startVideo(video: FrameVideo, url: string): Promise<void> {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.preload = "auto";
  video.src = url;
  video.load();
  const meta = once(video, "loadedmetadata");
  meta.catch(() => {});
  let play = "play not started";
  const played = video.play().then(
    () => (play = "playing"),
    (e: unknown) => (play = `play refused: ${reasonOf(e)}`)
  );
  if (video.readyState < 1 && !(await meta)) throw new Error("no metadata after 10 s");
  const began = performance.now();
  while (video.readyState < 2) {
    if (video.error) throw new Error(`video error ${video.error.code}${video.error.message ? `: ${video.error.message}` : ""}`);
    if (performance.now() - began > 10000) throw new Error(`no data after 10 s (ready state ${video.readyState}, ${play})`);
    await new Promise((r) => setTimeout(r, 50));
  }
  // The play asked for may not have started yet: wait a moment for it before pausing, so it does not start after.
  await Promise.race([played, new Promise((r) => setTimeout(r, 1000))]);
  video.pause();
  if (video.currentTime > 1e-3) {
    video.currentTime = 0;
    await once(video, "seeked", 2000).catch(() => false);
  }
}

/** The play and seek path of `readVideoFrames`. */
async function playRead(file: Blob, progress: (fraction: number) => void, plan: ReadPlan): Promise<VideoFrames> {
  const url = URL.createObjectURL(file);
  const video: FrameVideo = document.createElement("video");
  const began = performance.now();
  try {
    await startVideo(video, url);
    const rows = bandRows(video.videoHeight, plan.band);
    const { width, height } = scaledSize(video.videoWidth, rows.h, MAX_PIXELS);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no canvas");
    const duration = Number.isFinite(video.duration) ? video.duration : plan.to;
    const from = Math.max(0, Math.min(plan.from, duration));
    const to = Math.min(duration, plan.to);
    const r: Reading = {
      video,
      ctx,
      width,
      height,
      rows,
      gray: [],
      times: [],
      dropped: new Set(),
      pending: Promise.resolve(),
      planes: undefined,
      cost: [],
      plan: { ...plan, from, to },
      slots: null,
      early: [],
      late: 0,
      onProgress: progress
    };
    let whole = false;
    let fill = { passes: 0, left: 0 };
    if (hasFrameCallback(video) && to > from) {
      whole = await firstPass(r);
      await r.pending;
      // Frames passed over between the last kept and the end are missing too,
      // however the pass ended.
      r.slots?.close();
      const kept = r.times.length - r.dropped.size;
      // Playing gave something: go back for what it missed. Nothing at all: seek.
      if (kept > 0 && r.slots) {
        fill = await refill(r);
        whole = true;
      }
    }
    await r.pending;
    const played = r.times.length - r.dropped.size;
    const copied = r.planes === true;
    if (!whole && to > from) {
      // Copied frames of an HDR clip are brighter than drawn ones (the canvas
      // tone-maps it): one read is all one or all the other.
      if (copied) {
        r.times = [];
        r.gray = [];
        r.dropped.clear();
      }
      await readBySeeking(r);
    }
    // In time order: the passes after the first fill in between.
    const order = r.times.map((t, i) => ({ t, g: r.gray[i] })).filter((x) => x.g).sort((a, b) => a.t - b.t);
    const gray = order.map((x) => x.g!);
    const times = order.map((x) => x.t);
    const src = r.slots?.src ?? plan.after?.src ?? null;
    console.info(
      `Shot tracer: read ${gray.length} frames (${played} while playing, ${copied ? "copied" : "drawn"}, ` +
        `${fill.passes} passes back for ${r.slots?.missing.length ?? 0} missed, ${fill.left} still missing, ${r.late} shown late) ` +
        `from ${from.toFixed(3)} s to ${(times[times.length - 1] ?? from).toFixed(3)} s at ${plan.fps.toFixed(0)} fps of a ${src ? (1 / src).toFixed(1) : "?"} fps video, ` +
        `rows ${rows.y} to ${rows.y + rows.h} of ${video.videoWidth} by ${video.videoHeight} at ${width} by ${height}, ` +
        `in ${((performance.now() - began) / 1000).toFixed(1)} s, rate ${video.playbackRate}, ${median(r.cost).toFixed(1)} ms a frame`
    );
    return { width, height, gray, times, src, step: r.slots?.step ?? 1 / plan.fps, missing: fill.left };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * The rate the first look plays at. Chromium on a 1080 by 1920 VP9 clip: 4
 * gave a frame every 0.067 s of video (15 a second) and read 7 s in 4.5.
 * Slower, so that a 60 Hz screen shows every frame (0.45 for a 120 fps video),
 * was tried (2026-11-16): the look took 16 s rather than 4 on IMG_1996, and
 * once the runs were judged on the lane (`shotWindow.ts`) and the clips' band
 * was read first, the window and the readings repeated at this rate as well.
 */
const SCAN_RATE = 2;
/** The most seeks the first look makes where it cannot play: a frame every `duration / SCAN_SEEKS` seconds at the least. */
const SCAN_SEEKS = 300;

/** What the first look learned about the video as a whole. */
export interface ScannedVideo {
  /** The picture as shown, pixels (`videoWidth` by `videoHeight`). */
  width: number;
  height: number;
  duration: number;
  /** How the frames were read, for the details line (as `VideoFrames.via`). */
  via?: string;
}

/**
 * The first look at a whole video (`lib/shotTrack/shotStart.ts`): small grey
 * frames, `COARSE_WIDTH` wide, about `COARSE_FPS` a second, each handed to
 * `onFrame` as it is drawn (so they need not all be kept). Read by playing the
 * video fast, muted, and keeping a frame from each one shown that is far
 * enough past the last; a frame drawn whole to a small canvas costs 8 to 14
 * ms in desktop Chromium. Where the browser cannot say which frame it shows,
 * or playback will not start or stalls, by seeking at coarse steps from where
 * it got to. `onProgress` is told how far it has got, 0 to 1.
 */
export async function scanVideo(
  file: Blob,
  onFrame: (frame: CoarseFrame) => void,
  onProgress: (fraction: number) => void,
  notes?: Notes
): Promise<ScannedVideo> {
  // Frames go on in time order whichever path gives them: after a decode that
  // failed part way, playing hands on only those past the last one given.
  let last = -Infinity;
  let given = 0;
  let late = 0;
  const looks: string[] = [];
  const give = (frame: CoarseFrame) => {
    if (frame.t <= last) {
      late++;
      return;
    }
    last = frame.t;
    if (given === 0 || given === 40) looks.push(`#${given} ${grayStats(frame.data)}`);
    given++;
    onFrame(frame);
  };
  let reached = 0;
  const progress = (f: number) => {
    if (f > reached) onProgress((reached = f));
  };
  const codec = await openCodec(file);
  let why = typeof codec === "string" ? codec : "";
  if (typeof codec !== "string") {
    try {
      const scanned = await codecScan(codec, give, progress, notes);
      notes?.set("path", `WebCodecs ${codec.config.codec}`);
      return scanned;
    } catch (e) {
      why = `failed: ${reasonOf(e)}`;
      dropCodec(file, why);
      console.info(`Shot tracer: decoding failed (${reasonOf(e)}); playing the video instead`);
    }
  }
  notes?.set("path", `playback (WebCodecs ${why})`);
  try {
    const scanned = await playScan(file, give, progress);
    notes?.set("look", `${given} frames by playback (${late} dropped as not after the last), ${scanned.width}x${scanned.height}, ${scanned.duration.toFixed(2)} s, gray mean/min/max ${looks.join(" ")}`);
    return { ...scanned, via: `playback (WebCodecs ${why})` };
  } catch (e) {
    throw new Error(`playback: ${reasonOf(e)} (WebCodecs ${why})`);
  }
}

/** The play and seek path of `scanVideo`. */
async function playScan(file: Blob, onFrame: (frame: CoarseFrame) => void, onProgress: (fraction: number) => void): Promise<ScannedVideo> {
  const url = URL.createObjectURL(file);
  const video: FrameVideo = document.createElement("video");
  const began = performance.now();
  try {
    await startVideo(video, url);
    const duration = video.duration;
    if (!(duration > 0) || !Number.isFinite(duration)) throw new Error("no duration");
    const width = COARSE_WIDTH;
    const height = Math.max(2, Math.round((COARSE_WIDTH * video.videoHeight) / video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no canvas");
    let last = -Infinity;
    let count = 0;
    const take = (t: number) => {
      ctx.drawImage(video, 0, 0, width, height);
      onFrame({ width, height, data: toGray(ctx.getImageData(0, 0, width, height).data, width, height), t });
      last = t;
      count++;
      onProgress(Math.min(1, t / duration));
    };
    // The next slot of the grid wanted (`gridSlot`).
    let next = 0;
    // Frames taken past their slot: the one on it went by unseen.
    let offSlot = 0;
    const onGrid = (t: number) => {
      const after = gridSlot(t, next, COARSE_FPS);
      if (after === null) return false;
      if (t - (after - 1) / COARSE_FPS > 0.004) offSlot++;
      next = after;
      return true;
    };
    if (hasFrameCallback(video))
      await new Promise<void>((resolve) => {
        let handle = 0;
        let over = false;
        let stall: ReturnType<typeof setTimeout> | undefined;
        const stop = () => {
          if (over) return;
          over = true;
          clearTimeout(stall);
          clearTimeout(overrun);
          video.cancelVideoFrameCallback?.(handle);
          video.removeEventListener("ended", stop);
          video.pause();
          resolve();
        };
        const watch = (ms: number) => {
          clearTimeout(stall);
          stall = setTimeout(stop, ms);
        };
        const onShown = (_: number, meta: FrameMeta) => {
          if (over) return;
          if (onGrid(meta.mediaTime)) {
            take(meta.mediaTime);
            watch(STALL_MS);
          }
          handle = video.requestVideoFrameCallback!(onShown);
        };
        // However the frames come, it ends: the video at real time, and a margin.
        const overrun = setTimeout(stop, duration * 1000 + FIRST_FRAME_MS);
        video.addEventListener("ended", stop);
        handle = video.requestVideoFrameCallback!(onShown);
        watch(FIRST_FRAME_MS);
        video.playbackRate = SCAN_RATE;
        video.play().catch(stop);
      });
    // What playing did not reach, by seeking.
    const stride = Math.max(1 / COARSE_FPS, duration / SCAN_SEEKS);
    for (let t = Math.max(0, last + stride); t < duration - 1e-3; t += stride) {
      const at = await seekTo(video, t);
      if (at > last && onGrid(at)) take(at);
    }
    console.info(`Shot tracer: looked at ${count} frames of ${duration.toFixed(1)} s in ${((performance.now() - began) / 1000).toFixed(1)} s, rate ${video.playbackRate.toFixed(2)}, ${offSlot} off their slot`);
    return { width: video.videoWidth, height: video.videoHeight, duration };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
