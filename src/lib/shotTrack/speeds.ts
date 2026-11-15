import type { Metric, MetricState } from "./types";

/**
 * The two speeds a lane tracking system reports (the owner, 2026-11-15:
 * "laydown speed, just the first 10 to 15 ft, and then speed at
 * breakpoint/pins"; CATS and Specto call them launch and entry speed):
 *
 * - launch speed, over the first `LAUNCH_FT` feet past the foul line, where
 *   the ball skids and has lost almost nothing yet;
 * - entry speed, over the last `ENTRY_FT` feet seen before the head pin,
 *   which is lower: the ball has rolled 45 ft and hooked.
 *
 * Each is the slope of a straight line through the sightings' distance
 * against their own times (each frame's media time, not an assumed frame
 * rate), so a ball that slows over the lane gives the speed of that stretch,
 * not the whole lane's average. Only from sightings actually in the stretch:
 * a stretch the ball was not seen over is missing, never filled in from the
 * fitted motion. Pure.
 */

/** The launch stretch: from the foul line to this many feet. */
export const LAUNCH_FT = 15;
/** The entry stretch: this many feet before the head pin. */
export const ENTRY_FT = 15;
/** The head pin's spot, feet from the foul line. */
export const HEAD_PIN_FT = 60;
/** A stretch seen over this many feet, with `MEASURED_POINTS` sightings, is measured. */
export const MEASURED_SPAN_FT = 8;
export const MEASURED_POINTS = 5;
/** Seen over less, down to this and `ESTIMATED_POINTS`, it is estimated. */
export const ESTIMATED_SPAN_FT = 4;
export const ESTIMATED_POINTS = 4;
/** The entry stretch is read only when the ball was seen this close to the head pin: measured from `ENTRY_MEASURED_FROM`, estimated from `ENTRY_ESTIMATED_FROM` (as the board at the pins is). */
export const ENTRY_MEASURED_FROM = 57;
export const ENTRY_ESTIMATED_FROM = 54;

const FTS_TO_MPH = 3600 / 5280;

/** A sighting: seconds, feet from the foul line, and its weight (1 when not given). */
export interface TimedPoint {
  t: number;
  v: number;
  w?: number;
}

/**
 * The speed (ft/s) of the weighted straight line through `pts`' distance
 * against time, then again without the points more than three spreads off it
 * (a far sighting's distance jumps by a foot a pixel). Null for fewer than two
 * points or no spread in time.
 */
export function lineSpeed(pts: readonly TimedPoint[]): number | null {
  const fit = (ps: readonly TimedPoint[]) => {
    let sw = 0;
    let st = 0;
    let sv = 0;
    for (const p of ps) {
      const w = p.w ?? 1;
      sw += w;
      st += w * p.t;
      sv += w * p.v;
    }
    if (ps.length < 2 || !(sw > 0)) return null;
    const mt = st / sw;
    const mv = sv / sw;
    let num = 0;
    let den = 0;
    for (const p of ps) {
      const w = p.w ?? 1;
      num += w * (p.t - mt) * (p.v - mv);
      den += w * (p.t - mt) ** 2;
    }
    if (!(den > 1e-12)) return null;
    const s = num / den;
    return { s, at: (t: number) => mv + s * (t - mt) };
  };
  const first = fit(pts);
  if (!first) return null;
  const resid = pts.map((p) => Math.abs(p.v - first.at(p.t)));
  const sorted = [...resid].sort((a, b) => a - b);
  const spread = Math.max(0.3, 1.4826 * sorted[sorted.length >> 1]);
  const kept = pts.filter((_, i) => resid[i] <= 3 * spread);
  return (kept.length === pts.length ? first : fit(kept) ?? first).s;
}

/** A believable bowling speed, mph (as the average speed's). */
const sane = (mph: number) => mph >= 8 && mph <= 26;

/** The speed over the points of a stretch as a reading: measured, estimated or missing by how much of it was seen. */
function stretchSpeed(pts: readonly TimedPoint[], measuredToo: boolean): Metric {
  const vs = pts.map((p) => p.v);
  const span = pts.length ? Math.max(...vs) - Math.min(...vs) : 0;
  let state: MetricState = "missing";
  if (measuredToo && pts.length >= MEASURED_POINTS && span >= MEASURED_SPAN_FT) state = "measured";
  else if (pts.length >= ESTIMATED_POINTS && span >= ESTIMATED_SPAN_FT) state = "estimated";
  if (state === "missing") return { value: null, state };
  const s = lineSpeed(pts);
  const mph = s === null ? NaN : s * FTS_TO_MPH;
  return sane(mph) ? { value: mph, state } : { value: null, state: "missing" };
}

/** Launch speed, mph: over the sightings in the first `LAUNCH_FT` feet. */
export function launchSpeed(pts: readonly TimedPoint[]): Metric {
  return stretchSpeed(
    pts.filter((p) => p.v >= -1 && p.v <= LAUNCH_FT),
    true
  );
}

/**
 * Entry speed, mph: over the sightings in the last `ENTRY_FT` feet before
 * the head pin, before `rackMovesAt` (after it the pins have the ball). Read
 * only when the ball was seen near the head pin (`ENTRY_ESTIMATED_FROM`).
 */
export function entrySpeed(pts: readonly TimedPoint[], rackMovesAt?: number): Metric {
  const before = pts.filter((p) => p.v <= HEAD_PIN_FT + 0.5 && (rackMovesAt === undefined || p.t < rackMovesAt));
  const far = before.length ? Math.max(...before.map((p) => p.v)) : -Infinity;
  if (far < ENTRY_ESTIMATED_FROM) return { value: null, state: "missing" };
  return stretchSpeed(
    before.filter((p) => p.v >= HEAD_PIN_FT - ENTRY_FT),
    far >= ENTRY_MEASURED_FROM
  );
}
