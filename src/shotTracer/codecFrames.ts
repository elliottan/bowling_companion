import { readPick, scanPick, type PickPlan } from "../lib/shotTrack/framePick";
import { lumaRange, toFullRange } from "../lib/shotTrack/grayRange";
import { COARSE_WIDTH, type CoarseFrame } from "../lib/shotTrack/shotStart";
import { planeCrop, planeGray, readProgress, sourceStep, toGray } from "../lib/shotTrack/marking";
import { grayStats, type Notes } from "../lib/shotTrack/notes";
import { blobSource, Mp4Error, nearestStamp, readVideoTrack, shownTimes, spanStamps, stampOf, type VideoTrack } from "../lib/shotTrack/mp4";

/**
 * Frames read out of a video file by decoding it (WebCodecs' `VideoDecoder`),
 * not by playing it: the file's own frames, every one of them, each at its own
 * time from the file, as fast as the decoder goes. The container is read here
 * (`lib/shotTrack/mp4.ts`, the `moov` box alone), the frames fed to the
 * decoder from the keyframe at or before the stretch wanted, and each one the
 * read keeps turned to grey: its luma plane copied out where the decoder's
 * format has one (8, 10 or 12 bits) and brought to full range
 * (`grayRange.ts`), else drawn to a canvas. Frames come
 * unturned from a decoder; a phone's portrait video is turned here by its
 * track matrix.
 *
 * Playing (`videoFrames.ts`) was bound to the clock: IMG_1996's 7 s took 11 s
 * to look over and 17 s to read in desktop Chromium, and on an iPhone a video
 * element that was never played gave no frame at all. This path is used where
 * the browser has `VideoDecoder` (Safari since 16.4), the file is an MP4 or MOV
 * of H.264, HEVC or VP9, and the decoder says it takes that stream; anything
 * else, or a decoder that fails part way, falls back to playing, and the reason
 * is kept for the screen's details line.
 *
 * Needs a real browser's decoder, so it is not unit tested here; the container
 * and the choices of frames are in `lib/shotTrack` (`mp4.ts`, `marking.ts`).
 */

/** A file the decoder takes: its track and the configuration that was accepted. */
export interface CodecVideo {
  file: Blob;
  track: VideoTrack;
  config: VideoDecoderConfig;
}

/** One answer per file chosen, so the first look and the read agree on the path. */
const opened = new WeakMap<Blob, Promise<CodecVideo | string>>();

/**
 * The file as a `CodecVideo`, or why it cannot be decoded here (a short
 * reason: no `VideoDecoder`, a container or codec not handled, a stream the
 * decoder will not take).
 */
export function openCodec(file: Blob): Promise<CodecVideo | string> {
  let known = opened.get(file);
  if (!known) {
    known = open(file);
    opened.set(file, known);
  }
  return known;
}

/** After a decode that failed part way: the file is read by playing from now on, with this reason. */
export function dropCodec(file: Blob, why: string): void {
  opened.set(file, Promise.resolve(why));
}

async function open(file: Blob): Promise<CodecVideo | string> {
  if (typeof VideoDecoder === "undefined" || typeof VideoFrame === "undefined") return "no VideoDecoder";
  let track: VideoTrack;
  try {
    track = await readVideoTrack(blobSource(file));
  } catch (e) {
    return e instanceof Mp4Error ? e.message : `container: ${reasonOf(e)}`;
  }
  if (!track.samples.length) return "no frames in the track";
  const base: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.codedWidth,
    codedHeight: track.codedHeight,
    ...(track.description ? { description: track.description } : {})
  };
  // Hardware first where the browser says it has it for this stream.
  for (const hardwareAcceleration of ["prefer-hardware", "no-preference"] as const) {
    try {
      const { supported } = await VideoDecoder.isConfigSupported({ ...base, hardwareAcceleration });
      if (supported) return { file, track, config: { ...base, hardwareAcceleration } };
    } catch (e) {
      return `codec ${track.codec}: ${reasonOf(e)}`;
    }
  }
  return `codec ${track.codec} not supported`;
}

