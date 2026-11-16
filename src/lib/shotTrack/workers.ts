import type { Background } from "./background";
import type { GrayFrame } from "./types";

/**
 * Sharing the tracer's work among a few workers (`src/shotTracer/pool.ts`):
 * how many, and the pure pieces of splitting a job and putting it back
 * together. Every split here gives back exactly what the whole job gives.
 */

/** The most workers the tracer uses: past four the per-frame jobs are too small to gain more on a phone. */
export const MAX_WORKERS = 4;

/**
 * How many workers to run: one fewer than the cores the browser reports (the
 * page and the decoder need one), at most `MAX_WORKERS`, at least one. Safari
 * on iOS is said to report two whatever the phone has (every iPhone since
 * 2017 has six cores), so a report of two or fewer on iOS is taken as four
 * cores. `override` (the harness's) wins when it is a whole number from 1.
 */
export function poolSize(reported: number | undefined, ios: boolean, override?: number | null): number {
  if (override !== undefined && override !== null && Number.isInteger(override) && override >= 1) return Math.min(override, 16);
  const cores = !reported || !Number.isFinite(reported) ? 2 : ios && reported <= 2 ? 4 : reported;
  return Math.max(1, Math.min(MAX_WORKERS, Math.floor(cores) - 1));
}

/** `height` rows cut into `n` bands as even as whole rows allow, none empty: [first row, row past the last]. */
export function rowBands(height: number, n: number): [number, number][] {
  const k = Math.max(1, Math.min(n, height));
  const out: [number, number][] = [];
  for (let i = 0; i < k; i++) out.push([Math.round((i * height) / k), Math.round(((i + 1) * height) / k)]);
  return out;
}

/** Rows `from` to `to` (past the last) of a picture, copied. */
export function rowsOf(f: GrayFrame, from: number, to: number): GrayFrame {
  return { width: f.width, height: to - from, data: f.data.slice(from * f.width, to * f.width), t: f.t };
}

/** Bands of a background (`medianBackground` run on each band of rows) put back together, top to bottom. */
export function joinBackground(parts: Background[]): Background {
  const width = parts[0].width;
  const height = parts.reduce((s, p) => s + p.height, 0);
  const data = new Float32Array(width * height);
  const spread = new Float32Array(width * height);
  let at = 0;
  for (const p of parts) {
    data.set(p.data as Float32Array, at);
    spread.set(p.spread, at);
    at += p.width * p.height;
  }
  return { width, height, data, t: 0, spread };
}
