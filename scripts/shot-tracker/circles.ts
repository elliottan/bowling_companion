/**
 * The circle check: does the tracer's circle sit on the ball? For each clip,
 * the automatic trace (as `auto.ts` runs it), then on every frame the tracer
 * drew a ball (its sightings, the release follow-back, the follow to the
 * pins) the ball's outline measured afresh: along rays from the circle's
 * center over the top and sides (the lower rim meets the ball's mirror image
 * and is left out), the strongest edge between 0.5 and 1.7 radii, then a
 * circle through those points with the radius free, twice, dropping points
 * more than 1.5 px off. Printed per clip: the radius ratio (tracer over
 * outline) and how far the circle's base, where boards are read, sits from
 * the outline's base, in pixels and in boards across, where the outline is
 * within 20% of the ball's size the lane predicts (in front of the rack it
 * takes a pin's edge instead); and on every circle its radius over that
 * prediction, the one check that holds among the pins. The worst frames are
 * listed.
 *
 *   npx tsx scripts/shot-tracker/circles.ts [shot-0N ...] [--png <dir>] [--frames 232,233]
 *
 * `--png` writes a crop of each listed frame (or of the reading frames) with
 * the tracer's circle in yellow and the outline's in cyan.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { findLanes, frameLanes } from "../../src/lib/shotTrack/laneFind";
import { downAt } from "../../src/lib/shotTrack/homography";
import { contactPoint, expectedRadiusPx, imageToLane } from "../../src/lib/shotTrack/laneModel";
import { trace } from "../../src/lib/shotTrack/pipeline";
import { sample } from "../../src/lib/shotTrack/image";
import type { GrayFrame, Mat3, Point, TrackResult } from "../../src/lib/shotTrack/types";
import { loadColorFrame } from "./clip";
import { fromRgb, type Color } from "./draw";
import { enlarge, jpg, ring, thin } from "./review-lib";
import { loadTruth } from "./truth";

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const pngDir = opt("--png");
const only = opt("--frames")?.split(",").map(Number);
const names = args.length ? args : ["shot-01", "shot-02", "shot-03", "shot-04", "shot-05", "shot-06"];

interface Disc { cx: number; cy: number; r: number }
interface Row { frame: number; kind: string; disc: Disc; out: Disc | null; ratio: number; base: number; baseBoards: number; across: number; vsExpected: number }

/** The ball's outline near a disc, measured afresh (see the header). */
export function outline(f: GrayFrame, d: Disc, down: Point): Disc | null {
  const pts: Point[] = [];
  for (let a = 0; a < 72; a++) {
    const th = (2 * Math.PI * a) / 72;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    if (dx * down.x + dy * down.y > 0.3) continue;
    let best = 0;
    let at = -1;
    for (let t = 0.5 * d.r; t <= 1.7 * d.r; t += 0.25) {
      const g = Math.abs(sample(f, d.cx + dx * (t + 1), d.cy + dy * (t + 1)) - sample(f, d.cx + dx * (t - 1), d.cy + dy * (t - 1)));
      if (Number.isFinite(g) && g > best) {
        best = g;
        at = t;
      }
    }
    if (at > 0 && best >= 10) pts.push({ x: d.cx + dx * at, y: d.cy + dy * at });
  }
  let use = pts;
  let fit: Disc | null = null;
  for (let pass = 0; pass < 3; pass++) {
    if (use.length < 12) return null;
    fit = kasa(use);
    if (!fit) return null;
    const f0 = fit;
    use = use.filter((p) => Math.abs(Math.hypot(p.x - f0.cx, p.y - f0.cy) - f0.r) <= 1.5);
  }
  return fit;
}

function kasa(pts: Point[]): Disc | null {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const uc = (0.5 * (suuu + suvv) * svv - 0.5 * (svvv + svuu) * suv) / det;
  const vc = (suu * 0.5 * (svvv + svuu) - suv * 0.5 * (suuu + suvv)) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return Number.isFinite(r) ? { cx: mx + uc, cy: my + vc, r } : null;
}

const med = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");

