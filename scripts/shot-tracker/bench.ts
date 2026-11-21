/**
 * The app's compute on the sample videos, timed stage by stage, with every
 * reading it gives, so a change to the lane finder or the tracer can be held
 * to the same readings (`--compare`).
 *
 *   npx tsx scripts/shot-tracker/bench.ts [shot-0N | IMG_1996 | dumpDir/stem.json ...] [--out file.json] [--compare base.json] [--dump dir]
 *
 * A `.json` name is a read `app-read.ts --dump` wrote: the frames the app
 * gives the tracer for any video, timed the same way.
 *
 * The frames are what the app reads (`marking.ts`): scaled to fit
 * `MAX_PIXELS`, at 60 a second. The clips are read whole (shot-01 is 279
 * frames, a little over the app's `READ_BUDGET`); IMG_1996 (the phone's original) is cropped to the
 * clips' band (30% to 72% of its height) and read over the window the app
 * chose for it (3.467 to 7.083 s). Then, as `ShotTracerView` does: the lane on
 * the first two seconds' frames (the read's first part) and on the read's,
 * each on the grid the view's `findOn` uses (`gridFrames`), and the trace.
 * Frames keep the file's own times, as the app's do, so the grid falls on the
 * same frames.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIRST_LANE_EVERY, LANE_EVERY } from "../../src/lib/shotTrack/framePick";
import { findLanes, frameLanes } from "../../src/lib/shotTrack/laneFind";
import { bandRows, FrameSlots, keptFps, MAX_PIXELS, READ_RATES, scaledSize, sourceStep } from "../../src/lib/shotTrack/marking";
import { trace } from "../../src/lib/shotTrack/pipeline";
import type { GrayFrame } from "../../src/lib/shotTrack/types";
import { lanesReading, laneFrames, tracedReading, type Run } from "./bench-readings";
import type { Handedness } from "../../src/types/bowling";

const here = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const outFile = opt("--out");
const compareFile = opt("--compare");
const dumpDir = opt("--dump");
const names = args.length ? args : ["shot-01", "shot-02", "shot-03", "shot-04", "shot-05", "shot-06", "IMG_1996"];

/** The read's first part, seconds (`shotWindow.ts`: 0.4 before the run, 1.6 after). */
const FIRST_PART_S = 2;

interface Input {
  name: string;
  hand: Handedness;
  width: number;
  height: number;
  frames: GrayFrame[];
}

function probe(path: string): { width: number; height: number; times: number[] } {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
    "-show_entries", "frame=pts_time,best_effort_timestamp_time", "-of", "json", path
  ], { maxBuffer: 64 << 20 }).toString();
  const info = JSON.parse(out) as { streams: { width: number; height: number; side_data_list?: { rotation?: number }[] }[]; frames: { pts_time?: string; best_effort_timestamp_time?: string }[] };
  const s = info.streams[0];
  const rot = Math.abs(s.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  const [width, height] = rot === 90 || rot === 270 ? [s.height, s.width] : [s.width, s.height];
  const stamps = info.frames.map((f) => Number(f.pts_time ?? f.best_effort_timestamp_time));
  return { width, height, times: stamps };
}

/** The frames `app-read.ts --dump` wrote (`<dir>/<stem>.json` and `.gray`): the app's own read of any video. */
function loadDump(path: string): Input {
  const meta = JSON.parse(readFileSync(path, "utf8")) as { name: string; hand: Handedness; width: number; height: number; times: number[] };
  const raw = readFileSync(path.replace(/\.json$/, ".gray"));
  const px = meta.width * meta.height;
  const frames = meta.times.map((t, i) => ({ width: meta.width, height: meta.height, data: new Uint8ClampedArray(raw.buffer, raw.byteOffset + i * px, px), t }));
  console.log(`${meta.name}: ${frames.length} frames of ${meta.width} x ${meta.height}, as app-read gave them`);
  return { name: meta.name, hand: meta.hand, width: meta.width, height: meta.height, frames };
}

