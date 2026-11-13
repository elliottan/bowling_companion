/**
 * Detection aid: what the tracer sees of the ball in a run of frames. For each
 * frame, three panels of the same crop (calibration pixels): the frame
 * steadied onto the empty lane, the empty lane, and the change the detector
 * counts (white: over its threshold), with the frame's candidates boxed.
 *
 *   npx tsx scripts/shot-tracker/diff.ts <clip> <first> <last> <step> <x0> <y0> <w> <h> <scale> <out.png>
 */
import { join } from "node:path";
import { steady } from "../../src/lib/shotTrack/background";
import { changeMap } from "../../src/lib/shotTrack/ballDetect";
import { trace } from "../../src/lib/shotTrack/pipeline";
import { loadClip } from "./clip";
import { GREEN, YELLOW, canvas, cropScale, fromGray, line, savePng, text, type Canvas } from "./draw";
import { readCalibration, toCalMarks } from "./overlay";

const here = new URL(".", import.meta.url).pathname;
const [name, f0s, f1s, steps, x0s, y0s, ws, hs, ks, out] = process.argv.slice(2);
const [f0, f1, step, x0, y0, w, h, k] = [f0s, f1s, steps, x0s, y0s, ws, hs, ks].map(Number);
const cal = readCalibration(join(here, "calibrations", `${name}.json`));
const clip = loadClip(join(here, "fixtures", "clips", cal.clip));
const { debug } = trace({ source: clip, calibFrame: cal.frame, calMarks: toCalMarks(cal), hand: cal.hand, register: cal.register });
const { roi, background: bg } = debug;
if (!roi || !bg) throw new Error("the clip did not reach the background stage");
const frames: number[] = [];
for (let f = f0; f <= f1; f += step) if (debug.steady.has(f)) frames.push(f);
const sheet = canvas(3 * (w * k + 4), frames.length * (h * k + 4));
const paste = (c: Canvas, px: number, py: number) => {
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) for (let q = 0; q < 3; q++) sheet.rgb[((py + y) * sheet.width + px + x) * 3 + q] = c.rgb[(y * c.width + x) * 3 + q];
};
frames.forEach((f, row) => {
  const st = steady(clip.frame(f), debug.steady.get(f)!, roi);
  const { diff, threshold } = changeMap(st, bg);
  const crop = (data: ArrayLike<number>) => cropScale(fromGray(data, roi.width, roi.height), x0 - roi.x0, y0 - roi.y0, w, h, k);
  const panels = [crop(st.data), crop(bg.data), crop(Array.from(diff, (d) => (d > threshold ? 255 : Math.min(160, (160 * d) / threshold))))];
  for (const c of debug.candidates.filter((q) => q.frame === f)) {
    const col = debug.associated.includes(c) ? GREEN : YELLOW;
    const [a, b, cc, d] = [(c.box.x0 - x0) * k, (c.box.y0 - y0) * k, (c.box.x1 + 1 - x0) * k, (c.box.y1 + 1 - y0) * k];
    for (const p of [panels[0], panels[2]]) {
      line(p, a, b, cc, b, col);
      line(p, cc, b, cc, d, col);
      line(p, cc, d, a, d, col);
      line(p, a, d, a, b, col);
    }
  }
  text(panels[0], 2, 2, `${f} thr ${threshold.toFixed(0)}`, YELLOW, 2);
  panels.forEach((p, i) => paste(p, i * (w * k + 4), row * (h * k + 4)));
});
savePng(sheet, out);
console.log(`${frames.length} frames, roi ${roi.x0},${roi.y0} ${roi.width}x${roi.height}`);
