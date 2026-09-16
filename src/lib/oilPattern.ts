import { LANE_BOARDS } from "./laneGeometry";
import type { Handedness, OilPass } from "../types/bowling";

/**
 * The oil pattern, derived from its load table (ADR-101).
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

/**
 * A sheet's board, "2L" or "7R", as an absolute board counted from the left
 * edge. Kegel counts in from each gutter, so 2L is board 2 and 2R is board 38,
 * and a pass written "2L to 2R" covers 37 boards. That is checkable rather than
 * assumed: the Chromium 6742 sheet prints CROSSED 111 for that pass at 3 loads,
 * and 3 × 37 is 111.
 */
export function parseSheetBoard(raw: string): number | null {
  const m = /^\s*(\d{1,2})\s*([LlRr])?\s*$/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1) return null;
  const board = m[2]?.toUpperCase() === "R" ? LANE_BOARDS + 1 - n : n;
  return board >= 1 && board <= LANE_BOARDS ? board : null;
}

/** The inverse, so a stored pass reads back in the notation it was typed in. */
export function formatSheetBoard(board: number): string {
  return board <= (LANE_BOARDS + 1) / 2 ? `${board}L` : `${LANE_BOARDS + 1 - board}R`;
}

/** The feet a pass covers. A reverse pass runs back toward the foul line, so
 *  its end is before its start and the span has to be read either way round. */