/** An error's message, short. */
export function reasonOf(e: unknown): string {
  const text = e instanceof Error ? e.message || e.name : String(e);
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

/** No frame out of the decoder for this long while it has work, milliseconds: it has stalled. */
const STALL_MS = 8000;
/** Chunks queued in the decoder at most, and frames out of it waiting to be turned to grey. */
const QUEUE = 6;
const WAITING = 3;
/** The most bytes read from the file at once, for a run of frames next to each other. */
const READ_BYTES = 4 << 20;

/** What a decode pass did. */
interface Decoded {
  /** Frames out of the decoder. */
  out: number;
  /** Chunks fed. */
  fed: number;
  ms: number;
  /** Frames that came out with a time before one already out (handed out in decode order, not shown order). */
  backwards: number;
  /** Frames whose time was not their sample's to the microsecond, but near it (rounded or rebased by the decoder). */
  moved: number;
  /** Frames matching no sample of the stretch, and frames that came out twice. */
  stray: number;
  /** Frames wanted that never came out. */
  lost: number;
}

/**
 * Decodes samples `first` to `last` of the track and hands each frame out of
 * the decoder that is one of `wanted` (by its sample's stamp, `stampOf`, to
 * its place in the read) to `handle`, which must close it. A frame is matched
 * to its sample by time (`nearestStamp`), whatever order frames come out in
 * and however the decoder rounds their times, and carries its sample's time.
 * The rest are closed at once, so the decoder has them back: a phone's
 * hardware decoder has only a few. Feeding waits while the decoder's queue or
 * the frames waiting are full.
 */
async function decodeRange(
  cv: CodecVideo,
  first: number,
  last: number,
  wanted: Map<number, number>,
  handle: (frame: VideoFrame, t: number, place: number) => Promise<void> | void
): Promise<Decoded> {
  const began = performance.now();
  const stamps = spanStamps(cv.track.samples, first, last);
  const waiting: { frame: VideoFrame; t: number; place: number }[] = [];
  const seen = new Set<number>();
  let failed: unknown = null;
  let out = 0;
  let backwards = 0;
  let moved = 0;
  let stray = 0;
  let latest = -Infinity;
  let woke: (() => void) | null = null;
  let activity = performance.now();
  const wake = () => {
    activity = performance.now();
    woke?.();
  };
  const decoder = new VideoDecoder({
    output: (frame) => {
      out++;
      const at = frame.timestamp;
      if (at < latest) backwards++;
      latest = Math.max(latest, at);
      const k = nearestStamp(stamps, at);
      const stamp = k >= 0 ? stamps[k] : NaN;
      if (k >= 0 && stamp !== at) moved++;
      const place = k >= 0 && !seen.has(stamp) ? wanted.get(stamp) : undefined;
      if (k < 0 || seen.has(stamp)) stray++;
      if (k >= 0) seen.add(stamp);
      if (failed || place === undefined) frame.close();
      else waiting.push({ frame, t: stamp / 1e6, place });
      wake();
    },
    error: (e) => {
      failed = e;
      wake();
    }
  });
  decoder.addEventListener?.("dequeue", wake);
  const tick = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        woke = null;
        resolve();
      }, 10);
      woke = () => {
        clearTimeout(timer);
        woke = null;
        resolve();
      };
    });
  const drainOne = async () => {
    const next = waiting.shift()!;
    try {
      await handle(next.frame, next.t, next.place);
    } finally {
      next.frame.close();
    }
    activity = performance.now();
  };
  const check = () => {
    if (failed) throw new Error(`decoder: ${reasonOf(failed)}`);
    if (performance.now() - activity > STALL_MS) throw new Error(`decoder stalled after ${out} frames`);
  };
  const samples = cv.track.samples;
  const source = blobSource(cv.file);
  let fed = 0;
  try {
    decoder.configure(cv.config);
    let bytes: Uint8Array | null = null;
    let bytesFrom = 0;
    for (let i = first; i <= last; i++) {
      const s = samples[i];
      if (!bytes || s.offset < bytesFrom || s.offset + s.size > bytesFrom + bytes.length) {
        // A run of samples at once: from this one as far as READ_BYTES reaches.
        let end = s.offset + s.size;
        for (let j = i + 1; j <= last; j++) {
          const n = samples[j];
          if (n.offset < s.offset || n.offset + n.size - s.offset > READ_BYTES) break;
          end = Math.max(end, n.offset + n.size);
        }
        bytesFrom = s.offset;
        bytes = await source.read(s.offset, end - s.offset);
      }
      for (;;) {
        check();
        if (waiting.length) await drainOne();
        else if (decoder.decodeQueueSize >= QUEUE || waiting.length >= WAITING) await tick();
        else break;
      }
      decoder.decode(
        new EncodedVideoChunk({
          type: s.key ? "key" : "delta",
          // Whole microseconds: the stamp the frame is matched back by.
          timestamp: stampOf(s.t),
          duration: Math.round(s.duration * 1e6),
          data: bytes.subarray(s.offset - bytesFrom, s.offset - bytesFrom + s.size)
        })
      );
      fed++;
    }
    let flushed = false;
    const flush = decoder.flush().then(
      () => {
        flushed = true;
        wake();
      },
      (e: unknown) => {
        failed ??= e;
        wake();
      }
    );
    while (!flushed || waiting.length) {
      check();
      if (waiting.length) await drainOne();
      else await Promise.race([flush, tick()]);
    }
    check();
  } finally {
    for (const w of waiting) w.frame.close();
    if (decoder.state !== "closed") decoder.close();
  }
  let lost = 0;
  for (const stamp of wanted.keys()) if (!seen.has(stamp)) lost++;
  return { out, fed, ms: performance.now() - began, backwards, moved, stray, lost };
}

