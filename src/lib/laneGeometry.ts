import type { Handedness, LineSpec } from "../types/bowling";

// Physical landmarks.
export const LANE_BOARDS = 39;
export const LANE_FEET = 60;            // foul line → head pin
export const ARROWS_FEET = 15;          // target arrows
export const DEFAULT_BREAKPOINT_FEET = 42;
export const POCKET_BOARD = 17.5;       // 1-3 pocket (right-hander); mirrored by boardToX
// Ball + pin radius in boards (≈ 4.25" + 2.38" over 1.0417"/board). If the ball
// center ends farther than this off a pin it cannot have contacted it — used to
// flag an unreachable spare as a miss.
export const BALL_PIN_BOARDS = 6.37;

// Spare hook shape (ADR-019), hardcoded for now — both will become tweakable
// parameters later. The skid rides the focal straight until HOOK_START_FT, the
// ball hooks over the next HOOK_LENGTH_FT, then rolls straight into the pin. The
// *amount* of hook is not a parameter: it is forced by the pin board (the ball
// must recover exactly the focal→pin gap). Angularity is emergent (the quadratic
// control sits on the focal at the hook-span midpoint).
export const HOOK_START_FT = 38;
export const HOOK_LENGTH_FT = 14;


// Vertical drawing extent, in feet measured from the foul line. We draw a short
// approach BELOW the foul line (negative) so the laydown handle isn't jammed
// against the bottom edge, and extend ABOVE the head pin so the full pin deck
// (pins reach ~62.9 ft) is visible rather than clipped to the foul-line→head-pin
// span. The foul line (0 ft) therefore sits a little above the very bottom.
export const DRAW_FRONT_FEET = -4;      // approach, below the foul line
export const DRAW_BACK_FEET = 63.4;     // just behind the back pin row (~62.6 ft)

// Vertical mapping is LINEAR (ADR-020): every straight line in real lane space
// must render perfectly straight on screen, focal included. The old deck "knee"
// (ADR-018) expanded the last 2.6 ft into a tall band, which kinked every line at
// 60 ft — so it's gone. The pin deck is now a decorative, fixed-scale rack
// (`LaneSurface`) anchored at the head-pin column, decoupled from feetToY: render
// for appeal, keep the line math straight.

// Flat-plane drawing dimensions (SVG user units). Length is compressed vs.
// width for phone legibility. Tune in the visual pass — all geometry derives
// from these two constants.
export const PLANE_W = 100;
export const PLANE_L = 300;

const clampBoard = (b: number) => Math.max(1, Math.min(LANE_BOARDS, b));

/** Board number → x on the plane. Right-handers: board 1 = right edge.
 *  `raw` skips the [1,39] clamp so off-lane boards (a lofted laydown, the focal
 *  line running off the edge) map past the lane's x extent instead of pinning. */
export function boardToX(board: number, hand: Handedness, raw = false): number {
  const f = ((raw ? board : clampBoard(board)) - 1) / (LANE_BOARDS - 1); // 0 at board 1
  return hand === "right" ? PLANE_W * (1 - f) : PLANE_W * f;
}

/** Inverse of boardToX (not clamped, so dragging past the edge reads sensibly). */
export function xToBoard(x: number, hand: Handedness): number {
  const f = hand === "right" ? 1 - x / PLANE_W : x / PLANE_W;
  return 1 + f * (LANE_BOARDS - 1);
}

/** Distance from foul line (ft) → y on the plane. Linear across the whole extent
 *  [DRAW_FRONT_FEET, DRAW_BACK_FEET] → [PLANE_L, 0]; smaller feet → lower. Linear
 *  so a real-straight line draws straight (ADR-020). */
export function feetToY(feet: number): number {
  const f = (feet - DRAW_FRONT_FEET) / (DRAW_BACK_FEET - DRAW_FRONT_FEET);
  return PLANE_L - f * PLANE_L;
}

/** Inverse of feetToY. */
export function yToFeet(y: number): number {
  return DRAW_FRONT_FEET + ((PLANE_L - y) / PLANE_L) * (DRAW_BACK_FEET - DRAW_FRONT_FEET);
}

/** Real arrows form a chevron: the centre arrow (board 20) sits furthest
 *  down-lane, the outer ones step back toward the foul line. The Target peg's
 *  down-lane distance snaps to this curve, so it always reads as "on the arrows". */
export function arrowFeet(board: number): number {
  return ARROWS_FEET + 1 - (Math.abs(board - 20) / 15) * 4;
}

