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

// Hook shape (ADR-019): the per-line defaults for `hook_start_distance` /
// `hook_length` (ADR-026). The skid rides the focal straight until HOOK_START_FT, the
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

// --- Unified hook curve (ADR-026) -------------------------------------------
// ONE construction for strike and spare (the ADR-019 shape, per-line timing):
// straight skid on the focal to the hook start dS, one quadratic over [dS, dE]
// (control on the focal at the span midpoint → feet linear in t), then a
// straight roll into the final. The hook *amount* is forced by the final; only
// the timing (`hook_start_distance` / `hook_length`) is tunable. The breakpoint
// is DERIVED for both modes — the curve's furthest-out point, deepest on ties,
// board-clamped to the lane so its handle stays reachable. `breakpoint` /
// `breakpoint_distance` are outputs (stored == drawn); `breakpoint != null`
// still flags strike mode.

interface HookGeom {
  dS: number; dE: number;                        // effective (clamped) hook span
  pts: Array<{ board: number; feet: number }>;   // path samples, ft = fF·k/N, k = 1…N
  apex: { board: number; feet: number };         // furthest-out; deepest on ties; board ∈ [1,39]
  hookRawBoard: number;                          // hook-zone extreme (ft > tgtFt only), unclamped — drives the on-lane cap
}

const HOOK_N = 160;

function hookGeomRaw(p: StrikeParams, dS0: number, len: number): HookGeom {
  const dS = clamp(dS0, p.tgtFt + 1, p.fF - 2);
  const dE = clamp(dS + len, dS + 1, p.fF - 0.5);
  const dM = (dS + dE) / 2;
  const Psb = p.focalBoard(dS), Cb = p.focalBoard(dM);
  const u = (dE - dM) / (p.fF - dM);
  const Peb = Cb + u * (p.fB - Cb);
  const board = (ft: number): number => {
    if (ft <= dS) return p.focalBoard(ft);
    if (ft <= dE) { const t = (ft - dS) / (dE - dS), v = 1 - t; return v * v * Psb + 2 * v * t * Cb + t * t * Peb; }
    return Peb + ((ft - dE) / (p.fF - dE)) * (p.fB - Peb);
  };
  const moreOut = (a: number, b: number) => (p.dir > 0 ? a < b : a > b);
  let extB = p.foul, extFt = 0; // laydown is furthest-out on an inside line
  // Furthest-out wins; on a board tie (laydown == target: the whole skid rides
  // one board) the DEEPEST point wins, so the breakpoint sits at/past the
  // target, never back at the foul line.
  const consider = (b: number, f: number) => {
    if (moreOut(b, extB) || (Math.abs(b - extB) < 1e-6 && f > extFt)) { extB = b; extFt = f; }
  };
  consider(p.tgt, p.tgtFt);
  consider(Psb, dS); // the hook start exactly (grid samples straddle it)
  consider(Peb, dE);
  let hookB = Psb; // furthest-out of the timing-controlled zone (ride/hook/roll)
  const considerHook = (b: number) => { if (moreOut(b, hookB)) hookB = b; };
  considerHook(Peb);
  // Exact hook vertex: the drawn polyline only approximates the quadratic's
  // extreme, but the marker and the magnetic solve need the true apex — a grid
  // sample can sit a full step (fF/HOOK_N ≈ 0.375 ft) off the vertex.
  const den = Psb - 2 * Cb + Peb;
  if (Math.abs(den) > 1e-12) {
    const tv = (Psb - Cb) / den;
    if (tv > 0 && tv < 1) {
      const v = 1 - tv;
      const vb = v * v * Psb + 2 * v * tv * Cb + tv * tv * Peb;
      consider(vb, dS + tv * (dE - dS));
      considerHook(vb);
    }
  }
  const pts: Array<{ board: number; feet: number }> = [];
  for (let k = 1; k <= HOOK_N; k++) {
    const ft = (p.fF * k) / HOOK_N;
    const b = board(ft);
    consider(b, ft);
    if (ft > p.tgtFt) considerHook(b);
    pts.push({ board: b, feet: ft });
  }
  return { dS, dE, pts, apex: { board: clamp(extB, 1, 39), feet: extFt }, hookRawBoard: hookB };
}

/** The unified sampler. `capToLane` (strike): shrink the hook start until the
 *  hook zone (ride/hook/roll — the part timing controls; the fixed skid is
 *  exempt) stays on the lane — a deep hook start on a crossing aim rides the
 *  skid into the gutter (the ADR-023 failure mode, prevented dynamically now).
 *  When even the earliest start exits the lane, cap AT the earliest start —
 *  the nearest achievable geometry, keeping the map continuous. */
