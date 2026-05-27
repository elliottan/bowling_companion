import { isSpare, isStrike, tenthFrameFollowUpPinfall } from "./scoring";
import { knockedDownCount, pinsClearedBetween } from "./pins";
import type { Frame } from "../types/bowling";

export function getFrameShotSymbols(frame: Frame): string[] {
  if (frame.frame_number === 10) return getTenthFrameSymbols(frame);

  if (isStrike(frame)) return ["", "X"];

  const shotOne = knockedDownCount(frame.shot_1_pins_standing);

  if (!frame.shot_2_pins_standing) return [formatPinfall(shotOne), ""];
  if (isSpare(frame)) return [formatPinfall(shotOne), "/"];

  const shotTwo = pinsClearedBetween(
    frame.shot_1_pins_standing,
    frame.shot_2_pins_standing
  );

  return [formatPinfall(shotOne), formatPinfall(shotTwo)];
}

function getTenthFrameSymbols(frame: Frame): string[] {
  const shotOne = knockedDownCount(frame.shot_1_pins_standing);
  const symbols = [shotOne === 10 ? "X" : formatPinfall(shotOne)];

  if (!frame.shot_2_pins_standing) return [...symbols, "", ""];

  const shotTwo = tenthFrameFollowUpPinfall(
    frame.shot_1_pins_standing,
    frame.shot_2_pins_standing
  );

  symbols.push(
    shotOne !== 10 && shotOne + shotTwo === 10
      ? "/"
      : shotTwo === 10
      ? "X"
      : formatPinfall(shotTwo)
  );

  if (!frame.shot_3_pins_standing) return [...symbols, ""];

  const shotThree = tenthFrameFollowUpPinfall(
    frame.shot_2_pins_standing,
    frame.shot_3_pins_standing
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
