import type { Handedness, PinNumber } from "../types/bowling";
import { PIN_POSITIONS } from "./pinGeometry";
import { LANE_BOARDS } from "./laneGeometry";

// Geometry constants, all in boards (1 board = 1.0417 in).
const BOARD_IN = 1.0417;
const R_BALL = 4.08; // 8.5 in ball / 2 / BOARD_IN
const R_PIN = 2.29; // 4.766 in pin / 2 / BOARD_IN
const SLIDE_REACH = R_BALL + R_PIN; // ≈ 6.37 — full lateral slide offset (θ=90°)
const CONNECT_BOARDS = 11.5; // ≤ one pin spacing → laterally connected
const SLEEPER_BOARDS = 3; // |Δboard| under this + deeper = a pin stacked behind

const CENTER_BOARD = 20; // head-pin board
const POCKET_BOARD = 17.5;

export interface AimPoint {
  board: number;
  feet: number;
}

type Pin = { pin: PinNumber } & AimPoint;

/** Pins ordered front (shallow) to back, tie-broken toward the pocket. */
function ordered(pins: PinNumber[]): Pin[] {
  return pins
    .map((pin) => ({ pin, ...PIN_POSITIONS[pin] }))
    .sort(
      (a, b) =>
        a.feet - b.feet ||
        Math.abs(a.board - CENTER_BOARD) - Math.abs(b.board - CENTER_BOARD) ||
        Math.abs(a.board - POCKET_BOARD) - Math.abs(b.board - POCKET_BOARD)
    );
}

const connected = (a: Pin, b: Pin) => Math.abs(a.board - b.board) <= CONNECT_BOARDS;
const behind = (front: Pin, other: Pin) =>
  other.feet > front.feet && Math.abs(other.board - front.board) < SLEEPER_BOARDS;

/** Aim point in the canonical PIN_POSITIONS board space (board 1 = left edge,
 *  i.e. `boardToX(..., "left")`). Mirrored to the bowler's hand by spareAimPoint. */
function rawAim(pins: PinNumber[]): AimPoint | undefined {
  if (pins.length === 0) return undefined;
  const order = ordered(pins);
  const p1 = order[0];
  if (order.length === 1) return { board: p1.board, feet: p1.feet };

  const rest = order.slice(1);
  // Connected, non-sleeper neighbors are pocket-aim candidates.
  const neighbors = rest.filter((p) => connected(p1, p) && !behind(p1, p));
  if (neighbors.length > 0) {
    // P2 = frontmost connected neighbor (ordered() already tie-breaks pocket-side).
    const p2 = neighbors[0];
    return { board: (p1.board + p2.board) / 2, feet: (p1.feet + p2.feet) / 2 };
  }

  // All neighbors are stacked behind (sleeper) → aim at the front pin center.
  if (rest.every((p) => behind(p1, p))) return { board: p1.board, feet: p1.feet };

  // Split: slide the clip pin (p1) across into the frontmost other pin.
  const other = rest[0];
  const dBoardFt = (Math.abs(p1.board - other.board) * BOARD_IN) / 12;
  const dFeet = Math.abs(p1.feet - other.feet);
  const sinT = dBoardFt / Math.hypot(dBoardFt, dFeet);
  const offset = SLIDE_REACH * sinT;
  const away = Math.sign(p1.board - other.board) || 1; // contact on the far side
  return { board: p1.board + away * offset, feet: p1.feet };
}

/**
 * The ideal place to send the ball to make a leave, in the bowler's **line-board**
 * convention (the same boards a target/laydown use: board 1 = the bowler's gutter
 * side, so for a right-hander the 10-pin lands near board 3). Single pin → its
 * center; a connected cluster → the midpoint of the front pin and its pocket-side
 * connected neighbor; a split → a thin clip that slides the front pin across,
 * offset by the real slide angle. Sleepers (a pin stacked directly behind) fall
 * back to the front pin's center. Returns undefined for an empty leave. Pure.
 */
export function spareAimPoint(pins: PinNumber[], hand: Handedness): AimPoint | undefined {
  const aim = rawAim(pins);
  if (!aim) return undefined;
  // PIN_POSITIONS is board-1-left; a right-hander's boards mirror about centre.
  return hand === "right" ? { board: LANE_BOARDS + 1 - aim.board, feet: aim.feet } : aim;
}