function hookGeom(p: StrikeParams, wantDS: number, wantLen: number, capToLane: boolean): HookGeom {
  const edge = p.dir > 0 ? 1 : 39;
  const off = (g: HookGeom) => p.dir * (g.hookRawBoard - edge) < 0;
  let g = hookGeomRaw(p, wantDS, wantLen);
  // Canonical length: the EFFECTIVE span at the requested start. The dE clamp
  // (dE ≤ fF − 0.5) aliases different requested lengths onto one geometry, so
  // bisecting with the raw wantLen would re-derive a different span at smaller
  // starts — and the reported (dS, len) would not reproduce the drawn apex on
  // rebuild (ADR-026: returned == drawn must hold by construction).
  const len = g.dE - g.dS;
  if (capToLane && off(g)) {
    const lo = p.tgtFt + 1;
    const gLo = hookGeomRaw(p, lo, len);
    if (off(gLo)) {
      g = gLo; // even the earliest start exits the lane — nearest achievable
    } else {
      let good = lo, bad = g.dS;
      for (let i = 0; i < 20; i++) {
        const mid = (good + bad) / 2;
        if (off(hookGeomRaw(p, mid, len))) bad = mid; else good = mid;
      }
      g = hookGeomRaw(p, good, len);
    }
  }
  return g;
}

/** Hook start reproducing a legacy stored apex depth (`breakpoint_distance`)
 *  with the default hook length — the ADR-026 lazy migration. Coarse + refine. */
function migrateHookStart(p: StrikeParams, wantApexFt: number): number {
  const lo = p.tgtFt + 1, hi = p.fF - 2, STEPS = 32;
  const cost = (dS: number) => Math.abs(hookGeom(p, dS, HOOK_LENGTH_FT, true).apex.feet - wantApexFt);
  let best = lo, bestC = Infinity;
  for (let i = 0; i <= STEPS; i++) {
    const c = lo + ((hi - lo) * i) / STEPS;
    const k = cost(c);
    if (k < bestC) { bestC = k; best = c; }
  }
  let step = (hi - lo) / STEPS;
  for (let r = 0; r < 16 && step > 1e-3; r++) {
    step /= 2;
    for (const c of [best - step, best + step]) {
      if (c < lo || c > hi) continue;
      const k = cost(c);
      if (k < bestC) { bestC = k; best = c; }
    }
  }
  return best;
}

/** Effective hook timing for a line: stored params, else migrated from a legacy
 *  `breakpoint_distance`, else the defaults. */
function lineHookTiming(p: StrikeParams, line: LineSpec): { dS: number; len: number } {
  const len = line.hook_length ?? HOOK_LENGTH_FT;
  if (line.hook_start_distance != null) return { dS: line.hook_start_distance, len };
  if (line.breakpoint_distance != null) return { dS: migrateHookStart(p, line.breakpoint_distance), len };
  return { dS: HOOK_START_FT, len };
}

/** The derived breakpoint for a line, honouring reachability the same way
 *  `buildLinePath` does. Used by `solveLine` to write the stored value. Returns
 *  the effective (clamped) hook timing alongside so it can be materialised. */
export function strikeApexPoint(line: LineSpec, hand: Handedness): { board: number; feet: number; dS: number; len: number } | null {
  const foul = line.laydown ?? line.stance;
  if (foul == null || line.target == null) return null;
  const dir = hand === "right" ? 1 : -1;
  const fB = line.final_board ?? POCKET_BOARD;
  const fF = line.final_distance ?? LANE_FEET;
  const p = strikeParams(foul, line.target, fB, fF, dir);
  const t = lineHookTiming(p, line);
  const moreOut = (a: number, b: number) => (dir > 0 ? a < b : a > b);
  if (dir * (fB - p.focalBoard(fF)) <= 0) {
    // Unreachable: the ball rides the focal straight; apex = furthest on-lane point.
    const endB = p.focalBoard(fF), outEnd = !moreOut(foul, endB); // ties → deep end
    const g = hookGeomRaw(p, t.dS, t.len); // effective timing for the write-back
    return { board: clamp(outEnd ? endB : foul, 1, 39), feet: outEnd ? fF : 0, dS: g.dS, len: g.dE - g.dS };
  }
  const g = hookGeom(p, t.dS, t.len, true);
  return { board: g.apex.board, feet: g.apex.feet, dS: g.dS, len: g.dE - g.dS };
}

