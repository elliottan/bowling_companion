import { LANE_BOARDS } from "./laneGeometry";
import type { Handedness, OilPass } from "../types/bowling";

/**
 * The oil pattern, derived from its load table (ADR-090).
 *
 * A pattern sheet is a list of machine passes, and everything a bowler quotes
 * about a pattern falls out of that list: the distance is the deepest pass, the
 * volume is the oil those passes carry, the ratio is the heaviest board against
 * the lightest. So nothing here is stored twice, the passes are the pattern.
 *
 * Boards are ABSOLUTE and counted from the left edge (1 = far left, 39 = far
 * right), the way a sheet is printed. Handedness only enters at the drawing
 * edge, through `toHandBoard`, because the app's board space puts board 1 on
 * the bowler's side (`boardToX`).
 */

/** A pattern sheet board (1 = far left) in the app's handed board space. */
export function toHandBoard(board: number, hand: Handedness): number {
  return hand === "right" ? LANE_BOARDS + 1 - board : board;
}

/** Per-board oil units over one down-lane slice. `units[i]` is board `i + 1`. */
export interface OilZone {
  /** Feet from the foul line. */
  start: number;
  stop: number;
  units: number[];
}

/** A drawable rectangle: one run of equal-loaded boards inside a zone. */
export interface OilBand {
  start: number;
  stop: number;
  /** Inclusive board span, left-edge numbering. */
  fromBoard: number;
  toBoard: number;
  units: number;
}

export interface OilStats {
  /** Pattern distance: the deepest foot any pass loads. */
  length: number;
  /** Total oil, in millilitres. */
  volumeMl: number;
  forwardMl: number;
  reverseMl: number;
  /** Heaviest loaded board against the lightest loaded one, the quoted ratio. */
  ratio: number | null;
  /** Outermost boards carrying any oil at all, left-edge numbering. */
  fromBoard: number | null;
  toBoard: number | null;
}

const isUsable = (p: OilPass): boolean =>
  p.stop_distance > p.start_distance &&
  p.right_board >= p.left_board &&
  p.loads > 0 &&
  p.microliters > 0;

/** Slice the lane at every pass boundary, then total each board in each slice. */
export function oilZones(passes: readonly OilPass[] | undefined): OilZone[] {
  const usable = (passes ?? []).filter(isUsable);
  if (usable.length === 0) return [];

  const edges = [...new Set(usable.flatMap((p) => [p.start_distance, p.stop_distance]))].sort(
    (a, b) => a - b
  );

  const zones: OilZone[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const start = edges[i];
    const stop = edges[i + 1];
    const units = new Array<number>(LANE_BOARDS).fill(0);
    let any = false;
    for (const p of usable) {
      if (p.start_distance > start || p.stop_distance < stop) continue;
      const lo = Math.max(1, Math.round(p.left_board));
      const hi = Math.min(LANE_BOARDS, Math.round(p.right_board));
      for (let b = lo; b <= hi; b += 1) units[b - 1] += p.loads * p.microliters;
      any = any || hi >= lo;
    }
    if (any) zones.push({ start, stop, units });
  }
  return zones;
}

/** Zones flattened into rectangles, merging neighbouring boards of equal load. */
export function oilBands(zones: readonly OilZone[]): OilBand[] {
  const bands: OilBand[] = [];
  for (const z of zones) {
    let runFrom = -1;
    let runUnits = 0;
    for (let b = 1; b <= LANE_BOARDS + 1; b += 1) {
      const units = b <= LANE_BOARDS ? z.units[b - 1] : 0;
      if (runFrom > 0 && units !== runUnits) {
        bands.push({ start: z.start, stop: z.stop, fromBoard: runFrom, toBoard: b - 1, units: runUnits });
        runFrom = units > 0 ? b : -1;
        runUnits = units;
      } else if (runFrom < 0 && units > 0) {
        runFrom = b;
        runUnits = units;
      }
    }
  }
  return bands;
}

/** The heaviest board load anywhere in the pattern, the scale for the drawing. */
export function peakUnits(zones: readonly OilZone[]): number {
  let peak = 0;
  for (const z of zones) for (const u of z.units) if (u > peak) peak = u;
  return peak;
}

