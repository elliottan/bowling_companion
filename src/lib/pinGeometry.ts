import type { LineSpec, PinNumber } from "../types/bowling";

/**
 * Approximate pin positions: board (1–39, lower = right for a RH view) and
 * distance from the foul line in feet. Head pin (1) at board 20 / 60 ft, pins
 * on 12-inch (~11.25-board) centres, rows ~0.866 ft deeper. Hardcoded — the
 * pin deck geometry is fixed.
 */
export const PIN_POSITIONS: Record<PinNumber, { board: number; feet: number }> = {
  1: { board: 20, feet: 60.0 },
  2: { board: 14.375, feet: 60.87 },
  3: { board: 25.625, feet: 60.87 },
  4: { board: 8.75, feet: 61.73 },
  5: { board: 20, feet: 61.73 },
  6: { board: 31.25, feet: 61.73 },
  7: { board: 3.125, feet: 62.6 },
  8: { board: 14.375, feet: 62.6 },
  9: { board: 25.625, feet: 62.6 },
  10: { board: 36.875, feet: 62.6 }
};

/** Arrows / target distance from the foul line (feet). Laydown ≈ foul line. */
const ARROWS_FEET = 15;

/** The front-most pin of a leave = the lowest pin number standing. */
export function frontPin(pins: PinNumber[]): PinNumber | undefined {
  if (pins.length === 0) return undefined;
  return [...pins].sort((a, b) => a - b)[0];
}

/**
 * Board the straight laydown→arrows line reaches at the front-most pin's depth.
 * Uses laydown as the foul-line board; falls back to stance for older entries
 * that predate the laydown field. Returns undefined if neither is set, or if
 * target or pins are missing. Not clamped to 1–39.
 */
export function derivePinBoard(line: LineSpec | undefined, pins: PinNumber[]): number | undefined {
  const foul = line?.laydown ?? line?.stance;
  if (foul == null || line?.target == null) return undefined;
  const pin = frontPin(pins);
  if (pin == null) return undefined;
  const { feet } = PIN_POSITIONS[pin];
  const board = foul + (line.target - foul) * (feet / ARROWS_FEET);
  return Math.round(board * 10) / 10;
}
