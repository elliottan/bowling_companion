/**
 * The review pictures from the app's own read (`app-read.ts`): the frames
 * the app gives the tracer, traced as the view traces them, then the lane
 * pictures (`lane.jpg`, `near.jpg`, `far.jpg`), the frame behind each
 * reading (`auto-<reading>.jpg`, `auto-pins-1..5.jpg`, and six frames round
 * the pins frame in `p6/`), `manifest.json` and `frames.json` in the shape
 * `review-auto.ts` writes them, and `readings.json`: every reading with its
 * frame, time and whether it is estimated, the hand and its cues, and the circle check
 * (`outline.ts`) on every reading frame and the five frames before the pins.
 *
 *   npx tsx scripts/shot-tracker/review-app.ts <outDir> <video>[:left] ... [--frames dumpDir] [--check] [--check-frames 211,212]
 *
 * `--frames` takes the read from `app-read.ts --dump` (`<stem>.gray` and
 * `.json`, which name the video and the band read) rather than reading again.
 * `--check` also writes `<name>/check/<reading>-f<frame>.jpg`, for the owner:
 * the tracer's circle in yellow and its base (the point under the ball) as a
 * cross, nothing else; and `<name>/check-debug/` the same with the outline
 * measured afresh in cyan, whose numbers are in `readings.json` (the owner
 * found the second circle confusing, 2026-11-19). `--check-frames` adds
 * those frames (numbered as the video counts them) to the check, as
 * `frame-f<n>.jpg`, wherever the tracer drew a circle on them.
 * The hand is read from the video as the app reads it (the right hand where
 * it cannot tell); `<video>:left` or `:right` makes the trace use that hand.
 * Frame numbers in the pictures and the json are the video's own (counted
 * from its first frame, as ffprobe lists them); `readFrame` is the index in
 * the read. The color pictures are the same frames cropped to the band and
 * scaled to the read's size by ffmpeg.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { apply, downAt } from "../../src/lib/shotTrack/homography";
import { contactPoint, expectedRadiusPx, imageToLane, laneU } from "../../src/lib/shotTrack/laneModel";
import { bandRows } from "../../src/lib/shotTrack/marking";
import { LANE_EVERY } from "../../src/lib/shotTrack/framePick";
import { pathInPicture } from "../../src/lib/shotTrack/marking";
import { trace, type TraceOutput } from "../../src/lib/shotTrack/pipeline";
import type { GrayFrame, Mat3, TrackResult } from "../../src/lib/shotTrack/types";
import type { VideoFrames } from "../../src/shotTracer/videoFrames";
import type { Handedness } from "../../src/types/bowling";
import { appRead, fileTrack, findOn } from "./app-read";
import { tracedReading } from "./bench-readings";
import { cross, fromRgb, type Canvas } from "./draw";
import { outline, type Disc } from "./outline";
import { autoFrames, type AutoReading, type FrameView } from "./review-frames";
import { boxOf, enlarge, jpg, renderLane, ring } from "./review-lib";

interface Input {
  name: string;
  video: string;
  hand: Handedness;
  band: { top: number; bottom: number } | null;
  frames: GrayFrame[];
}

function fromDump(dir: string, stem: string): Input {
  const meta = JSON.parse(readFileSync(join(dir, `${stem}.json`), "utf8")) as { hand: Handedness; video: string; band: Input["band"]; width: number; height: number; times: number[] };
  const raw = readFileSync(join(dir, `${stem}.gray`));
  const px = meta.width * meta.height;
  const frames = meta.times.map((t, i) => ({ width: meta.width, height: meta.height, data: new Uint8ClampedArray(raw.buffer, raw.byteOffset + i * px, px), t }));
  return { name: stem, video: meta.video, hand: meta.hand, band: meta.band, frames };
}

/** Each frame's time as ffprobe lists them, in order: a frame's place in this list is its number in the video. */
function videoTimes(path: string): number[] {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time,best_effort_timestamp_time", "-of", "csv=p=0", path], { maxBuffer: 64 << 20 }).toString();
  return out.trim().split("\n").filter((l) => /\d/.test(l)).map((l) => Number(l.split(",").find((x) => x !== "")));
}