export function oilStats(passes: readonly OilPass[] | undefined): OilStats {
  const usable = (passes ?? []).filter(isUsable);
  const empty: OilStats = {
    length: 0, volumeMl: 0, forwardMl: 0, reverseMl: 0, ratio: null, fromBoard: null, toBoard: null,
  };
  if (usable.length === 0) return empty;

  let forward = 0;
  let reverse = 0;
  for (const p of usable) {
    const boards = Math.min(LANE_BOARDS, Math.round(p.right_board)) - Math.max(1, Math.round(p.left_board)) + 1;
    const microliters = p.loads * p.microliters * Math.max(0, boards);
    if (p.direction === "reverse") reverse += microliters;
    else forward += microliters;
  }

  // Per-board totals, the y-axis of the classic pattern graph. The ratio is read
  // off it: a flat pattern loads every board the same and is 1:1 by definition,
  // a house shot piles the middle up and reads 8:1 or so.
  const totals = new Array<number>(LANE_BOARDS).fill(0);
  for (const p of usable) {
    const lo = Math.max(1, Math.round(p.left_board));
    const hi = Math.min(LANE_BOARDS, Math.round(p.right_board));
    for (let b = lo; b <= hi; b += 1) totals[b - 1] += p.loads * p.microliters;
  }
  const loaded = totals.map((u, i) => ({ u, board: i + 1 })).filter((t) => t.u > 0);

  return {
    length: Math.max(...usable.map((p) => p.stop_distance)),
    volumeMl: (forward + reverse) / 1000,
    forwardMl: forward / 1000,
    reverseMl: reverse / 1000,
    ratio: loaded.length ? Math.max(...loaded.map((t) => t.u)) / Math.min(...loaded.map((t) => t.u)) : null,
    fromBoard: loaded.length ? loaded[0].board : null,
    toBoard: loaded.length ? loaded[loaded.length - 1].board : null,
  };
}

/** The oiled board span at a given distance, or null where the lane is dry. */
export function oiledSpanAt(
  zones: readonly OilZone[],
  feet: number
): { fromBoard: number; toBoard: number } | null {
  const z = zones.find((zone) => feet >= zone.start && feet <= zone.stop);
  if (!z) return null;
  const from = z.units.findIndex((u) => u > 0);
  if (from < 0) return null;
  let to = from;
  for (let i = z.units.length - 1; i >= 0; i -= 1) {
    if (z.units[i] > 0) { to = i; break; }
  }
  return { fromBoard: from + 1, toBoard: to + 1 };
}

/**
 * Where the ball leaves the oil: the last point of its path that still sits on
 * a loaded board. That is the exit point a bowler is actually looking for, and
 * it is NOT always the end of the pattern, a ball that runs outside the oiled
 * width exits early, out at the edge, with dry boards still ahead of it.
 *
 * `samples` is the ball path in the app's handed board space, front to back.
 */
export function oilExitPoint(
  zones: readonly OilZone[],
  samples: readonly { board: number; feet: number }[],
  hand: Handedness
): { board: number; feet: number } | null {
  if (zones.length === 0) return null;
  let last: { board: number; feet: number } | null = null;
  for (const s of densify(samples, 0.5)) {
    const span = oiledSpanAt(zones, s.feet);
    const sheetBoard = toHandBoard(s.board, hand); // the mirror is its own inverse
    const inOil =
      span != null && sheetBoard >= span.fromBoard - 0.5 && sheetBoard <= span.toBoard + 0.5;
    if (inOil) last = s;
    else if (last) break; // left the oil and did not come back
  }
  return last;
}

/** Walk a polyline in fixed down-lane steps, so the exit reads to the half foot
 *  even where the path itself is only a couple of vertices long. */
function densify(
  poly: readonly { board: number; feet: number }[],
  stepFt: number
): Array<{ board: number; feet: number }> {
  const out: Array<{ board: number; feet: number }> = [];
  for (let i = 0; i < poly.length - 1; i += 1) {
    const a = poly[i];
    const b = poly[i + 1];
    const span = b.feet - a.feet;
    const steps = Math.max(1, Math.ceil(Math.abs(span) / stepFt));
    for (let k = 0; k < steps; k += 1) {
      const t = k / steps;
      out.push({ board: a.board + (b.board - a.board) * t, feet: a.feet + span * t });
    }
  }
  if (poly.length > 0) out.push(poly[poly.length - 1]);
  return out;
}
