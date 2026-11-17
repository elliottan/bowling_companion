import type { FrameLane } from "../lib/shotTrack/laneTrack";
import { bandRows, keptFps, MAX_PIXELS, READ_FPS, scaledSize } from "../lib/shotTrack/marking";
import type { Band, ShotFound } from "../lib/shotTrack/shotStart";
import { verdictNote, windowNote, type Notes } from "../lib/shotTrack/notes";
import { firstPart, pickWindow, runFeet, runInFrame, runVerdict, splitRead, windowOutside, windowStart, type ShotWindow } from "../lib/shotTrack/shotWindow";
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

/** A run in feet as the details show it: its verdict, and from where to where up the lane over how long. */
const runSpan = (r: readonly { t: number; v: number }[]) =>
  r.length ? `${runVerdict(r)} ${r[0].v.toFixed(0)} to ${r[r.length - 1].v.toFixed(0)} ft in ${(r[r.length - 1].t - r[0].t).toFixed(2)} s` : "empty";

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
 * first part's frames (null when it is not there); not found there and with
 * another band to try (`lastBand` false), nothing more is read and the answer
 * is "no-lane". A shot the first look only guessed at (`ShotFound.guessed`)
 * that the lane does not bear out is "no-shot". Without a shot (a short
 * video) the whole video is read.
 */
export async function readShot(
  file: Blob,
  found: ShotFound | null,
  video: { width: number; height: number; duration: number },
  band: Band | null,
  look: (first: VideoFrames) => Promise<FrameLane[] | null>,
  onProgress: (fraction: number) => void,
  lastBand = true,
  notes?: Notes
): Promise<ShotFrames | "no-lane" | "no-shot"> {
  const key = `band ${band ? `${band.top.toFixed(2)}-${band.bottom.toFixed(2)}` : "all"}`;
  const shown = scaledSize(video.width, bandRows(video.height, band).h, MAX_PIXELS);
  const frameBytes = shown.width * shown.height;
  if (!found) {
    const to = Number.isFinite(video.duration) ? video.duration : 0;
    const frames = await readVideoFrames(file, onProgress, { from: 0, to, fps: Math.min(READ_FPS, keptFps(to, frameBytes)), band }, notes);
    notes?.add(key, `no shot: whole video read, ${frames.gray.length} frames`);
    return { frames, window: null };
  }
  const part = firstPart(found, video.duration);
  const first = await readVideoFrames(file, (f) => onProgress(FIRST_SHARE * f), { ...part, fps: READ_FPS, band }, notes);
  const lanes = first.gray.length ? await look(first) : null;
  notes?.add(key, `first part ${part.from.toFixed(2)} to ${part.to.toFixed(2)} s, ${first.gray.length} frames, lane ${lanes ? `found on ${lanes.length}` : "not found"}`);
  if (!lanes && !lastBand) {
    console.info(`Shot tracer: no lane on the first part (${part.from.toFixed(3)} to ${part.to.toFixed(3)} s) in this band; the next band`);
    return "no-lane";
  }
  const runs = lanes ? [found.run, ...(found.others ?? [])].map((run) => runFeet(runInFrame(run, band, first), lanes, first.times)) : [];
  const window = pickWindow(runs, found, video.duration);
  notes?.add(key, `runs: ${lanes ? `${verdictNote(runs.map(runVerdict))} (${runs.slice(0, 6).map(runSpan).join(", ")})` : "not judged"}; window ${windowNote(window)}`);
  if (found.guessed && window.by !== "speed") {
    console.info(`Shot tracer: none of the first look's ${runs.length} runs passed for the ball's, and none goes up the lane at a ball's speed`);
    return "no-shot";
  }
  const why =
    window.by === "speed"
      ? `${window.speed!.toFixed(1)} ft/s`
      : lanes
        ? `none of the first look's ${runs.length} runs goes up the lane at a ball's speed`
        : "no lane found on the first part";
  let frames: VideoFrames;
  let fps: number;
  if (windowOutside(window, part)) {
    // The ball is not where the first look's run said: the window read on its own.
    const from = Math.max(0, windowStart(window));
    fps = Math.min(READ_FPS, keptFps(window.end - from, frameBytes));
    first.gray = [];
    frames = await readVideoFrames(file, (f) => onProgress(FIRST_SHARE + (1 - FIRST_SHARE) * f), { from, to: window.end, fps, band }, notes);
  } else {
    const split = splitRead(first.times, first.step, READ_FPS, part.to, window, first.width * first.height);
    fps = split.fps;
    const gray = split.keep.map((i) => first.gray[i]);
    const times = split.keep.map((i) => first.times[i]);
    // The rest of the first part's frames are let go before the rest is read.
    first.gray = [];
    let missing = first.missing;
    let via = first.via;
    if (split.rest) {
      const last = times[times.length - 1];
      const rest = await readVideoFrames(file, (f) => onProgress(FIRST_SHARE + (1 - FIRST_SHARE) * f), {
        ...split.rest,
        fps: split.fps,
        band,
        after: first.src !== null && last !== undefined ? { t: last, src: first.src } : undefined
      }, notes);
      // Past the first part's last frame kept, half a frame clear of it.
      const clear = (last ?? -Infinity) + 0.5 * (first.src ?? 1 / READ_FPS);
      rest.times.forEach((t, i) => {
        if (t <= clear) return;
        gray.push(rest.gray[i]);
        times.push(t);
      });
      missing += rest.missing;
      if (rest.via !== via) via = `${via ?? "?"}, then ${rest.via ?? "?"}`;
    }
    frames = { width: first.width, height: first.height, gray, times, src: first.src, step: first.step * Math.round(READ_FPS / split.fps), missing, via };
  }
  onProgress(1);
  const { times } = frames;
  console.info(
    `Shot tracer: the shot from ${(times[0] ?? part.from).toFixed(3)} s to ${(times[times.length - 1] ?? part.from).toFixed(3)} s ` +
      `(foul line ${window.foul !== null ? `${window.foul.toFixed(3)} s` : "not found"}, end ${window.end.toFixed(3)} s by ${window.by}: ${why}), ` +
      `${frames.gray.length} frames at ${fps.toFixed(0)} a second`
  );
  return { frames, window };
}