function passSpan(p: OilPass): { from: number; to: number } {
  return {
    from: Math.min(p.start_distance, p.end_distance),
    to: Math.max(p.start_distance, p.end_distance),
  };
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

/** A pass whose geometry makes sense. A buffer-only pass (LOADS 0) is one of
 *  these: it lays nothing, but it travels, and the pattern distance is how far
 *  the machine got, not where the last oil went down. */
const isDrawable = (p: OilPass): boolean =>
  p.start_distance !== p.end_distance &&
  p.right_board >= p.left_board &&
  p.loads >= 0 &&
  p.microliters >= 0;

/** A pass that actually puts oil on the boards. */
const laysOil = (p: OilPass): boolean => isDrawable(p) && p.loads > 0 && p.microliters > 0;

/** Units this pass leaves on each board it covers. */
const passUnits = (p: OilPass): number => p.loads * p.microliters;

/** Slice the lane at every pass boundary, then total each board in each slice. */
export function oilZones(passes: readonly OilPass[] | undefined): OilZone[] {
  const usable = (passes ?? []).filter(laysOil);
  if (usable.length === 0) return [];

  const spans = usable.map((p) => ({ pass: p, ...passSpan(p) }));
  const edges = [...new Set(spans.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);

  const zones: OilZone[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const start = edges[i];
    const stop = edges[i + 1];
    const units = new Array<number>(LANE_BOARDS).fill(0);
    let any = false;
    for (const s of spans) {
      if (s.from > start || s.to < stop) continue;
      const lo = Math.max(1, Math.round(s.pass.left_board));
      const hi = Math.min(LANE_BOARDS, Math.round(s.pass.right_board));
      for (let b = lo; b <= hi; b += 1) units[b - 1] += passUnits(s.pass);
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
  const all = (passes ?? []).filter(isDrawable);
  const oiling = all.filter(laysOil);
  const empty: OilStats = {
    length: 0, volumeMl: 0, forwardMl: 0, reverseMl: 0, ratio: null, fromBoard: null, toBoard: null,
  };
  if (all.length === 0) return empty;

  let forward = 0;
  let reverse = 0;
  for (const p of oiling) {
    const microliters = passUnits(p) * boardCount(p);
    if (p.direction === "reverse") reverse += microliters;
    else forward += microliters;
  }

  const totals = boardTotals(oiling);
  const loaded = totals.map((u, i) => ({ u, board: i + 1 })).filter((t) => t.u > 0);

  return {
    // The distance the machine reaches, buffer-only passes included. On the
    // Chromium 6742 sheet the last oil goes down at 30.6 ft and the quoted
    // pattern distance is 42: the buffer carries it the rest of the way, and 42
    // is the number on the wall at the alley.
    length: Math.max(...all.map((p) => passSpan(p).to)),
    volumeMl: (forward + reverse) / 1000,
    forwardMl: forward / 1000,
    reverseMl: reverse / 1000,
    ratio: loaded.length ? Math.max(...loaded.map((t) => t.u)) / Math.min(...loaded.map((t) => t.u)) : null,
    fromBoard: loaded.length ? loaded[0].board : null,
    toBoard: loaded.length ? loaded[loaded.length - 1].board : null,
  };
}

const boardCount = (p: OilPass): number =>
  Math.max(0, Math.min(LANE_BOARDS, Math.round(p.right_board)) - Math.max(1, Math.round(p.left_board)) + 1);

/** Units on every board, the y-axis of the pattern graph printed on a sheet. */
function boardTotals(passes: readonly OilPass[]): number[] {
  const totals = new Array<number>(LANE_BOARDS).fill(0);
  for (const p of passes) {
    const lo = Math.max(1, Math.round(p.left_board));
    const hi = Math.min(LANE_BOARDS, Math.round(p.right_board));
    for (let b = lo; b <= hi; b += 1) totals[b - 1] += passUnits(p);
  }
  return totals;
}

/**
 * The track zone ratios a sheet prints, each zone against the middle of the
 * lane: how many times more oil the middle carries than that band of boards.
 * The outside one is the number bowlers quote about a pattern.
 *
 * Zones are the sheet's own, five boards each counted in from the left gutter
 * and mirrored on the right, with the middle being 18L to 18R. Verified against
 * Kegel's Chromium 6742, which prints 6.71 / 1.76 / 1.00 both ways round, and
 * `oilPattern.test.ts` holds that sheet as a fixture.
 */
export interface TrackZoneRatio {
  /** The sheet's own label, e.g. "3L-7L". */
  label: string;
  ratio: number;
}

const TRACK_ZONES: Array<{ label: string; from: number; to: number }> = [
  { label: "3L-7L", from: 3, to: 7 },
  { label: "8L-12L", from: 8, to: 12 },
  { label: "13L-17L", from: 13, to: 17 },
  { label: "17R-13R", from: 23, to: 27 },
  { label: "12R-8R", from: 28, to: 32 },
  { label: "7R-3R", from: 33, to: 37 },
];
const MIDDLE_ZONE = { from: 18, to: 22 }; // 18L to 18R

export function trackZoneRatios(passes: readonly OilPass[] | undefined): TrackZoneRatio[] {
  const oiling = (passes ?? []).filter(laysOil);
  if (oiling.length === 0) return [];
  const totals = boardTotals(oiling);
  const mean = (from: number, to: number) => {
    let sum = 0;
    for (let b = from; b <= to; b += 1) sum += totals[b - 1] ?? 0;
    return sum / (to - from + 1);
  };
  const middle = mean(MIDDLE_ZONE.from, MIDDLE_ZONE.to);
  if (middle <= 0) return [];
  return TRACK_ZONES.flatMap(({ label, from, to }) => {
    const zone = mean(from, to);
    return zone > 0 ? [{ label, ratio: middle / zone }] : [];
  });
}

/** The outside track against the middle, the ratio a pattern is known by. The
 *  higher of the two sides, so an asymmetric pattern is quoted by its steepest. */
export function headlineRatio(passes: readonly OilPass[] | undefined): number | null {
  const outside = trackZoneRatios(passes).filter((z) => z.label === "3L-7L" || z.label === "7R-3R");
  return outside.length ? Math.max(...outside.map((z) => z.ratio)) : null;
}

/** The oiled board span at a given distance/** The oiled board span at a given distance, or null where the lane is dry. */
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
  const inOil = (p: { board: number; feet: number }): boolean => {
    const span = oiledSpanAt(zones, p.feet);
    if (span == null) return false;
    const sheetBoard = toHandBoard(p.board, hand); // the mirror is its own inverse
    return sheetBoard >= span.fromBoard - 0.5 && sheetBoard <= span.toBoard + 0.5;
  };

  const walk = densify(samples, 0.5);
  let last: { board: number; feet: number } | null = null;
  let first: { board: number; feet: number } | null = null;
  for (const p of walk) {
    if (inOil(p)) {
      last = p;
    } else if (last) {
      first = p; // left the oil and does not come back
      break;
    }
  }
  if (!last) return null;
  if (!first) return last;

  // Close the half-foot the walk steps over, so the exit reads as the number on
  // the sheet (30.6 ft, not 30.5) rather than as an artefact of the step size.
  let lo = last;
  let hi = first;
  for (let i = 0; i < 12; i += 1) {
    const mid = {
      board: (lo.board + hi.board) / 2,
      feet: (lo.feet + hi.feet) / 2,
    };
    if (inOil(mid)) lo = mid;
    else hi = mid;
  }
  return { board: Math.round(lo.board * 100) / 100, feet: Math.round(lo.feet * 100) / 100 };
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

/**
 * How a pattern is spoken about, derived from its ratio rather than asserted.
 *
 * The bands are the ones the sport actually uses: USBC caps a Sport pattern at
 * 3:1, challenge conditions run about 4:1 to 8:1, and a recreation pattern is
 * 8:1 and up, which is the funnel that makes a house shot forgiving. Deriving
 * this keeps it honest: a pattern cannot claim to be a Sport shot while its own
 * load table says 8:1.
 */
export type PatternClass = "sport" | "challenge" | "recreation";

export function patternClass(ratio: number | null | undefined): PatternClass | null {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return null;
  if (ratio <= 3) return "sport";
  return ratio < 8 ? "challenge" : "recreation";
}

/** What to call it on screen. Kegel's own three tiers, and the words a bowler
 *  reads on a pattern sheet. */
export const PATTERN_CLASS_LABEL: Record<PatternClass, string> = {
  sport: "Sport",
  challenge: "Challenge",
  recreation: "Recreation",
};

/**
 * A pattern's length, however it knows it. A load table decides it; without one
 * the stored distance is all there is. Returns null when neither is known.
 */
export function patternLength(pattern: {
  passes?: OilPass[];
  distance?: number;
}): number | null {
  const stats = oilStats(pattern.passes);
  if (stats.length > 0) return stats.length;
  return pattern.distance != null && pattern.distance > 0 ? pattern.distance : null;
}
