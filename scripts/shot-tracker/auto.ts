/**
 * The tracer with no marks at all: the lane found by `laneFind.ts` on every
 * frame it can be (`findLanes`), then the same `trace()` the app runs with
 * those lanes (`lanes`), against the hand-verified calibration.
 *
 *   npx tsx scripts/shot-tracker/auto.ts [shot-0N ...] [--step 10] [--no-trace] [--png] [--fresh-hand]
 *
 * For each clip: the frame the finder chose, the found lines against the hand
 * calibration carried to that frame (boards at the foul line and at 50 ft,
 * feet for the foul line and the pin row), the pins check, and the readings
 * of both traces side by side. Writes `out/auto.md`.
 *
 * The hand trace does not depend on the finder, so its readings are kept in
 * `out/<clip>/hand-trace.json` beside the calibration they came from and
 * reused while that file is unchanged; `--fresh-hand` traces it again (after
 * a change to the tracer itself).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fitCalibration, focalFromPlane } from "../../src/lib/shotTrack/calibrate";
import { checkPins } from "../../src/lib/shotTrack/calibrationCheck";
import { apply, intersect, invert, lineThrough, multiply, normalize, type Line3 } from "../../src/lib/shotTrack/homography";
import { findLanes, frameLanes } from "../../src/lib/shotTrack/laneFind";
import { trace } from "../../src/lib/shotTrack/pipeline";
import { register, registerPlane } from "../../src/lib/shotTrack/registration";
import type { Mat3, Metric, TrackResult } from "../../src/lib/shotTrack/types";
import { toCalMarks } from "./overlay";
import { loadTruth } from "./truth";
import { loadColorFrame } from "./clip";
import { CYAN, GREEN, YELLOW, fromRgb, line as drawLine, savePng } from "./draw";

const args = process.argv.slice(2);
const flag = (k: string) => {
  const i = args.indexOf(k);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const step = Number(opt("--step") ?? 10);
const noTrace = flag("--no-trace");
const png = flag("--png");
const freshHand = flag("--fresh-hand");
const here = new URL(".", import.meta.url).pathname;
const names = args.length ? [...args] : ["shot-01", "shot-02", "shot-03", "shot-04", "shot-05", "shot-06"];

/** Where a picture line crosses the cross-lane line at v feet of H, as lane u. */
function uOf(H: Mat3, l: Line3, v: number): number {
  const p = intersect(l, lineThrough(apply(H, { x: -20, y: v }), apply(H, { x: 60, y: v })));
  return p ? apply(invert(H), p).x : NaN;
}
/** Where a picture line crosses the lane line at u boards of H, as lane v. */
function vOf(H: Mat3, l: Line3, u: number): number {
  const p = intersect(l, lineThrough(apply(H, { x: u, y: -10 }), apply(H, { x: u, y: 70 })));
  return p ? apply(invert(H), p).y : NaN;
}
const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");
const metric = (m: Metric | undefined, d = 1) => (m && m.value !== null ? `${m.value.toFixed(d)}${m.state === "estimated" ? "e" : ""}` : "-");

