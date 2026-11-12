/**
 * Calibration aid: an enlarged colour crop of one frame with a pixel grid,
 * labelled in source pixels, and optionally a calibration's lines over it.
 *
 *   npx tsx scripts/shot-tracker/peek.ts <clip> <frame> <x0> <y0> <w> <h> <scale> <out.png> [calibration.json]
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadColorFrame } from "./clip";
import { cropScale, fromRgb, line, savePng, text, CYAN, YELLOW, type Canvas } from "./draw";

const [clip, fi, x0s, y0s, ws, hs, ks, out, cal] = process.argv.slice(2);
const [x0, y0, w, h, k] = [x0s, y0s, ws, hs, ks].map(Number);
const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", clip]).toString().trim().split(",").map(Number);
const full = fromRgb(loadColorFrame(clip, Number(fi), dims[0], dims[1]), dims[0], dims[1]);
if (cal) {
  const c = JSON.parse(readFileSync(cal, "utf8")) as { marks: Record<string, [[number, number], [number, number]]> };
  for (const seg of Object.values(c.marks)) {
    const [[ax, ay], [bx, by]] = seg;
    // Extend each mark well past its ends so its fit can be judged.
    const dx = bx - ax;
    const dy = by - ay;
    line(full, ax - dx, ay - dy, bx + dx, by + dy, YELLOW, { alpha: 0.6 });
  }
}
const img: Canvas = cropScale(full, x0, y0, w, h, k);
for (let x = Math.ceil(x0 / 10) * 10; x < x0 + w; x += 10) {
  line(img, (x - x0) * k, 0, (x - x0) * k, img.height - 1, CYAN, { alpha: x % 50 === 0 ? 0.6 : 0.2 });
  if (x % 50 === 0) text(img, (x - x0) * k + 2, 2, String(x), CYAN, 2);
}
for (let y = Math.ceil(y0 / 10) * 10; y < y0 + h; y += 10) {
  line(img, 0, (y - y0) * k, img.width - 1, (y - y0) * k, CYAN, { alpha: y % 50 === 0 ? 0.6 : 0.2 });
  if (y % 50 === 0) text(img, 2, (y - y0) * k + 2, String(y), CYAN, 2);
}
savePng(img, out);
