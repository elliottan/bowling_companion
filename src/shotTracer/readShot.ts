import type { FrameLane } from "../lib/shotTrack/laneTrack";
import { bandRows, keptFps, MAX_PIXELS, READ_FPS, scaledSize } from "../lib/shotTrack/marking";
import { findBall, type BallSearch } from "../lib/shotTrack/ballFind";
import type { Band, ShotFound } from "../lib/shotTrack/shotStart";
import { ballNote, verdictNote, windowNote, type Notes } from "../lib/shotTrack/notes";
import { budgetFrom, firstPart, partSees, pickWindow, runFeet, runInFrame, runVerdict, seekPart, seenWindow, splitRead, windowOutside, windowStart, type ShotWindow } from "../lib/shotTrack/shotWindow";
import type { ReadPlan, VideoFrames } from "./videoFrames";

/**
 * The shot's frames out of a video, and only the shot's (`lib/shotTrack/
 * shotWindow.ts`): the first part read from just before the ball's run to a
 * second and a half later, the lane looked for on a few of its frames
 * (`look`), the ball looked for in the part's own frames through that lane
 * (`seek`, `lib/shotTrack/ballFind.ts`), and, where it is not there, other
 * parts read until it is (`seekPart`): the first look is a cheap guess, and
 * the decision is made where the lane is known. The window is worked out from
 * the ball seen (or, seen nowhere, from a run of the first look's through the
 * lane), and the rest read to where the ball has left the pin deck, at the
 * rate that fits the whole window. The frames before the ball reaches the
 * foul line are let go. Browser code (the reader needs a decoder); the
 * decisions are in `shotWindow.ts` and `ballFind.ts`.
 */

/** A run in feet as the details show it: its verdict, and from where to where up the lane over how long. */
const runSpan = (r: readonly { t: number; v: number }[]) =>
  r.length ? `${runVerdict(r)} ${r[0].v.toFixed(0)} to ${r[r.length - 1].v.toFixed(0)} ft in ${(r[r.length - 1].t - r[0].t).toFixed(2)} s` : "empty";

/** How much of the bar the first part fills: about its share of a shot's read. */
const FIRST_SHARE = 0.4;

/** At most this many parts are read beside the first to look for the ball in (`seekPart`)... */
export const SEEK_PARTS = 8;
/** ...for no longer than this, milliseconds: a long video is not read whole a part at a time. */
export const SEEK_MS = 30000;

/** Looks for the ball in a part's frames with its lane (`findBall`). */
export type BallSeeker = (on: VideoFrames, lanes: FrameLane[]) => BallSearch;

/** `findBall` on a read's frames, on this thread. */
export const seekFrames: BallSeeker = (on, lanes) => findBall(on.gray.map((data, i) => ({ width: on.width, height: on.height, data, t: on.times[i] })), lanes);

/** Reads the frames a plan asks for (`readVideoFrames` on the chosen file in the app; ffmpeg in the harness, `scripts/shot-tracker/app-read.ts`). */
export type FrameReader = (plan: ReadPlan, onProgress: (fraction: number) => void) => Promise<VideoFrames>;

export interface ShotFrames {
  frames: VideoFrames;
  /** Where the shot was found to be in the video; null when no shot was found and the video was read whole. */
  window: ShotWindow | null;
}

/**
 * Reads the shot `found` with `read` (a video `size` pixels shown and `duration`
 * seconds long), of a portrait video only `band`. `look` finds the lane on the
 * first part's frames (null when it is not there); not found there, other
 * parts are looked at for it (the look's other runs, then the video stepped
 * through), and found in none with another band to try (`lastBand` false),
 * the answer is "no-lane". A shot the first look only guessed at (`ShotFound.guessed`)
 * whose ball is seen in no part read, and none of whose runs goes up the lane
 * at a ball's speed, is "no-shot". Without a shot (a short video) the whole
 * video is read. `seek` looks for the ball in a part's frames (`findBall` on
 * this thread unless given).
 */