/** A decode pass as a line of the details: what came out of the decoder and how it matched the file. */
function decodedNote(d: Decoded, kept: number): string {
  return `${d.fed} fed, ${d.out} out, ${kept} kept, ${d.lost} lost, ${d.backwards} out of order, ${d.moved} times moved, ${d.stray} stray, ${(d.ms / 1000).toFixed(1)} s`;
}

/** The track as a line of the details. */
export function trackNote(track: VideoTrack, config: VideoDecoderConfig): string {
  const shown = shownTimes(track.samples);
  const steps = shown.slice(1).map((t, i) => t - shown[i]);
  const src = sourceStep(steps);
  return (
    `${track.codec} (${track.fourcc}) ${track.bitDepth}-bit, coded ${track.codedWidth}x${track.codedHeight}, turned ${track.rotation}, shown ${track.width}x${track.height}, ` +
    `${track.duration.toFixed(2)} s, ${track.samples.length} samples, ${src ? (1 / src).toFixed(1) : "?"} fps, first at ${(shown[0] ?? NaN).toFixed(3)} s, ${config.hardwareAcceleration}`
  );
}

/**
 * Draws a frame as shown, turned `turn` degrees clockwise, into a canvas:
 * the shown picture (`shownW` by `shownH`) scaled by `k`, from `top` rows of
 * it down.
 */
function drawTurned(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, frame: VideoFrame, turn: number, shownW: number, shownH: number, k: number, top: number) {
  ctx.setTransform(k, 0, 0, k, 0, -top * k);
  if (turn === 90) ctx.transform(0, 1, -1, 0, shownW, 0);
  else if (turn === 180) ctx.transform(-1, 0, 0, -1, shownW, shownH);
  else if (turn === 270) ctx.transform(0, -1, 1, 0, 0, shownH);
  ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
}

function canvas2d(width: number, height: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  return ctx;
}

/**
 * The first look (`lib/shotTrack/shotStart.ts`) by decoding: every frame of
 * the video decoded, and those on the `COARSE_FPS` grid (`gridSlot`, chosen
 * over the file's own frame times) made `COARSE_WIDTH` wide in grey: drawn
 * to a canvas, or, for a video of more than 8 bits (an iPhone's HDR, which a
 * canvas tone-maps), from the frame's luma plane where it can be copied.
 * Same frames as playing would give where playing shows every frame; here
 * none is passed over. Handed to `onFrame` in time order.
 */