function load(name: string): Input {
  if (name.endsWith(".json")) return loadDump(name);
  const original = !name.startsWith("shot-");
  const path = original ? join(here, "fixtures", "originals", `${name}.mov`) : join(here, "fixtures", "clips", `${name}.mp4`);
  const cal = original ? null : (JSON.parse(readFileSync(join(here, "calibrations", `${name}.json`), "utf8")) as { hand: Handedness });
  const p = probe(path);
  const band = original ? bandRows(p.height, { top: 0.3, bottom: 0.72 }) : { y: 0, h: p.height };
  const size = scaledSize(p.width, band.h, MAX_PIXELS);
  const vf = `crop=${p.width}:${band.h}:0:${band.y},scale=${size.width}:${size.height}:flags=bilinear`;
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "gray", "-vsync", "passthrough", "-"], { maxBuffer: 2e9 });
  const px = size.width * size.height;
  const count = Math.floor(raw.length / px);
  const all = Array.from({ length: count }, (_, i) => ({ i, t: p.times[i] ?? p.times[p.times.length - 1] }));
  const [from, to] = original ? [3.467, 7.083] : [0, Infinity];
  const inWindow = all.filter((f) => f.t >= from - 1e-6 && f.t <= to + 1e-6);
  const seconds = inWindow[inWindow.length - 1].t - inWindow[0].t;
  // The clips are read whole at 60 a second, a little over the app's budget on the longest (shot-01, 279 frames), so the pins are read at the rate the app reads them.
  const fps = original ? Math.min(READ_RATES[0], keptFps(seconds, px)) : READ_RATES[0];
  // The frames the app's reader keeps (`FrameSlots`): every mth of the video's own, counted from its start.
  const shown = inWindow.map((f) => f.t);
  const src = sourceStep(shown.slice(1).map((t, i) => t - shown[i])) ?? 1 / fps;
  const slots = new FrameSlots(inWindow[0].t, Infinity, fps, src);
  const kept = inWindow.filter((f) => slots.offer(f.t));
  const frames = kept.map((f) => ({ width: size.width, height: size.height, data: new Uint8ClampedArray(raw.buffer, raw.byteOffset + f.i * px, px), t: f.t }));
  console.log(`${name}: ${frames.length} frames of ${size.width} x ${size.height} at ${fps} a second`);
  return { name, hand: cal?.hand ?? "right", width: size.width, height: size.height, frames };
}

/** The frames as read, for `pool-bench.ts` to run the same compute in a browser: raw grey, one after another, and what they are. */
function dump(input: Input, dir: string) {
  mkdirSync(dir, { recursive: true });
  const raw = Buffer.concat(input.frames.map((f) => Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength)));
  writeFileSync(join(dir, `${input.name}.gray`), raw);
  writeFileSync(join(dir, `${input.name}.json`), JSON.stringify({ name: input.name, hand: input.hand, width: input.width, height: input.height, times: input.frames.map((f) => f.t), FIRST_PART_S }));
}

