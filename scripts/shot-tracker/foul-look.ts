/**
 * The foul line aid: enlarged colour crops of the foul line's region on one
 * frame of a clip, with the found foul line (orange), the hand calibration's
 * (cyan, carried to the frame when it is another) and every candidate the
 * finder weighed on that frame (magenta, dashed, in `cands-*.jpg`), and a
 * table of the candidates: their row at the lane's middle, how far each sits
 * from the hand line and the found one in feet, and where each puts the
 * camera with the frame's pin row. The lane's edges, found and hand, are
 * drawn dashed in the same colours.
 *
 *   npx tsx scripts/shot-tracker/foul-look.ts <clip> <outDir> [<frame> ...]
 *
 * With no frame, the hand calibration's frame. The frame is added to the
 * finder's frames (every 10th), so the found lane is the finder's own on it.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { apply, intersect, invert, lineThrough, mapLine, multiply, normalize, type Line3 } from "../../src/lib/shotTrack/homography";
import { findFoulLines, gutterEnds, laneAttempts, lanesOnFrame, rankLanes, steadyProfiles } from "../../src/lib/shotTrack/laneFind";
import { focalFromPlane } from "../../src/lib/shotTrack/calibrate";
import { register, registerPlane } from "../../src/lib/shotTrack/registration";
import { BACK_ROW_FT } from "../../src/lib/shotTrack/laneModel";
import type { Mat3, Point } from "../../src/lib/shotTrack/types";
import { loadColorFrame } from "./clip";
import { fromRgb, type Canvas, type Color } from "./draw";
import { enlarge, jpg, thin } from "./review-lib";
import { loadTruth } from "./truth";

const [name, outDir, ...fs] = process.argv.slice(2);
if (!outDir || /^\d+$/.test(outDir)) throw new Error("usage: foul-look.ts <clip> <outDir> [<frame> ...] (the output directory comes before the frames)");
const t = loadTruth(name);
const frames = fs.length ? fs.map(Number) : [t.cal.frame];
mkdirSync(outDir, { recursive: true });
const FOUND: Color = [255, 140, 0];
const HAND: Color = [0, 230, 255];
const CAND: Color = [255, 0, 220];

const X = (l: Line3, y: number) => -(l[1] * y + l[2]) / l[0];
const rowAt = (l: Line3, x: number) => -(l[0] * x + l[2]) / l[1];
/** Where a picture line crosses lane line u of H, as lane v. */
const vOf = (H: Mat3, l: Line3, u: number) => {
  const p = intersect(l, lineThrough(apply(H, { x: u, y: -10 }), apply(H, { x: u, y: 70 })));
  return p ? apply(invert(H), p).y : NaN;
};

