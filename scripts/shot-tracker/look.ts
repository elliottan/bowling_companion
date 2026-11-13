/**
 * Calibration aid: an enlarged, locally contrast-stretched crop of one frame
 * with a pixel grid labelled in source pixels, for placing marks on the lane's
 * own markings (arrows, pin bases, edges, the foul line). With --cal, the
 * clip's calibration is fitted and drawn over it: every mark (yellow) with its
 * residual, the projected arrows (magenta) and pin spots (red), board lines
 * every 5 and the foul line, so a misplaced mark or calibration shows.
 *
 *   npx tsx scripts/shot-tracker/look.ts <clip> <frame> <x0> <y0> <w> <h> <scale> <out.png> [--cal] [--median]
 */
import { join } from "node:path";
import { arrowFeet } from "../../src/lib/laneGeometry";
import { PIN_POSITIONS } from "../../src/lib/pinGeometry";
import { fitCalibration, type CalMark } from "../../src/lib/shotTrack/calibrate";
import { apply, invert, multiply } from "../../src/lib/shotTrack/homography";
import { register } from "../../src/lib/shotTrack/registration";
import type { Mat3 } from "../../src/lib/shotTrack/types";
import { loadClip, loadColorFrame } from "./clip";
import { medianBackground } from "../../src/lib/shotTrack/background";
import { warp } from "../../src/lib/shotTrack/image";
import { CYAN, MAGENTA, RED, YELLOW, cropScale, cross, fromGray, fromRgb, line, savePng, stretch, text, type Canvas } from "./draw";
import { drawAcross, drawBoards, readCalibration, toCalMarks } from "./overlay";

const here = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const withCal = args.includes("--cal");
const withMedian = args.includes("--median");
const [name, fi, x0s, y0s, ws, hs, ks, out] = args.filter((a) => !a.startsWith("--"));
const [x0, y0, w, h, k] = [x0s, y0s, ws, hs, ks].map(Number);
const frame = Number(fi);
const cal = readCalibration(join(here, "calibrations", `${name}.json`));
const clipPath = join(here, "fixtures", "clips", cal.clip);
const clip = loadClip(clipPath);
// --median: the per-pixel median of every fourth frame of the clip carried into
// this frame's pixels, so the bowler, the ball and passing reflections go and
// the lane's own marks stay.
const full = withMedian ? medianCanvas() : fromRgb(loadColorFrame(clipPath, frame, clip.width, clip.height), clip.width, clip.height);
function medianCanvas(): Canvas {
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const geo = register(clip, frame, I, 0, clip.count - 1, cal.register);
  const frames = geo.filter((g, i) => g && g.ok && i % 4 === 0).map((g) => warp(clip.frame(g.index), g.S, 0, 0, clip.width, clip.height));
  const m = medianBackground(frames);
  const data = Uint8Array.from(m.data, (v) => (Number.isFinite(v) ? v : 0));
  return fromGray(data, clip.width, clip.height);
}
const img: Canvas = cropScale(stretch(full), x0, y0, w, h, k);
for (let x = Math.ceil(x0 / 10) * 10; x < x0 + w; x += 10) {
  line(img, (x - x0) * k, 0, (x - x0) * k, img.height - 1, CYAN, { alpha: x % 50 === 0 ? 0.5 : 0.15 });
  if (x % 50 === 0) text(img, (x - x0) * k + 2, 2, String(x), CYAN, 2);
}
for (let y = Math.ceil(y0 / 10) * 10; y < y0 + h; y += 10) {
  line(img, 0, (y - y0) * k, img.width - 1, (y - y0) * k, CYAN, { alpha: y % 50 === 0 ? 0.5 : 0.15 });
  if (y % 50 === 0) text(img, 2, (y - y0) * k + 2, String(y), CYAN, 2);
}
if (withCal) {
  const marks = toCalMarks(cal);
  const frames = [frame, cal.frame, ...marks.map((m) => m.frame ?? cal.frame)];
  const lo = Math.min(...frames);
  const hi = Math.max(...frames);
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const geo = lo === hi ? null : register(clip, cal.frame, I, lo, hi, cal.register);
  const S = (f: number) => (geo && f !== cal.frame ? geo[f - lo].S : I);
  const inCal: CalMark[] = marks.map((m) => {
    const back = invert(S(m.frame ?? cal.frame));
    return m.kind === "point" ? { ...m, at: apply(back, m.at) } : { ...m, at: m.at.map((p) => apply(back, p)) };
  });
  const fit = fitCalibration(inCal);
  const H = multiply(S(frame), fit.H);
  console.log(`redundancy ${fit.redundancy}, worst ${fit.worstBoards.toFixed(2)} boards`);
  for (const r of fit.residuals) {
    console.log(`  ${r.label}#${r.index}: ${r.px.toFixed(2)} px, ${r.boards === null ? "" : `${r.boards.toFixed(2)} boards`}${r.feet === null ? "" : ` ${r.feet.toFixed(2)} ft`}`);
  }
  drawBoards(img, H, cal.hand, { k, ox: x0, oy: y0, v0: -3, v1: 62.85, every: 5, labelAt: 2 });
  drawAcross(img, H, 0, YELLOW, k, x0, y0);
  drawAcross(img, H, 62.6, YELLOW, k, x0, y0);
  for (let b = 5; b <= 35; b += 5) {
    const p = apply(H, { x: b, y: arrowFeet(b) });
    cross(img, (p.x - x0) * k, (p.y - y0) * k, Math.max(3, k), MAGENTA);
  }
  for (const pin of Object.values(PIN_POSITIONS)) {
    const p = apply(H, { x: pin.board, y: pin.feet });
    cross(img, (p.x - x0) * k, (p.y - y0) * k, Math.max(3, k), RED);
  }
  const Sf = S(frame);
  for (const m of inCal) {
    for (const q of m.kind === "point" ? [m.at] : m.at) {
      const p = apply(Sf, q);
      cross(img, (p.x - x0) * k, (p.y - y0) * k, 2, YELLOW);
    }
  }
}
savePng(img, out);
