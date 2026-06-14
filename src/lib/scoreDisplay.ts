import { isSpare, isStrike, tenthFrameFollowUpPinfall } from "./scoring";
import { knockedDownCount, pinsClearedBetween } from "./pins";
import type { Frame } from "../types/bowling";

export interface FrameShotCell {
  symbol: string;
  /** Index into frame.shots this display cell represents, or null if empty. */
  shotIndex: number | null;
}

/**
 * Pair each scorecard display cell with the shot it represents, so a UI can
 * make individual shots tappable. Mirrors getFrameShotSymbols, but resolves
 * the strike convention (frames 1-9 render the X in the *second* box while it
 * is actually shot 0).
 */
export function getFrameShotCells(frame: Frame): FrameShotCell[] {
  const symbols = getFrameShotSymbols(frame);

  if (frame.frame_number !== 10 && isStrike(frame)) {
    return [
      { symbol: symbols[0], shotIndex: null },
      { symbol: symbols[1], shotIndex: 0 }
    ];
  }

  return symbols.map((symbol, i) => ({
    symbol,
    shotIndex: frame.shots[i] ? i : null
  }));
}

export function getFrameShotSymbols(frame: Frame): string[] {
  if (frame.frame_number === 10) return getTenthFrameSymbols(frame);

  if (isStrike(frame)) return ["", "X"];

  const shotOne = knockedDownCount(frame.shots[0].pins_standing);

  if (!frame.shots[1]) return [formatPinfall(shotOne), ""];
  if (isSpare(frame)) return [formatPinfall(shotOne), "/"];

  const shotTwo = pinsClearedBetween(
    frame.shots[0].pins_standing,
    frame.shots[1].pins_standing
  );

  return [formatPinfall(shotOne), formatPinfall(shotTwo)];
}

function getTenthFrameSymbols(frame: Frame): string[] {
  const shotOne = knockedDownCount(frame.shots[0].pins_standing);
  const symbols = [shotOne === 10 ? "X" : formatPinfall(shotOne)];

  if (!frame.shots[1]) return [...symbols, "", ""];

  const shotTwo = tenthFrameFollowUpPinfall(
    frame.shots[0].pins_standing,
    frame.shots[1].pins_standing
  );

  symbols.push(
    shotOne !== 10 && shotOne + shotTwo === 10
      ? "/"
      : shotTwo === 10
      ? "X"
      : formatPinfall(shotTwo)
  );

  if (!frame.shots[2]) return [...symbols, ""];

  const shotThree = tenthFrameFollowUpPinfall(
    frame.shots[1].pins_standing,
    frame.shots[2].pins_standing
  );

  symbols.push(
    shotTwo !== 10 && shotTwo + shotThree === 10
      ? "/"
      : shotThree === 10
      ? "X"
      : formatPinfall(shotThree)
  );

  return symbols;
}

function formatPinfall(pinfall: number): string {
  return pinfall === 0 ? "-" : String(pinfall);
}