export async function readShot(
  read: FrameReader,
  found: ShotFound | null,
  video: { width: number; height: number; duration: number },
  band: Band | null,
  look: (first: VideoFrames) => Promise<FrameLane[] | null>,
  onProgress: (fraction: number) => void,
  lastBand = true,
  notes?: Notes,
  seek: BallSeeker = seekFrames
): Promise<ShotFrames | "no-lane" | "no-shot"> {
  const key = `band ${band ? `${band.top.toFixed(2)}-${band.bottom.toFixed(2)}` : "all"}`;
  const shown = scaledSize(video.width, bandRows(video.height, band).h, MAX_PIXELS);
  const frameBytes = shown.width * shown.height;
  if (!found) {
    const to = Number.isFinite(video.duration) ? video.duration : 0;
    const frames = await read({ from: 0, to, fps: Math.min(READ_FPS, keptFps(to, frameBytes)), band }, onProgress);
    notes?.add(key, `no shot: whole video read, ${frames.gray.length} frames`);
    return { frames, window: null };
  }
  let part = firstPart(found, video.duration);
  let first = await read({ ...part, fps: READ_FPS, band }, (f) => onProgress(FIRST_SHARE * f));
  let lanes = first.gray.length ? await look(first) : null;
  notes?.add(key, `first part ${part.from.toFixed(2)} to ${part.to.toFixed(2)} s, ${first.gray.length} frames, lane ${lanes ? `found on ${lanes.length}` : "not found"}`);
  const looks = [found.run, ...(found.others ?? [])];
  const tried = [part];
  // No lane on the first part: the run the look chose may be no ball's
  // (IMG_2938 on an iPhone: a run at 7.27 s, the camera zoomed in on the
  // bowler walking back, no lane in the picture), so the parts the look's
  // other runs start in, then the video stepped through, are looked at for
  // the lane in turn (`seekPart`), and the first that shows it is taken as
  // the first part, before the band is given up.
  if (!lanes) {
    const starts = looks.flatMap((r) => (r[0] ? [r[0].t] : []));
    const began = Date.now();
    for (let more = 0; !lanes && more < SEEK_PARTS && Date.now() - began < SEEK_MS; more++) {
      const next = seekPart(starts, tried, video.duration, found.release);
      if (!next) break;
      tried.push(next);
      const other = await read({ ...next, fps: READ_FPS, band }, () => {});
      const otherLanes = other.gray.length ? await look(other) : null;
      notes?.add(key, `lane looked for ${next.from.toFixed(2)} to ${next.to.toFixed(2)} s, ${otherLanes ? `found on ${otherLanes.length}` : "not found"}`);
      if (!otherLanes) {
        other.gray = [];
        continue;
      }
      first.gray = [];
      [part, first, lanes] = [next, other, otherLanes];
    }
  }
  if (!lanes && !lastBand) {
    console.info(`Shot tracer: no lane in ${tried.length} part${tried.length === 1 ? "" : "s"} of the video in this band; the next band`);
    return "no-lane";
  }
  const judged = (on: VideoFrames, by: FrameLane[]) => looks.map((run) => runFeet(runInFrame(run, band, on), by, on.times));
  let runs = lanes ? judged(first, lanes) : [];
  let window = pickWindow(runs, found, video.duration);
  notes?.add(key, `runs: ${lanes ? `${verdictNote(runs.map(runVerdict))} (${runs.slice(0, 6).map(runSpan).join(", ")})` : "not judged"}; window ${windowNote(window)}`);
  // The ball found in the part's own frames, where the lane is known
  // (`ballFind.ts`), decides: the first look's runs are a guess, and a part
  // of the bowler held above the lane can pass for one.
  // How long each search for the ball took, for the details.
  const timed = (on: VideoFrames, by: FrameLane[]) => {
    const t0 = Date.now();
    const r = seek(on, by);
    return { r, took: `in ${((Date.now() - t0) / 1000).toFixed(1)} s` };
  };
  const firstSeek = lanes ? timed(first, lanes) : null;
  let ball = firstSeek?.r ?? null;
  if (firstSeek) notes?.add(key, `ball: ${ballNote(firstSeek.r)} ${firstSeek.took}`);
  // Not seen in this part: the parts the ball may be in, in turn (`seekPart`),
  // until it is seen or the time runs out. First where this part's search
  // saw it out on the lane, then the crossing of the look's run that passes,
  // then the look's runs that pass on the lane, then its others, then the
  // whole video stepped through.
  const hints: number[] = [];
  const hintFrom = (seen: BallSearch | null, w: ShotWindow, rs: ReturnType<typeof judged>) => {
    if (seen?.earlier != null) hints.push(seen.earlier);
    if (w.foul !== null) hints.push(w.foul);
    rs.forEach((r, i) => runVerdict(r) === "ball" && hints.push(r.find((q) => q.v > 0)?.t ?? looks[i][0].t));
  };
  hintFrom(ball, window, runs);
  for (const r of looks) if (r[0]) hints.push(r[0].t);
  // Each part's window from a run of the look's at a ball's speed through its
  // lane, for when the ball is seen in no part; and the parts searched.
  const byRun: { part: typeof part; window: ShotWindow; lanes: FrameLane[] }[] = window.by === "speed" ? [{ part, window, lanes: lanes! }] : [];
  const searched = lanes ? [part] : [];
  let dropped = false;
  const began = Date.now();
  for (let more = 0; lanes && !ball?.seen && more < SEEK_PARTS && Date.now() - began < SEEK_MS; more++) {
    const next = seekPart(hints, tried, video.duration, found.release);
    if (!next) break;
    tried.push(next);
    const other = await read({ ...next, fps: READ_FPS, band }, () => {});
    const otherLanes = other.gray.length ? await look(other) : null;
    const otherRuns = otherLanes ? judged(other, otherLanes) : [];
    const w = pickWindow(otherRuns, found, video.duration);
    const sought = otherLanes ? timed(other, otherLanes) : null;
    const b = sought?.r ?? null;
    notes?.add(key, `looked again ${next.from.toFixed(2)} to ${next.to.toFixed(2)} s, lane ${otherLanes ? `found on ${otherLanes.length}` : "not found"}; window ${windowNote(w)}${sought ? `; ball: ${ballNote(sought.r)} ${sought.took}` : ""}`);
    if (otherLanes) hintFrom(b, w, otherRuns);
    if (otherLanes) searched.push(next);
    if (w.by === "speed") byRun.push({ part: next, window: w, lanes: otherLanes! });
    if (!b?.seen) {
      other.gray = [];
      continue;
    }
    first.gray = [];
    dropped = false;
    [part, first, lanes, runs, ball] = [next, other, otherLanes, otherRuns, b];
  }
  // Not seen in any part: a run's window, first one whose crossing no part
  // searched would have shown. A ball that crossed the foul line rolls up the
  // lane in the frames after: a crossing inside a part searched where nothing
  // rolled is the bowler (IMG_1996: the pushaway at 1.6 s), taken only when
  // nothing else is left (the ball can be hidden, behind the bowler on shot-04).
  const crossingSearched = (w: ShotWindow) => searched.some((p) => partSees(p, w.foul!));
  const run = byRun.find((r) => !crossingSearched(r.window)) ?? byRun[0];
  if (ball?.seen) window = seenWindow(ball.seen, video.duration);
  else if (run && run.part !== part) {
    // The run's part was let go: its window is read on its own.
    first.gray = [];
    dropped = true;
    [part, lanes, window] = [run.part, run.lanes, run.window];
  } else if (run) window = run.window;
  if (!ball?.seen && run) notes?.add(key, `ball not seen; window from a run of the first look's${crossingSearched(run.window) ? ", though no ball rolled after its crossing" : ""}`);
  if (found.guessed && window.by !== "speed" && window.by !== "seen") {
    console.info(`Shot tracer: the ball was not seen in ${tried.length} part${tried.length === 1 ? "" : "s"} of the video, and none of the first look's ${runs.length} runs goes up the lane at a ball's speed`);
    return "no-shot";
  }
  const why =
    window.by === "seen"
      ? `the ball seen at ${window.speed!.toFixed(1)} ft/s`
      : window.by === "speed"
      ? `${window.speed!.toFixed(1)} ft/s`
      : lanes
        ? `none of the first look's ${runs.length} runs goes up the lane at a ball's speed`
        : "no lane found on the first part";
  let frames: VideoFrames;
  let fps: number;
  if (windowOutside(window, part) || dropped) {
    // The ball is not where the first look's run said: the window read on its own.
    const from = Math.max(0, windowStart(window));
    fps = Math.min(READ_FPS, keptFps(window.end - budgetFrom(window, from), frameBytes));
    first.gray = [];
    frames = await read({ from, to: window.end, fps, band }, (f) => onProgress(FIRST_SHARE + (1 - FIRST_SHARE) * f));
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
      const rest = await read({
        ...split.rest,
        fps: split.fps,
        band,
        after: first.src !== null && last !== undefined ? { t: last, src: first.src } : undefined
      }, (f) => onProgress(FIRST_SHARE + (1 - FIRST_SHARE) * f));
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