function run(input: Input): Run {
  const n = input.frames.length;
  const firstCount = input.frames.filter((f) => f.t <= input.frames[0].t + FIRST_PART_S).length;
  const firstIdx = laneFrames(input.frames.slice(0, firstCount).map((f) => f.t), FIRST_LANE_EVERY);
  let t0 = performance.now();
  const first = findLanes(firstIdx.map((i) => input.frames[i]));
  const firstMs = performance.now() - t0;
  const idx = laneFrames(input.frames.map((f) => f.t), LANE_EVERY);
  t0 = performance.now();
  const all = findLanes(idx.map((i) => input.frames[i]));
  const findMs = performance.now() - t0;
  let traced: Record<string, unknown> | null = null;
  const stages: Record<string, number> = {};
  let traceMs = 0;
  if (all.best) {
    t0 = performance.now();
    let stage = "";
    let since = t0;
    const onProgress = (next: string) => {
      const now = performance.now();
      if (stage) stages[stage] = Math.round(now - since);
      stage = next;
      since = now;
    };
    const out = trace({ source: { count: n, frame: (i) => input.frames[i] }, calibFrame: idx[all.best.index], lanes: frameLanes(all, (i) => idx[i]), hand: input.hand, onProgress });
    traceMs = performance.now() - t0;
    traced = tracedReading(out);
  }
  const r: Run = { name: input.name, frames: n, ms: { firstFind: Math.round(firstMs), find: Math.round(findMs), trace: Math.round(traceMs) }, first: lanesReading(first, firstIdx), lane: lanesReading(all, idx), trace: traced, stages };
  console.log(`${input.name}: first find ${r.ms.firstFind} ms (${firstIdx.length} frames), find ${r.ms.find} ms (${idx.length} frames), trace ${r.ms.trace} ms (${Object.entries(stages).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`   ${JSON.stringify({ lane: r.lane && { frame: r.lane.frame, camera: r.lane.camera }, ...(traced && { laydown: traced.laydown, arrows: traced.arrows, breakpoint: traced.breakpoint, at: traced.breakpointFeet, pins: traced.pins, pinsReadFrame: traced.pinsReadFrame, launch: traced.launchSpeed, entry: traced.entrySpeed, failure: traced.failure }) })}`);
  return r;
}

/** Where two runs' readings differ: numbers by more than `tol`, anything else at all. */
function compare(a: unknown, b: unknown, path: string, out: string[], tol = 0.1) {
  const num = (x: unknown) => (typeof x === "string" && /^-?\d+(\.\d+)?e?$/.test(x) ? Number(x.replace("e", "")) : typeof x === "number" ? x : null);
  const na = num(a);
  const nb = num(b);
  if (na !== null && nb !== null) {
    const est = (x: unknown) => typeof x === "string" && x.endsWith("e");
    const k = path.split(".").pop() ?? "";
    // Picture coordinates and the trace's matrix are not readings; a pixel and a part in 1e4 are their tolerance.
    const t = /corners|camera/.test(path) ? 1 : k.startsWith("H0") ? 1e-4 * Math.max(1, Math.abs(na)) : tol;
    if (Math.abs(na - nb) > t + 1e-9 || est(a) !== est(b)) out.push(`${path}: ${String(a)} -> ${String(b)}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && !path.endsWith("H0")) {
    if (JSON.stringify(a) !== JSON.stringify(b) && !(a.length && typeof a[0] === "number" && a.length === b.length && /corners/.test(path))) {
      if (a.length === b.length && a.every((x) => typeof x === "number")) {
        a.forEach((x, i) => compare(x, b[i], `${path}[${i}]`, out, tol));
        return;
      }
      out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
      return;
    }
    if (/corners/.test(path)) a.forEach((x, i) => compare(x, b[i], `${path}[${i}]`, out, tol));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) || Array.isArray(b)) {
      (a as unknown[]).forEach((x, i) => compare(x, (b as unknown[])[i], `${path}[${i}]`, out, tol));
      return;
    }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (path === "" && (k === "ms" || k === "name" || k === "stages")) continue;
      compare((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out, tol);
    }
    return;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
}

const runs: Run[] = [];
for (const name of names) {
  const input = load(name);
  if (dumpDir) dump(input, dumpDir);
  runs.push(run(input));
}
console.log("\n| input | frames | first find | find | trace | total |\n|---|---|---|---|---|---|");
for (const r of runs) console.log(`| ${r.name} | ${r.frames} | ${(r.ms.firstFind / 1000).toFixed(2)} s | ${(r.ms.find / 1000).toFixed(2)} s | ${(r.ms.trace / 1000).toFixed(2)} s | ${((r.ms.firstFind + r.ms.find + r.ms.trace) / 1000).toFixed(2)} s |`);
if (outFile) writeFileSync(outFile, JSON.stringify(runs, null, 1) + "\n");
if (compareFile) {
  const base = JSON.parse(readFileSync(compareFile, "utf8")) as Run[];
  for (const r of runs) {
    const b = base.find((x) => x.name === r.name);
    if (!b) continue;
    const diffs: string[] = [];
    compare(b, r, "", diffs);
    const speed = (k: keyof Run["ms"]) => `${(b.ms[k] / 1000).toFixed(2)} -> ${(r.ms[k] / 1000).toFixed(2)} s`;
    console.log(`\n${r.name}: first find ${speed("firstFind")}, find ${speed("find")}, trace ${speed("trace")}`);
    console.log(diffs.length ? diffs.map((d) => `   ${d}`).join("\n") : "   the same readings");
  }
}