/** Magnetic drag (ADR-026): solve BOTH hook-timing params so the derived apex
 *  lands nearest the finger (plane distance) within the achievable region.
 *  Coarse grid + pattern-search refine; the apex moves smoothly in (dS, len),
 *  so this is stable at pointer-move rates.
 *
 *  Aim cascade (ADR-027): timing alone confines the apex to a narrow band along
 *  the focal. With `giveWay` set, a finger beyond that band rotates the given
 *  aim peg so the focal passes through the finger, then re-solves timing — the
 *  cascade is accepted only when it clearly helps (residual at least halved),
 *  so depth-walled fingers don't twitch the aim. Recency/freeze policy lives in
 *  the caller (LaneVisualizer); solveLine never cascades (ADR-015 intact).
 */
export function projectBreakpoint(
  line: LineSpec, hand: Handedness, board: number, feet: number,
  giveWay?: "target" | "laydown" | null
): { board: number; feet: number; hook_start_distance: number; hook_length: number; target?: number; laydown?: number } {
  const foul = line.laydown ?? line.stance;
  const fallback = { board, feet, hook_start_distance: line.hook_start_distance ?? HOOK_START_FT, hook_length: line.hook_length ?? HOOK_LENGTH_FT };
  if (foul == null || line.target == null) return fallback;
  const dir = hand === "right" ? 1 : -1;
  const fB = line.final_board ?? POCKET_BOARD;
  const fF = line.final_distance ?? LANE_FEET;
  const wantX = boardToX(board, hand, true), wantY = feetToY(feet);

  const solve = (p: StrikeParams) => {
    const loS = p.tgtFt + 1, hiS = p.fF - 2, loL = 4, hiL = 25;
    const cost = (dS: number, len: number) => {
      const a = hookGeom(p, dS, len, true).apex;
      const dx = boardToX(a.board, hand, true) - wantX, dy = feetToY(a.feet) - wantY;
      return dx * dx + dy * dy;
    };
    let bS = loS, bL = HOOK_LENGTH_FT, bC = Infinity;
    const GS = 12, GL = 6;
    for (let i = 0; i <= GS; i++) {
      for (let j = 0; j <= GL; j++) {
        const dS = loS + ((hiS - loS) * i) / GS, len = loL + ((hiL - loL) * j) / GL;
        const k = cost(dS, len);
        if (k < bC) { bC = k; bS = dS; bL = len; }
      }
    }
    let stepS = (hiS - loS) / GS, stepL = (hiL - loL) / GL;
    for (let r = 0; r < 14 && (stepS > 1e-3 || stepL > 1e-3); r++) {
      stepS /= 2; stepL /= 2;
      for (const [dS, len] of [[bS - stepS, bL], [bS + stepS, bL], [bS, bL - stepL], [bS, bL + stepL]] as const) {
        if (dS < loS || dS > hiS || len < loL || len > hiL) continue;
        const k = cost(dS, len);
        if (k < bC) { bC = k; bS = dS; bL = len; }
      }
    }
    return { dS: bS, len: bL, cost: bC };
  };

  const p = strikeParams(foul, line.target, fB, fF, dir);
  if (dir * (fB - p.focalBoard(fF)) <= 0) {
    const a = strikeApexPoint(line, hand);
    return a ? { board: a.board, feet: a.feet, hook_start_distance: a.dS, hook_length: a.len } : fallback;
  }
  const s1 = solve(p);
  const g1 = hookGeom(p, s1.dS, s1.len, true);
  const base = { board: g1.apex.board, feet: g1.apex.feet, hook_start_distance: r2(g1.dS), hook_length: r2(g1.dE - g1.dS) };

  const CASCADE_THRESH = 1.5; // plane units (~0.6 board): inside the band, never cascade
  const r1 = Math.sqrt(s1.cost);
  if (!giveWay || r1 <= CASCADE_THRESH) return base;
  // Blend the rotation in over [T, 5T] so the cascade ENGAGES continuously —
  // a hard accept/reject gate pops the marker ~a board at the flip point.
  const lam = Math.min(1, (r1 - CASCADE_THRESH) / (4 * CASCADE_THRESH));

  // Rotate the give-way peg so the focal passes through the finger.
  let rl: LineSpec;
  if (giveWay === "target") {
    let tf = arrowFeet(line.target);
    let t2 = foul + (board - foul) * (tf / Math.max(feet, tf + 1));
    tf = arrowFeet(clamp(t2, 1, 39)); // arrows depth depends on the board — one refinement
    t2 = clamp(foul + (board - foul) * (tf / Math.max(feet, tf + 1)), 1, 39);
    // Never rotate past straight: an inverted aim (target crossing hook-side of
    // the laydown) flips the apex to the laydown — the marker would teleport.
    t2 = dir > 0 ? Math.min(t2, foul) : Math.max(t2, foul);
    // Physical wall: the final must stay hook-side of the rotated focal. Clamp
    // the rotation instead of bailing — a bail pops the marker at the boundary.
    const tCrit = foul + ((fB - dir * 0.5) - foul) * (tf / fF);
    t2 = dir > 0 ? Math.min(t2, tCrit) : Math.max(t2, tCrit);
    t2 = line.target + lam * (t2 - line.target); // ease the aim in with the drag
    rl = { ...line, target: r2(t2) };
  } else {
    const tf = arrowFeet(line.target);
    if (Math.abs(feet - tf) < 1) return base; // finger at the arrows: pivot undefined
    let l2 = clamp(line.target + (board - line.target) * ((0 - tf) / (feet - tf)), 1 - LOFT_MARGIN, 39 + LOFT_MARGIN);
    // Never rotate past straight (laydown crossing anti-hook-side of the target).
    l2 = dir > 0 ? Math.max(l2, line.target) : Math.min(l2, line.target);
    // Physical wall, mirrored: keep the final reachable from the rotated focal.
    const lCrit = ((fB - dir * 0.5) * tf - line.target * fF) / (tf - fF);
    l2 = dir > 0 ? Math.max(l2, lCrit) : Math.min(l2, lCrit);
    l2 = foul + lam * (l2 - foul); // ease the aim in with the drag
    rl = { ...line, laydown: r2(l2) };
  }
  const foul2 = (rl.laydown ?? rl.stance)!;
  const p2 = strikeParams(foul2, rl.target!, fB, fF, dir);
  if (dir * (fB - p2.focalBoard(fF)) <= 0) return base; // rotation made the final unreachable
  const s2 = solve(p2);
  if (s2.cost >= s1.cost) return base; // take the strictly better of the two
  const g2 = hookGeom(p2, s2.dS, s2.len, true);
  return {
    board: g2.apex.board, feet: g2.apex.feet,
    hook_start_distance: r2(g2.dS), hook_length: r2(g2.dE - g2.dS),
    ...(giveWay === "target" ? { target: rl.target } : { laydown: rl.laydown }),
  };
}

