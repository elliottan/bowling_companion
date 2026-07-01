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

/**
 * Build the SVG path + marker points for a line as skid → hook → roll (ADR-013).
 * Needs a foul-line board (`laydown ?? stance`) and a `target`; returns null
 * otherwise.
 *
 * - Skid (straight): laydown → target. The target rides the arrow chevron
 *   (`arrowFeet`); only its board is free.
 * - Hook + roll (two C1-continuous cubics through the breakpoint apex):
 *   target → breakpoint leaves the arrows along the skid heading and arrives at
 *   the breakpoint with a **vertical** tangent; breakpoint → final leaves
 *   vertical and eases into the roll heading. The vertical apex tangent makes the
 *   breakpoint the strict rightmost (RH) point — no overshoot.
 *
 * With no breakpoint set, the line runs straight to the final point.
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
  // A strike line is a non-spare line that carries a breakpoint. It uses the SAME
  // curve as the spare (ADR-022); its breakpoint is *derived* — the furthest-out
  // point of that curve — not a shaping input.
  const isStrike = !spareCurve && line.breakpoint != null;

  // No curve requested (a bare strike line with no breakpoint): straight to final.
  if (!spareCurve && !isStrike) {
    const d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} L ${final.x} ${final.y}`;
    return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint: null, final } };
  }

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
    const outEnd = moreOut(endB, foul);
    const breakpoint = isStrike
      ? pt(boardToX(clamp(outEnd ? endB : foul, 1, 39), hand, true), feetToY(outEnd ? end : 0))
      : null;
    return { d, focal, miss, points: { laydown, target, hookStart: null, breakpoint, final } };
  }

  // Strike (ADR-023): ONE smooth quadratic from the target to the final. The control
  // sits on the focal at the [arrows, final] midpoint, but is pulled *nearer* if the
  // focal would run off the lane — so the whole curve stays on the lane and smooth
  // (the breakpoint comes nearer) instead of guttering and cornering. Tangent to the
  // skid at the target (control on the focal) and a convex blend of on-focal +
  // hook-side points ⇒ it never crosses to the anti-hook side of the focal and never
  // reverts (no S, no kink). The breakpoint is the derived furthest-out point.
  if (isStrike) {
    const focalAtBoard = (b: number) => (tgtFt * (b - foul)) / (tgt - foul);
    let cDist = (tgtFt + fF) / 2;
    if (tgt !== foul) {
      const cb = focalBoard(cDist);
      if (cb < 1) cDist = Math.min(cDist, focalAtBoard(1));
      else if (cb > 39) cDist = Math.min(cDist, focalAtBoard(39));
    }
    cDist = clamp(cDist, tgtFt + 1, fF - 1);
    const Cb = focalBoard(cDist), Cf = cDist;
    const N = 120;
    let d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y}`;
    let extB = foul, extFt = 0; // laydown is the rightmost on an inside line
    if (moreOut(tgt, extB)) { extB = tgt; extFt = tgtFt; }
    for (let k = 1; k <= N; k++) {
      const t = k / N, v = 1 - t;
      const b = v * v * tgt + 2 * v * t * Cb + t * t * fB;
      const f = v * v * tgtFt + 2 * v * t * Cf + t * t * fF;
      if (moreOut(b, extB)) { extB = b; extFt = f; }
      const p = pt(boardToX(b, hand, true), feetToY(f));
      d += ` L ${p.x} ${p.y}`;
    }
    const breakpoint = pt(boardToX(extB, hand, true), feetToY(extFt));
    return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint, final } };
  }

  // Spare (ADR-019): straight skid on the focal to HOOK_START_FT, one quadratic over
  // HOOK_LENGTH_FT (control on the focal at the span midpoint → feet linear in t),
  // then a straight roll into the pin. No breakpoint marker.
  const dS = clamp(HOOK_START_FT, tgtFt + 1, fF - 2);
  const dE = clamp(dS + HOOK_LENGTH_FT, dS + 1, fF - 0.5);
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

const BP_DIST_MAX = 59;  // < 60 ft pocket
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
  if (line.breakpoint == null) return out;

  const bpd = clamp(line.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET, Math.ceil(arrowFeet(tg)) + 1, BP_DIST_MAX);
  const focal = (d: number) => skidBoardAt(ld, tg, d);
  const hookSide = (a: number, b: number) => (dir > 0 ? Math.max(a, b) : Math.min(a, b)); // the more hook-side
  const antiSide = (a: number, b: number) => (dir > 0 ? Math.min(a, b) : Math.max(a, b)); // the more anti-hook

  // Breakpoint: hook-side of the focal; on an out-and-back skid it must also carry
  // far enough *past* the aim that the hook can leave the arrows tangent to the
  // (steeper-the-wider-the-aim) skid without a corner. `minDrift` is the Fritsch–
  // Carlson monotonicity threshold for that tangent leave; closer than it can't be
  // drawn smoothly, so the breakpoint slides gutter-ward (subsumes the old "no
  // further hook-side than the aim" cap).
  let bp = hookSide(clLane(line.breakpoint), focal(bpd));
  if (dir * (ld - tg) > 0) {
    const minDrift = (Math.abs(tg - ld) * (bpd - arrowFeet(tg))) / (3 * arrowFeet(tg));
    bp = antiSide(bp, tg - dir * minDrift);
  }
  bp = clLane(bp);
  out.breakpoint = r2(bp);
  out.breakpoint_distance = Math.round(bpd);

  // Final: hook-side of the breakpoint and of the focal at the pins. Materialised
  // only when set, or when the pocket default is no longer reachable. Capped to the
  // lane: a guttering aim's final stays at the lane edge (the furthest on-lane point)
  // so its handle is always reachable, rather than flying off-screen.
  const fb = clLane(hookSide(line.final_board ?? POCKET_BOARD, hookSide(bp, focal(LANE_FEET))));
  if (line.final_board != null || dir * (fb - POCKET_BOARD) > 0) out.final_board = r2(fb);

  return out;
}
