/**
 * The ball's outline measured afresh near a circle the tracer drew, for
 * checking that circle (`circles.ts`, `review-app.ts`): along rays from the
 * circle's center over the top and sides (the lower rim meets the ball's
 * mirror image and is left out), the strongest edge between 0.5 and 1.7
 * radii, then a circle through those points with the radius free, refitted
 * twice without the points more than 1.5 px off it.
 */
import { sample } from "../../src/lib/shotTrack/image";
import type { GrayFrame, Point } from "../../src/lib/shotTrack/types";

export interface Disc { cx: number; cy: number; r: number }

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