/** The read's frames as a `FrameView`: numbered by the video's own count, in color through ffmpeg (turned as shown, cropped to the band, scaled to the read's size). */
async function viewOf(inp: Input): Promise<FrameView> {
  const track = await fileTrack(inp.video);
  const times = videoTimes(inp.video);
  const { width, height } = inp.frames[0];
  const rows = bandRows(track.height, inp.band);
  const numbers = inp.frames.map((f) => {
    let best = 0;
    for (let k = 1; k < times.length; k++) if (Math.abs(times[k] - f.t) < Math.abs(times[best] - f.t)) best = k;
    return best;
  });
  return {
    hand: inp.hand,
    count: inp.frames.length,
    width,
    height,
    time: (i) => inp.frames[i].t,
    number: (i) => numbers[i],
    color: (i) => {
      const raw = execFileSync("ffmpeg", [
        "-v", "error", "-i", inp.video, "-vf", `select=eq(n\\,${numbers[i]}),crop=${track.width}:${rows.h}:0:${rows.y},scale=${width}:${height}:flags=area`,
        "-frames:v", "1", "-vsync", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
      ], { maxBuffer: 256 << 20 });
      return fromRgb(new Uint8Array(raw.buffer, raw.byteOffset, width * height * 3), width, height);
    }
  };
}

/** The circle the tracer drew on read frame `i`, as the review pictures draw it. */
function discOn(out: TraceOutput, i: number, laydown: boolean): Disc | null {
  const res = out.result as TrackResult;
  const rel = out.debug.release?.track.find((d) => d.frame === i);
  if (laydown && rel) return rel;
  const s = res.sightings.find((x) => x.frame === i);
  if (s) return s;
  return out.debug.toPins?.find((x) => x.frame === i) ?? rel ?? null;
}

export interface CircleCheck {
  frame: number;
  readFrame: number;
  /** The tracer's circle and the outline measured afresh, read frame pixels. */
  circle: Disc;
  outline: Disc | null;
  /** The circle's center from the outline's, in the outline's radii. */
  centerOff: number | null;
  /** The circle's radius over the outline's. */
  radiusRatio: number | null;
  /** The base (one radius down) from the outline's base, boards across. */
  baseBoards: number | null;
  /** The circle's radius over the size the lane predicts where it stands. */
  vsLane: number;
}

function check(f: GrayFrame, H: Mat3, disc: Disc, frame: number, readFrame: number): CircleCheck {
  const down = downAt(H, { x: disc.cx, y: disc.cy });
  const cp = contactPoint(H, { x: disc.cx, y: disc.cy }, disc.r);
  const rExp = expectedRadiusPx(H, cp.u, Math.min(cp.v, 60));
  const o0 = outline(f, disc, down);
  // An outline far from the ball's size has taken a pin or the gutter's edge: not trusted.
  const o = o0 && Math.abs(o0.r / rExp - 1) <= 0.2 ? o0 : null;
  const base = (d: Disc) => ({ x: d.cx + d.r * down.x, y: d.cy + d.r * down.y });
  return {
    frame, readFrame, circle: { cx: disc.cx, cy: disc.cy, r: disc.r }, outline: o,
    centerOff: o ? Math.hypot(disc.cx - o.cx, disc.cy - o.cy) / o.r : null,
    radiusRatio: o ? disc.r / o.r : null,
    baseBoards: o ? imageToLane(H, base(disc)).u - imageToLane(H, base(o)).u : null,
    vsLane: disc.r / rExp
  };
}

