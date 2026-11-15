/**
 * Pictures and numbers for judging the fully automatic tracer, clip by clip.
 *
 *   npx tsx scripts/shot-tracker/review-auto.ts [outDir] [shot-0N ...]
 *
 * For each clip: the lane found with no marks (`findLanes`, `frameLanes`, then
 * `trace` exactly as `auto.ts` runs it), drawn thin on color pictures of the
 * calibration frame (`lane.jpg`, `near.jpg`, `far.jpg`), and `manifest.json`
 * with the readings. The output directory defaults to `out/review-auto`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { apply } from "../../src/lib/shotTrack/homography";
import { findLanes, frameLanes } from "../../src/lib/shotTrack/laneFind";
import { pathInPicture } from "../../src/lib/shotTrack/marking";
import { trace } from "../../src/lib/shotTrack/pipeline";
import type { Mat3, Metric, Point, TrackResult } from "../../src/lib/shotTrack/types";
import { loadColorFrame } from "./clip";
import { canvas, dot, fromRgb, line, toPng, type Canvas, type Color } from "./draw";
import { loadTruth } from "./truth";

const here = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const names = args.filter((a) => /^shot-\d+$/.test(a));
const rest = args.filter((a) => !/^shot-\d+$/.test(a));
const outDir = resolve(rest[0] ?? join(here, "out", "review-auto"));
const clips = names.length ? names : ["shot-01", "shot-02", "shot-03", "shot-04", "shot-05", "shot-06"];
const STEP = 10;
const MAX_W = 1100;

const EDGE: Color = [60, 255, 80];
const CROSS: Color = [255, 120, 0];
const PATH: Color = [255, 0, 200];
const SIGHT: Color = [255, 255, 255];

/** A crop of the frame enlarged by a real factor (bilinear), so a width cap never needs an integer. */
function enlarge(c: Canvas, x0: number, y0: number, w: number, h: number, k: number): Canvas {
  const W = Math.round(w * k);
  const H = Math.round(h * k);
  const out = canvas(W, H);
  for (let y = 0; y < H; y++) {
    const sy = Math.max(0, Math.min(c.height - 1.001, y0 + (y + 0.5) / k - 0.5));
    const iy = Math.floor(sy);
    const fy = sy - iy;
    for (let x = 0; x < W; x++) {
      const sx = Math.max(0, Math.min(c.width - 1.001, x0 + (x + 0.5) / k - 0.5));
      const ix = Math.floor(sx);
      const fx = sx - ix;
      for (let ch = 0; ch < 3; ch++) {
        const g = (i: number, j: number) => c.rgb[(j * c.width + i) * 3 + ch];
        out.rgb[(y * W + x) * 3 + ch] = Math.round(
          (1 - fy) * ((1 - fx) * g(ix, iy) + fx * g(ix + 1, iy)) + fy * ((1 - fx) * g(ix, iy + 1) + fx * g(ix + 1, iy + 1))
        );
      }
    }
  }
  return out;
}

interface Box { x: number; y: number; w: number; h: number }

/** The smallest box around lane points (u, v) pushed through H, grown by a margin, kept in the frame. */
function boxOf(H: Mat3, pts: [number, number][], W: number, Hh: number, margin: number): Box {
  const p = pts.map(([u, v]) => apply(H, { x: u, y: v }));
  const x0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q.x)) - margin));
  const x1 = Math.min(W, Math.ceil(Math.max(...p.map((q) => q.x)) + margin));
  const y0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q.y)) - margin));
  const y1 = Math.min(Hh, Math.ceil(Math.max(...p.map((q) => q.y)) + margin));
  return { x: x0, y: y0, w: Math.max(8, x1 - x0), h: Math.max(8, y1 - y0) };
}

interface Layers {
  H: Mat3;
  v0: number;
  v1: number;
  pin: boolean;
  foul: boolean;
  path: Point[];
  sightings: Point[];
}

function render(frame: Canvas, box: Box, want: number, L: Layers): Canvas {
  const k = Math.min(want, MAX_W / box.w);
  const c = enlarge(frame, box.x, box.y, box.w, box.h, k);
  const P = (p: Point): Point => ({ x: (p.x - box.x + 0.5) * k - 0.5, y: (p.y - box.y + 0.5) * k - 0.5 });
  const seg = (a: Point, b: Point, col: Color) => {
    const p = P(a);
    const q = P(b);
    line(c, p.x, p.y, q.x, q.y, col);
  };
  const at = (u: number, v: number) => apply(L.H, { x: u, y: v });
  seg(at(0.5, L.v0), at(0.5, L.v1), EDGE);
  seg(at(39.5, L.v0), at(39.5, L.v1), EDGE);
  if (L.foul) seg(at(-2, 0), at(42, 0), CROSS);
  if (L.pin) seg(at(-2, 62.6), at(42, 62.6), CROSS);
  for (let i = 1; i < L.path.length; i++) seg(L.path[i - 1], L.path[i], PATH);
  for (const s of L.sightings) {
    const p = P(s);
    const fill = Math.max(1, Math.floor(k / 2.5));
    dot(c, p.x, p.y, fill + 1, [0, 0, 0]);
    dot(c, p.x, p.y, fill, SIGHT);
  }
  return c;
}

const jpg = (c: Canvas, file: string) => {
  const tmp = file + ".png";
  writeFileSync(tmp, toPng(c));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", tmp, "-q:v", "3", "-pix_fmt", "yuvj444p", file]);
  rmSync(tmp);
};

const reading = (m: Metric | undefined) => (m ? { value: m.value, state: m.state } : null);
const readings = (m: TrackResult["metrics"] | null | undefined) =>
  m
    ? {
        laydown: reading(m.laydown), arrows: reading(m.arrows), breakpoint: reading(m.breakpoint),
        breakpointFeet: reading(m.breakpointFeet), pins: reading(m.pins), speed: reading(m.speed)
      }
    : null;

const manifest: Record<string, unknown> = {};
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

  const cache = join(here, "out", name, "hand-trace.json");
  const kept = existsSync(cache) ? (JSON.parse(readFileSync(cache, "utf8")) as { ok: boolean; failure?: string; metrics: TrackResult["metrics"] | null }) : null;

  const f = fromRgb(loadColorFrame(t.clipPath, frame, t.clip.width, t.clip.height), t.clip.width, t.clip.height);
  const path = ok ? pathInPicture(H, res.path, res.from, res.to) : [];
  const sightings = ok ? res.sightings.filter((s) => !s.airborne).map((s) => apply(H, { x: s.u, y: s.v })) : [];
  const base = { H, path, sightings };
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
    handCalibrated: kept ? { ok: kept.ok, failure: kept.failure ?? null, ...readings(kept.metrics) } : null,
    found: { camera: found.camera, support: found.support, guess: found.guess },
    pinsUsed: found.pinsUsed,
    lanes: { kept: out.debug.lanes?.kept.length ?? null, dropped: out.debug.lanes?.dropped.length ?? null, totalFound: all.lanes.length },
    sightings: ok ? { used: (res as TrackResult).sightings.filter((s) => !s.airborne).length, fromFeet: (res as TrackResult).from, toFeet: (res as TrackResult).to, rms: (res as TrackResult).rms } : null,
    pictures: pics
  };
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${join(outDir, "manifest.json")}`);
