/**
 * The app's read in Node, to the frame: the frames the app in a browser would
 * give the tracer, so a reading the app gives can be reproduced and bisected
 * without a browser.
 *
 *   npx tsx scripts/shot-tracker/app-read.ts <video> [<video> ...] [--hand left] [--gray decoded|full] [--from 0] [--json out.json] [--dump dir]
 *
 * What the app does (`ShotTracerView`, `readShot.ts`, `codecFrames.ts`), with
 * ffmpeg as the decoder: the file's sample table read by `mp4.ts`; the first
 * look's frames chosen by `scanPick` and turned to `COARSE_WIDTH` grey,
 * searched by `ShotSearch`; the bands (`laneBands`); then `readShot` itself,
 * its reads chosen by `readPick` and each frame's luma plane cropped, scaled
 * and turned by `planeGray` as `codecRead` does; the lane on the first part's
 * frames and on 24 of the read's (`findLanes`, the frames `findOn` chooses);
 * the trace.
 *
 * `--gray decoded` keeps each luma plane as decoded (the app before
 * 2026-11-17: video range), `--gray full` (the default) brings it to full
 * range as the app now does (`grayRange.ts`). `--from 0` reads from the
 * video's start to the window's end instead of from the window's start, the
 * frames otherwise chosen the same way: the read's start alone changed.
 * `--dump dir` writes the frames the trace got as `bench.ts --dump` does, for
 * `pool-bench.ts`.
 *
 * The first look's frames are the luma plane scaled down where the app draws
 * an 8-bit video to a canvas; the window it finds is printed beside the
 * app's (the details block's "search" and "band" lines) to check.
 */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readPick, scanPick, type PickPlan } from "../../src/lib/shotTrack/framePick";
import { lumaRange, toFullRange } from "../../src/lib/shotTrack/grayRange";
import { findLanes, frameLanes } from "../../src/lib/shotTrack/laneFind";
import { planeCrop, planeGray } from "../../src/lib/shotTrack/marking";
import { nearestStamp, readVideoTrack, spanStamps, type VideoTrack } from "../../src/lib/shotTrack/mp4";
import { Notes } from "../../src/lib/shotTrack/notes";
import { trace } from "../../src/lib/shotTrack/pipeline";
import { COARSE_WIDTH, laneBands, readFrom, ShotSearch, type CoarseFrame, type ShotFound } from "../../src/lib/shotTrack/shotStart";
import type { GrayFrame } from "../../src/lib/shotTrack/types";
import { readShot, type ShotFrames } from "../../src/shotTracer/readShot";
import type { VideoFrames } from "../../src/shotTracer/videoFrames";
import type { Handedness } from "../../src/types/bowling";
import { spread, tracedReading } from "./bench-readings";

/** As `ShotTracerView`. */
const FIND_FRAMES = 24;
const FIRST_FIND_FRAMES = 8;

export type GrayMode = "decoded" | "full";

/** A file as `mp4.ts` reads it, from disk. */
export async function fileTrack(path: string): Promise<VideoTrack> {
  const fd = openSync(path, "r");
  try {
    const size = statSync(path).size;
    return await readVideoTrack({
      size,
      read: async (offset, length) => {
        const buf = Buffer.alloc(Math.max(0, Math.min(length, size - offset)));
        readSync(fd, buf, 0, buf.length, offset);
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
      }
    });
  } finally {
    closeSync(fd);
  }
}

/** Each decoded frame's time as ffmpeg gives it, in the order it gives the frames. */
function frameStamps(path: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time,best_effort_timestamp_time", "-of", "csv=p=0", path]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", reject);
    p.on("close", () => resolve(out.trim().split("\n").map((l) => Number(l.split(",").find((x) => x !== "")))));
  });
}
const stampsCache = new Map<string, Promise<number[]>>();

/**
 * Decodes the whole video with ffmpeg, unturned, and hands each frame whose
 * sample is in `wanted` (by stamp, as the app's decoder matches frames) to
 * `onFrame` as its luma plane: one byte a sample, or two (little-endian)
 * past 8 bits.
 */
