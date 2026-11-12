/**
 * The shot tracer's development harness (plan 10.3). Never shipped.
 *
 *   npx tsx scripts/shot-tracker/run.ts            # every clip with a calibration
 *   npx tsx scripts/shot-tracker/run.ts shot-01    # one clip
 *
 * For each clip: decodes it to grey frames with ffmpeg, reads the hand-made
 * calibration in `calibrations/<clip>.json`, runs the same `pipeline.ts` the
 * app will run, and writes to `out/<clip>/`: calibration.png, sightings.png,
 * lane.png, result.json and review.html. `out/summary.md` gets the results
 * table for the README.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arrowFeet } from "../../src/lib/laneGeometry";
import { PIN_POSITIONS } from "../../src/lib/pinGeometry";
import { apply } from "../../src/lib/shotTrack/homography";
import { DECK_END_FT, LEFT_U, RIGHT_U, handedBoard, laneU } from "../../src/lib/shotTrack/laneModel";
import { pathU } from "../../src/lib/shotTrack/pathFit";
import { trace, type TraceOutput } from "../../src/lib/shotTrack/pipeline";
import { globalShift } from "../../src/lib/shotTrack/registration";
import { snapEdge } from "../../src/lib/shotTrack/edgeSnap";
import type { BallSighting, Metric, Segment, TrackResult } from "../../src/lib/shotTrack/types";
import { loadClip, loadColorFrame, type Clip } from "./clip";
import {
  BLUE, CYAN, GREEN, MAGENTA, ORANGE, RED, WHITE, YELLOW,
  canvas, circle, cropScale, cross, dot, fromRgb, line, savePng, text, toPng, type Canvas
} from "./draw";
import { drawAcross, drawBoards, drawLandmarks, drawSegment, readCalibration, toMarks, type CalibrationFile } from "./overlay";
import { reviewHtml, type ReviewShot } from "./review";

const here = new URL(".", import.meta.url).pathname;
const calDir = join(here, "calibrations");
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(calDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();

const rows: string[] = [];
const radiusRows: string[] = [];
for (const name of names) {
  const cal = readCalibration(join(calDir, `${name}.json`));
  const outDir = join(here, "out", name);
  mkdirSync(outDir, { recursive: true });
  const clipPath = join(here, "fixtures", "clips", cal.clip);
  const clip = loadClip(clipPath);
  if (cal.skip) {
    const mid = frameCanvas(clipPath, clip, cal.frame);
    savePng(mid, join(outDir, "frame.png"));
    writeFileSync(join(outDir, "review.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name} not traced</title><style>body{font:15px/1.45 system-ui,sans-serif;margin:16px;max-width:1000px}img{max-width:100%}</style></head><body><h1>${name}: not traced</h1><p>${cal.skip}</p><p>Frame ${cal.frame}:</p><img alt="frame" src="data:image/png;base64,${toPng(mid).toString("base64")}"></body></html>\n`);
    rows.push(`| ${name} (${cal.hand}) | not calibrated: ${cal.skip} | | | | | | | | | |`);
    console.log(`${name}: skipped (${cal.skip})`);
    continue;
  }
  const t0 = Date.now();
  const out = trace({ source: clip, calibFrame: cal.frame, marks: toMarks(cal, carrier(clip), refiner(clip, cal)), hand: cal.hand, farFeet: cal.farFeet, register: cal.register,
    carried: (Object.keys(cal.marks) as (keyof typeof cal.marks)[]).filter((k) => cal.marks[k].length === 3) });
  const ms = Date.now() - t0;
  const r = out.result;
  console.log(`${name}: ${r.ok ? "traced" : `failed (${r.failure}: ${r.detail})`} in ${(ms / 1000).toFixed(1)} s, ${out.debug.candidates.length} candidates, ${out.debug.associated.length} associated`);
  drawCalibration(clip, clipPath, cal, out, join(outDir, "calibration.png"));
  const json: Record<string, unknown> = {
    clip: cal.clip, hand: cal.hand, ms, frames: clip.count,
    usableFrames: out.debug.geometry.filter((g) => g?.ok).length,
    candidates: out.debug.candidates.length, associated: out.debug.associated.length,
    calibration: out.debug.calibration, snapSupport: out.debug.snap.support
  };
  if (r.ok) {
    drawSightings(clip, r, out, join(outDir, "sightings.png"));
    savePng(drawLane(r), join(outDir, "lane.png"));
    Object.assign(json, {
      from: r.from, to: r.to, rms: r.rms, path: r.path, metrics: r.metrics, motion: r.motion,
      touchdownFrame: r.touchdownFrame, pinFrame: r.pinFrame,
      sightings: r.sightings.map((s) => ({ f: s.frame, t: +s.t.toFixed(4), u: +s.u.toFixed(2), v: +s.v.toFixed(2), r: +s.r.toFixed(2), w: +s.weight.toFixed(2), air: s.airborne }))
    });
    writeFileSync(join(outDir, "review.html"), reviewHtml(reviewShots(name, clip, clipPath, cal, r, out), name, cal, r, out, json));
  } else {
    Object.assign(json, { failure: r.failure, detail: r.detail });
    writeFileSync(join(outDir, "review.html"), reviewHtml([], name, cal, null, out, json));
  }
  writeFileSync(join(outDir, "result.json"), JSON.stringify(json, null, 1));
  rows.push(summaryRow(name, cal, out, ms));
  if (r.ok) radiusRows.push(radiusRow(name, r));
}
writeFileSync(join(here, "out", "summary.md"), [
  "| Clip | Visible | Sightings | Pins check | Arrows check | RMS | Laydown | Arrows | Breakpoint | Pins | Speed |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  ...rows
].join("\n") + "\n");
writeFileSync(join(here, "out", "radius.md"), [
  "| Clip | r / expected, 0-20 ft | 20-40 ft | 40-60 ft | Mirror image found | Midpoint minus radius contact: feet | boards |",
  "|---|---|---|---|---|---|---|",
  ...radiusRows
].join("\n") + "\n");
console.log(rows.join("\n"));
console.log(radiusRows.join("\n"));

/**
 * The diagnostic for whether the snapped edges are the lane's true edges: the
 * fitted radius over the radius the lane's width predicts, by distance (near
 * 1.00 everywhere when they are), and how far the mirror-image contact sits
 * from the radius contact.
 */
