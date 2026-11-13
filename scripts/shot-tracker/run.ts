/**
 * The shot tracer's development harness (plan 10.3). Never shipped.
 *
 *   npx tsx scripts/shot-tracker/run.ts            # every clip with a calibration
 *   npx tsx scripts/shot-tracker/run.ts shot-01    # one clip
 *
 * For each clip: decodes it to grey frames with ffmpeg, reads the hand-made
 * calibration in `calibrations/<clip>.json`, runs the same `pipeline.ts` the
 * app will run, and writes to `out/<clip>/`: cal-lane.png, cal-near.png, cal-pins.png, sightings.png,
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
import type { BallSighting, Mat3, Metric, TrackResult } from "../../src/lib/shotTrack/types";
import { loadClip, loadColorFrame, type Clip } from "./clip";
import {
  BLUE, CYAN, GREEN, MAGENTA, ORANGE, RED, WHITE, YELLOW,
  canvas, circle, cropScale, cross, dot, fromRgb, line, savePng, stretch, text, toPng, type Canvas, type Color
} from "./draw";
import { drawAcross, drawBoards, drawLandmarks, readCalibration, toCalMarks, type CalibrationFile } from "./overlay";
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
  const out = trace({ source: clip, calibFrame: cal.frame, calMarks: toCalMarks(cal), hand: cal.hand, register: cal.register });
  const ms = Date.now() - t0;
  const r = out.result;
  console.log(`${name}: ${r.ok ? "traced" : `failed (${r.failure}: ${r.detail})`} in ${(ms / 1000).toFixed(1)} s, ${out.debug.candidates.length} candidates, ${out.debug.associated.length} associated`);
  drawCalibration(clip, clipPath, cal, out, outDir);
  const json: Record<string, unknown> = {
    clip: cal.clip, hand: cal.hand, ms, frames: clip.count,
    usableFrames: out.debug.geometry.filter((g) => g?.ok).length,
    // Frames whose lane came from the floor's own homography; the rest kept the whole picture's turn.
    floorRegistered: out.debug.geometry.filter((g) => g?.plane).length,
    floorMissing: out.debug.geometry.filter((g) => g && !g.plane).map((g) => g.index),
    candidates: out.debug.candidates.length, associated: out.debug.associated.length,
    calibration: out.debug.calibration,
    fit: out.debug.fit && {
      redundancy: out.debug.fit.redundancy, worstBoards: +out.debug.fit.worstBoards.toFixed(3),
      residuals: out.debug.fit.residuals.map((q) => ({ mark: q.index ? `${q.label} #${q.index + 1}` : q.label, px: +q.px.toFixed(2), boards: q.boards === null ? null : +q.boards.toFixed(3), feet: q.feet === null ? null : +q.feet.toFixed(3) }))
    }
  };
  if (r.ok) {
    drawSightings(clip, r, out, join(outDir, "sightings.png"));
    savePng(drawLane(r), join(outDir, "lane.png"));
    Object.assign(json, {
      from: r.from, to: r.to, rms: r.rms, path: r.path, metrics: r.metrics, motion: r.motion,
      touchdownFrame: r.touchdownFrame, pinFrame: r.pinFrame, speeds: out.debug.speeds,
      gutterEdgeBoards: edgeStats(out),
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
  "| Clip | Marks (redundancy) | Worst mark, boards | Visible | Sightings | Pins check | RMS | Gutter edges vs fit, L / R boards | Speed anchored / slope mph | Laydown (0 ft) | Touchdown | Arrows | Breakpoint | Pins | Speed |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
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

/** Median offset of each re-snapped gutter edge from the fitted lane edge near the ball's row, boards (positive: toward the right as seen). */
function edgeStats(out: TraceOutput) {
  const med = (k: "left" | "right") => {
    const xs = out.debug.edgeOffsets.map((e) => e[k]).filter((x): x is number => x !== null).sort((a, b) => a - b);
    return xs.length ? +xs[xs.length >> 1].toFixed(2) : null;
  };
  return { left: med("left"), right: med("right"), resnapped: out.debug.edgeOffsets.length };
}

function fmt(m: Metric, unit = ""): string {
  if (m.value === null) return "missing";
  return `${m.state === "estimated" ? "about " : ""}${m.value.toFixed(1)}${unit} (${m.state === "measured" ? "m" : "e"})`;
}