/**
 * Build the SVG path + marker points for a line.
 *
 * - **Strike** (non-spare): auto-hooks with the unified skid→hook→roll curve
 *   (ADR-026); timing per-line, breakpoint derived.
 * - **Spare** (`spareCurve`): same curve, no lane cap, derived breakpoint too.
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
    const breakpoint = pt(boardToX(clamp(outEnd ? endB : foul, 1, 39), hand, true), feetToY(outEnd ? end : 0));
    return { d, focal, miss, points: { laydown, target, hookStart: null, breakpoint, final } };
  }

  if (isStrike) {
    const p = strikeParams(foul, tgt, fB, fF, dir);
    const t = lineHookTiming(p, line);
    const g = hookGeom(p, t.dS, t.len, true);
    let d = `M ${laydown.x} ${laydown.y}`;
    for (const s of g.pts) {
      const q = pt(boardToX(s.board, hand, true), feetToY(s.feet));
      d += ` L ${q.x} ${q.y}`;
    }
    const breakpoint = pt(boardToX(g.apex.board, hand, true), feetToY(g.apex.feet));
    return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint, final } };
  }

  // Spare (ADR-019 shape, per-line timing ADR-024): same unified curve, no
  // on-lane cap (a guttering spare may run off — the miss flag handles it), and
  // now with the derived breakpoint marker too (ADR-026).
  const sp = strikeParams(foul, tgt, fB, fF, dir);
  const st = lineHookTiming(sp, line);
  const sg = hookGeomRaw(sp, st.dS, st.len);
  let d = `M ${laydown.x} ${laydown.y}`;
  for (const s of sg.pts) {
    const q = pt(boardToX(s.board, hand, true), feetToY(s.feet));
    d += ` L ${q.x} ${q.y}`;
  }
  const spBreakpoint = pt(boardToX(sg.apex.board, hand, true), feetToY(sg.apex.feet));
  return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint: spBreakpoint, final } };
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

  // Breakpoint is DERIVED (ADR-024/026): the drawn apex. Write it back so the
  // stored board + distance always equal what's drawn, and materialise the
  // effective hook timing (migrating a legacy breakpoint_distance on first
  // edit) so the sliders always show reality.
  const apex = strikeApexPoint(out, hand);
  if (apex) {
    out.breakpoint = r2(apex.board);
    out.breakpoint_distance = r2(apex.feet);
    out.hook_start_distance = r2(apex.dS);
    out.hook_length = r2(apex.len);
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
