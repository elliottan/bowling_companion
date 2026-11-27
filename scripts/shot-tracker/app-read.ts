/**
 * The app's read in Node, to the frame: the frames the app in a browser would
 * give the tracer, so a reading the app gives can be reproduced and bisected
 * without a browser.
 *
 *   npx tsx scripts/shot-tracker/app-read.ts <video> [<video> ...] [--hand left] [--gray decoded|full|phone] [--from 0] [--look dir] [--json out.json] [--dump dir]
 *
 * What the app does (`ShotTracerView`, `readShot.ts`, `codecFrames.ts`), with
 * ffmpeg as the decoder: the file's sample table read by `mp4.ts`; the first
 * look's frames chosen by `scanPick` and turned to `COARSE_WIDTH` gray,
 * searched by `ShotSearch`; the bands (`laneBands`); then `readShot` itself,
 * its reads chosen by `readPick` and each frame's luma plane cropped, scaled
 * and turned by `planeGray` as `codecRead` does; the lane on the first part's
 * frames and on the read's (`findLanes` on the frames `gridFrames` chooses,
 * as `findOn` in the view); the trace.
 *
 * `--gray decoded` keeps each luma plane as decoded (the app before
 * 2026-11-17: video range), `--gray full` (the default) brings it to full
 * range as the app now does (`grayRange.ts`). `--gray phone` decodes an HDR
 * video (HLG or PQ) as an iPhone's decoder hands it to the app
 * (`PHONE_DECODE`), and any other video as `full` does. `--from 0` reads from the
 * video's start to the window's end instead of from the window's start, the
 * frames otherwise chosen the same way: the read's start alone changed.
 * `--found file.json` replays a first look's result instead of searching (a
 * `ShotFound` as JSON: the release, the run and the others a phone's details
 * show), for a search a phone made that the luma plane here does not repeat.
 * `--dump dir` writes the frames the trace got as `bench.ts --dump` does, for
 * `pool-bench.ts` and `review-app.ts --frames` (with the video and the band read).
 *
 * The first look's frames are the luma plane scaled down where the app draws
 * an 8-bit video to a canvas; the window it finds is printed beside the
 * app's (the details block's "search" and "band" lines) to check.
 */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { FIRST_LANE_EVERY, gridFrames, LANE_EVERY, readPick, readStep, scanPick, type PickPlan } from "../../src/lib/shotTrack/framePick";
import { lumaRange, toFullRange } from "../../src/lib/shotTrack/grayRange";
import { findLanes, frameLanes } from "../../src/lib/shotTrack/laneFind";
import { planeCrop, planeGray } from "../../src/lib/shotTrack/marking";
import { nearestStamp, readVideoTrack, spanStamps, type VideoTrack } from "../../src/lib/shotTrack/mp4";
import { laneCheckNote, Notes } from "../../src/lib/shotTrack/notes";
import { laneVerdict, type LaneEvidence } from "../../src/lib/shotTrack/laneVerdict";
import { trace } from "../../src/lib/shotTrack/pipeline";
import { COARSE_WIDTH, laneBands, readFrom, ShotSearch, type Band, type CoarseFrame, type ShotFound } from "../../src/lib/shotTrack/shotStart";
import type { GrayFrame } from "../../src/lib/shotTrack/types";
import { readShot, type ShotFrames } from "../../src/shotTracer/readShot";
import type { VideoFrames } from "../../src/shotTracer/videoFrames";
import type { Handedness } from "../../src/types/bowling";
import { tracedReading } from "./bench-readings";

export type GrayMode = "decoded" | "full" | "phone";

/**
 * How an iPhone's hardware decoder hands an HDR video to the app (Safari 18.7,
 * WebCodecs, HEVC Main 10 HLG, 0.118.6): an 8-bit NV12 frame in full range,
 * tagged BT.709 with the sRGB transfer. The tag says tone mapped, but the
 * luma is the HLG signal as coded, only rounded from 10-bit video range to
 * 8-bit full range: on clip 6602 the first look's gray means at frames 0, 47
 * and 93 are the phone's 158/138/142 with this, where the 10-bit plane cut to
 * 8 bits and then expanded (`--gray full`) gives 158/138/141 (141.31: half a
 * level darker on average) and every tone map tried is further off (BT.2390
 * via zscale to linear then hable 115/99/102, mobius 154/141/144 at 203 nits,
 * no tone map at 203 nits 185/154/159, the gamut alone 157/137/141, and none
 * reaches 255). `PHONE_VF` tries another ffmpeg chain in its place.
 */