for (const frame of frames) {
  const idx = [...new Set([...Array.from({ length: Math.ceil(t.clip.count / 10) }, (_, i) => i * 10), frame])].sort((a, b) => a - b);
  const gray = idx.map((i) => t.clip.frame(i));
  const k = idx.indexOf(frame);
  const { attempts, camera } = laneAttempts(gray, gray.length);
  const a = attempts.find((x) => x.found.index === k)?.found ?? null;
  // The hand truth on this frame (carried as auto.ts carries it).
  let H = t.H;
  if (frame !== t.cal.frame) {
    const lo = Math.min(frame, t.cal.frame);
    const hi = Math.max(frame, t.cal.frame);
    const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const pics = register(t.clip, t.cal.frame, I, lo, hi, t.cal.register);
    const focal = focalFromPlane(t.H, t.clip.width, t.clip.height) ?? undefined;
    H = normalize(multiply(registerPlane(t.clip, t.cal.frame, t.H, pics, lo, { focal })[frame - lo].S, t.H));
  }
  const handFoul = mapLine(H, [0, 1, 0]);
  console.log(`${name} frame ${frame}: clip camera ${camera.toFixed(2)} ft; found lane on this frame: ${a ? `camera ${a.camera.toFixed(2)} ft, foul ${vOf(H, a.foul!, 20).toFixed(2)} ft by the hand lane (measured ${vOf(H, a.measured.foul, 20).toFixed(2)})` : "none"}`);
  // Every candidate on the frame, as `measure` weighs them.
  const per = gray.map((f) => lanesOnFrame(f));
  steadyProfiles(per);
  const pick = rankLanes(per, t.clip.width).find((p) => p.index === k);
  const cands: Line3[] = [];
  if (a && pick) {
    const slope = -a.measured.foul[0] / a.measured.foul[1];
    const span = pick.near - pick.far;
    const mid = (y: number) => (X(a.measured.left, y) + X(a.measured.right, y)) / 2;
    const yPin = rowAt(a.measured.pinRow, mid(pick.far));
    console.log(`   pick near row ${pick.near.toFixed(1)}, far ${pick.far.toFixed(1)}, span ${span.toFixed(1)}; search rows ${Math.round(pick.near - 0.18 * span)} to ${Math.round(pick.near + 0.04 * span)}`);
    const ge = gutterEnds(gray[k], a.measured.left, a.measured.right, pick.near, span, slope);
    console.log(`   gutter ends: ${ge.map((g) => (g ? `(${g.x.toFixed(1)}, ${g.y.toFixed(2)}) drop ${g.drop.toFixed(1)}` : "none")).join("; ")}; slope ${slope.toFixed(4)}${ge[0] && ge[1] ? `, theirs ${((ge[1].y - ge[0].y) / (ge[1].x - ge[0].x)).toFixed(4)}` : ""}`);
    const list = findFoulLines(gray[k], a.measured.left, a.measured.right, pick.near, span, slope);
    for (const [i, c] of list.entries()) {
      const y = rowAt(c.line, mid(pick.near));
      const ratio = (yPin - a.vp.y) / (y - a.vp.y);
      const d = (BACK_ROW_FT * ratio) / (1 - ratio);
      cands.push(c.line);
      console.log(`   cand ${i}: row ${y.toFixed(1)} at the middle, ${c.points.length} side(s), strength ${c.strength.toFixed(1)}, ${vOf(H, c.line, 20).toFixed(2)} ft by the hand lane, camera ${d.toFixed(2)} ft`);
    }
  }
  const c = fromRgb(loadColorFrame(t.clipPath, frame, t.clip.width, t.clip.height), t.clip.width, t.clip.height);
  // Crops: the whole width at 4x and each gutter end at 10x.
  const box = (u0: number, u1: number, v0: number, v1: number) => {
    const p = [apply(H, { x: u0, y: v0 }), apply(H, { x: u1, y: v0 }), apply(H, { x: u0, y: v1 }), apply(H, { x: u1, y: v1 })];
    const x0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q.x))));
    const x1 = Math.min(t.clip.width, Math.ceil(Math.max(...p.map((q) => q.x))));
    const y0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q.y))));
    const y1 = Math.min(t.clip.height, Math.ceil(Math.max(...p.map((q) => q.y))));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const shots: [string, ReturnType<typeof box>, number][] = [
    ["wide", box(-8, 48, -4, 5), 4],
    ["left", box(-7, 7, -2.5, 3), 10],
    ["right", box(33, 47, -2.5, 3), 10]
  ];
  for (const [tag, b, s] of shots) {
    if (b.w < 4 || b.h < 4) continue;
    for (const withCands of [false, true]) {
      const out: Canvas = enlarge(c, b.x, b.y, b.w, b.h, s);
      const P = (p: Point): Point => ({ x: (p.x - b.x + 0.5) * s - 0.5, y: (p.y - b.y + 0.5) * s - 0.5 });
      const draw = (l: Line3, col: Color, dash?: number) => {
        const p = P({ x: b.x - 5, y: rowAt(l, b.x - 5) });
        const q = P({ x: b.x + b.w + 5, y: rowAt(l, b.x + b.w + 5) });
        thin(out, p.x, p.y, q.x, q.y, col, dash);
      };
      // The edges, steep: drawn from the crop's top row to its bottom row.
      const drawEdge = (l: Line3, col: Color, dash?: number) => {
        const p = P({ x: X(l, b.y - 5), y: b.y - 5 });
        const q = P({ x: X(l, b.y + b.h + 5), y: b.y + b.h + 5 });
        thin(out, p.x, p.y, q.x, q.y, col, dash);
      };
      if (withCands) for (const l of cands) draw(l, CAND, 6);
      draw(handFoul, HAND);
      for (const u of [0.5, 39.5]) drawEdge(mapLine(H, [1, 0, -u]), HAND, 4);
      if (a?.foul) draw(a.foul, FOUND);
      if (a) for (const l of [a.left, a.right]) drawEdge(l, FOUND, 4);
      jpg(out, join(outDir, `${name}-f${frame}-${tag}${withCands ? "-cands" : ""}.jpg`));
    }
  }
}