export async function codecScan(
  cv: CodecVideo,
  onFrame: (frame: CoarseFrame) => void,
  onProgress: (fraction: number) => void,
  notes?: Notes
): Promise<{ width: number; height: number; duration: number; via: string }> {
  const { track } = cv;
  const duration = track.duration;
  const width = COARSE_WIDTH;
  const height = Math.max(2, Math.round((COARSE_WIDTH * track.height) / track.width));
  const turn = track.rotation;
  let ctx: CanvasRenderingContext2D | null = null;
  // The frames on the grid, over the frames' own times in the order shown.
  const pick = scanPick(track.samples, duration);
  if (!pick) throw new Error("no frames to look at");
  notes?.set("video", trackNote(track, cv.config));
  const { span, order, offGrid } = pick;
  const wanted = new Map(order.map((stamp, k) => [stamp, k]));
  // Made as they come from the decoder, handed on in time order; one that
  // never comes is given up once eight after it have.
  const made: (CoarseFrame | undefined)[] = [];
  let given = 0;
  let count = 0;
  let skipped = 0;
  let how = "";
  const looks: string[] = [];
  const handOn = (all: boolean) => {
    for (;;) {
      if (made[given]) {
        onFrame(made[given]!);
        made[given] = undefined;
        given++;
      } else if (given < made.length && (all || made.slice(given + 1, given + 9).filter(Boolean).length >= 8)) {
        given++;
        skipped++;
      } else return;
    }
  };
  const done = await decodeRange(cv, span.first, span.last, wanted, async (frame, t, place) => {
    let data: Uint8ClampedArray | null = null;
    const format = String(frame.format);
    const bits = LUMA_16[format];
    if (track.bitDepth > 8 && bits && frame.visibleRect) {
      // The luma plane, untouched by tone mapping.
      const vr = frame.visibleRect;
      const buf = new Uint8Array(frame.allocationSize());
      const layout = await frame.copyTo(buf);
      const quarter = turn % 180 !== 0;
      const range = lumaRange(frame.colorSpace?.fullRange, track.fullRange);
      data = toFullRange(planeGray(buf, bits, layout[0].offset + vr.y * layout[0].stride + 2 * vr.x, layout[0].stride, vr.width, vr.height, quarter ? height : width, quarter ? width : height, turn), range);
      how = `luma plane ${format} ${range}`;
    } else {
      ctx ??= canvas2d(width, height);
      drawTurned(ctx, frame, turn, track.width, track.height, width / track.width, 0);
      data = toGray(ctx.getImageData(0, 0, width, height).data, width, height);
      how = `canvas ${format}`;
    }
    if (place === 0 || place === order.length >> 1 || place === order.length - 1) looks.push(`#${place} ${grayStats(data)}`);
    made[place] = { width, height, data, t };
    count++;
    handOn(false);
    onProgress(Math.min(1, count / Math.max(1, order.length)));
  });
  handOn(true);
  const via = `WebCodecs ${track.codec} ${cv.config.hardwareAcceleration}`;
  notes?.set("look", `${count} of ${order.length} grid frames (${offGrid} off the grid, ${skipped} given up), ${how}, gray mean/min/max ${looks.join(" ")}; decoder ${decodedNote(done, count)}`);
  console.info(`Shot tracer: looked at ${count} frames of ${duration.toFixed(1)} s by decoding (${via}), ${notes?.get("look") ?? ""}`);
  return { width: track.width, height: track.height, duration, via };
}

/** Formats whose first plane is luma, one byte a sample. */
const LUMA_8 = new Set(["I420", "I420A", "I422", "I444", "NV12"]);
/** Formats whose first plane is luma, two bytes a sample, by their bits. */
const LUMA_16: Record<string, number> = { I420P10: 10, I420AP10: 10, I422P10: 10, I444P10: 10, I420P12: 12, I422P12: 12, I444P12: 12, P010: 10 };

/** The plan of one read, as `videoFrames.ts` gives it. */
export type CodecPlan = PickPlan;

/**
 * The frames of a stretch the plan asks for (`ReadPlan`): every frame from
 * the keyframe before `from` decoded, and those `FrameSlots` keeps turned to
 * grey at most `MAX_PIXELS`, of a portrait video only its band. Each has its
 * own time from the file, and none is passed over, so two reads give the same
 * frames without going back for any. `missing` counts the frames on the grid
 * the file does not have (a phone records at a varying rate).
 */
