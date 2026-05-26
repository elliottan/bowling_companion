import { ALL_PINS, isSpare, isStrike, knockedDownCount } from "./scoring";
import type { Frame, PinNumber } from "../types/bowling";

export function getFrameShotSymbols(frame: Frame) {
  if (frame.frame_number === 10) {
    return getTenthFrameSymbols(frame);
  }

  if (isStrike(frame)) {
    return ["", "X"];
  }

  const shotOne = knockedDownCount(frame.shot_1_pins_standing);

  if (!frame.shot_2_pins_standing) {
    return [formatPinfall(shotOne), ""];
  }

  if (isSpare(frame)) {
    return [formatPinfall(shotOne), "/"];
  }

  const shotTwo = pinsClearedBetween(
    frame.shot_1_pins_standing,
    frame.shot_2_pins_standing
  );

  return [formatPinfall(shotOne), formatPinfall(shotTwo)];
}

function getTenthFrameSymbols(frame: Frame) {
  const shotOne = knockedDownCount(frame.shot_1_pins_standing);
  const symbols = [shotOne === 10 ? "X" : formatPinfall(shotOne)];

  if (!frame.shot_2_pins_standing) {
    return [...symbols, "", ""];
  }

  const shotTwo = tenthFrameFollowUpPinfall(
    frame.shot_1_pins_standing,
    frame.shot_2_pins_standing
  );

  if (shotOne !== 10 && shotOne + shotTwo === 10) {
    symbols.push("/");
  } else {
    symbols.push(shotTwo === 10 ? "X" : formatPinfall(shotTwo));
  }

  if (!frame.shot_3_pins_standing) {
    return [...symbols, ""];
  }

  const shotThree = tenthFrameFollowUpPinfall(
    frame.shot_2_pins_standing,
    frame.shot_3_pins_standing
  );

  if (shotTwo !== 10 && shotTwo + shotThree === 10) {
    symbols.push("/");
  } else {
    symbols.push(shotThree === 10 ? "X" : formatPinfall(shotThree));
  }

  return symbols;
}

function formatPinfall(pinfall: number) {
  return pinfall === 0 ? "-" : String(pinfall);
}

function tenthFrameFollowUpPinfall(
  previousStandingPins: PinNumber[],
  currentStandingPins: PinNumber[]
) {
  if (previousStandingPins.length === 0) {
    return knockedDownCount(currentStandingPins);
  }

  return pinsClearedBetween(previousStandingPins, currentStandingPins);
}

function pinsClearedBetween(
  previousStandingPins: PinNumber[],
  currentStandingPins: PinNumber[]
) {
  const currentPins = new Set(currentStandingPins);
  const previousPins = previousStandingPins.length === 0 ? ALL_PINS : previousStandingPins;

  return previousPins.filter((pin) => !currentPins.has(pin)).length;
}
