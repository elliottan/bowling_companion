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

// Strike hook shape (ADR-021), hardcoded for now. The skid is straight on the
// focal to the arrows; the hook leaves the arrows tangent to the skid, arcs out to
// the breakpoint apex, hooks back, then rolls straight from STRIKE_ROLL_START_FT
// into the pocket. (A skid that runs *past* the arrows can't absorb a steep focal
// into a flat apex without a corner, so the strike hooks from the arrows — the
// tangent leave still looks straight there.) Unlike the spare, the breakpoint
// board + distance are user inputs (the apex), not derived.
export const STRIKE_ROLL_START_FT = 54;

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
  // raw: a guttering line's final sits off the lane (on the focal); the marker must
  // follow it past the edge to match the drawn ball, not pin to board 39.
  const final = pt(boardToX(finalBoard0, hand, true), feetToY(finalFeet));

  // Focal guide: laydown→target extended across the whole drawing extent. A plain
  // straight segment now (feetToY is linear, ADR-020).
  const focalBoard = (ft: number) => skidBoardAt(foul, line.target!, ft);
  const focalPt = (ft: number) => pt(boardToX(focalBoard(ft), hand, true), feetToY(ft));
  const fa = focalPt(DRAW_FRONT_FEET), fb = focalPt(DRAW_BACK_FEET);
  const focal = `M ${fa.x} ${fa.y} L ${fb.x} ${fb.y}`;

  // Spares ignore any stored breakpoint (dormant legacy data) — they always take
  // the smooth-curve / straight branch, never the breakpoint cubic.
  if (spareCurve || line.breakpoint == null) {
    if (spareCurve) {
      // Spare ball (ADR-019): three phases as a board(ft) function, sampled
      // uniformly down-lane so it renders smoothly through the 60 ft deck knee.
      //   skid  — straight on the focal until HOOK_START_FT
      //   hook  — one quadratic over HOOK_LENGTH_FT, control on the focal at the
      //           span midpoint (so feet is linear in t and angularity is emergent)
      //   roll  — straight from the hook's end into the pin
      // Both joins are tangent-continuous (no kink), and because the skid and the
      // control sit on the focal while the pin sits hook-side, the whole path is a
      // convex blend of on-focal and hook-side points: it can never cross right of
      // the focal and never reverts its turn (structural, not clamped).
      const dir = hand === "right" ? 1 : -1;
      const fB = finalBoard0, fF = finalFeet;
      const focalAtFinal = focalBoard(fF);
      // Pin on the gutter side of the focal ⇒ no leftward hook can reach it: ride
      // the focal straight off the back, flag a miss if it ends >1 ball+pin radius
      // off the pin (else the straight ball still clips it).
      if (dir * (fB - focalAtFinal) <= 0) {
        const miss = Math.abs(focalAtFinal - fB) > BALL_PIN_BOARDS;
        let d = `M ${laydown.x} ${laydown.y}`;
        const N = 120;
        for (let k = 1; k <= N; k++) {
          const ft = (DRAW_BACK_FEET * k) / N;
          d += ` L ${focalPt(ft).x} ${focalPt(ft).y}`;
        }
        return { d, focal, miss, points: { laydown, target, hookStart: null, breakpoint: null, final } };
      }

      const dS = clamp(HOOK_START_FT, arrowFeet(line.target) + 1, fF - 2);
      const dE = clamp(dS + HOOK_LENGTH_FT, dS + 1, fF - 0.5);
      const dM = (dS + dE) / 2;
      const Psb = focalBoard(dS);          // hook start (on focal)
      const Cb = focalBoard(dM);           // control (on focal, span midpoint)
      const u = (dE - dM) / (fF - dM);     // roll start sits on the line C→pin…
      const Peb = Cb + u * (fB - Cb);      // …at the hook-end distance dE
      const board = (ft: number): number => {
        if (ft <= dS) return focalBoard(ft);                 // skid
        if (ft <= dE) {                                       // hook (feet linear in t)
          const t = (ft - dS) / (dE - dS), v = 1 - t;
          return v * v * Psb + 2 * v * t * Cb + t * t * Peb;
        }
        return Peb + ((ft - dE) / (fF - dE)) * (fB - Peb);    // roll (straight to pin)
      };
      let d = `M ${laydown.x} ${laydown.y}`;
      const N = 160;
      for (let k = 1; k <= N; k++) {
        const ft = (fF * k) / N;
        const p = pt(boardToX(board(ft), hand, true), feetToY(ft));
        d += ` L ${p.x} ${p.y}`;
      }
      return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint: null, final } };
    }
    const d = `M ${laydown.x} ${laydown.y} L ${target.x} ${target.y} L ${final.x} ${final.y}`;
    return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint: null, final } };
  }

  // Strike line (ADR-021): the spare's straight skid → smooth hook → straight roll,
  // with a user breakpoint as a flat-tangent apex in the middle. Four phases as one
  // board(ft) function, sampled (linear feetToY → straight renders straight):
  //   skid     — straight on the focal to the arrows
  //   hook-out — cubic Hermite: leaves the arrows tangent to the focal, arrives at
  //              the breakpoint with a flat tangent (the apex / furthest point)
  //   hook-in  — quadratic from the breakpoint (flat tangent) toward the roll start,
  //              control on the breakpoint's vertical at the span midpoint (spare-style)
  //   roll     — straight into the final/pocket
  const dir = hand === "right" ? 1 : -1;
  const tgt = line.target; // captured (non-null) for the closures below
  const dT = arrowFeet(tgt);
  const focalB = (d: number) => skidBoardAt(foul, tgt, d);
  const focalSlope = (tgt - foul) / dT; // boards per ft along the skid
  const Bb = line.breakpoint; // breakpoint board (solveLine keeps it hook-side of focal)
  const Bd = clamp(line.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET, dT + 2, LANE_FEET - 2);
  const Fb = finalBoard0, Fd = finalFeet;
  const breakpoint = pt(boardToX(Bb, hand, true), feetToY(Bd)); // raw: may sit off-lane (gutter)

  // Hook-out Hermite from the arrows: slope focalSlope (tangent to skid) → 0 (flat
  // apex). Limit the start slope (Fritsch–Carlson) so the piece stays monotone — no
  // overshoot past the apex, and no crossing right of the focal.
  const hs = dT, bS = tgt; // skid ends on the arrows (focalB(dT) === tgt)
  const fc = (m: number, s: number) => (s === 0 || m * s < 0 ? 0 : Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(s)));
  const mOut = fc(focalSlope, (Bb - bS) / (Bd - hs));

  // Hook-in + roll (spare-style about the breakpoint's vertical): control on the
  // vertical through the breakpoint at the span midpoint → flat tangent at the
  // breakpoint and feet linear in t; the roll start sits on the line control→final,
  // so the straight roll joins tangentially.
  const rs = clamp(STRIKE_ROLL_START_FT, Bd + 1, Fd - 1);
  const dM = (Bd + rs) / 2;
  const PeB = Bb + ((rs - dM) / (Fd - dM)) * (Fb - Bb); // roll-start board

  const board = (d: number): number => {
    let b: number;
    if (d <= hs) b = focalB(d);                                   // skid
    else if (d <= Bd) {                                           // hook-out Hermite
      const h = Bd - hs, t = (d - hs) / h, t2 = t * t, t3 = t2 * t;
      b = bS * (2 * t3 - 3 * t2 + 1) + mOut * h * (t3 - 2 * t2 + t) + Bb * (-2 * t3 + 3 * t2);
    } else if (d <= rs) {                                         // hook-in quadratic
      const t = (d - Bd) / (rs - Bd), v = 1 - t;
      b = v * v * Bb + 2 * v * t * Bb + t * t * PeB;
    } else {                                                      // straight roll
      b = PeB + ((d - rs) / (Fd - rs)) * (Fb - PeB);
    }
    // The ball hooks to one side only; it can NEVER be on the anti-hook (gutter)
    // side of the focal — always, for every aim (inside lines included). If the
    // breakpoint/final the user set would need that, the ball rides the focal off
    // the lane instead (ADR-021). Capped to the same off-lane bound as the pegs
    // (solveLine) so the path and markers agree when the ball gutters.
    const clamped = dir > 0 ? Math.max(b, focalB(d)) : Math.min(b, focalB(d));
    return clamp(clamped, 1 - LOFT_MARGIN, 39 + LOFT_MARGIN);
  };

  const N = 160;
  let d = `M ${laydown.x} ${laydown.y}`;
  for (let k = 1; k <= N; k++) {
    const dist = (Fd * k) / N;
    const p = pt(boardToX(board(dist), hand, true), feetToY(dist));
    d += ` L ${p.x} ${p.y}`;
  }

  return { d, focal, miss: false, points: { laydown, target, hookStart: null, breakpoint, final } };
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
  // Dependent pegs may sit off the lane on the hook side: an aim whose focal runs
  // off the lane sends the ball into the gutter, and the breakpoint/final follow it
  // off the edge rather than the line drawing something impossible (ADR-021).
  const clLoft = (b: number) => clamp(b, 1 - LOFT_MARGIN, 39 + LOFT_MARGIN);
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
  bp = clLoft(bp);
  out.breakpoint = r2(bp);
  out.breakpoint_distance = Math.round(bpd);

  // Final: hook-side of the breakpoint and of the focal at the pins. Materialised
  // only when set, or when the pocket default is no longer reachable.
  const fb = clLoft(hookSide(line.final_board ?? POCKET_BOARD, hookSide(bp, focal(LANE_FEET))));
  if (line.final_board != null || dir * (fb - POCKET_BOARD) > 0) out.final_board = r2(fb);

  return out;
}