function summaryRow(name: string, cal: CalibrationFile, out: TraceOutput, ms: number): string {
  const r = out.result;
  const c = out.debug.calibration;
  const f = out.debug.fit;
  const nMarks = (cal.points?.length ?? 0) + (cal.lines ?? []).reduce((s, l) => s + l[1].length, 0);
  const fitCols = f ? `${nMarks} (${f.redundancy}) | ${f.worstBoards.toFixed(2)}` : `${nMarks} | not fitted`;
  const pins = c?.pins.length ? c.pins.map((p) => `${p.name.replace("pin ", "")}: ${p.error.toFixed(2)}`).join(", ") : "not found";
  if (!r.ok) return `| ${name} (${cal.hand}) | ${fitCols} | failed: ${r.failure} (${r.detail}) | | | | | | | | | | |`;
  const m = r.metrics;
  const n = r.sightings.filter((s) => !s.airborne).length;
  const sp = out.debug.speeds;
  const es = edgeStats(out);
  return `| ${name} (${cal.hand}) | ${fitCols} | ${r.from.toFixed(1)} to ${r.to.toFixed(1)} ft | ${n} | ${pins} | ${r.rms.toFixed(2)} | ${es.left ?? "none"} / ${es.right ?? "none"} | ${sp ? `${sp.anchored?.toFixed(1) ?? "none"} / ${sp.slope.toFixed(1)}` : ""} | ${fmt(m.laydown)} | ${fmt(m.touchdown)} at ${fmt(m.touchdownFeet, " ft")} | ${fmt(m.arrows)} | ${fmt(m.breakpoint)} at ${fmt(m.breakpointFeet, " ft")} | ${fmt(m.pins)} | ${fmt(m.speed, " mph")} (${(ms / 1000).toFixed(0)} s) |`;
}

function frameCanvas(clipPath: string, clip: Clip, i: number): Canvas {
  return fromRgb(loadColorFrame(clipPath, i, clip.width, clip.height), clip.width, clip.height);
}