function radiusRow(name: string, r: TrackResult): string {
  const bin = (lo: number, hi: number) => {
    const xs = r.sightings.filter((s) => s.v >= lo && s.v < hi && s.rExpected).map((s) => s.r / s.rExpected!);
    return xs.length ? `${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3)} (${xs.length})` : "none";
  };
  const both = r.sightings.filter((s) => s.reflection && s.radiusV !== undefined);
  const mean = (f: (s: BallSighting) => number) => (both.length ? both.reduce((a, s) => a + f(s), 0) / both.length : NaN);
  return `| ${name} | ${bin(0, 20)} | ${bin(20, 40)} | ${bin(40, 61)} | ${both.length} of ${r.sightings.length} | ${mean((s) => s.v - s.radiusV!).toFixed(2)} | ${mean((s) => s.u - s.radiusU!).toFixed(2)} |`;
}

function fmt(m: Metric, unit = ""): string {
  if (m.value === null) return "missing";
  return `${m.state === "estimated" ? "about " : ""}${m.value.toFixed(1)}${unit} (${m.state === "measured" ? "m" : "e"})`;
}

function summaryRow(name: string, cal: CalibrationFile, out: TraceOutput, ms: number): string {
  const r = out.result;
  const c = out.debug.calibration;
  const pins = c?.pins.length ? c.pins.map((p) => `${p.name.replace("pin ", "")}: ${p.error.toFixed(2)}`).join(", ") : "not found";
  const arrows = c?.arrows.length ? `${c.arrows.length} found, worst ${c.arrowError!.toFixed(2)}` : "not found";
  if (!r.ok) return `| ${name} (${cal.hand}) | failed: ${r.failure} | | ${pins} | ${arrows} | | | | | | |`;
  const m = r.metrics;
  const n = r.sightings.filter((s) => !s.airborne).length;
  return `| ${name} (${cal.hand}) | ${r.from.toFixed(1)} to ${r.to.toFixed(1)} ft | ${n} | ${pins} | ${arrows} | ${r.rms.toFixed(2)} | ${fmt(m.laydown)} | ${fmt(m.arrows)} | ${fmt(m.breakpoint)} at ${fmt(m.breakpointFeet, " ft")} | ${fmt(m.pins)} | ${fmt(m.speed, " mph")} (${(ms / 1000).toFixed(0)} s) |`;
}