/** Board the straight skid line (laydown→target) reaches at a given distance,
 *  extrapolated past the arrows. Uses the target's chevron distance as the base. */
export function skidBoardAt(laydown: number, target: number, feet: number): number {
  return laydown + (target - laydown) * (feet / arrowFeet(target));
}

export interface PlanePoint { x: number; y: number; }

export interface LinePath {
  d: string;
  /** Spare only: the ball cannot contact the leave — the straight focal line
   *  already lands more than a ball+pin radius hook-side of the pin, so no hook
   *  can reach it. Drives the miss indicator. Always false for strike lines. */
  miss: boolean;
  /** Dotted guide: the straight laydown→target line extended down the lane, as an
   *  SVG path. The ball rides it on the skid and can never cross right of it
   *  (ADR-014). */
  focal: string | null;
  points: {
    laydown: PlanePoint;
    target: PlanePoint;
    hookStart: PlanePoint | null; // deprecated: always null (v3 dropped the hook-start peg)
    breakpoint: PlanePoint | null;
    final: PlanePoint;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pt = (x: number, y: number): PlanePoint => ({ x: r2(x), y: r2(y) });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// --- Strike breakpoint rail (ADR-024) --------------------------------------
// The strike ball path is ONE quadratic from the target to the final (ADR-023),
// its control riding the focal (laydown→target extended). The control's down-lane
// distance `cDist` is the single free shape parameter: a 1-DOF *rail* the derived
// breakpoint apex slides along. `breakpoint_distance` stores the apex depth and
// drives the rail; the drawn apex is written back so the stored value always
// equals what's drawn (no free 2-D apex → no S / no kink, by construction).

interface StrikeParams {
  foul: number; tgt: number; tgtFt: number; fB: number; fF: number;
  dir: number; focalBoard: (ft: number) => number;
}

function strikeParams(foul: number, tgt: number, fB: number, fF: number, dir: number): StrikeParams {
  const tgtFt = arrowFeet(tgt);
  return { foul, tgt, tgtFt, fB, fF, dir, focalBoard: (ft) => skidBoardAt(foul, tgt, ft) };
}

/** Valid range for the control distance. Upper bound is pulled *nearer* if the
 *  focal there would run off the lane, so the whole curve stays on-lane (ADR-023). */
function strikeCDistRange(p: StrikeParams): { lo: number; hi: number } {
  const lo = p.tgtFt + 1;
  let hi = p.fF - 1;
  if (p.tgt !== p.foul) {
    const focalAtBoard = (b: number) => (p.tgtFt * (b - p.foul)) / (p.tgt - p.foul);
    const cap = focalAtBoard(p.tgt > p.foul ? 39 : 1); // where the focal meets the edge it heads for
    if (cap > lo) hi = Math.min(hi, cap);
  }
  return { lo, hi: Math.max(lo, hi) };
}

const strikeDefaultCDist = (p: StrikeParams) => (p.tgtFt + p.fF) / 2;

interface StrikeGeom {
  pts: Array<{ board: number; feet: number }>;   // curve samples, t = 0…1
  apex: { board: number; feet: number };         // furthest-out; deepest on ties
}

/** Sample the strike curve for a control distance and report its apex. The ONE
 *  source of truth for the drawn shape — `buildStrike` renders these samples, so
 *  apex == drawn apex exactly. */
function strikeGeom(p: StrikeParams, cDist: number): StrikeGeom {
  const P0b = p.tgt, P0f = p.tgtFt;
  const Cb = p.focalBoard(cDist), Cf = cDist;
  const moreOut = (a: number, b: number) => (p.dir > 0 ? a < b : a > b);
  let extB = p.foul, extFt = 0; // laydown is furthest-out on an inside line
  // Furthest-out wins; on a board tie (laydown == target: the whole skid rides
  // one board) the DEEPEST point wins, so the breakpoint sits at/past the
  // target, never back at the foul line.
  const consider = (b: number, f: number) => {
    if (moreOut(b, extB) || (Math.abs(b - extB) < 1e-6 && f > extFt)) { extB = b; extFt = f; }
  };
  consider(p.tgt, p.tgtFt);
  const pts: Array<{ board: number; feet: number }> = [];
  const N = 120;
  for (let k = 0; k <= N; k++) {
    const t = k / N, v = 1 - t;
    const b = v * v * P0b + 2 * v * t * Cb + t * t * p.fB;
    const f = v * v * P0f + 2 * v * t * Cf + t * t * p.fF;
    consider(b, f);
    pts.push({ board: b, feet: f });
  }
  return { pts, apex: { board: extB, feet: extFt } };
}

const sampledApex = (p: StrikeParams, cDist: number) => strikeGeom(p, cDist).apex;

/** Solve the control distance minimising `cost(apex)`: coarse scan + bisection
 *  refine. The apex depth vs. cDist is smooth and near-monotone, so this is stable. */
function solveCDist(p: StrikeParams, lo: number, hi: number, cost: (a: { board: number; feet: number }) => number): number {
  let best = lo, bestC = Infinity;
  const STEPS = 48;
  for (let i = 0; i <= STEPS; i++) {
    const c = lo + ((hi - lo) * i) / STEPS;
    const k = cost(sampledApex(p, c));
    if (k < bestC) { bestC = k; best = c; }
  }
  let step = (hi - lo) / STEPS;
  for (let r = 0; r < 20 && step > 1e-4; r++) {
    step /= 2;
    for (const c of [best - step, best + step]) {
      if (c < lo || c > hi) continue;
      const k = cost(sampledApex(p, c));
      if (k < bestC) { bestC = k; best = c; }
    }
  }
  return best;
}

/** Control distance for a line: solved to hit its stored apex depth
 *  (`breakpoint_distance`), else the ADR-023 midpoint default. */
function strikeCDist(p: StrikeParams, wantApexFt: number | null | undefined): number {
  const { lo, hi } = strikeCDistRange(p);
  if (wantApexFt == null) return clamp(strikeDefaultCDist(p), lo, hi);
  return solveCDist(p, lo, hi, (a) => Math.abs(a.feet - wantApexFt));
}

/** Draw the strike (skid laydown→target, then the sampled curve) and report its
 *  apex. Renders `strikeGeom`'s samples, so the marker == the drawn path. */
function buildStrike(p: StrikeParams, wantApexFt: number | null | undefined, laydown: PlanePoint, hand: Handedness): { d: string; apex: { board: number; feet: number } } {
  const cDist = strikeCDist(p, wantApexFt);
  const { pts, apex } = strikeGeom(p, cDist);
  const target = pt(boardToX(p.tgt, hand), feetToY(p.tgtFt));
  let d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y}`;
  for (let i = 1; i < pts.length; i++) { // skip t=0: duplicates the target just drawn
    const s = pts[i];
    const q = pt(boardToX(s.board, hand, true), feetToY(s.feet));
    d += ` L ${q.x} ${q.y}`;
  }
  return { d, apex };
}

/** The strike apex (derived breakpoint) for a line, honouring reachability the
 *  same way `buildLinePath` does. Used by `solveLine` to write the stored value. */
export function strikeApexPoint(line: LineSpec, hand: Handedness): { board: number; feet: number } | null {
  const foul = line.laydown ?? line.stance;
  if (foul == null || line.target == null) return null;
  const dir = hand === "right" ? 1 : -1;
  const fB = line.final_board ?? POCKET_BOARD;
  const fF = line.final_distance ?? LANE_FEET;
  const p = strikeParams(foul, line.target, fB, fF, dir);
  const moreOut = (a: number, b: number) => (dir > 0 ? a < b : a > b);
  if (dir * (fB - p.focalBoard(fF)) <= 0) {
    // Unreachable: the ball rides the focal straight; apex = furthest on-lane point.
    const endB = p.focalBoard(fF), outEnd = !moreOut(foul, endB); // ties → deep end
    return { board: clamp(outEnd ? endB : foul, 1, 39), feet: outEnd ? fF : 0 };
  }
  return sampledApex(p, strikeCDist(p, line.breakpoint_distance));
}

/** Project a requested apex point (from a drag) onto the achievable rail: the
 *  nearest point (in plane space) the breakpoint can actually reach. */
export function projectBreakpoint(line: LineSpec, hand: Handedness, board: number, feet: number): { board: number; feet: number } {
  const foul = line.laydown ?? line.stance;
  if (foul == null || line.target == null) return { board, feet };
  const dir = hand === "right" ? 1 : -1;
  const fB = line.final_board ?? POCKET_BOARD;
  const fF = line.final_distance ?? LANE_FEET;
  const p = strikeParams(foul, line.target, fB, fF, dir);
  if (dir * (fB - p.focalBoard(fF)) <= 0) return strikeApexPoint(line, hand) ?? { board, feet };
  const { lo, hi } = strikeCDistRange(p);
  const wantX = boardToX(board, hand, true), wantY = feetToY(feet);
  const cDist = solveCDist(p, lo, hi, (a) => {
    const dx = boardToX(a.board, hand, true) - wantX, dy = feetToY(a.feet) - wantY;
    return dx * dx + dy * dy;
  });
  return sampledApex(p, cDist);
}

/**
 * Build the SVG path + marker points for a line.
 *
 * - **Strike** (non-spare): auto-hooks (ADR-024) — one quadratic target→final on
 *   the 1-DOF breakpoint rail. Straight is just the degenerate case (final on the
 *   focal). The breakpoint is *derived* (the curve's furthest-out point).
 * - **Spare** (`spareCurve`): straight skid → one quadratic hook → straight roll
 *   (ADR-019); hook timing from `hook_start_distance`/`hook_length`. No breakpoint.
 * - **Unreachable** final (gutter-side of the focal): rides the focal straight.
 *
 * Needs a foul-line board (`laydown ?? stance`) and a `target`; returns null else.
 */
export function buildLinePath(
  line: LineSpec | undefined,
  hand: Handedness,
  spareCurve = false
): LinePath | null {
  const foul = line?.laydown ?? line?.stance;
  if (line == null || foul == null || line.target == null) return null;

  // Laydown maps raw so a lofted (off-lane) board sits past the edge.
  const laydown = pt(boardToX(foul, hand, true), feetToY(0));
  const target = pt(boardToX(line.target, hand), feetToY(arrowFeet(line.target)));
  const finalBoard0 = line.final_board ?? POCKET_BOARD;
  const finalFeet = line.final_distance ?? LANE_FEET;
  const final = pt(boardToX(finalBoard0, hand), feetToY(finalFeet));

  // Focal guide: laydown→target extended across the whole drawing extent. A plain
  // straight segment now (feetToY is linear, ADR-020).
  const focalBoard = (ft: number) => skidBoardAt(foul, line.target!, ft);
  const focalPt = (ft: number) => pt(boardToX(focalBoard(ft), hand, true), feetToY(ft));
  const fa = focalPt(DRAW_FRONT_FEET), fb = focalPt(DRAW_BACK_FEET);
  const focal = `M ${fa.x} ${fa.y} L ${fb.x} ${fb.y}`;

  const dir = hand === "right" ? 1 : -1;
  // Auto-hook (ADR-024): every non-spare line curves. Its breakpoint is *derived*
  // — the furthest-out point of the strike quadratic — not a shaping input. A
  // straight line is the degenerate case where the final sits on the focal.
  const isStrike = !spareCurve;

  const tgt = line.target;
  const fB = finalBoard0, fF = finalFeet;
  const tgtFt = arrowFeet(tgt);
  const focalAtFinal = focalBoard(fF);
  const reachable = dir * (fB - focalAtFinal) > 0;
  const moreOut = (a: number, b: number) => (dir > 0 ? a < b : a > b); // furthest-out

  // Unreachable (final gutter-side of the focal): no hook can reach it — the ball
  // rides the focal STRAIGHT (a straight line is smooth: no corner). It may run off
  // the lane — that's a guttering shot — but the pegs stay on the lane (the final
  // peg is clamped, the breakpoint sits at the on-lane furthest-out end) so their
  // handles are always reachable. The spare flags a miss.
  if (!reachable) {
    const miss = Math.abs(focalAtFinal - fB) > BALL_PIN_BOARDS;
    const end = isStrike ? fF : DRAW_BACK_FEET;
    const e = focalPt(end);
    const d = `M ${laydown.x} ${laydown.y} L ${e.x} ${e.y}`;
    const endB = focalBoard(end);
    const outEnd = !moreOut(foul, endB); // ties → deep end
    const breakpoint = isStrike
      ? pt(boardToX(clamp(outEnd ? endB : foul, 1, 39), hand, true), feetToY(outEnd ? end : 0))
      : null;
    return { d, focal, miss, points: { laydown, target, hookStart: null, breakpoint, final } };
  }

  // Strike (ADR-023/024): ONE smooth quadratic from the target to the final on the
  // 1-DOF breakpoint rail. The control rides the focal at a distance set by the
  // stored apex depth (`breakpoint_distance`), else the [arrows, final] midpoint,
  // pulled *nearer* if the focal would run off the lane. Tangent to the skid at the
  // target + a convex blend of on-focal + hook-side points ⇒ never crosses to the
  // anti-hook side of the focal, never reverts (no S, no kink). The breakpoint is
  // the derived furthest-out point.
  if (isStrike) {
    const p = strikeParams(foul, tgt, fB, fF, dir);
    const { d, apex } = buildStrike(p, line.breakpoint_distance, laydown, hand);
    const breakpoint = pt(boardToX(apex.board, hand, true), feetToY(apex.feet));
    return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint, final } };
  }

  // Spare (ADR-019): straight skid on the focal to the hook start, one quadratic over
  // the hook length (control on the focal at the span midpoint → feet linear in t),
  // then a straight roll into the pin. Timing is per-line (ADR-024). No breakpoint.
  const hookStartFt = line.hook_start_distance ?? HOOK_START_FT;
  const hookLen = line.hook_length ?? HOOK_LENGTH_FT;
  const dS = clamp(hookStartFt, tgtFt + 1, fF - 2);
  const dE = clamp(dS + hookLen, dS + 1, fF - 0.5);
  const dM = (dS + dE) / 2;
  const Psb = focalBoard(dS), Cb = focalBoard(dM);
  const u = (dE - dM) / (fF - dM);
  const Peb = Cb + u * (fB - Cb);
  const board = (ft: number): number => {
    if (ft <= dS) return focalBoard(ft);
    if (ft <= dE) { const t = (ft - dS) / (dE - dS), v = 1 - t; return v * v * Psb + 2 * v * t * Cb + t * t * Peb; }
    return Peb + ((ft - dE) / (fF - dE)) * (fB - Peb);
  };
  const N = 160;
  let d = `M ${laydown.x} ${laydown.y}`;
  for (let k = 1; k <= N; k++) {
    const ft = (fF * k) / N;
    const p = pt(boardToX(board(ft), hand, true), feetToY(ft));
    d += ` L ${p.x} ${p.y}`;
  }
  return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint: null, final } };
}

// --- Drawability solver (ADR-015) ------------------------------------------
// The laydown and target are the user's aim and stay exactly where set — they
// define the focal line. The breakpoint and final are *dependent*: after any edit
// they re-clamp (in a single pass) onto the nearest drawable spot so the line stays
// one hook, in board space (hook side = higher board RH, lower LH):
//   - breakpoint on/hook-side of the focal line at its distance (it peels off the aim)
//   - on an out-and-back skid, breakpoint no further hook-side than the target
//     (so it stays the apex, not past the aim)
//   - final on/hook-side of both the breakpoint and the focal line at the pins
// No cascade onto the laydown/target, so nothing jumps to the gutter to "make
// room" — a dependent peg just slides onto its boundary. The laydown may loft
// off-lane. Pure: returns a corrected LineSpec.

export type Peg = "laydown" | "target" | "breakpoint" | "final";

const LOFT_MARGIN = 20;  // boards a lofted laydown may sit beyond each lane edge

export function solveLine(line: LineSpec, hand: Handedness): LineSpec {
  const foulField: "laydown" | "stance" = line.laydown != null || line.stance == null ? "laydown" : "stance";
  const ld0 = line.laydown ?? line.stance;
  if (ld0 == null || line.target == null) return line;

  const dir = hand === "right" ? 1 : -1;
  const clLane = (b: number) => clamp(b, 1, 39);
  const ld = clamp(ld0, 1 - LOFT_MARGIN, 39 + LOFT_MARGIN); // laydown may loft off-lane
  const tg = clLane(line.target);

  const out: LineSpec = { ...line, target: r2(tg), [foulField]: r2(ld) };
  if (line.breakpoint == null) return out; // not a strike line (spare / bare aim)

  // Breakpoint is DERIVED from the rail (ADR-024): the drawn strike apex. Write it
  // back so the stored board + distance always equal what's drawn — `breakpoint_
  // distance` is the rail input, the apex board falls out.
  const apex = strikeApexPoint(out, hand);
  if (apex) {
    out.breakpoint = r2(apex.board);
    out.breakpoint_distance = r2(apex.feet);
  }

  // Final: hook-side of the breakpoint apex and of the focal at the pins. Materialised
  // only when set, or when the pocket default is no longer reachable. Capped to the
  // lane so its handle stays reachable on a guttering aim.
  const focal = (d: number) => skidBoardAt(ld, tg, d);
  const hookSide = (a: number, b: number) => (dir > 0 ? Math.max(a, b) : Math.min(a, b));
  const bpBoard = apex ? apex.board : line.breakpoint;
  const fb = clLane(hookSide(line.final_board ?? POCKET_BOARD, hookSide(bpBoard, focal(LANE_FEET))));
  if (line.final_board != null || dir * (fb - POCKET_BOARD) > 0) out.final_board = r2(fb);

  return out;
}
