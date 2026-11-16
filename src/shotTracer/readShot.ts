import type { FrameLane } from "../lib/shotTrack/laneTrack";
import { bandRows, keptFps, MAX_PIXELS, READ_FPS, scaledSize } from "../lib/shotTrack/marking";
import type { Band, ShotFound } from "../lib/shotTrack/shotStart";
import { firstPart, pickWindow, runFeet, runInFrame, splitRead, type ShotWindow } from "../lib/shotTrack/shotWindow";
import { readVideoFrames, type VideoFrames } from "./videoFrames";

/**
 * The shot's frames out of a video, and only the shot's (`lib/shotTrack/
 * shotWindow.ts`): the first part read from just before the ball's run to a
 * second and a half later, the lane looked for on a few of its frames
 * (`look`), the window worked out from the run through that lane, and the
 * rest read to where the ball has left the pin deck, at the rate that fits the
 * whole window. The frames before the ball reaches the foul line are let go.
 * Browser code (the reader needs a decoder); the decisions are in
 * `shotWindow.ts`.
 */

/** How much of the bar the first part fills: about its share of a shot's read. */
const FIRST_SHARE = 0.4;

export interface ShotFrames {
  frames: VideoFrames;
  /** Where the shot was found to be in the video; null when no shot was found and the video was read whole. */
  window: ShotWindow | null;
}

/**
 * Reads the shot `found` in `file` (a video `size` pixels shown and `duration`
 * seconds long), of a portrait video only `band`. `look` finds the lane on the
 * first part's frames (null when it is not there). Without a shot (a short
 * video) the whole video is read.
 */
export async function readShot(
  file: Blob,
  found: ShotFound | null,
  video: { width: number; height: number; duration: number },
  band: Band | null,
  look: (first: VideoFrames) => Promise<FrameLane[] | null>,
  onProgress: (fraction: number) => void
): Promise<ShotFrames> {
  const shown = scaledSize(video.width, bandRows(video.height, band).h, MAX_PIXELS);
  const frameBytes = shown.width * shown.height;
  if (!found) {
    const to = Number.isFinite(video.duration) ? video.duration : 0;
    const frames = await readVideoFrames(file, onProgress, { from: 0, to, fps: Math.min(READ_FPS, keptFps(to, frameBytes)), band });
    return { frames, window: null };
  }
  const part = firstPart(found, video.duration);
  const first = await readVideoFrames(file, (f) => onProgress(FIRST_SHARE * f), { ...part, fps: READ_FPS, band });
  const lanes = first.gray.length ? await look(first) : null;
  const runs = lanes ? [found.run, ...(found.others ?? [])].map((run) => runFeet(runInFrame(run, band, first), lanes, first.times)) : [];
  const window = pickWindow(runs, found, video.duration, part);
  const feet = runs[0] ?? [];
  const split = splitRead(first.times, first.step, READ_FPS, part.to, window, first.width * first.height);
  const gray = split.keep.map((i) => first.gray[i]);
  const times = split.keep.map((i) => first.times[i]);
  // The rest of the first part's frames are let go before the rest is read.
  first.gray = [];
  let missing = first.missing;
  if (split.rest) {
    const last = times[times.length - 1];
    const rest = await readVideoFrames(file, (f) => onProgress(FIRST_SHARE + (1 - FIRST_SHARE) * f), {
      ...split.rest,
      fps: split.fps,
      band,
      after: first.src !== null && last !== undefined ? { t: last, src: first.src } : undefined
    });
    // Past the first part's last frame kept, half a frame clear of it.
    const clear = (last ?? -Infinity) + 0.5 * (first.src ?? 1 / READ_FPS);
    rest.times.forEach((t, i) => {
      if (t <= clear) return;
      gray.push(rest.gray[i]);
      times.push(t);
    });
    missing += rest.missing;
  }
  onProgress(1);
  console.info(
    `Shot tracer: the shot from ${(times[0] ?? part.from).toFixed(3)} s to ${(times[times.length - 1] ?? part.from).toFixed(3)} s ` +
      `(foul line ${window.foul !== null ? `${window.foul.toFixed(3)} s` : "not found"}, end ${window.end.toFixed(3)} s by ${window.by}` +
      `${window.speed !== null ? `, ${window.speed.toFixed(1)} ft/s` : ""}), ${gray.length} frames at ${split.fps.toFixed(0)} a second; ` +
      `the run chosen ${feet.length ? feet.map((p) => `${p.v.toFixed(1)} ft at ${p.t.toFixed(3)} s`).join(", ") : `not on a found lane (${lanes?.length ?? 0} found)`}`
  );
  return {
    frames: { width: first.width, height: first.height, gray, times, src: first.src, step: first.step * Math.round(READ_FPS / split.fps), missing },
    window
  };
}