/** The picture box around lane points (u, v), raised by `lift` pixels, clipped to the frame. */
function boxAround(H: Mat3, us: number[], vs: number[], lift: number, W: number, Hh: number, pad = 6) {
  const pts = us.flatMap((u) => vs.map((v) => apply(H, { x: u, y: v })));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) - pad));
  const x1 = Math.min(W, Math.ceil(Math.max(...pts.map((p) => p.x)) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - pad - lift));
  const y1 = Math.min(Hh, Math.ceil(Math.max(...pts.map((p) => p.y)) + pad));
  return { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * A contrast-stretched, enlarged crop with the calibration drawn on it: board
 * lines every 5 (board 20 brighter), the foul line and the pin row, the
 * projected arrows (magenta) and pin spots (red), and, when given, the marks
 * (yellow) with each point mark's residual in boards.
 */
function calibratedCrop(
  full: Canvas, H: Mat3, hand: CalibrationFile["hand"], box: { x0: number; y0: number; w: number; h: number }, width: number,
  marks?: { at: { x: number; y: number }[]; label: string; boards: (number | null)[] }[]
): Canvas {
  const k = Math.max(2, Math.min(16, Math.floor(width / box.w)));
  const c = cropScale(stretch(cropScale(full, box.x0, box.y0, box.w, box.h, 1)), 0, 0, box.w, box.h, k);
  drawBoards(c, H, hand, { k, ox: box.x0, oy: box.y0, v0: -2, v1: DECK_END_FT, every: 5 });
  drawBoards(c, H, hand, { k, ox: box.x0, oy: box.y0, v0: -2, v1: DECK_END_FT, every: 20, color: WHITE });
  drawAcross(c, H, 0, YELLOW, k, box.x0, box.y0);
  drawAcross(c, H, 62.6, YELLOW, k, box.x0, box.y0);
  for (let b = 5; b <= 35; b += 5) {
    const p = apply(H, { x: b, y: arrowFeet(b) });
    cross(c, (p.x - box.x0) * k, (p.y - box.y0) * k, Math.max(4, k), MAGENTA);
  }
  for (const pin of Object.values(PIN_POSITIONS)) {
    const p = apply(H, { x: pin.board, y: pin.feet });
    cross(c, (p.x - box.x0) * k, (p.y - box.y0) * k, Math.max(4, k), RED);
  }
  for (const m of marks ?? []) {
    m.at.forEach((q, n) => {
      const x = (q.x - box.x0) * k;
      const y = (q.y - box.y0) * k;
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
      circle(c, x, y, Math.max(3, k / 2), YELLOW);
      const b = m.boards[n];
      if (m.at.length === 1 && b !== null) text(c, x + 6, y + 6, b.toFixed(2), YELLOW, 2);
    });
  }
  return c;
}

/** The calibration on its frame: the whole lane, the near end and the pin deck, for the owner. */
function drawCalibration(clip: Clip, clipPath: string, cal: CalibrationFile, out: TraceOutput, outDir: string): void {
  const fit = out.debug.fit;
  if (!fit) return;
  const full = frameCanvas(clipPath, clip, cal.frame);
  const H = fit.H;
  const marks = out.debug.fitMarks.map((m) => {
    const rs = fit.residuals.filter((q) => q.label === m.label);
    return { label: m.label, at: m.kind === "point" ? [m.at] : m.at, boards: rs.map((q) => q.boards) };
  });
  const pinH = 2.2 * expectedRadiusPxAt(H, 61) * (15 / 8.5);
  const whole = boxAround(H, [LEFT_U - 6, RIGHT_U + 6], [-3, DECK_END_FT], pinH, clip.width, clip.height, 20);
  savePng(calibratedCrop(full, H, cal.hand, whole, 1100, marks), join(outDir, "cal-lane.png"));
  const near = boxAround(H, [LEFT_U - 4, RIGHT_U + 4], [-2, 18], 0, clip.width, clip.height);
  savePng(calibratedCrop(full, H, cal.hand, near, 1100, marks), join(outDir, "cal-near.png"));
  const deck = boxAround(H, [LEFT_U - 4, RIGHT_U + 4], [57, 63.5], pinH, clip.width, clip.height);
  savePng(calibratedCrop(full, H, cal.hand, deck, 1100, marks), join(outDir, "cal-pins.png"));
}

function expectedRadiusPxAt(H: Mat3, v: number): number {
  const a = apply(H, { x: 16, y: v });
  const b = apply(H, { x: 24, y: v });
  return Math.hypot(b.x - a.x, b.y - a.y) / 2;
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
    // Ten boards either side of the ball, enlarged so a board can be read off
    // the numbered lines by eye.
    const a = apply(g.H, { x: Math.max(LEFT_U - 2, s.u - 10), y: Math.max(-2, s.v - 4) });
    const b = apply(g.H, { x: Math.min(RIGHT_U + 2, s.u + 10), y: Math.max(-2, s.v - 4) });
    const top = apply(g.H, { x: 20, y: Math.min(DECK_END_FT, s.v + 6) });
    const x0 = Math.max(0, Math.round(Math.min(a.x, b.x) - 6));
    const x1 = Math.min(clip.width, Math.round(Math.max(a.x, b.x) + 6));
    const y0 = Math.max(0, Math.round(Math.min(top.y, s.cy - 3 * s.r) - 6));
    const y1 = Math.min(clip.height, Math.round(Math.max(a.y, s.cy + 3 * s.r) + 6));
    const k = Math.max(3, Math.min(14, Math.floor(1000 / (x1 - x0))));
    const c = cropScale(full, x0, y0, x1 - x0, y1 - y0, k);
    drawBoards(c, g.H, cal.hand, { k, ox: x0, oy: y0, v0: Math.max(0, s.v - 4), v1: Math.min(DECK_END_FT, s.v + 4), every: 5, labelAt: Math.max(0, s.v - 3.5) });
    drawBoards(c, g.H, cal.hand, { k, ox: x0, oy: y0, v0: Math.max(0, s.v - 4), v1: Math.min(DECK_END_FT, s.v + 4), every: 1, color: [120, 255, 255] });
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
  shots.push(laydownShot(clip, clipPath, cal, r, out));
  shots.push(touchdownShot(clip, clipPath, cal, r, out, first));
  shots.push(markedShot(clip, clipPath, cal, r, out, nearestSighting(r, 15), [6, 22], "Arrows (15 ft)", m.arrows,
    "Contrast-stretched. Magenta crosses: where the calibration puts the arrows' tips; red: the pin spots; cyan lines every 5 boards (white: board 20). If the crosses do not sit on the real arrows, the calibration is off."));
  if (m.breakpointFeet.value !== null) add("Breakpoint", nearestSighting(r, m.breakpointFeet.value), m.breakpointFeet.value, m.breakpoint, `Breakpoint at ${m.breakpointFeet.value.toFixed(1)} ft.`);
  const last = nearestSighting(r, 58);
  shots.push(markedShot(clip, clipPath, cal, r, out, last, [Math.min(42, last.v - 12), 63.5], "Pins (60 ft)", m.pins,
    `Contrast-stretched. Red crosses: where the calibration puts the pin spots (each pin stands on its cross). Entry angle ${fmt(m.entryAngle, " deg")}.`));
  void name;
  return shots;
}

/**
 * The laydown, for checking by eye: the frame in which the ball is over the
 * foul line (in the hand, in the air or on the lane), with the foul line drawn
 * and a tick every 5 boards on it, numbered. The tracer's laydown is the
 * magenta cross on the foul line, with a plumb line up from it: the ball's
 * centre should sit on that line. Below it, the frame before and the frame
 * after.
 */
function laydownShot(clip: Clip, clipPath: string, cal: CalibrationFile, r: TrackResult, out: TraceOutput): ReviewShot {
  const m = r.metrics;
  const rolling = r.sightings.filter((s) => !s.airborne);
  const first = rolling[0];
  // The first 8 ft of sightings: a few frames alone time the crossing poorly.
  const ground = rolling.filter((s) => s.v <= first.v + 8);
  // When the ball is over the foul line: the first sightings' distance against time, run back to 0 ft.
  const mt = ground.reduce((a, s) => a + s.t, 0) / ground.length;
  const mv = ground.reduce((a, s) => a + s.v, 0) / ground.length;
  const den = ground.reduce((a, s) => a + (s.t - mt) ** 2, 0);
  const speed = den > 0 ? ground.reduce((a, s) => a + (s.t - mt) * (s.v - mv), 0) / den : 0;
  const t0 = speed > 0 ? mt - mv / speed : first.t;
  const ok = (f: number) => f >= out.debug.first && !!out.debug.geometry[f - out.debug.first]?.ok;
  const rel = out.debug.release ?? null;
  let f0 = first.frame;
  if (rel) f0 = Math.round(rel.at);
  else {
    for (let f = first.frame; f >= Math.max(out.debug.first, first.frame - 30); f--) {
      if (ok(f) && Math.abs(clip.times[f] - t0) < Math.abs(clip.times[f0] - t0)) f0 = f;
    }
  }
  const panel = (frame: number, width: number, mark: boolean) => {
    const H = out.debug.geometry[frame - out.debug.first].H;
    const box = boxAround(H, [LEFT_U - 3, RIGHT_U + 3], [-3, 4], 4.5 * first.r, clip.width, clip.height);
    const k = Math.max(2, Math.min(12, Math.ceil(width / box.w)));
    const c = cropScale(frameCanvas(clipPath, clip, frame), box.x0, box.y0, box.w, box.h, k);
    const P = (u: number, v: number) => {
      const p = apply(H, { x: u, y: v });
      return { x: (p.x - box.x0) * k, y: (p.y - box.y0) * k };
    };
    for (const u of [LEFT_U, RIGHT_U]) {
      const a = P(u, -1);
      const b = P(u, 4);
      line(c, a.x, a.y, b.x, b.y, GREEN);
    }
    const a = P(LEFT_U - 2, 0);
    const b = P(RIGHT_U + 2, 0);
    line(c, a.x, a.y, b.x, b.y, YELLOW);
    for (let n = 5; n <= 35; n += 5) {
      const u = laneU(n, cal.hand);
      const col: Color = n === 20 ? WHITE : CYAN;
      const p = P(u, -0.5);
      const q = P(u, 0.5);
      line(c, p.x, p.y, q.x, q.y, col);
      const at = P(u, 0);
      if (mark) text(c, at.x - 8 * String(n).length, at.y + 10, String(n), col, n === 20 ? 4 : 3);
    }
    if (m.laydown.value !== null) {
      const at = P(laneU(m.laydown.value, cal.hand), 0);
      cross(c, at.x, at.y, mark ? 10 : 6, MAGENTA);
      line(c, at.x, at.y, at.x, at.y - 5 * first.r * k, MAGENTA, { alpha: 0.8, dash: 6 });
    }
    const disc = rel?.track.find((d) => d.frame === frame);
    if (disc) circle(c, (disc.cx - box.x0) * k, (disc.cy - box.y0) * k, disc.r * k, GREEN);
    return c;
  };
  const big = panel(f0, 900, true);
  const smalls = [f0 - 1, f0 + 1].filter((f) => ok(f) && f < clip.count).map((f) => panel(f, Math.floor(big.width / 2) - 8, false));
  const W = Math.max(big.width, smalls.reduce((a, c) => a + c.width + 8, 0));
  const img = canvas(W, big.height + (smalls.length ? Math.max(...smalls.map((c) => c.height)) + 8 : 0), [250, 250, 250]);
  const blit = (c: Canvas, ox: number, oy: number) => {
    for (let y = 0; y < c.height; y++) img.rgb.set(c.rgb.subarray(y * c.width * 3, (y + 1) * c.width * 3), ((oy + y) * img.width + ox) * 3);
  };
  blit(big, 0, 0);
  let ox = 0;
  for (const c of smalls) {
    blit(c, ox, big.height + 8);
    ox += c.width + 8;
  }
  return {
    title: "Laydown (foul line)",
    png: toPng(img).toString("base64"),
    lines: [
      `Laydown: ${m.laydown.value === null ? "missing" : `board ${m.laydown.value.toFixed(1)}`} (${m.laydown.state}), the board the ball is over as it crosses the foul line.`,
      "The laydown is the board under the ball where it sits right above the foul line in the picture, in the hand or in the air: not where it lands. Above: that frame. Green circle: the ball as the tracer followed it back from the lane. Yellow: the foul line, with a tick every 5 boards on it, numbered (the bowler's own boards; 20 in white). Magenta cross: the tracer's laydown, with a plumb line up from it; the ball's centre should sit on that line. Below: the frame before and the frame after.",
      rel
        ? `Frame ${rel.at.toFixed(1)}: the ball's bottom ${rel.reached ? "reaches the foul line's row" : "comes closest to the foul line's row (it never reaches it: the ball is carried over the line)"}. First sighting on the lane: frame ${first.frame}, board ${handedBoard(first.u, r.hand).toFixed(2)} at ${first.v.toFixed(1)} ft.`
        : `The ball could not be followed back from the lane, so the laydown is the line through its first sightings run back to the foul line (over it at ${t0.toFixed(3)} s, frame ${f0}). First sighting: frame ${first.frame}, board ${handedBoard(first.u, r.hand).toFixed(2)} at ${first.v.toFixed(1)} ft.`
    ]
  };
}

/**
 * The touchdown, for reading the laydown by eye: the whole lane's width at
 * the ball's row in that frame, the two lane edges as the tracer has them
 * there (green), a tick every 5 boards on the ball's row with its number on
 * it (board 20 white), the ball's circle and contact point, and the two frames
 * before it, small.
 */
function touchdownShot(clip: Clip, clipPath: string, cal: CalibrationFile, r: TrackResult, out: TraceOutput, s: BallSighting): ReviewShot {
  const panel = (frame: number, width: number, mark: boolean) => {
    const g = out.debug.geometry[frame - out.debug.first];
    const H = g.H;
    const box = boxAround(H, [LEFT_U - 3, RIGHT_U + 3], [Math.max(-3, s.v - 3), s.v + 4], 2.6 * s.r, clip.width, clip.height);
    const k = Math.max(2, Math.min(12, Math.ceil(width / box.w)));
    const c = cropScale(frameCanvas(clipPath, clip, frame), box.x0, box.y0, box.w, box.h, k);
    const P = (u: number, v: number) => {
      const p = apply(H, { x: u, y: v });
      return { x: (p.x - box.x0) * k, y: (p.y - box.y0) * k };
    };
    for (const u of [LEFT_U, RIGHT_U]) {
      const a = P(u, s.v - 3);
      const b = P(u, s.v + 4);
      line(c, a.x, a.y, b.x, b.y, GREEN);
    }
    const a = P(LEFT_U, s.v);
    const b = P(RIGHT_U, s.v);
    line(c, a.x, a.y, b.x, b.y, CYAN, { alpha: 0.5 });
    for (let n = 5; n <= 35; n += 5) {
      const u = laneU(n, cal.hand);
      const col: Color = n === 20 ? WHITE : CYAN;
      const p = P(u, s.v - 0.6);
      const q = P(u, s.v + 0.6);
      line(c, p.x, p.y, q.x, q.y, col);
      const at = P(u, s.v);
      if (mark) text(c, at.x - 8 * (String(n).length), at.y - 12, String(n), col, n === 20 ? 4 : 3);
    }
    if (mark) {
      circle(c, (s.cx - box.x0) * k, (s.cy - box.y0) * k, s.r * k, GREEN);
      cross(c, (s.contact.x - box.x0) * k, (s.contact.y - box.y0) * k, 8, RED);
    }
    return c;
  };
  // The touchdown frame alone at 900 pixels or more, so a phone can read it;
  // the two frames before it below, at half that.
  const big = panel(s.frame, 900, true);
  const smalls = [s.frame - 2, s.frame - 1].filter((f) => f >= out.debug.first && out.debug.geometry[f - out.debug.first]?.ok).map((f) => panel(f, Math.floor(big.width / 2) - 8, false));
  const W = Math.max(big.width, smalls.reduce((a, c) => a + c.width + 8, 0));
  const img = canvas(W, big.height + (smalls.length ? Math.max(...smalls.map((c) => c.height)) + 8 : 0), [250, 250, 250]);
  const blit = (c: Canvas, ox: number, oy: number) => {
    for (let y = 0; y < c.height; y++) img.rgb.set(c.rgb.subarray(y * c.width * 3, (y + 1) * c.width * 3), ((oy + y) * img.width + ox) * 3);
  };
  blit(big, 0, 0);
  let ox = 0;
  for (const c of smalls) {
    blit(c, ox, big.height + 8);
    ox += c.width + 8;
  }
  const m = r.metrics;
  return {
    title: "Touchdown",
    png: toPng(img).toString("base64"),
    lines: [
      `Touchdown: ${m.touchdown.value === null ? "missing" : `board ${m.touchdown.value.toFixed(1)}`} at ${m.touchdownFeet.value?.toFixed(1) ?? "?"} ft.`,
      "The touchdown is where the ball first touches the lane; it is not the laydown. Above: the touchdown frame, the lane's whole width at the ball's row. Green: the lane's edges as the tracer has them in this frame. Ticks every 5 boards on the ball's row, numbered (the bowler's own boards; 20 in white). Red cross: the point under the ball. Below: the two frames before it, with the ball still in the air or in the hand.",
      `Frame ${s.frame}, t ${s.t.toFixed(3)} s. This sighting: board ${handedBoard(s.u, r.hand).toFixed(2)} at ${s.v.toFixed(1)} ft, radius ${s.r.toFixed(1)} px.`
    ]
  };
}

/** A contrast-stretched lane stretch [v0, v1] at a sighting's frame, with the projected arrows and pin spots. */
function markedShot(clip: Clip, clipPath: string, cal: CalibrationFile, r: TrackResult, out: TraceOutput, s: BallSighting, [v0, v1]: number[], title: string, metric: Metric, note: string): ReviewShot {
  const g = out.debug.geometry[s.frame - out.debug.first];
  const pinH = v1 > 50 ? 4 * expectedRadiusPxAt(g.H, 61) : 2.6 * s.r;
  // The pins picture is zoomed out (the owner, shot-02): the next lanes' edges and the last 20 ft of the ball's path.
  const wide = v1 > 50 ? 12 : 4;
  const box = boxAround(g.H, [LEFT_U - wide, RIGHT_U + wide], [v0, v1], pinH, clip.width, clip.height);
  const c = calibratedCrop(frameCanvas(clipPath, clip, s.frame), g.H, cal.hand, box, 1000);
  const k = c.width / box.w;
  circle(c, (s.cx - box.x0) * k, (s.cy - box.y0) * k, s.r * k, GREEN);
  return {
    title,
    png: toPng(c).toString("base64"),
    lines: [
      `${title}: ${metric.value === null ? "missing" : `${metric.state === "estimated" ? "about " : ""}board ${metric.value.toFixed(1)}`} (${metric.state})`,
      `Frame ${s.frame}. Nearest sighting: board ${handedBoard(s.u, r.hand).toFixed(2)} at ${s.v.toFixed(1)} ft (green circle).`,
      note
    ]
  };
}