async function decodeLuma(path: string, track: VideoTrack, wanted: ReadonlyMap<number, number>, onFrame: (place: number, t: number, plane: Uint8Array) => void): Promise<number> {
  if (!stampsCache.has(path)) stampsCache.set(path, frameStamps(path));
  const times = await stampsCache.get(path)!;
  const stamps = spanStamps(track.samples, 0, track.samples.length - 1);
  const bytes = track.bitDepth > 8 ? 2 : 1;
  const size = track.codedWidth * track.codedHeight * bytes;
  const fmt = track.bitDepth > 8 ? "gray10le" : "gray";
  return new Promise((resolve, reject) => {
    // The luma plane as stored: no turn, no range change, no scaling.
    const p = spawn("ffmpeg", ["-v", "error", "-noautorotate", "-i", path, "-vf", `extractplanes=y,format=${fmt}`, "-f", "rawvideo", "-vsync", "passthrough", "-"]);
    let k = 0;
    let given = 0;
    let fill = Buffer.alloc(size);
    let at = 0;
    p.stdout.on("data", (d: Buffer) => {
      let off = 0;
      while (off < d.length) {
        const n = Math.min(size - at, d.length - off);
        d.copy(fill, at, off, off + n);
        at += n;
        off += n;
        if (at === size) {
          const j = nearestStamp(stamps, Math.round(times[k] * 1e6));
          const place = j >= 0 ? wanted.get(stamps[j]) : undefined;
          if (place !== undefined) {
            onFrame(place, stamps[j] / 1e6, new Uint8Array(fill.buffer, fill.byteOffset, size));
            fill = Buffer.alloc(size);
            given++;
          }
          k++;
          at = 0;
        }
      }
    });
    p.stderr.on("data", (d: Buffer) => process.stderr.write(d));
    p.on("error", reject);
    p.on("close", () => resolve(given));
  });
}

/** The first look, as `codecScan` gives it to the search worker. */
export async function look(path: string, track: VideoTrack, gray: GrayMode): Promise<CoarseFrame[]> {
  const pick = scanPick(track.samples, track.duration);
  if (!pick) return [];
  const width = COARSE_WIDTH;
  const height = Math.max(2, Math.round((COARSE_WIDTH * track.height) / track.width));
  const turn = track.rotation;
  const quarter = turn % 180 !== 0;
  const made: CoarseFrame[] = [];
  const wanted = new Map(pick.order.map((s, k) => [s, k]));
  await decodeLuma(path, track, wanted, (place, t, plane) => {
    const data = planeGray(plane, track.bitDepth, 0, track.codedWidth * (track.bitDepth > 8 ? 2 : 1), track.codedWidth, track.codedHeight, quarter ? height : width, quarter ? width : height, turn);
    made[place] = { width, height, data: gray === "full" ? toFullRange(data, lumaRange(null, track.fullRange)) : data, t };
  });
  return made.filter(Boolean);
}

/** A read as `codecRead` gives it. */
export function reader(path: string, track: VideoTrack, gray: GrayMode, log: string[]) {
  return async (plan: PickPlan): Promise<VideoFrames> => {
    const pick = readPick(track, plan);
    const turn = track.rotation;
    const quarter = turn % 180 !== 0;
    const bytes = track.bitDepth > 8 ? 2 : 1;
    const c = planeCrop(pick.band, track.codedWidth, track.codedHeight, turn);
    const placed: Uint8ClampedArray[] = [];
    const placedT: number[] = [];
    if (pick.span)
      await decodeLuma(path, track, pick.wanted, (place, t, plane) => {
        const g = planeGray(plane, track.bitDepth, c.y * track.codedWidth * bytes + c.x * bytes, track.codedWidth * bytes, c.w, c.h, quarter ? pick.height : pick.width, quarter ? pick.width : pick.height, turn);
        placed[place] = gray === "full" ? toFullRange(g, lumaRange(null, track.fullRange)) : g;
        placedT[place] = t;
      });
    const out: VideoFrames = { width: pick.width, height: pick.height, gray: [], times: [], src: pick.src, step: pick.step, missing: pick.missing, via: "ffmpeg" };
    placed.forEach((g, k) => {
      if (!g) return;
      out.gray.push(g);
      out.times.push(placedT[k]);
    });
    log.push(`read ${pick.from.toFixed(3)} to ${pick.to.toFixed(3)} s at ${plan.fps} fps: ${out.gray.length} frames, ${pick.missing} not in the file, ${pick.width}x${pick.height}`);
    return out;
  };
}

const framesOf = (v: VideoFrames): GrayFrame[] => v.gray.map((data, i) => ({ width: v.width, height: v.height, data, t: v.times[i] }));

/** `findOn` in the view: the lane on every `stride`th frame. */
function findOn(v: VideoFrames, count: number) {
  const all = framesOf(v);
  const idx = spread(all.length, count);
  const found = findLanes(idx.map((i) => all[i]));
  return found.best ? { frame: idx[found.best.index], lanes: frameLanes(found, (i) => idx[i]) } : null;
}

export interface AppRead {
  name: string;
  found: ShotFound | null;
  window: ShotFrames["window"];
  frames: GrayFrame[];
  log: string[];
  notes: string;
}