/** The picture's shift from one frame to another, summed frame by frame (registration's coarse step). */
function carrier(clip: Clip) {
  return (from: number, to: number) => {
    const d = { x: 0, y: 0 };
    const step = from < to ? 1 : -1;
    for (let i = from; i !== to; i += step) {
      const s = globalShift(clip.frame(i), clip.frame(i + step));
      d.x += s.x;
      d.y += s.y;
    }
    return d;
  };
}

/** Snap a line on the frame it was marked on (edges by the lane-is-brighter rule). */
function refiner(clip: Clip, cal: CalibrationFile) {
  return (frame: number, s: Segment, edge: boolean): Segment => {
    const p = cal.interior?.[String(frame)];
    const r = snapEdge(clip.frame(frame), s, { band: 6, sign: edge ? "rising" : "auto", interior: p ? { x: p[0], y: p[1] } : undefined });
    if (!r.ok) console.log(`  a line marked on frame ${frame} did not snap (support ${r.support.toFixed(2)}); kept as marked`);
    return r.ok ? r.segment : s;
  };
}

function frameCanvas(clipPath: string, clip: Clip, i: number): Canvas {
  return fromRgb(loadColorFrame(clipPath, i, clip.width, clip.height), clip.width, clip.height);
}

function drawCalibration(clip: Clip, clipPath: string, cal: CalibrationFile, out: TraceOutput, file: string): void {
  const full = frameCanvas(clipPath, clip, cal.frame);
  const m = out.debug.snap.marks;
  const rough = toMarks(cal, carrier(clip), refiner(clip, cal));
  const g = out.debug.geometry[cal.frame - out.debug.first];
  const xs = [m.left.a.x, m.left.b.x, m.right.a.x, m.right.b.x];
  const ys = [m.deck.a.y, m.foul.a.y, m.foul.b.y];
  const x0 = Math.max(0, Math.round(Math.min(...xs) - 40));
  const y0 = Math.max(0, Math.round(Math.min(...ys) - 50));
  const w = Math.min(clip.width - x0, Math.round(Math.max(...xs) - x0 + 40));
  const h = Math.min(clip.height - y0, Math.round(Math.max(...ys) - y0 + 30));
  const k = Math.max(2, Math.min(4, Math.floor(1400 / w)));
  const c = cropScale(full, x0, y0, w, h, k);
  for (const key of ["left", "right", "foul", "deck"] as const) {
    drawSegment(c, rough[key], YELLOW, k, x0, y0, 3);
    drawSegment(c, m[key], GREEN, k, x0, y0);
  }
  if (g) {
    drawBoards(c, g.H, cal.hand, { k, ox: x0, oy: y0, labelAt: 3 });
    drawAcross(c, g.H, 15, MAGENTA, k, x0, y0);
    drawAcross(c, g.H, 60, RED, k, x0, y0);
    drawLandmarks(c, g.H, k, x0, y0);
  }
  text(c, 6, 6, `${cal.frame}`, YELLOW, 3);
  savePng(c, file);
}