if (process.argv[1]?.endsWith("review-app.ts")) {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const dumpDir = opt("--frames");
  const checkPics = args.includes("--check") ? (args.splice(args.indexOf("--check"), 1), true) : false;
  const alsoFrames = opt("--check-frames")?.split(",").map(Number);
  const outDir = resolve(args.shift()!);
  mkdirSync(outDir, { recursive: true });
  const manifest: Record<string, unknown> = {};
  const framesAll: Record<string, unknown> = {};
  const readings: Record<string, unknown> = {};
  for (const arg of args) {
    const [video, side] = arg.split(":");
    const stem = basename(video).replace(/\.[^.]+$/, "");
    let inp: Input;
    if (dumpDir && existsSync(join(dumpDir, `${stem}.json`))) inp = fromDump(dumpDir, stem);
    else {
      const r = await appRead(video, "full");
      if (!r) {
        console.log(`${stem}: no shot read`);
        continue;
      }
      inp = { name: stem, video, hand: (side as Handedness) ?? "right", band: r.band, frames: r.frames };
    }
    if (side) inp.hand = side as Handedness;
    const fromVideo = !side;
    const name = inp.name;
    const vf: VideoFrames = { width: inp.frames[0].width, height: inp.frames[0].height, gray: inp.frames.map((f) => f.data), times: inp.frames.map((f) => f.t), src: null, step: 0, missing: 0 };
    const lane = findOn(vf, LANE_EVERY);
    if (!lane) {
      console.log(`${name}: no lane`);
      manifest[name] = { clip: name, laneFound: false };
      continue;
    }
    const out = trace({ source: { count: inp.frames.length, frame: (i) => inp.frames[i] }, calibFrame: lane.frame, lanes: lane.lanes, hand: inp.hand, handFromVideo: fromVideo });
    // The hand the trace counted its boards from: the video's, unless one was named.
    if (out.result.ok) inp.hand = out.result.hand;
    const view = await viewOf(inp);
    const dir = join(outDir, name);
    mkdirSync(dir, { recursive: true });
    const res = out.result;
    const ok = res.ok;
    const H = out.debug.H0!;
    const W = view.width;
    const Hh = view.height;
    const f = view.color(lane.frame);
    const path = ok ? pathInPicture(H, res.path, res.from, res.drawTo ?? res.to) : [];
    const sightings = ok ? res.sightings.filter((s) => !s.airborne).map((s) => apply(H, { x: s.u, y: s.v })) : [];
    const lay = ok ? res.metrics.laydown.value : null;
    const base = { H, path, sightings, laydown: lay !== null ? apply(H, { x: laneU(lay, inp.hand), y: 0 }) : undefined };
    const pics: Record<string, { file: string; width: number; height: number }> = {};
    const put = (file: string, c: Canvas) => {
      jpg(c, join(dir, file));
      pics[file.replace(".jpg", "")] = { file: `${name}/${file}`, width: c.width, height: c.height };
    };
    put("lane.jpg", renderLane(f, boxOf(H, [[-3, -2], [43, -2], [-3, 64], [43, 64]], W, Hh, 0.03 * Hh), 2, { ...base, v0: -2, v1: 64, pin: true, foul: true }));
    put("near.jpg", renderLane(f, boxOf(H, [[-3, -2], [43, -2], [-3, 20], [43, 20]], W, Hh, 0.015 * Hh), 3, { ...base, v0: -2, v1: 21, pin: false, foul: true }));
    put("far.jpg", renderLane(f, boxOf(H, [[-3, 45], [43, 45], [-3, 66], [43, 66]], W, Hh, 0.015 * Hh), 6, { ...base, v0: 45, v1: 66, pin: true, foul: false }));
    let auto: AutoReading[] = [];
    const checks: CircleCheck[] = [];
    if (ok) {
      auto = autoFrames(view, out, dir, name);
      const pinsRow = auto.find((r) => r.reading === "pins");
      const shown = pinsRow?.frames[pinsRow.frames.length - 1]?.readFrame;
      if (shown !== undefined) {
        mkdirSync(join(dir, "p6"), { recursive: true });
        const six = autoFrames(view, out, dir, name, { pinsFrames: [shown - 3, shown - 2, shown - 1, shown, shown + 1, shown + 2], pinsFile: (k) => `p6/pins-${k}.jpg` });
        const strip = six.find((r) => r.reading === "pins");
        if (pinsRow && strip) (pinsRow as AutoReading & { six?: unknown }).six = strip.frames;
      }
      const geo = (i: number) => out.debug.geometry[i - out.debug.first]?.H ?? null;
      // The reading frames, then any other frame asked for by its number in the video (`--check-frames`).
      const asked = (alsoFrames ?? []).flatMap((n) => {
        const i = Array.from({ length: view.count }, (_, k) => k).find((k) => view.number(k) === n);
        return i === undefined || auto.some((r) => r.frames.some((fm) => fm.readFrame === i)) ? [] : [{ reading: "frame", frames: [{ frame: n, readFrame: i }] }];
      });
      for (const r of [...auto, ...asked]) {
        for (const fm of r.frames) {
          const i = fm.readFrame;
          const h = geo(i);
          const d = discOn(out, i, r.reading === "laydown");
          if (!h || !d) continue;
          const c = check(inp.frames[i], h, d, fm.frame, i);
          checks.push({ ...c, reading: r.reading } as CircleCheck & { reading: string });
          if (checkPics) {
            // For the owner: the circle (yellow) and its base, the point under the ball (a cross); for us, the outline measured afresh (cyan) too.
            mkdirSync(join(dir, "check"), { recursive: true });
            mkdirSync(join(dir, "check-debug"), { recursive: true });
            const R = Math.max(d.r, c.outline?.r ?? 0);
            const box = { x: Math.max(0, Math.floor(d.cx - 2.5 * R)), y: Math.max(0, Math.floor(d.cy - 2.5 * R)), w: Math.ceil(5 * R), h: Math.ceil(5 * R) };
            const k = Math.min(16, 300 / box.w);
            const P = (x: number, y: number) => ({ x: (x - box.x + 0.5) * k - 0.5, y: (y - box.y + 0.5) * k - 0.5 });
            const q = P(d.cx, d.cy);
            const dn = downAt(h, { x: d.cx, y: d.cy });
            const b = P(d.cx + d.r * dn.x, d.cy + d.r * dn.y);
            const plain = () => {
              const pic = enlarge(view.color(i), box.x, box.y, box.w, box.h, k);
              ring(pic, q.x, q.y, d.r * k, [255, 230, 0]);
              cross(pic, b.x, b.y, Math.max(4, 0.25 * d.r * k), [255, 230, 0]);
              return pic;
            };
            jpg(plain(), join(dir, "check", `${r.reading}-f${fm.frame}.jpg`));
            const dbg = plain();
            if (c.outline) {
              const o = P(c.outline.cx, c.outline.cy);
              ring(dbg, o.x, o.y, c.outline.r * k, [0, 230, 255]);
            }
            jpg(dbg, join(dir, "check-debug", `${r.reading}-f${fm.frame}.jpg`));
          }
        }
      }
    }
    const tr = tracedReading(out);
    const m = ok ? (res as TrackResult).metrics : null;
    const metricRow = (k: keyof TrackResult["metrics"]) => (m ? { value: m[k].value, state: m[k].state } : null);
    readings[name] = {
      video: inp.video, hand: inp.hand,
      // How the hand was read: from the video (each cue's boards and vote, -1 left to +1 right) or the setting with no cue.
      handFound: ok ? ((res as TrackResult).handFound ?? null) : null,
      path: ok ? { kind: (res as TrackResult).path.kind, rough: (res as TrackResult).path.rough ?? false, rms: (res as TrackResult).rms } : null,
      band: inp.band, frames: inp.frames.length, first: inp.frames[0].t, last: inp.frames[inp.frames.length - 1].t, calibFrame: view.number(lane.frame),
      failure: ok ? null : res.failure,
      metrics: m ? Object.fromEntries((Object.keys(m) as (keyof TrackResult["metrics"])[]).map((k) => [k, metricRow(k)])) : null,
      pinFrame: ok && res.pinFrame !== null ? view.number(res.pinFrame) : null,
      readings: auto.map((r) => ({
        reading: r.reading, value: r.value, state: r.state, estimated: r.state === "estimated" || r.extrapolated, extrapolated: r.extrapolated,
        frames: r.frames.map((fm) => ({ frame: fm.frame, readFrame: fm.readFrame, time: fm.timeSeconds, picture: fm.picture, ball: fm.ball, note: fm.note }))
      })),
      circles: checks,
      trace: tr
    };
    const fx = (x: number | null, d = 2) => (x === null ? "-" : x.toFixed(d));
    console.log(`${name}: ${JSON.stringify({ l: tr.laydown, a: tr.arrows, b: tr.breakpoint, at: tr.breakpointFeet, p: tr.pins, ls: tr.launchSpeed, es: tr.entrySpeed })}`);
    for (const c of checks) console.log(`   ${String((c as CircleCheck & { reading: string }).reading).padEnd(10)} f${c.frame} r${c.readFrame} center ${fx(c.centerOff)} r, radius ${fx(c.radiusRatio)}, base ${fx(c.baseBoards)} b, vs lane ${fx(c.vsLane)}`);
    manifest[name] = {
      clip: name, laneFound: true, calibFrame: view.number(lane.frame), frameCount: inp.frames.length, hand: inp.hand, traceOk: ok,
      failure: ok ? null : res.failure, detail: ok ? null : res.detail,
      auto: m ? { laydown: metricRow("laydown"), touchdown: metricRow("touchdown"), touchdownFeet: metricRow("touchdownFeet"), arrows: metricRow("arrows"), breakpoint: metricRow("breakpoint"), breakpointFeet: metricRow("breakpointFeet"), pins: metricRow("pins"), speed: metricRow("speed") } : null,
      handCalibrated: null,
      lanes: { kept: out.debug.lanes?.kept.length ?? null, dropped: out.debug.lanes?.dropped.length ?? null },
      sightings: ok ? { used: res.sightings.filter((s) => !s.airborne).length, fromFeet: res.from, toFeet: res.to, rms: res.rms } : null,
      pictures: pics
    };
    framesAll[name] = { clip: name, autoOk: ok, auto };
  }
  const merged = (file: string, mine: Record<string, unknown>) => {
    const prev = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
    const all = { ...prev, ...mine };
    return JSON.stringify(Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]])), null, 2) + "\n";
  };
  writeFileSync(join(outDir, "manifest.json"), merged(join(outDir, "manifest.json"), manifest));
  writeFileSync(join(outDir, "frames.json"), merged(join(outDir, "frames.json"), framesAll));
  writeFileSync(join(outDir, "readings.json"), merged(join(outDir, "readings.json"), readings));
  console.log(`wrote ${outDir}`);
}
