/**
 * Release aid: frames of a clip around the release, each cropped to the near
 * end with the foul line drawn and a tick every board on it (numbered every
 * 5, in the bowler's boards), for reading where the ball is as it reaches the
 * foul line. The lane lines are on the floor: a ball in the air is read
 * against the ticks straight below its centre.
 *
 *   npx tsx scripts/shot-tracker/foul.ts <clip> <out.png> <frame> [<frame> ...]
 */
import { join } from "node:path";
import { apply } from "../../src/lib/shotTrack/homography";
import { LEFT_U, RIGHT_U, laneU } from "../../src/lib/shotTrack/laneModel";
import { trace } from "../../src/lib/shotTrack/pipeline";
import { loadClip, loadColorFrame } from "./clip";
import { CYAN, GREEN, WHITE, YELLOW, canvas, cropScale, fromRgb, line, savePng, text, type Canvas, type Color } from "./draw";
import { readCalibration, toCalMarks } from "./overlay";

const here = new URL(".", import.meta.url).pathname;
const [name, out, ...fs] = process.argv.slice(2);
const cal = readCalibration(join(here, "calibrations", `${name}.json`));
const clipPath = join(here, "fixtures", "clips", cal.clip);
const clip = loadClip(clipPath);
const { debug } = trace({ source: clip, calibFrame: cal.frame, calMarks: toCalMarks(cal), hand: cal.hand, register: cal.register });
const panels: Canvas[] = [];
for (const f of fs.map(Number)) {
  const g = debug.geometry[f - debug.first];
  if (!g?.ok) continue;
  const P0 = (u: number, v: number) => apply(g.H, { x: u, y: v });
  const pts = [P0(LEFT_U - 2, -3), P0(RIGHT_U + 2, -3), P0(LEFT_U - 2, 3), P0(RIGHT_U + 2, 3)];
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const x1 = Math.min(clip.width, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const y1 = Math.min(clip.height, Math.ceil(Math.max(...pts.map((p) => p.y))));
  const y0 = Math.max(0, y1 - Math.round(0.75 * (x1 - x0)));
  const k = Math.max(2, Math.ceil(700 / (x1 - x0)));
  const c = cropScale(fromRgb(loadColorFrame(clipPath, f, clip.width, clip.height), clip.width, clip.height), x0, y0, x1 - x0, y1 - y0, k);
  const P = (u: number, v: number) => {
    const p = P0(u, v);
    return { x: (p.x - x0) * k, y: (p.y - y0) * k };
  };
  for (const u of [LEFT_U, RIGHT_U]) {
    const a = P(u, -2);
    const b = P(u, 3);
    line(c, a.x, a.y, b.x, b.y, GREEN);
  }
  const a = P(LEFT_U - 2, 0);
  const b = P(RIGHT_U + 2, 0);
  line(c, a.x, a.y, b.x, b.y, YELLOW);
  for (let n = 1; n <= 39; n++) {
    const u = laneU(n, cal.hand);
    const col: Color = n === 20 ? WHITE : CYAN;
    const p = P(u, n % 5 ? -0.15 : -0.5);
    const q = P(u, n % 5 ? 0.15 : 0.5);
    line(c, p.x, p.y, q.x, q.y, col);
    if (n % 5 === 0) text(c, P(u, 0).x - 8 * String(n).length, P(u, 0).y + 10, String(n), col, 3);
  }
  text(c, 6, 6, `frame ${f}  ${clip.times[f].toFixed(3)} s`, YELLOW, 3);
  panels.push(c);
}
const cols = 2;
const w = Math.max(...panels.map((p) => p.width));
const h = Math.max(...panels.map((p) => p.height));
const sheet = canvas(cols * (w + 8), Math.ceil(panels.length / cols) * (h + 8), [255, 255, 255]);
panels.forEach((p, i) => {
  const ox = (i % cols) * (w + 8);
  const oy = Math.floor(i / cols) * (h + 8);
  for (let y = 0; y < p.height; y++) sheet.rgb.set(p.rgb.subarray(y * p.width * 3, (y + 1) * p.width * 3), ((oy + y) * sheet.width + ox) * 3);
});
savePng(sheet, out);
console.log(`${panels.length} frames`);