function drawSightings(clip: Clip, r: TrackResult, out: TraceOutput, file: string): void {
  const tile = 96;
  const cols = 12;
  const list = r.sightings.length > 96 ? r.sightings.filter((_, k) => k % Math.ceil(r.sightings.length / 96) === 0) : r.sightings;
  const img = canvas(cols * tile, Math.ceil(list.length / cols) * tile);
  list.forEach((s, n) => {
    const f = clip.frame(s.frame);
    const half = Math.max(8, Math.round(2.4 * s.r));
    const k = tile / (2 * half);
    const t = canvas(tile, tile);
    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        const sx = Math.round(s.cx - half + x / k);
        const sy = Math.round(s.cy - half + y / k);
        const g = sx >= 0 && sy >= 0 && sx < f.width && sy < f.height ? f.data[sy * f.width + sx] : 0;
        t.rgb[(y * tile + x) * 3] = t.rgb[(y * tile + x) * 3 + 1] = t.rgb[(y * tile + x) * 3 + 2] = g;
      }
    }
    const fit = out.debug.circles.get(s.frame);
    for (const p of fit?.edges ?? []) dot(t, (p.x - s.cx + half) * k, (p.y - s.cy + half) * k, 0, YELLOW);
    circle(t, half * k, half * k, s.r * k, s.airborne ? ORANGE : GREEN);
    cross(t, (s.contact.x - s.cx + half) * k, (s.contact.y - s.cy + half) * k, 3, RED);
    text(t, 2, 2, `${s.frame}`, WHITE, 1);
    text(t, 2, tile - 8, `${s.v.toFixed(1)}f ${handedBoard(s.u, r.hand).toFixed(1)}b`, CYAN, 1);
    const ox = (n % cols) * tile;
    const oy = Math.floor(n / cols) * tile;
    for (let y = 0; y < tile; y++) img.rgb.set(t.rgb.subarray(y * tile * 3, (y + 1) * tile * 3), ((oy + y) * img.width + ox) * 3);
  });
  savePng(img, file);
}

/** The track on a top-down lane, stretched across so boards can be read. */
function drawLane(r: TrackResult): Canvas {
  const kx = 12;
  const ky = 10;
  const W = 40 * kx + 60;
  const H = Math.round(66 * ky) + 20;
  const c = canvas(W, H, [235, 225, 200]);
  // Handed: the bowler's own gutter (board 1) is drawn on the side it is on.
  const X = (u: number) => 30 + u * kx;
  const Y = (v: number) => H - 10 - (v + 2) * ky;
  line(c, X(LEFT_U), Y(0), X(LEFT_U), Y(DECK_END_FT), [90, 90, 90]);
  line(c, X(RIGHT_U), Y(0), X(RIGHT_U), Y(DECK_END_FT), [90, 90, 90]);
  line(c, X(LEFT_U), Y(0), X(RIGHT_U), Y(0), [90, 90, 90]);
  for (let b = 5; b <= 35; b += 5) {
    const u = laneU(b, r.hand);
    line(c, X(u), Y(0), X(u), Y(DECK_END_FT), [200, 190, 170]);
    text(c, X(u) - 4, Y(-1.2), String(b), [60, 60, 60], 1);
    dot(c, X(b), Y(arrowFeet(b)), 2, MAGENTA);
  }
  for (const p of Object.values(PIN_POSITIONS)) circle(c, X(p.board), Y(p.feet), 3, RED);
  for (let v = 0; v <= 60; v += 10) text(c, 2, Y(v) - 3, String(v), [60, 60, 60], 1);
  const v0 = Math.max(0, r.from - 0);
  const v1 = Math.min(DECK_END_FT, r.to + 5);
  for (let v = 0; v < v1; v += 0.1) {
    const dashed = v < r.from || v > r.to;
    if (dashed && Math.floor(v * 2) % 2) continue;
    dot(c, X(pathU(r.path, v)), Y(v), 1, dashed ? BLUE : [20, 60, 200]);
  }
  void v0;
  for (const s of r.sightings) dot(c, X(s.u), Y(s.v), 2, s.airborne ? ORANGE : s.weight > 0.6 ? GREEN : YELLOW);
  return c;
}

function nearestSighting(r: TrackResult, v: number): BallSighting {
  const seen = r.sightings.filter((s) => !s.airborne);
  return seen.reduce((b, s) => (Math.abs(s.v - v) < Math.abs(b.v - v) ? s : b), seen[0]);
}