/** The frames the app gives the tracer for `path`: the first look, the bands, `readShot`. `fromZero` reads from the video's start instead of the window's. */
export async function appRead(path: string, gray: GrayMode, fromZero = false): Promise<AppRead | null> {
  const track = await fileTrack(path);
  const log: string[] = [];
  const notes = new Notes();
  const coarse = await look(path, track, gray);
  const search = new ShotSearch();
  for (const f of coarse) search.push(f);
  const found = search.finish();
  const from = readFrom(track.duration, found);
  const bands = laneBands(track.width, track.height, found);
  log.push(
    `look: ${coarse.length} frames; ${found ? `release ${found.release.toFixed(2)} s, pins ${found.pinHit?.toFixed(2) ?? "not seen"}, ${found.guessed ? "guessed, " : ""}${1 + (found.others?.length ?? 0)} runs` : "no shot"}; read from ${from?.toFixed(2) ?? "nowhere"}; bands ${bands.map((b) => (b ? `${b.top.toFixed(2)}-${b.bottom.toFixed(2)}` : "all")).join(", ")}`
  );
  if (from === null) return null;
  const read = reader(path, track, gray, log);
  const video = { width: track.width, height: track.height, duration: track.duration };
  for (let b = 0; b < bands.length; b++) {
    const band = bands[b];
    const r = await readShot(
      (plan) => read(fromZero && plan.from > 0 && !plan.after ? { ...plan, from: 0 } : plan),
      found,
      video,
      band,
      async (first) => findOn(first, FIRST_FIND_FRAMES)?.lanes ?? null,
      () => {},
      b === bands.length - 1,
      notes
    );
    if (r === "no-shot") return null;
    if (r === "no-lane") continue;
    return { name: basename(path), found, window: r.window, frames: framesOf(r.frames), log, notes: notes.text() };
  }
  return null;
}

/** The trace as the view runs it on the read's frames: the lane on 24 of them, then `trace`. */
export function traceRead(frames: GrayFrame[], hand: Handedness) {
  const v: VideoFrames = { width: frames[0].width, height: frames[0].height, gray: frames.map((f) => f.data), times: frames.map((f) => f.t), src: null, step: 0, missing: 0 };
  const m = findOn(v, FIND_FRAMES);
  if (!m) return null;
  return trace({ source: { count: frames.length, frame: (i) => frames[i] }, calibFrame: m.frame, lanes: m.lanes, hand });
}

if (process.argv[1]?.endsWith("app-read.ts")) {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const hand = (opt("--hand") ?? "right") as Handedness;
  const gray = (opt("--gray") ?? "full") as GrayMode;
  const fromZero = opt("--from") === "0";
  const jsonOut = opt("--json");
  const dumpDir = opt("--dump");
  const results: Record<string, unknown>[] = [];
  for (const path of args) {
    const t0 = Date.now();
    const r = await appRead(path, gray, fromZero);
    if (!r) {
      console.log(`${basename(path)}: no shot read`);
      continue;
    }
    const out = traceRead(r.frames, hand);
    const reading = out ? tracedReading(out) : null;
    const w = r.window;
    console.log(`${r.name} (${gray}${fromZero ? ", from 0" : ""}): ${r.frames.length} frames ${r.frames[0].width}x${r.frames[0].height}, ${r.frames[0].t.toFixed(3)} to ${r.frames[r.frames.length - 1].t.toFixed(3)} s; window foul ${w?.foul?.toFixed(3) ?? "-"} end ${w?.end.toFixed(3) ?? "-"} by ${w?.by ?? "-"} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const l of r.log) console.log(`   ${l}`);
    const pick = (k: string) => (reading as Record<string, unknown> | null)?.[k];
    console.log(`   ${JSON.stringify({ laydown: pick("laydown"), arrows: pick("arrows"), breakpoint: pick("breakpoint"), at: pick("breakpointFeet"), pins: pick("pins"), launch: pick("launchSpeed"), failure: pick("failure") })}`);
    results.push({ name: r.name, gray, fromZero, first: r.frames[0].t, last: r.frames[r.frames.length - 1].t, count: r.frames.length, window: w, trace: reading });
    if (dumpDir) {
      mkdirSync(dumpDir, { recursive: true });
      const stem = r.name.replace(/\.[^.]+$/, "");
      writeFileSync(join(dumpDir, `${stem}.gray`), Buffer.concat(r.frames.map((f) => Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength))));
      writeFileSync(join(dumpDir, `${stem}.json`), JSON.stringify({ name: stem, hand, width: r.frames[0].width, height: r.frames[0].height, times: r.frames.map((f) => f.t), FIND_FRAMES, FIRST_FIND_FRAMES, FIRST_PART_S: 2 }));
    }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1) + "\n");
}
