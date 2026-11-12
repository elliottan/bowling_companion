/**
 * Check a hand-made calibration before tracing: snaps the marks on their frame
 * and draws the result (snapped lines green, the marks yellow, board lines
 * every 5 boards, arrows and pin spots) on enlarged crops of the far and the
 * near end.
 *
 *   npx tsx scripts/shot-tracker/calib.ts <shot-01> [outDir]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { snapMarks } from "../../src/lib/shotTrack/edgeSnap";
import { homographyFromMarks, markCorners } from "../../src/lib/shotTrack/laneModel";
import { loadClip, loadColorFrame } from "./clip";
import { GREEN, YELLOW, cropScale, fromRgb, savePng } from "./draw";
import { drawBoards, drawLandmarks, drawSegment, readCalibration, toMarks } from "./overlay";

const here = new URL(".", import.meta.url).pathname;
const name = process.argv[2];
const outDir = process.argv[3] ?? join(here, "out", name);
mkdirSync(outDir, { recursive: true });
const cal = readCalibration(join(here, "calibrations", `${name}.json`));
const clipPath = join(here, "fixtures", "clips", cal.clip);
const clip = loadClip(clipPath);
const rough = toMarks(cal);
const snap = snapMarks(clip.frame(cal.frame), rough);
console.log(name, "support", snap.support, "ok", snap.ok);
const corners = markCorners(snap.marks)!;
console.log("corners", corners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("  "));
for (const k of ["left", "right", "foul", "deck"] as const) {
  const r = rough[k];
  const s = snap.marks[k];
  console.log(k, "moved", ((s.a.x - r.a.x) ** 2 + (s.a.y - r.a.y) ** 2) ** 0.5, ((s.b.x - r.b.x) ** 2 + (s.b.y - r.b.y) ** 2) ** 0.5);
}
const H = homographyFromMarks(snap.marks, cal.farFeet);
const full = fromRgb(loadColorFrame(clipPath, cal.frame, clip.width, clip.height), clip.width, clip.height);
const draw = (ox: number, oy: number, w: number, h: number, k: number, file: string) => {
  const c = cropScale(full, ox, oy, w, h, k);
  for (const key of ["left", "right", "foul", "deck"] as const) {
    drawSegment(c, rough[key], YELLOW, k, ox, oy, 3);
    drawSegment(c, snap.marks[key], GREEN, k, ox, oy);
  }
  drawBoards(c, H, cal.hand, { k, ox, oy, labelAt: file.includes("far") ? 58 : 3 });
  drawLandmarks(c, H, k, ox, oy);
  savePng(c, join(outDir, file));
};
const [nl, nr, fl, fr] = corners;
draw(Math.round(fl.x - 30), Math.round(Math.min(fl.y, fr.y) - 45), Math.round(fr.x - fl.x + 60), 90, 6, "calib-far.png");
const nw = Math.round(nr.x - nl.x + 60);
draw(Math.round(nl.x - 30), Math.round(Math.max(nl.y, nr.y) - 80), nw, 110, Math.max(2, Math.min(5, Math.floor(1100 / nw))), "calib-near.png");