export async function codecRead(
  cv: CodecVideo,
  plan: CodecPlan,
  onProgress: (fraction: number) => void,
  notes?: Notes
): Promise<{ width: number; height: number; gray: Uint8ClampedArray[]; times: number[]; src: number | null; step: number; missing: number; via: string }> {
  const { track } = cv;
  // The frames to keep (`readPick`); each frame out of the decoder is matched
  // to its place among them by its time.
  const { from, to, rows, band, width, height, src, step, missing, span, wanted } = readPick(track, plan);
  const turn = track.rotation;
  const quarter = turn % 180 !== 0;
  const placed: (Uint8ClampedArray | undefined)[] = [];
  const placedT: number[] = [];
  let mode: "unknown" | "planes" | "drawn" = "unknown";
  let how = "none";
  let ctx: CanvasRenderingContext2D | null = null;
  let noRect = false;
  const cost: number[] = [];

  /** The frame's luma plane, cropped to the band; null where its format has none to copy. */
  const lumaPlane = async (frame: VideoFrame): Promise<{ data: Uint8Array; bits: number; w: number; h: number; stride: number; offset: number } | null> => {
    const format = String(frame.format);
    const bits = LUMA_8.has(format) ? 8 : LUMA_16[format];
    const vr = frame.visibleRect;
    if (!bits || !vr) return null;
    const c = planeCrop(band, vr.width, vr.height, turn);
    const rect = { x: vr.x + c.x, y: vr.y + c.y, width: c.w, height: c.h };
    let buf: Uint8Array;
    let layout: PlaneLayout[];
    let x0 = 0;
    let y0 = 0;
    if (!noRect) {
      try {
        buf = new Uint8Array(frame.allocationSize({ rect }));
        layout = await frame.copyTo(buf, { rect });
      } catch {
        noRect = true;
      }
    }
    if (noRect) {
      // The whole frame, and the band found in it.
      buf = new Uint8Array(frame.allocationSize());
      layout = await frame.copyTo(buf);
      x0 = rect.x;
      y0 = rect.y;
    }
    const plane = layout![0];
    return { data: buf!, bits, w: c.w, h: c.h, stride: plane.stride, offset: plane.offset + y0 * plane.stride + (bits > 8 ? 2 : 1) * x0 };
  };

  const done = span
    ? await decodeRange(
        cv,
        span.first,
        span.last,
        wanted,
        async (frame, t, place) => {
          const started = performance.now();
          let g: Uint8ClampedArray | null = null;
          if (mode !== "drawn") {
            const luma = await lumaPlane(frame);
            if (luma) {
              const outW = quarter ? height : width;
              const outH = quarter ? width : height;
              // In the range the video was recorded in (limited, mostly): brought to the tracer's full range.
              const range = lumaRange(frame.colorSpace?.fullRange, track.fullRange);
              g = toFullRange(planeGray(luma.data, luma.bits, luma.offset, luma.stride, luma.w, luma.h, outW, outH, turn), range);
              mode = "planes";
              how = `planes ${String(frame.format)} ${range}`;
            } else if (mode === "unknown") mode = "drawn";
            else throw new Error(`frame format changed to ${String(frame.format)}`);
          }
          if (!g) {
            // One read is all drawn or all copied: drawn HDR is tone-mapped, copied is not.
            ctx ??= canvas2d(width, height);
            drawTurned(ctx, frame, turn, track.width, track.height, width / track.width, rows.y);
            g = toGray(ctx.getImageData(0, 0, width, height).data, width, height);
            how = `drawn ${String(frame.format)}`;
          }
          if (place === 0) notes?.add("gray", `${how} ${grayStats(g)}`);
          placed[place] = g;
          placedT[place] = t;
          cost.push(performance.now() - started);
          onProgress(readProgress(t, from, to));
        }
      )
    : { out: 0, fed: 0, ms: 0, backwards: 0, moved: 0, stray: 0, lost: 0 };
  // In time order, any frame the decoder never gave left out.
  const gray: Uint8ClampedArray[] = [];
  const times: number[] = [];
  placed.forEach((g, k) => {
    if (!g) return;
    gray.push(g);
    times.push(placedT[k]);
  });
  notes?.add("read", `${from.toFixed(2)} to ${to.toFixed(2)} s at ${plan.fps.toFixed(0)} fps: ${gray.length} frames, ${missing} not in the file, ${how}, ${width}x${height}; decoder ${decodedNote(done, gray.length)}`);
  const via = `WebCodecs ${track.codec} ${cv.config.hardwareAcceleration}, ${how}`;
  const median = cost.length ? [...cost].sort((a, b) => a - b)[cost.length >> 1] : 0;
  console.info(
    `Shot tracer: read ${gray.length} frames by decoding (${via}) from ${from.toFixed(3)} s to ${(times[times.length - 1] ?? from).toFixed(3)} s ` +
      `at ${plan.fps.toFixed(0)} fps of a ${(1 / src).toFixed(1)} fps video, ${done.fed} decoded from ${span ? track.samples[span.first].t.toFixed(3) : "-"} s, ` +
      `${missing} not in the file, rows ${rows.y} to ${rows.y + rows.h} of ${track.width} by ${track.height} at ${width} by ${height}, ` +
      `in ${(done.ms / 1000).toFixed(1)} s, ${median.toFixed(1)} ms a frame`
  );
  return { width, height, gray, times, src, step, missing, via };
}
