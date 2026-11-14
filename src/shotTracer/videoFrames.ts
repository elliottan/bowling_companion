import { frameTimes, scaledSize, toGray } from "../lib/shotTrack/marking";

/**
 * Frames read out of a video file in the browser, for the shot tracer
 * (Settings, Labs): the file is played into a hidden video element, seeked a
 * frame at a time and drawn to a canvas, at most `MAX_PIXELS` a frame, kept
 * in grey. It is seeked at `FPS` and a frame seen twice is kept once, so a
 * 60 fps clip is read at 60 and a 30 fps one at 30 (the board at the pins
 * needs the 60: shot-01 read 14.8 at 30 and 19.2 at 60, by eye 19.4), up to
 * `MAX_FRAMES` frames: four seconds at 60, eight at 30. Needs a real browser's decoder, so it is not unit tested; the pure parts are in `lib/shotTrack/marking.ts`.
 */

export const FPS = 60;
export const MAX_FRAMES = 240;
/** 960 by 720: the far end of the lane keeps a ball of three or four pixels across. */
export const MAX_PIXELS = 960 * 720;

export interface VideoFrames {
  width: number;
  height: number;
  /** Grey frames, one byte a pixel. */
  gray: Uint8ClampedArray[];
  times: number[];
}

function once(target: EventTarget, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      target.removeEventListener("error", bad);
      resolve();
    };
    const bad = () => {
      target.removeEventListener(name, ok);
      reject(new Error(`video ${name} failed`));
    };
    target.addEventListener(name, ok, { once: true });
    target.addEventListener("error", bad, { once: true });
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
async function seekTo(video: HTMLVideoElement, t: number): Promise<number> {
  if (Math.abs(video.currentTime - t) < 1e-4) return t;
  const v = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  };
  const presented = v.requestVideoFrameCallback
    ? new Promise<number>((resolve) => v.requestVideoFrameCallback!((_, meta) => resolve(meta.mediaTime)))
    : once(video, "seeked").then(() => t);
  video.currentTime = t;
  return Promise.race([presented, new Promise<number>((resolve) => setTimeout(() => resolve(t), 1000))]);
}

/** How far past a frame's start each seek aims, seconds: a quarter of a 60 fps frame. */
const SEEK_INTO = 1 / 240;

export async function readVideoFrames(file: Blob, onProgress: (fraction: number) => void): Promise<VideoFrames> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadedmetadata");
    if (video.readyState < 2) await once(video, "loadeddata");
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
    const times = frameTimes(video.duration, FPS, 2 * MAX_FRAMES);
    const gray: Uint8ClampedArray[] = [];
    const seen: number[] = [];
    for (let i = 0; i < times.length && gray.length < MAX_FRAMES; i++) {
      const at = await seekTo(video, Math.min(times[i] + SEEK_INTO, video.duration));
      onProgress(Math.max((i + 1) / times.length, gray.length / MAX_FRAMES));
      // The same frame twice (a clip slower than the reading rate) is kept once.
      if (seen.length && Math.abs(at - seen[seen.length - 1]) < 1e-4) continue;
      ctx.drawImage(video, 0, 0, width, height);
      const img = ctx.getImageData(0, 0, width, height);
      gray.push(toGray(img.data, width, height));
      seen.push(at);
    }
    return { width, height, gray, times: seen };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
