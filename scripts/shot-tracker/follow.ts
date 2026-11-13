import { contactPoint } from "../../src/lib/shotTrack/laneModel";
import { fitMotion, fitPath, metrics, type PathPoint } from "../../src/lib/shotTrack/pathFit";
import type { TraceOutput } from "../../src/lib/shotTrack/pipeline";
import { findDisc, fitOutline, overFoulLine } from "../../src/lib/shotTrack/release";
import type { BallSighting, Metric, TrackResult } from "../../src/lib/shotTrack/types";
import type { Clip } from "./clip";
import type { CalibrationFile } from "./overlay";

/**
 * The near end of a shot whose ball the tracer cannot find against the empty
 * lane (shot-04: the camera pans and the bowler stands over the ball's path,
 * so the empty lane still holds the bowler and the ball merges with what
 * changed round it). The ball is followed by its own darkness from a start
 * the calibration file gives (`follow`), frame by frame while it stays as
 * dark against the lane as it began and does not shrink suddenly (going
 * behind the bowler), and placed through each frame's lane mapping. Only the
 * laydown (the ball followed back into the hand), the touchdown and an
 * estimate at the arrows are read; the rest of the lane is not seen.
 */
export function followNearEnd(clip: Clip, cal: CalibrationFile, out: TraceOutput): TrackResult | null {
  const start = cal.follow;
  if (!start) return null;
  const geo = (i: number) => {
    const g = out.debug.geometry[i - out.debug.first];
    return g && g.ok ? g : null;
  };
  const seedFrame = clip.frame(start.frame);
  const rough = findDisc(seedFrame, { x: start.x, y: start.y }, [0.9, 0.95, 1, 1.05, 1.1].map((k) => k * start.r), 6);
  if (!rough) return null;
  let d = fitOutline(seedFrame, rough);
  const contrast0 = d.contrast;
  const sightings: BallSighting[] = [];
  for (let i = start.frame; i < Math.min(clip.count, start.frame + 120); i++) {
    const g = geo(i);
    if (!g) break;
    if (i > start.frame) {
      const next = findDisc(clip.frame(i), { x: d.cx, y: d.cy }, [0.92, 0.96, 1].map((k) => k * d.r), Math.max(4, 0.8 * d.r));
      if (!next || next.contrast < 0.85 * contrast0) break;
      const fitted = fitOutline(clip.frame(i), next);
      // Going behind the bowler the visible disc shrinks faster than distance allows.
      if (fitted.r < 0.94 * d.r) break;
      d = fitted;
    }
    const cp = contactPoint(g.H, { x: d.cx, y: d.cy }, d.r);
    sightings.push({ frame: i, t: clip.times[i], cx: d.cx, cy: d.cy, r: d.r, contact: cp.contact, u: cp.u, v: cp.v, weight: 1, airborne: false });
  }
  if (sightings.length < 6) return null;
  out.debug.release = overFoulLine((i) => (geo(i) ? clip.frame(i) : null), (i) => geo(i)?.H ?? null, sightings[0].frame, sightings[0]);
  const points: PathPoint[] = sightings.map((s) => ({ v: s.v, u: s.u, w: 1, t: s.t }));
  const fit = fitPath(points);
  const motion = fitMotion(sightings.map((s) => ({ t: s.t, v: s.v, w: 1 })));
  const seen = sightings.map((s) => s.v);
  const m = metrics({
    path: { ...fit.path, kind: "hook", s: 60, L: 2, k: 0 }, hand: cal.hand, seen, points, touchdown: seen[0], motion,
    tFirst: sightings[0].t, tLast: sightings[sightings.length - 1].t, speedMeasured: false, overFoulLineU: out.debug.release?.u
  });
  const missing: Metric = { value: null, state: "missing" };
  // Past the last sighting the board is a straight line run on: the arrows are an estimate, the rest not read.
  const to = Math.max(...seen);
  return {
    ok: true, hand: cal.hand, sightings, path: { ...fit.path, kind: "hook", s: 60, L: 2, k: 0 }, from: Math.min(...seen), to, rms: fit.rms,
    metrics: {
      ...m,
      arrows: m.arrows.value === null ? missing : { value: m.arrows.value, state: to >= 13 ? "measured" : "estimated" },
      breakpoint: missing, breakpointFeet: missing, pins: missing, entryAngle: missing, speed: missing, speedAtPins: missing
    },
    motion, touchdownFrame: sightings[0].frame, pinFrame: null
  };
}