export const PHONE_DECODE = process.env.PHONE_VF ?? "zscale=rin=limited:r=full,format=yuv420p";

/** The transfers of an HDR video, as ffprobe names them: HLG and PQ. */
export const HDR_TRANSFERS = new Set(["arib-std-b67", "smpte2084"]);

/** The transfer in ffprobe's `stream=color_transfer` csv (a trailing comma where the stream has side data): `unknown` where it names none. */
export function transferOf(csv: string): string {
  return csv.split(/[,\n]/)[0].trim() || "unknown";
}

/** Whether `path` is an HDR video (HLG or PQ), which a phone's decoder hands over as 8-bit full range. */
export function hdrSource(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer", "-of", "csv=p=0", path]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", reject);
    p.on("close", () => resolve(HDR_TRANSFERS.has(transferOf(out))));
  });
}

/** A track as the decoder hands it over: with `convert`, that ffmpeg chain applied first (the phone's), giving 8 bits in full range. */
export type Decoded = VideoTrack & { convert?: string };

/** The track as `gray` decodes it: an HDR video in `phone` mode as the phone's decoder gives it (`PHONE_DECODE`), any other as it is. */
export async function decodedTrack(path: string, track: VideoTrack, gray: GrayMode): Promise<Decoded> {
  if (gray !== "phone" || !(await hdrSource(path))) return track;
  return { ...track, bitDepth: 8, fullRange: true, convert: PHONE_DECODE };
}

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
    p.on("close", () => resolve(out.trim().split("\n").filter((l) => /\d/.test(l)).map((l) => Number(l.split(",").find((x) => x !== "")))));
  });
}
const stampsCache = new Map<string, Promise<number[]>>();

/**
 * Decodes the whole video with ffmpeg, unturned, and hands each frame whose
 * sample is in `wanted` (by stamp, as the app's decoder matches frames) to
 * `onFrame` as its luma plane: one byte a sample, or two (little-endian)
 * past 8 bits.
 */
