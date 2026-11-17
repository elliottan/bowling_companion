import { gridFrames, readStep } from "../../src/lib/shotTrack/framePick";
import { apply } from "../../src/lib/shotTrack/homography";
import type { LanesFound } from "../../src/lib/shotTrack/laneFind";
import type { TraceOutput } from "../../src/lib/shotTrack/pipeline";
import type { TrackResult } from "../../src/lib/shotTrack/types";

/**
 * The readings `bench.ts` keeps of a run, shared with `pool-bench.ts` (the
 * same compute in a browser, on a pool of workers), so the two can be held
 * to each other exactly.
 */

/** The frames `findOn` in the view sends: those on a grid `every` seconds apart from the video's start (`gridFrames`). */
export const laneFrames = (times: readonly number[], every: number) => gridFrames(times, every, readStep(times));

const r2 = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

export function lanesReading(all: LanesFound, idx: number[]) {
  const b = all.best;
  if (!b) return null;
  const at = (u: number, v: number) => {
    const p = apply(b.H, { x: u, y: v });
    return [r2(p.x), r2(p.y)];
  };
  return {
    frame: idx[b.index], camera: r2(b.camera), guess: b.guess?.foul ?? null, pinsUsed: b.pinsUsed, found: all.lanes.map((l) => idx[l.found.index]),
    corners: { nearLeft: at(0.5, 0), nearRight: at(39.5, 0), farLeft: at(0.5, 60), farRight: at(39.5, 60) }
  };
}

export interface Run {
  name: string;
  frames: number;
  ms: { firstFind: number; find: number; trace: number };
  /** The trace's stages, ms (`TraceInput.onProgress`). */
  stages?: Record<string, number>;
  first: ReturnType<typeof lanesReading>;
  lane: ReturnType<typeof lanesReading>;
  trace: Record<string, unknown> | null;
}


/** A string's FNV-1a hash, hex: a short check that two runs' sightings are the same to the last bit. */
export function digest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A trace's readings to 4 places, and a digest of every sighting and the lane mapping in full. */
export function tracedReading(out: TraceOutput): Record<string, unknown> {
  const res = out.result;
  if (!res.ok) return { failure: res.failure, detail: res.detail };
  const m = (res as TrackResult).metrics;
  const v = (k: keyof TrackResult["metrics"]) => (m[k].value === null ? null : `${m[k].value!.toFixed(4)}${m[k].state === "estimated" ? "e" : ""}`);
  return {
    laydown: v("laydown"), touchdown: v("touchdown"), touchdownFeet: v("touchdownFeet"), arrows: v("arrows"), breakpoint: v("breakpoint"), breakpointFeet: v("breakpointFeet"),
    pins: v("pins"), entryAngle: v("entryAngle"), launchAngle: v("launchAngle"), speed: v("speed"), speedAtPins: v("speedAtPins"), launchSpeed: v("launchSpeed"), entrySpeed: v("entrySpeed"),
    pinFrame: res.pinFrame, touchdownFrame: res.touchdownFrame, releaseFrame: r2(out.debug.release?.frame ?? null), pinsReadFrame: out.debug.pinsRead?.frame ?? null,
    sightings: res.sightings.filter((s) => !s.airborne).map((s) => s.frame), airborne: res.sightings.filter((s) => s.airborne).map((s) => s.frame),
    lanesKept: out.debug.lanes?.kept.length, lanesDropped: out.debug.lanes?.dropped.length, H0: out.debug.H0?.map((x) => Number(x.toPrecision(6))),
    digest: digest(JSON.stringify([res.sightings, res.metrics, res.path, out.debug.H0, out.debug.release ?? null]))
  };
}
