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

/** Board number → x on the plane. Right-handers: board 1 = right edge. */
export function boardToX(board: number, hand: Handedness): number {
  const f = (clampBoard(board) - 1) / (LANE_BOARDS - 1); // 0 at board 1
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
const unit = (dx: number, dy: number) => {
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
};
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

  const laydown = pt(boardToX(foul, hand), feetToY(0));
  const target = pt(boardToX(line.target, hand), feetToY(arrowFeet(line.target)));
  const final = pt(boardToX(line.final_board ?? POCKET_BOARD, hand), feetToY(LANE_FEET));

  if (line.breakpoint == null) {
    const d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} L ${final.x} ${final.y}`;
    return { d, points: { laydown, target, hookStart: null, breakpoint: null, final } };
  }

  const bpDist = line.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET;
  const breakpoint = pt(boardToX(line.breakpoint, hand), feetToY(bpDist));

  const skid = unit(target.x - laydown.x, target.y - laydown.y);
  const roll = unit(final.x - breakpoint.x, final.y - breakpoint.y);

  // Cubic A: target → breakpoint. Leave along the skid heading (long handle so
  // the ball stays near-straight off the arrows, then turns late), arrive
  // vertical at the apex. Clamp c1.x so it never crosses the apex x — that is
  // exactly the v2 right-overshoot bug.
  const lenA = Math.hypot(breakpoint.x - target.x, breakpoint.y - target.y);
  const a1 = pt(
    clamp(target.x + skid.x * lenA * 0.7, Math.min(target.x, breakpoint.x), Math.max(target.x, breakpoint.x)),
    target.y + skid.y * lenA * 0.7
  );
  const a2 = pt(breakpoint.x, breakpoint.y + lenA * 0.4); // below the apex → vertical approach

  // Cubic B: breakpoint → final. Leave vertical (C1 with A at the apex), ease
  // into the roll heading.
  const lenB = Math.hypot(final.x - breakpoint.x, final.y - breakpoint.y);
  const b1 = pt(breakpoint.x, breakpoint.y - lenB * 0.4); // above the apex → vertical departure
  const b2 = pt(final.x - roll.x * lenB * 0.4, final.y - roll.y * lenB * 0.4);

  const d =
    `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} ` +
    `C ${a1.x} ${a1.y} ${a2.x} ${a2.y} ${breakpoint.x} ${breakpoint.y} ` +
    `C ${b1.x} ${b1.y} ${b2.x} ${b2.y} ${final.x} ${final.y}`;

  return { d, points: { laydown, target, hookStart: null, breakpoint, final } };
}

// --- Constraint solver (ADR-013) -------------------------------------------
// A real shot can only go straight or hook to one side. So the breakpoint must
// sit on/hook-side of the laydown→target skid line, and the final must sit
// on/hook-side of the breakpoint. When an edit breaks a rule, the
// least-recently-adjusted peg *capable* of fixing that rule yields; if it would
// leave the lane we cascade to the next capable peg; if none can, the held
// (just-edited) peg clamps. Hook side = higher board for RH, lower for LH.

export type Peg = "laydown" | "target" | "breakpoint" | "final";

const EPS = 1e-6;
const BP_DIST_MAX = 59; // < 60 ft pocket

/** Capable pegs minus the held one, ordered least-recently-moved first
 *  (a never-moved peg yields before any the user has touched). */
function yieldOrder(capable: Peg[], held: Peg, recency: Peg[]): Peg[] {
  const rank = (p: Peg) => { const i = recency.indexOf(p); return i === -1 ? Infinity : i; };
  return capable.filter((p) => p !== held).sort((a, b) => rank(b) - rank(a));
}

/**
 * Enforce the down-lane order, skid-wall and roll-direction rules after an edit
 * to `held`. `recency` is the move history, most-recent first. Pure: returns a
 * corrected LineSpec (only the fields it owns are rewritten).
 */
export function solveLine(line: LineSpec, held: Peg, recency: Peg[], hand: Handedness): LineSpec {
  const foulField: "laydown" | "stance" = line.laydown != null || line.stance == null ? "laydown" : "stance";
  const ld0 = line.laydown ?? line.stance;
  if (ld0 == null || line.target == null) return line;

  const dir = hand === "right" ? 1 : -1;
  const cb = (b: number) => clamp(b, 1, 39);
  const inLane = (v: number) => v >= 1 - EPS && v <= 39 + EPS;

  let ld = cb(ld0);
  let tg = cb(line.target);
  let bp = line.breakpoint == null ? null : cb(line.breakpoint);
  let fb = line.final_board == null ? null : cb(line.final_board);
  let bpd = clamp(line.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET, Math.ceil(arrowFeet(tg)) + 1, BP_DIST_MAX);

  if (bp != null) {
    // Target is a derived aim: until the user drags it, it rides the
    // laydown→breakpoint line so the skid points straight at the breakpoint (no
    // unnatural kink). Once dragged it's pinned (present in `recency`). The
    // fixed-point iteration resolves the arrowFeet(target) self-reference (the
    // arrows→breakpoint extrapolation amplifies it, so allow it to converge).
    if (!recency.includes("target")) {
      for (let i = 0; i < 6; i++) tg = clamp(ld + (bp - ld) * (arrowFeet(tg) / bpd), 1, 39);
    }

    for (let pass = 0; pass < 6; pass++) {
      let changed = false;

      // Apex: the breakpoint is the rightmost (RH) point, so it can't sit past
      // the aim — the skid already carried the ball to min(laydown, target). A
      // breakpoint on the hook side of that is not an apex (the curve would
      // bulge back the other way), so clamp it onto the aim.
      const aim = dir > 0 ? Math.min(ld, tg) : Math.max(ld, tg);
      if (dir * (aim - bp) < -EPS) { bp = aim; changed = true; }

      // Skid wall: dir*(bp - wall) >= 0
      const wall = skidBoardAt(ld, tg, bpd);
      if (dir * (bp - wall) < -EPS) {
        let fixed = false;
        for (const peg of yieldOrder(["breakpoint", "laydown", "target"], held, recency)) {
          const k = bpd / arrowFeet(tg);
          if (peg === "breakpoint" && inLane(wall)) { bp = cb(wall); fixed = true; break; }
          if (peg === "laydown") { const v = (bp - tg * k) / (1 - k); if (inLane(v)) { ld = cb(v); fixed = true; break; } }
          if (peg === "target") { const v = ld + (bp - ld) / k; if (inLane(v)) { tg = cb(v); fixed = true; break; } }
        }
        if (!fixed) bp = cb(skidBoardAt(ld, tg, bpd)); // clamp held to the wall
        changed = true;
      }

      // Roll direction: dir*(final - bp) >= 0  (pocket default counts as final)
      const fbEff = fb ?? POCKET_BOARD;
      if (dir * (fbEff - bp) < -EPS) {
        const [first] = yieldOrder(["final", "breakpoint"], held, recency);
        if (first === "breakpoint") bp = cb(fbEff);
        else fb = cb(bp); // move final onto the breakpoint (boundary)
        changed = true;
      }

      if (!changed) break;
    }
  }

  // Round to 2 dp / whole feet so solver-moved pegs read cleanly in the inputs
  // and labels (no 17-digit floats) while keeping the constraint satisfied.
  const out: LineSpec = { ...line, target: r2(tg), [foulField]: r2(ld) };
  if (bp != null) { out.breakpoint = r2(bp); out.breakpoint_distance = Math.round(bpd); }
  if (fb != null) out.final_board = r2(fb);
  return out;
}