function reviewShots(name: string, clip: Clip, clipPath: string, cal: CalibrationFile, r: TrackResult, out: TraceOutput): ReviewShot[] {
  const m = r.metrics;
  const shots: ReviewShot[] = [];
  const add = (title: string, s: BallSighting, at: number, metric: Metric, note: string) => {
    const g = out.debug.geometry[s.frame - out.debug.first];
    const full = frameCanvas(clipPath, clip, s.frame);
    const a = apply(g.H, { x: LEFT_U - 2, y: Math.max(-2, s.v - 4) });
    const b = apply(g.H, { x: RIGHT_U + 2, y: Math.max(-2, s.v - 4) });
    const top = apply(g.H, { x: 20, y: Math.min(DECK_END_FT, s.v + 6) });
    const x0 = Math.max(0, Math.round(Math.min(a.x, b.x) - 6));
    const x1 = Math.min(clip.width, Math.round(Math.max(a.x, b.x) + 6));
    const y0 = Math.max(0, Math.round(Math.min(top.y, s.cy - 3 * s.r) - 6));
    const y1 = Math.min(clip.height, Math.round(Math.max(a.y, s.cy + 3 * s.r) + 6));
    const k = Math.max(2, Math.min(10, Math.floor(900 / (x1 - x0))));
    const c = cropScale(full, x0, y0, x1 - x0, y1 - y0, k);
    drawBoards(c, g.H, cal.hand, { k, ox: x0, oy: y0, v0: Math.max(0, s.v - 4), v1: Math.min(DECK_END_FT, s.v + 4), every: 5, labelAt: Math.max(0, s.v - 3.5) });
    drawBoards(c, g.H, cal.hand, { k, ox: x0, oy: y0, v0: Math.max(0, s.v - 1.5), v1: Math.min(DECK_END_FT, s.v + 1.5), every: 1, color: [120, 255, 255] });
    if (title.startsWith("Arrows")) drawLandmarks(c, g.H, k, x0, y0);
    circle(c, (s.cx - x0) * k, (s.cy - y0) * k, s.r * k, GREEN);
    cross(c, (s.contact.x - x0) * k, (s.contact.y - y0) * k, 6, RED);
    // The fitted path at this frame's distance, for comparison with the sighting.
    const pp = apply(g.H, { x: pathU(r.path, at), y: at });
    dot(c, (pp.x - x0) * k, (pp.y - y0) * k, 3, MAGENTA);
    shots.push({
      title,
      png: toPng(c).toString("base64"),
      lines: [
        `${title}: ${metric.value === null ? "missing" : `${metric.state === "estimated" ? "about " : ""}board ${metric.value.toFixed(1)}`} (${metric.state})`,
        `Frame ${s.frame}, t ${s.t.toFixed(3)} s. This sighting: board ${handedBoard(s.u, r.hand).toFixed(2)} at ${s.v.toFixed(1)} ft, radius ${s.r.toFixed(1)} px, weight ${s.weight.toFixed(2)}.`,
        `Fitted path at ${at.toFixed(1)} ft: board ${handedBoard(pathU(r.path, at), r.hand).toFixed(2)}.`,
        note
      ]
    });
  };
  const first = r.sightings.find((s) => !s.airborne)!;
  add("Laydown (touchdown)", first, first.v, m.laydown, `Laydown is the board at the foul line on the skid line through the touchdown (${m.laydownFeet.value?.toFixed(1) ?? "?"} ft). Red cross: the ball's contact point. Magenta dot: the fitted path. Board lines every 5 (numbered, handed) and every board near the ball.`);
  add("Arrows (15 ft)", nearestSighting(r, 15), 15, m.arrows, "The arrows (magenta dots are where the calibration puts them) should sit on the drawn board lines 5 to 35.");
  if (m.breakpointFeet.value !== null) add("Breakpoint", nearestSighting(r, m.breakpointFeet.value), m.breakpointFeet.value, m.breakpoint, `Breakpoint at ${m.breakpointFeet.value.toFixed(1)} ft.`);
  add("Pins (60 ft)", nearestSighting(r, 58), 60, m.pins, `Entry angle ${fmt(m.entryAngle, " deg")}.`);
  void name;
  return shots;
}