const rows: string[] = [
  "| clip | frame | left 0 / 50 ft | right 0 / 50 ft | foul ft | pin row ft | pins check | laydown | arrows | breakpoint | pins | speed |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|"
];
for (const name of names) {
  const t = loadTruth(name);
  const t0 = Date.now();
  const idx = Array.from({ length: Math.ceil(t.clip.count / step) }, (_, i) => i * step);
  const all = findLanes(idx.map((i) => t.clip.frame(i)));
  const found = all.best;
  const ms = Date.now() - t0;
  if (!found) {
    console.log(`${name}: no lane found (${ms} ms)`);
    rows.push(`| ${name} | not found | | | | | | | | | | |`);
    continue;
  }
  const frame = idx[found.index];
  const lo = Math.min(frame, t.cal.frame);
  const hi = Math.max(frame, t.cal.frame);
  // The hand truth carried to the finder's frame the way the tracer carries
  // its calibration: the whole picture's turn, then the lane's own plane
  // (the camera travels on these hand-held clips, and the picture's turn
  // alone puts the near end boards out over a hundred frames).
  let H = t.H;
  if (frame !== t.cal.frame) {
    const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const pics = register(t.clip, t.cal.frame, I, lo, hi, t.cal.register);
    const focal = focalFromPlane(t.H, t.clip.width, t.clip.height) ?? undefined;
    H = normalize(multiply(registerPlane(t.clip, t.cal.frame, t.H, pics, lo, { focal })[frame - lo].S, t.H));
  }
  const fit = fitCalibration(found.marks);
  const f = t.clip.frame(frame);
  const L = [uOf(H, found.left, 0) - 0.5, uOf(H, found.left, 50) - 0.5];
  const R = [uOf(H, found.right, 0) - 39.5, uOf(H, found.right, 50) - 39.5];
  const foul = found.foul ? vOf(H, found.foul, 20) : NaN;
  const pinRow = found.pinRow ? vOf(H, found.pinRow, 20) - 62.6 : NaN;
  const pins = checkPins(f, fit.H);
  const pinsTruth = checkPins(f, H);
  console.log(`${name}: frame ${frame} (${ms} ms over ${idx.length} frames, the lane on ${all.lanes.length}); camera ${fmt(found.camera, 1)} ft; support L ${fmt(found.support.left)} R ${fmt(found.support.right)}; fit worst ${fmt(fit.worstBoards)} boards`);
  console.log(`   coarse left ${fmt(uOf(H, found.coarse.left, 0) - 0.5)} / ${fmt(uOf(H, found.coarse.left, 50) - 0.5)}  right ${fmt(uOf(H, found.coarse.right, 0) - 39.5)} / ${fmt(uOf(H, found.coarse.right, 50) - 39.5)}`);
  console.log(`   left ${fmt(L[0])} / ${fmt(L[1])}  right ${fmt(R[0])} / ${fmt(R[1])} boards at 0 / 50 ft; foul ${fmt(foul)} ft; pin row ${fmt(pinRow)} ft`);
  console.log(`   pins check: found ${pins.map((p) => `${p.name} ${fmt(p.error)}`).join(", ")} | hand ${pinsTruth.map((p) => `${p.name} ${fmt(p.error)}`).join(", ")}`);
  if (png) {
    const c = fromRgb(loadColorFrame(t.clipPath, frame, t.clip.width, t.clip.height), t.clip.width, t.clip.height);
    const draw = (l: Line3, col: [number, number, number]) => {
      if (Math.abs(l[0]) > Math.abs(l[1])) drawLine(c, -(l[2]) / l[0], 0, -(l[1] * (c.height - 1) + l[2]) / l[0], c.height - 1, col, { alpha: 0.8 });
      else drawLine(c, 0, -(l[2]) / l[1], c.width - 1, -(l[0] * (c.width - 1) + l[2]) / l[1], col, { alpha: 0.8 });
    };
    for (const [u0, u1, v0, v1] of [[0.5, 0.5, -5, 63], [39.5, 39.5, -5, 63], [-10, 50, 0, 0], [-10, 50, 62.6, 62.6]]) {
      const a = apply(H, { x: u0, y: v0 });
      const b = apply(H, { x: u1, y: v1 });
      drawLine(c, a.x, a.y, b.x, b.y, CYAN, { alpha: 0.9 });
    }
    for (const l of [found.left, found.right]) draw(l, GREEN);
    for (const l of [found.foul, found.pinRow]) if (l) draw(l, YELLOW);
    mkdirSync(join(here, "out", name), { recursive: true });
    savePng(c, join(here, "out", name, "auto-lane.png"));
  }
  let read = "| - | - | - | - | - |";
  if (!noTrace) {
    // The lane found on every frame it was found on, each frame's own blended
    // from those near it (`laneTrack`); the finder's chosen frame is only the
    // one the pictures are registered to.
    const t1 = Date.now();
    const autoOut = trace({ source: t.clip, calibFrame: frame, lanes: frameLanes(all, (i) => idx[i]), hand: t.cal.hand, register: t.cal.register });
    const auto = autoOut.result;
    console.log(`   traced in ${Date.now() - t1} ms; found lanes dropped as disagreeing: ${autoOut.debug.lanes?.dropped.map((l) => l.frame).join(", ") || "none"}`);
    const line = (r: typeof auto) => (r.ok ? (r as TrackResult).metrics : null);
    const a = line(auto);
    const cache = join(here, "out", name, "hand-trace.json");
    const key = JSON.stringify(t.cal);
    const kept = existsSync(cache) ? (JSON.parse(readFileSync(cache, "utf8")) as { key: string; ok: boolean; failure?: string; metrics: TrackResult["metrics"] | null }) : null;
    let handOk: boolean;
    let handFailure: string | undefined;
    let h: TrackResult["metrics"] | null;
    if (kept && kept.key === key && !freshHand) {
      ({ ok: handOk, failure: handFailure, metrics: h } = kept);
    } else {
      const hand = trace({ source: t.clip, calibFrame: t.cal.frame, calMarks: toCalMarks(t.cal), hand: t.cal.hand, register: t.cal.register }).result;
      handOk = hand.ok;
      handFailure = hand.ok ? undefined : hand.failure;
      h = line(hand);
      mkdirSync(join(here, "out", name), { recursive: true });
      writeFileSync(cache, JSON.stringify({ key, ok: handOk, failure: handFailure, metrics: h }));
    }
    const pair = (k: keyof TrackResult["metrics"], d = 1) => `${metric(a?.[k], d)} (${metric(h?.[k], d)})`;
    console.log(`   auto ${auto.ok ? "traced" : `failed: ${auto.failure} ${auto.detail}`}; hand ${handOk ? "traced" : `failed: ${handFailure}`}`);
    console.log(`   laydown ${pair("laydown")}  arrows ${pair("arrows")}  breakpoint ${pair("breakpoint")} at ${pair("breakpointFeet", 0)} ft  pins ${pair("pins")}  speed ${pair("speed")}   (hand in brackets)`);
    read = `| ${pair("laydown")} | ${pair("arrows")} | ${pair("breakpoint")} at ${pair("breakpointFeet", 0)} | ${pair("pins")} | ${pair("speed")} |`;
  }
  rows.push(`| ${name} | ${frame} | ${fmt(L[0])} / ${fmt(L[1])} | ${fmt(R[0])} / ${fmt(R[1])} | ${fmt(foul)} | ${fmt(pinRow)} | ${pins.map((p) => `${p.name.replace("pin ", "")}: ${fmt(p.error)}`).join(", ") || "-"} ${read}`);
}
mkdirSync(join(here, "out"), { recursive: true });
writeFileSync(join(here, "out", "auto.md"), rows.join("\n") + "\n");
console.log("\n" + rows.join("\n"));
