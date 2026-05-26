import type { Frame, PinNumber } from "../types/bowling";

export const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface FrameScore {
  frame_number: number;
  score: number | null;
  rollingTotal: number | null;
  isStrike: boolean;
  isSpare: boolean;
}

export interface GameScore {
  total: number;
  isComplete: boolean;
  frames: FrameScore[];
}

export function knockedDownCount(pinsStanding: PinNumber[] = ALL_PINS) {
  return 10 - uniquePins(pinsStanding).length;
}

export function isStrike(frame: Pick<Frame, "shot_1_pins_standing">) {
  return knockedDownCount(frame.shot_1_pins_standing) === 10;
}

export function isSpare(
  frame: Pick<Frame, "shot_1_pins_standing" | "shot_2_pins_standing">
) {
  if (isStrike(frame)) {
    return false;
  }

  if (!frame.shot_2_pins_standing) {
    return false;
  }

  return knockedDownCount(frame.shot_2_pins_standing) === 10;
}

export function calculateGameScore(frames: Frame[]): GameScore {
  const orderedFrames = [...frames].sort(
    (first, second) => first.frame_number - second.frame_number
  );
  const shots = flattenShots(orderedFrames);
  const scoredFrames: FrameScore[] = [];
  let shotIndex = 0;
  let rollingTotal = 0;

  for (let frameNumber = 1; frameNumber <= 10; frameNumber += 1) {
    const frame = orderedFrames.find((item) => item.frame_number === frameNumber);

    if (!frame) {
      return {
        total: rollingTotal,
        isComplete: false,
        frames: scoredFrames
      };
    }

    const strike = isStrike(frame);
    const spare = isSpare(frame);
    const bonusShotsNeeded = frameNumber < 10 ? (strike ? 2 : spare ? 1 : 0) : 0;
    const frameShots = shots.slice(shotIndex, shotIndex + (strike && frameNumber < 10 ? 1 : 2));
    const bonusShots = shots.slice(shotIndex + frameShots.length, shotIndex + frameShots.length + bonusShotsNeeded);

    if (frameNumber < 10 && bonusShots.length < bonusShotsNeeded) {
      scoredFrames.push({
        frame_number: frameNumber,
        score: null,
        rollingTotal: null,
        isStrike: strike,
        isSpare: spare
      });

      return {
        total: rollingTotal,
        isComplete: false,
        frames: scoredFrames
      };
    }

    const frameScore =
      frameNumber === 10
        ? calculateTenthFrameScore(frame)
        : frameShots.reduce((total, shot) => total + shot, 0) +
          bonusShots.reduce((total, shot) => total + shot, 0);

    if (frameScore === null) {
      scoredFrames.push({
        frame_number: frameNumber,
        score: null,
        rollingTotal: null,
        isStrike: strike,
        isSpare: spare
      });

      return {
        total: rollingTotal,
        isComplete: false,
        frames: scoredFrames
      };
    }

    rollingTotal += frameScore;
    scoredFrames.push({
      frame_number: frameNumber,
      score: frameScore,
      rollingTotal,
      isStrike: strike,
      isSpare: spare
    });

    shotIndex += strike && frameNumber < 10 ? 1 : 2;
  }

  return {
    total: rollingTotal,
    isComplete: scoredFrames.length === 10 && scoredFrames.every((frame) => frame.score !== null),
    frames: scoredFrames
  };
}

function flattenShots(frames: Frame[]) {
  return frames.flatMap((frame) => {
    if (frame.frame_number === 10) {
      return [
        knockedDownCount(frame.shot_1_pins_standing),
        frame.shot_2_pins_standing
          ? tenthFrameFollowUpPinfall(frame.shot_1_pins_standing, frame.shot_2_pins_standing)
          : undefined,
        frame.shot_3_pins_standing
          ? tenthFrameFollowUpPinfall(frame.shot_2_pins_standing ?? ALL_PINS, frame.shot_3_pins_standing)
          : undefined
      ].filter(isNumber);
    }

    if (isStrike(frame)) {
      return [10];
    }

    return [
      knockedDownCount(frame.shot_1_pins_standing),
      frame.shot_2_pins_standing
        ? pinsClearedBetween(frame.shot_1_pins_standing, frame.shot_2_pins_standing)
        : undefined
    ].filter(isNumber);
  });
}

function calculateTenthFrameScore(frame: Frame) {
  const shotOne = knockedDownCount(frame.shot_1_pins_standing);

  if (!frame.shot_2_pins_standing) {
    return null;
  }

  const shotTwo = tenthFrameFollowUpPinfall(
    frame.shot_1_pins_standing,
    frame.shot_2_pins_standing
  );
  const needsThirdShot = shotOne === 10 || shotOne + shotTwo === 10;

  if (!needsThirdShot) {
    return shotOne + shotTwo;
  }

  if (!frame.shot_3_pins_standing) {
    return null;
  }

  return (
    shotOne +
    shotTwo +
    tenthFrameFollowUpPinfall(frame.shot_2_pins_standing, frame.shot_3_pins_standing)
  );
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
  const currentPins = new Set(uniquePins(currentStandingPins));

  return uniquePins(previousStandingPins).filter((pin) => !currentPins.has(pin)).length;
}

function uniquePins(pins: PinNumber[]) {
  return [...new Set(pins)].sort((first, second) => first - second);
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number";
}