for (const name of names) {
  const t = loadTruth(name);
  const idx = Array.from({ length: Math.ceil(t.clip.count / 10) }, (_, i) => i * 10);
  const all = findLanes(idx.map((i) => t.clip.frame(i)));
  if (!all.best) {
    console.log(`${name}: no lane`);
    continue;
  }
  const out = trace({ source: t.clip, calibFrame: idx[all.best.index], lanes: frameLanes(all, (i) => idx[i]), hand: t.cal.hand, register: t.cal.register });
  if (!out.result.ok) {
    console.log(`${name}: ${out.result.failure}`);
    continue;
  }
  const res = out.result as TrackResult;
  const { debug } = out;
  const H = (i: number): Mat3 | null => debug.geometry[i - debug.first]?.H ?? null;
  const discs: { frame: number; kind: string; disc: Disc }[] = [
    ...res.sightings.map((s) => ({ frame: s.frame, kind: `${s.airborne ? "air" : "sight"}${debug.circles.get(s.frame)?.fixed ? "-fixed" : ""}`, disc: { cx: s.cx, cy: s.cy, r: s.r } })),
    ...(debug.release?.track ?? []).map((d) => ({ frame: d.frame, kind: "release", disc: d })),
    ...(debug.toPins ?? []).map((d) => ({ frame: d.frame, kind: "toPins", disc: d }))
  ];
  const rows: Row[] = [];
  for (const { frame, kind, disc } of discs) {
    const h = H(frame);
    if (!h) continue;
    const f = t.clip.frame(frame);
    const down = downAt(h, { x: disc.cx, y: disc.cy });
    // The lane's prediction of the ball's radius where the circle puts it.
    const cp = contactPoint(h, { x: disc.cx, y: disc.cy }, disc.r);
    const rExp = expectedRadiusPx(h, cp.u, Math.min(cp.v, 60));
    // An outline far from the ball's size has taken a pin or the gutter's edge: not trusted.
    const o0 = outline(f, disc, down);
    const o = o0 && Math.abs(o0.r / rExp - 1) <= 0.2 ? o0 : null;
    // The bases: one radius along "down" from each center.
    const b0 = { x: disc.cx + disc.r * down.x, y: disc.cy + disc.r * down.y };
    const b1 = o ? { x: o.cx + o.r * down.x, y: o.cy + o.r * down.y } : null;
    const base = b1 ? Math.hypot(b0.x - b1.x, b0.y - b1.y) : NaN;
    const baseBoards = b1 ? imageToLane(h, b0).u - imageToLane(h, b1).u : NaN;
    const across = o ? Math.abs((disc.cx - o.cx) * down.y - (disc.cy - o.cy) * down.x) : NaN;
    rows.push({ frame, kind, disc, out: o, ratio: o ? disc.r / o.r : NaN, base, baseBoards, across, vsExpected: disc.r / rExp });
  }
  const kinds = [...new Set(rows.map((r) => r.kind.replace("-fixed", "")))];
  console.log(`${name}: ${rows.length} circles, ${rows.filter((r) => r.out).length} outlines measured`);
  for (const k of kinds) {
    const every = rows.filter((r) => r.kind.replace("-fixed", "") === k);
    const ve = every.map((r) => r.vsExpected);
    console.log(`   ${k.padEnd(8)} n ${String(every.length).padStart(3)}  radius over the lane's prediction median ${fmt(med(ve))}, range ${fmt(Math.min(...ve))} to ${fmt(Math.max(...ve))}`);
    const rs = every.filter((r) => r.out);
    if (!rs.length) continue;
    console.log(`   ${"".padEnd(8)} outline on ${String(rs.length).padStart(3)} (fixed ${rows.filter((r) => r.kind === `${k}-fixed`).length})  radius ratio median ${fmt(med(rs.map((r) => r.ratio)))}  base off median ${fmt(med(rs.map((r) => r.base)), 1)} px, across ${fmt(med(rs.map((r) => Math.abs(r.baseBoards))))} boards; worst ${rs
      .sort((a, b) => Math.abs(b.baseBoards) - Math.abs(a.baseBoards))
      .slice(0, 3)
      .map((r) => `f${r.frame} ${fmt(r.baseBoards)} b (r ${fmt(r.ratio)})`)
      .join(", ")}`);
  }
  if (pngDir) {
    const dir = join(pngDir, name);
    mkdirSync(dir, { recursive: true });
    const want = only ?? [...new Set([res.touchdownFrame, ...(debug.toPins ?? []).slice(-6).map((d) => d.frame), res.sightings[Math.floor(res.sightings.length / 2)]?.frame].filter((x): x is number => x !== null && x !== undefined))];
    for (const frame of want) {
      const r = rows.find((x) => x.frame === frame);
      if (!r) continue;
      const R = Math.max(r.disc.r, r.out?.r ?? 0);
      const box = { x: Math.max(0, Math.floor(r.disc.cx - 2.5 * R)), y: Math.max(0, Math.floor(r.disc.cy - 2.5 * R)), w: Math.ceil(5 * R), h: Math.ceil(5 * R) };
      const k = Math.min(16, 360 / box.w);
      const c = enlarge(fromRgb(loadColorFrame(t.clipPath, frame, t.clip.width, t.clip.height), t.clip.width, t.clip.height), box.x, box.y, box.w, box.h, k);
      const P = (p: Point) => ({ x: (p.x - box.x + 0.5) * k - 0.5, y: (p.y - box.y + 0.5) * k - 0.5 });
      const draw = (d: Disc, col: Color) => {
        const q = P({ x: d.cx, y: d.cy });
        ring(c, q.x, q.y, d.r * k, col);
        thin(c, q.x - 4, q.y, q.x + 4, q.y, col);
      };
      draw(r.disc, [255, 230, 0]);
      if (r.out) draw(r.out, [0, 230, 255]);
      jpg(c, join(dir, `f${frame}-${r.kind}.jpg`));
    }
  }
  console.log(`   frames: ${rows.map((r) => `${r.frame}${r.kind[0]}:${fmt(r.ratio)}/${fmt(r.baseBoards, 1)}`).join(" ")}`);
}
