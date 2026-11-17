/**
 * Pictures and numbers for judging the fully automatic tracer, clip by clip.
 *
 *   npx tsx scripts/shot-tracker/review-auto.ts [outDir] [shot-0N ...]
 *
 * For each clip: the lane found with no marks (`findLanes`, `frameLanes`, then
 * `trace` exactly as `auto.ts` runs it), drawn thin on color pictures of the
 * calibration frame (`lane.jpg`, `near.jpg`, `far.jpg`), and `manifest.json`
 * with the readings. The output directory defaults to `out/review-auto`.
 *
 * It also runs the hand-calibrated trace (`--no-hand` skips it and reads the
 * kept readings instead) and, for every board reading that differs from it by
 * more than half a board, writes the frame the reading was taken on, one
 * picture per trace (`review-frames.ts`), and `frames.json`. A run of some
 * clips only updates those clips in `manifest.json` and `frames.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { apply } from "../../src/lib/shotTrack/homography";
import { findLanes, frameLanes } from "../../src/lib/shotTrack/laneFind";
import { pathInPicture } from "../../src/lib/shotTrack/marking";
import { laneU } from "../../src/lib/shotTrack/laneModel";
import { trace } from "../../src/lib/shotTrack/pipeline";
import type { Metric, TrackResult } from "../../src/lib/shotTrack/types";
import { loadColorFrame } from "./clip";
import { fromRgb, type Canvas } from "./draw";
import { autoFrames, reviewFrames, truthView, type FrameCase } from "./review-frames";
import { boxOf, jpg, renderLane as render } from "./review-lib";
import { toCalMarks } from "./overlay";
import { loadTruth } from "./truth";

const here = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const noHand = args.includes("--no-hand");
const names = args.filter((a) => /^shot-\d+$/.test(a));
const rest = args.filter((a) => !/^shot-\d+$/.test(a) && !a.startsWith("--"));
const outDir = resolve(rest[0] ?? join(here, "out", "review-auto"));
const clips = names.length ? names : ["shot-01", "shot-02", "shot-03", "shot-04", "shot-05", "shot-06"];
const STEP = 10;

const reading = (m: Metric | undefined) => (m ? { value: m.value, state: m.state } : null);
const readings = (m: TrackResult["metrics"] | null | undefined) =>
  m
    ? {
        laydown: reading(m.laydown), touchdown: reading(m.touchdown), touchdownFeet: reading(m.touchdownFeet), arrows: reading(m.arrows), breakpoint: reading(m.breakpoint),
        breakpointFeet: reading(m.breakpointFeet), pins: reading(m.pins), speed: reading(m.speed)
      }
    : null;

const readJson = (file: string): Record<string, unknown> => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {});
const manifest: Record<string, unknown> = {};
const framesAll: Record<string, unknown> = {};
for (const name of clips) {
  const t = loadTruth(name);
  const dir = join(outDir, name);
  mkdirSync(dir, { recursive: true });
  const idx = Array.from({ length: Math.ceil(t.clip.count / STEP) }, (_, i) => i * STEP);
  const all = findLanes(idx.map((i) => t.clip.frame(i)));
  const found = all.best;
  if (!found) {
    console.log(`${name}: no lane found`);
    manifest[name] = { clip: name, laneFound: false };
    continue;
  }
  const frame = idx[found.index];
  const t1 = Date.now();
  const out = trace({ source: t.clip, calibFrame: frame, lanes: frameLanes(all, (i) => idx[i]), hand: t.cal.hand, register: t.cal.register });
  const res = out.result;
  const H = out.debug.H0 ?? found.H;
  const ok = res.ok;
  console.log(`${name}: frame ${frame}, ${ok ? "traced" : `failed: ${res.failure}`} in ${Date.now() - t1} ms`);

  let handRun: ReturnType<typeof trace> | null = null;
  let frameCases: FrameCase[] = [];
  if (!noHand) {
    const t2 = Date.now();
    handRun = trace({ source: t.clip, calibFrame: t.cal.frame, calMarks: toCalMarks(t.cal), hand: t.cal.hand, register: t.cal.register });
    console.log(`${name}: hand trace ${handRun.result.ok ? "traced" : `failed: ${handRun.result.failure}`} in ${Date.now() - t2} ms`);
  }
  const cache = join(here, "out", name, "hand-trace.json");
  const kept = existsSync(cache) ? (JSON.parse(readFileSync(cache, "utf8")) as { ok: boolean; failure?: string; metrics: TrackResult["metrics"] | null }) : null;

  const f = fromRgb(loadColorFrame(t.clipPath, frame, t.clip.width, t.clip.height), t.clip.width, t.clip.height);
  const path = ok ? pathInPicture(H, res.path, res.from, res.to) : [];
  const sightings = ok ? res.sightings.filter((s) => !s.airborne).map((s) => apply(H, { x: s.u, y: s.v })) : [];
  const laydown = ok ? (res as TrackResult).metrics.laydown.value : null;
  const base = { H, path, sightings, laydown: laydown !== null ? apply(H, { x: laneU(laydown, t.cal.hand), y: 0 }) : undefined };
  const pics: Record<string, { file: string; width: number; height: number }> = {};
  const put = (file: string, c: Canvas) => {
    jpg(c, join(dir, file));
    pics[file.replace(".jpg", "")] = { file: `${name}/${file}`, width: c.width, height: c.height };
  };
  const mW = t.clip.width;
  const mH = t.clip.height;
  const lane = boxOf(H, [[-3, -2], [43, -2], [-3, 64], [43, 64]], mW, mH, 0.03 * mH);
  put("lane.jpg", render(f, lane, 2, { ...base, v0: -2, v1: 64, pin: true, foul: true }));
  const near = boxOf(H, [[-3, -2], [43, -2], [-3, 20], [43, 20]], mW, mH, 0.015 * mH);
  put("near.jpg", render(f, near, 3, { ...base, v0: -2, v1: 21, pin: false, foul: true }));
  const far = boxOf(H, [[-3, 45], [43, 45], [-3, 66], [43, 66]], mW, mH, 0.015 * mH);
  put("far.jpg", render(f, far, 6, { ...base, v0: 45, v1: 66, pin: true, foul: false }));

  if (handRun) {
    frameCases = reviewFrames(name, t, out, handRun, dir);
    framesAll[name] = {
      clip: name,
      autoOk: ok,
      handOk: handRun.result.ok,
      note: ok && handRun.result.ok ? "readings differing by more than 0.5 board (or present in one trace only), with the frame each trace took them on" : "no comparison: a trace failed",
      readings: frameCases,
      auto: autoFrames(truthView(t), out, dir, name)
    };
    console.log(`${name}: ${frameCases.map((c) => `${c.reading} ${c.auto.value?.toFixed(1) ?? "-"} vs ${c.hand.value?.toFixed(1) ?? "-"} (frames ${c.auto.frame} / ${c.hand.frame})`).join("; ") || "no differing readings"}`);
  }

  manifest[name] = {
    clip: name,
    laneFound: true,
    calibFrame: frame,
    frameCount: t.clip.count,
    hand: t.cal.hand,
    traceOk: ok,
    failure: ok ? null : res.failure,
    detail: ok ? null : res.detail,
    auto: ok ? readings((res as TrackResult).metrics) : null,
    handCalibrated: handRun ? { ok: handRun.result.ok, failure: handRun.result.ok ? null : handRun.result.failure, ...readings(handRun.result.ok ? handRun.result.metrics : null) } : kept ? { ok: kept.ok, failure: kept.failure ?? null, ...readings(kept.metrics) } : null,
    found: { camera: found.camera, support: found.support, guess: found.guess },
    pinsUsed: found.pinsUsed,
    lanes: { kept: out.debug.lanes?.kept.length ?? null, dropped: out.debug.lanes?.dropped.length ?? null, totalFound: all.lanes.length },
    sightings: ok ? { used: (res as TrackResult).sightings.filter((s) => !s.airborne).length, fromFeet: (res as TrackResult).from, toFeet: (res as TrackResult).to, rms: (res as TrackResult).rms } : null,
    pictures: pics
  };
}
// Merged with what other runs left, read back just now so parallel runs of different clips do not lose each other's.
const merged = (file: string, mine: Record<string, unknown>) => {
  const all = { ...readJson(file), ...mine };
  return JSON.stringify(Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]])), null, 2) + "\n";
};
writeFileSync(join(outDir, "manifest.json"), merged(join(outDir, "manifest.json"), manifest));
if (!noHand) writeFileSync(join(outDir, "frames.json"), merged(join(outDir, "frames.json"), framesAll));
console.log(`wrote ${join(outDir, "manifest.json")}`);