async function decodeLuma(path: string, track: Decoded, wanted: ReadonlyMap<number, number>, onFrame: (place: number, t: number, plane: Uint8Array) => void): Promise<number> {
  if (!stampsCache.has(path)) stampsCache.set(path, frameStamps(path));
  const times = await stampsCache.get(path)!;
  const stamps = spanStamps(track.samples, 0, track.samples.length - 1);
  // An edit list that starts the video past its first samples (a video a
  // messaging app re-encoded: seven samples before the start): ffmpeg leaves
  // those frames out and counts its times from the first one shown, while
  // the app decodes every sample at its own time. ffmpeg's times are moved
  // onto the samples it shows, or each frame lands on the sample before it.
  const sorted = [...stamps].sort((a, b) => a - b);
  const skipped = sorted.length - times.length;
  const shift = skipped > 0 ? sorted[skipped] / 1e6 - times[0] : 0;
  const bytes = track.bitDepth > 8 ? 2 : 1;
  const size = track.codedWidth * track.codedHeight * bytes;
  const fmt = track.bitDepth > 8 ? "gray10le" : "gray";
  return new Promise((resolve, reject) => {
    // The luma plane as stored: no turn, no range change, no scaling; or as a phone's decoder gives an HDR video.
    const vf = `${track.convert ? `${track.convert},` : ""}extractplanes=y,format=${fmt}`;
    const p = spawn("ffmpeg", ["-v", "error", "-noautorotate", "-i", path, "-vf", vf, "-f", "rawvideo", "-vsync", "passthrough", "-"]);
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
          const j = nearestStamp(stamps, Math.round((times[k] + shift) * 1e6));
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
export async function look(path: string, track: Decoded, gray: GrayMode): Promise<CoarseFrame[]> {
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
    made[place] = { width, height, data: gray !== "decoded" ? toFullRange(data, lumaRange(null, track.fullRange)) : data, t };
  });
  return made.filter(Boolean);
}

/**
 * The first look's frames as a browser gave them (`<stem>.look` and
 * `.look.json` in `dir`, written by a page that runs `codecScan`): a canvas
 * scales and converts color its own way, and the window found on its frames
 * can sit a grid slot from the one found on the luma plane.
 */
function savedLook(dir: string, path: string, gray: GrayMode): CoarseFrame[] {
  const stem = basename(path).replace(/\.[^.]+$/, "");
  const meta = JSON.parse(readFileSync(join(dir, `${stem}.look.json`), "utf8")) as { width: number; height: number; times: number[]; range?: string };
  const raw = readFileSync(join(dir, `${stem}.look`));
  const px = meta.width * meta.height;
  // Saved in the range the page gave (`range` in the json: video range before 2026-11-17).
  const expand = gray !== "decoded" && meta.range !== "full";
  return meta.times.map((t, i) => {
    const data = new Uint8ClampedArray(raw.subarray(i * px, (i + 1) * px));
    return { width: meta.width, height: meta.height, data: expand ? toFullRange(data, "limited") : data, t };
  });
}

/** A read as `codecRead` gives it. */
export function reader(path: string, track: Decoded, gray: GrayMode, log: string[]) {
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
        placed[place] = gray !== "decoded" ? toFullRange(g, lumaRange(null, track.fullRange)) : g;
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

/** `findOn` in the view: the lane on the frames on a grid `every` seconds apart from the video's start. */
export function findOn(v: VideoFrames, every: number) {
  const all = framesOf(v);
  const idx = gridFrames(v.times, every, v.step || readStep(v.times));
  const found = findLanes(idx.map((i) => all[i]));
  return found.best ? { frame: idx[found.best.index], lanes: frameLanes(found, (i) => idx[i]), best: found.best } : null;
}

export interface AppRead {
  name: string;
  found: ShotFound | null;
  window: ShotFrames["window"];
  /** The band of the picture read (`laneBands`), null for all of it. */
  band: Band | null;
  frames: GrayFrame[];
  log: string[];
  notes: string;
}

/** The frames the app gives the tracer for `path`: the first look, the bands, `readShot`. `fromZero` reads from the video's start instead of the window's. */
export async function appRead(path: string, gray: GrayMode, fromZero = false, lookDir?: string, given?: ShotFound): Promise<AppRead | null> {
  const track = await decodedTrack(path, await fileTrack(path), gray);
  const log: string[] = [];
  const notes = new Notes();
  const coarse = given ? [] : lookDir ? savedLook(lookDir, path, gray) : await look(path, track, gray);
  const search = new ShotSearch();
  for (const f of coarse) search.push(f);
  const found = given ?? search.finish();
  const from = readFrom(track.duration, found);
  const bands = laneBands(track.width, track.height, found);
  log.push(
    `look: ${given ? "given" : `${coarse.length} frames`}; ${found ? `release ${found.release.toFixed(2)} s, pins ${found.pinHit?.toFixed(2) ?? "not seen"}, ${found.guessed ? "guessed, " : ""}${1 + (found.others?.length ?? 0)} runs` : "no shot"}; read from ${from?.toFixed(2) ?? "nowhere"}; bands ${bands.map((b) => (b ? `${b.top.toFixed(2)}-${b.bottom.toFixed(2)}` : "all")).join(", ")}`
  );
  if (from === null) return null;
  const read = reader(path, track, gray, log);
  const video = { width: track.width, height: track.height, duration: track.duration };
  for (let b = 0; b < bands.length; b++) {
    const band = bands[b];
    const r = await readShot(
      read,
      found,
      video,
      band,
      async (first) => findOn(first, FIRST_LANE_EVERY)?.lanes ?? null,
      () => {},
      b === bands.length - 1,
      notes
    );
    if (r === "no-shot") return null;
    if (r === "no-lane") continue;
    let frames = r.frames;
    if (fromZero) {
      // The same frames from the video's start: the same rate and band, to the same last frame.
      const fps = Math.round(1 / r.frames.step);
      const to = r.frames.times[r.frames.times.length - 1] + 0.5 / fps;
      frames = await read({ from: 0, to, fps, band });
    }
    return { name: basename(path), found, window: r.window, band, frames: framesOf(frames), log, notes: notes.text() };
  }
  return null;
}

/** The trace as the view runs it on the read's frames: the lane on 24 of them, then `trace`. */
export function traceRead(frames: GrayFrame[], hand: Handedness, handFromVideo = false) {
  const v: VideoFrames = { width: frames[0].width, height: frames[0].height, gray: frames.map((f) => f.data), times: frames.map((f) => f.t), src: null, step: 0, missing: 0 };
  const m = findOn(v, LANE_EVERY);
  if (!m) return null;
  const out = trace({ source: { count: frames.length, frame: (i) => frames[i] }, calibFrame: m.frame, lanes: m.lanes, hand, handFromVideo });
  // The view's lane check (`traceShot` in `ShotTracerView`): the finder's best frame and the lanes the trace kept.
  const used = out.debug.lanes;
  const evidence: LaneEvidence = {
    guess: m.best.guess,
    support: m.best.support,
    pinsUsed: m.best.pinsUsed,
    camera: m.best.camera,
    kept: used?.kept.length,
    dropped: used?.dropped.length,
    elsewhere: used?.elsewhere.length,
    pinCheck: out.debug.calibration?.pinError ?? null,
    pinsSeen: out.debug.calibration?.pins.length
  };
  return { ...out, laneCheck: laneCheckNote(laneVerdict(evidence), evidence) };
}

if (process.argv[1]?.endsWith("app-read.ts")) {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  // `--hand auto`: the hand read from the video (as the app does), the right hand where it cannot tell.
  const handArg = opt("--hand") ?? "right";
  const auto = handArg === "auto";
  const hand = (auto ? "right" : handArg) as Handedness;
  const gray = (opt("--gray") ?? "full") as GrayMode;
  const fromZero = opt("--from") === "0";
  const jsonOut = opt("--json");
  const dumpDir = opt("--dump");
  const lookDir = opt("--look");
  const foundFile = opt("--found");
  const given = foundFile ? (JSON.parse(readFileSync(foundFile, "utf8")) as ShotFound) : undefined;
  const results: Record<string, unknown>[] = [];
  for (const path of args) {
    const t0 = Date.now();
    const r = await appRead(path, gray, fromZero, lookDir, given);
    if (!r) {
      console.log(`${basename(path)}: no shot read`);
      continue;
    }
    const out = traceRead(r.frames, hand, auto);
    const reading = out ? tracedReading(out) : null;
    const w = r.window;
    console.log(`${r.name} (${gray}${fromZero ? ", from 0" : ""}): ${r.frames.length} frames ${r.frames[0].width}x${r.frames[0].height}, ${r.frames[0].t.toFixed(3)} to ${r.frames[r.frames.length - 1].t.toFixed(3)} s; window foul ${w?.foul?.toFixed(3) ?? "-"} end ${w?.end.toFixed(3) ?? "-"} by ${w?.by ?? "-"} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const l of r.log) console.log(`   ${l}`);
    // The details block's lines on the bands: the runs as judged on the lane, and the window.
    for (const l of r.notes.split("\n").filter((x) => x.startsWith("band"))) console.log(`   ${l}`);
    if (out) console.log(`   lane check: ${out.laneCheck}`);
    const hf = out?.debug.hand;
    if (hf) console.log(`   hand: ${out?.result.ok ? out.result.hand : "-"} (video says ${hf.by === "video" ? hf.hand : `nothing: ${hf.why}`}, confidence ${hf.confidence.toFixed(2)}; ${hf.cues.map((c) => `${c.name} ${c.boards.toFixed(1)} -> ${c.vote.toFixed(2)}`).join(", ")})`);
    const pick = (k: string) => (reading as Record<string, unknown> | null)?.[k];
    console.log(`   ${JSON.stringify({ laydown: pick("laydown"), arrows: pick("arrows"), breakpoint: pick("breakpoint"), at: pick("breakpointFeet"), pins: pick("pins"), launch: pick("launchSpeed"), entry: pick("entrySpeed"), failure: pick("failure") })}`);
    results.push({ name: r.name, gray, fromZero, first: r.frames[0].t, last: r.frames[r.frames.length - 1].t, count: r.frames.length, window: w, trace: reading });
    if (dumpDir) {
      mkdirSync(dumpDir, { recursive: true });
      const stem = r.name.replace(/\.[^.]+$/, "");
      writeFileSync(join(dumpDir, `${stem}.gray`), Buffer.concat(r.frames.map((f) => Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength))));
      writeFileSync(join(dumpDir, `${stem}.json`), JSON.stringify({ name: stem, hand, video: path, band: r.band, width: r.frames[0].width, height: r.frames[0].height, times: r.frames.map((f) => f.t), FIRST_PART_S: 2 }));
    }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1) + "\n");
}
