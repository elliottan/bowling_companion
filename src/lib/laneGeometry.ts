import type { Handedness, LineSpec } from "../types/bowling";

// Physical landmarks.
export const LANE_BOARDS = 39;
export const LANE_FEET = 60;            // foul line → head pin
export const ARROWS_FEET = 15;          // target arrows
export const DEFAULT_BREAKPOINT_FEET = 42;
export const POCKET_BOARD = 17.5;       // 1-3 pocket (right-hander); mirrored by boardToX

// Vertical drawing extent, in feet measured from the foul line. We draw a short
// approach BELOW the foul line (negative) so the laydown handle isn't jammed
// against the bottom edge, and extend ABOVE the head pin so the full pin deck
// (pins reach ~62.9 ft) is visible rather than clipped to the foul-line→head-pin
// span. The foul line (0 ft) therefore sits a little above the very bottom.
export const DRAW_FRONT_FEET = -4;      // approach, below the foul line
export const DRAW_BACK_FEET = 63;       // just behind the pin deck
const DRAW_SPAN = DRAW_BACK_FEET - DRAW_FRONT_FEET;

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

/** Distance from foul line (ft) → y on the plane. Foul-relative feet map across
 *  the [DRAW_FRONT_FEET, DRAW_BACK_FEET] drawing extent; smaller feet → lower. */
export function feetToY(feet: number): number {
  return PLANE_L * (1 - (feet - DRAW_FRONT_FEET) / DRAW_SPAN);
}

/** Inverse of feetToY. */
export function yToFeet(y: number): number {
  return DRAW_FRONT_FEET + (1 - y / PLANE_L) * DRAW_SPAN;
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
  /** Dotted guide: the straight laydown→target line extended down the lane. The
   *  ball rides it on the skid and can never cross right of it (ADR-014). */
  focal: { a: PlanePoint; b: PlanePoint } | null;
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
export function buildLinePath(line: LineSpec | undefined, hand: Handedness): LinePath | null {
  const foul = line?.laydown ?? line?.stance;
  if (line == null || foul == null || line.target == null) return null;

  // Laydown maps raw so a lofted (off-lane) board sits past the edge.
  const laydown = pt(boardToX(foul, hand, true), feetToY(0));
  const target = pt(boardToX(line.target, hand), feetToY(arrowFeet(line.target)));
  const final = pt(boardToX(line.final_board ?? POCKET_BOARD, hand), feetToY(LANE_FEET));

  // Focal guide: laydown→target extended across the whole drawing extent.
  const focal = {
    a: pt(boardToX(skidBoardAt(foul, line.target, DRAW_FRONT_FEET), hand, true), feetToY(DRAW_FRONT_FEET)),
    b: pt(boardToX(skidBoardAt(foul, line.target, DRAW_BACK_FEET), hand, true), feetToY(DRAW_BACK_FEET)),
  };

  if (line.breakpoint == null) {
    const d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} L ${final.x} ${final.y}`;
    return { d, focal, points: { laydown, target, hookStart: null, breakpoint: null, final } };
  }

  const finalBoard = line.final_board ?? POCKET_BOARD;
  const tgt = line.target; // captured (non-null) for use inside the hookBoard closure
  const dT = arrowFeet(line.target);
  const bpd = clamp(line.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET, dT + 0.5, LANE_FEET - 0.5);
  const breakpoint = pt(boardToX(line.breakpoint, hand), feetToY(bpd));

  // Board as a function of down-lane distance d. Straight skid on the focal line,
  // then a monotone cubic-Hermite hook through the breakpoint apex (flat tangent
  // → the apex is the furthest point) easing to ~straight at the final. The pieces
  // are monotone by construction (no reversal) and clamped to the hook side of the
  // focal line, so the drawn curve can never cross it (ADR-015).
  const D = [dT, bpd, LANE_FEET];
  const V = [line.target, line.breakpoint, finalBoard];
  const secA = (V[1] - V[0]) / (D[1] - D[0]);
  const secB = (V[2] - V[1]) / (D[2] - D[1]);
  const focalSlope = (line.target - foul) / arrowFeet(line.target); // boards per ft along the skid
  // Leave the arrows tangent to the skid, arrive ~straight at the pins; Fritsch–
  // Carlson limiting (|slope| ≤ 3×secant, zero across an extremum) keeps each
  // Hermite segment monotone. The apex tangent is flat.
  const fc = (m: number, s: number) => (s === 0 || m * s < 0 ? 0 : Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(s)));
  const M = [fc(focalSlope, secA), 0, fc(secB, secB)];
  const dir = hand === "right" ? 1 : -1;
  // The focal line is an anti-hook wall only when the skid heads to the anti-hook
  // side (the ball goes out, then hooks back). When the aim itself heads hook-side
  // (across the lane), the focal runs off-lane and imposes no wall.
  const wall = dir * (foul - line.target) > 0;
  const hookBoard = (d: number): number => {
    const i = d <= bpd ? 0 : 1;
    const h = D[i + 1] - D[i];
    const s = (d - D[i]) / h;
    const H00 = 2 * s ** 3 - 3 * s ** 2 + 1, H10 = s ** 3 - 2 * s ** 2 + s;
    const H01 = -2 * s ** 3 + 3 * s ** 2, H11 = s ** 3 - s ** 2;
    const raw = V[i] * H00 + M[i] * h * H10 + V[i + 1] * H01 + M[i + 1] * h * H11;
    if (!wall) return raw;
    const focalB = skidBoardAt(foul, tgt, d);
    return dir > 0 ? Math.max(raw, focalB) : Math.min(raw, focalB); // never anti-hook of the focal
  };

  // Sample the hook into a smooth polyline. Splitting at the apex makes bpd a
  // sample, so the breakpoint marker sits exactly on the drawn line.
  const SEG = 28;
  let d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y}`;
  for (const [lo, hi] of [[dT, bpd], [bpd, LANE_FEET]]) {
    for (let k = 1; k <= SEG; k++) {
      const dist = lo + (hi - lo) * (k / SEG);
      const p = pt(boardToX(hookBoard(dist), hand, true), feetToY(dist));
      d += ` L ${p.x} ${p.y}`;
    }
  }

  return { d, focal, points: { laydown, target, hookStart: null, breakpoint, final } };
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
  // (steeper-the-further-apart) skid without a kink. `minDrift` is the Fritsch–
  // Carlson monotonicity threshold for that entry tangent; closer than it isn't
  // smoothly drawable, so the breakpoint slides to the apex side (subsumes the old
  // "no further hook-side than the aim" cap).
  let bp = hookSide(clLane(line.breakpoint), focal(bpd));
  if (dir * (ld - tg) > 0) {
    const minDrift = (Math.abs(tg - ld) * (bpd - arrowFeet(tg))) / (3 * arrowFeet(tg));
    bp = antiSide(bp, tg - dir * minDrift);
  }
  bp = clLane(bp);
  out.breakpoint = r2(bp);
  out.breakpoint_distance = Math.round(bpd);

  // Final: hook-side of the breakpoint and of the focal at the pins. Materialised
  // only when set, or when the pocket default is no longer reachable.
  const fb = clLane(hookSide(line.final_board ?? POCKET_BOARD, hookSide(bp, focal(LANE_FEET))));
  if (line.final_board != null || dir * (fb - POCKET_BOARD) > 0) out.final_board = r2(fb);

  return out;
}
