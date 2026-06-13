import type { Frame } from "../types/bowling";
import {
  ALL_PINS,
  knockedDownCount,
  pinsClearedBetween
} from "./pins";

export { ALL_PINS, knockedDownCount } from "./pins";

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

export function isStrike(frame: Pick<Frame, "shots">): boolean {
  return knockedDownCount(frame.shots[0]?.pins_standing ?? ALL_PINS) === 10;
}

export function isSpare(frame: Pick<Frame, "shots">): boolean {
  if (isStrike(frame)) return false;
  if (!frame.shots[1]) return false;
  return knockedDownCount(frame.shots[1].pins_standing) === 10;
}

export function calculateGameScore(frames: Frame[]): GameScore {
  const orderedFrames = [...frames].sort(
    (a, b) => a.frame_number - b.frame_number
  );
  const shots = flattenShots(orderedFrames);
  const scoredFrames: FrameScore[] = [];
  let shotIndex = 0;
  let rollingTotal = 0;

  for (let frameNumber = 1; frameNumber <= 10; frameNumber += 1) {
    const frame = orderedFrames.find((item) => item.frame_number === frameNumber);

    if (!frame) {
      return { total: rollingTotal, isComplete: false, frames: scoredFrames };
    }

    const strike = isStrike(frame);
    const spare = isSpare(frame);
    const bonusShotsNeeded = frameNumber < 10 ? (strike ? 2 : spare ? 1 : 0) : 0;
    const frameShotCount = strike && frameNumber < 10 ? 1 : 2;
    const frameShots = shots.slice(shotIndex, shotIndex + frameShotCount);
    const bonusShots = shots.slice(
      shotIndex + frameShots.length,
      shotIndex + frameShots.length + bonusShotsNeeded
    );

    if (frameNumber < 10 && bonusShots.length < bonusShotsNeeded) {
      scoredFrames.push(pending(frameNumber, strike, spare));
      return { total: rollingTotal, isComplete: false, frames: scoredFrames };
    }

    const frameScore =
      frameNumber === 10
        ? calculateTenthFrameScore(frame)
        : frameShots.reduce((sum, n) => sum + n, 0) +
          bonusShots.reduce((sum, n) => sum + n, 0);

    if (frameScore === null) {
      scoredFrames.push(pending(frameNumber, strike, spare));
      return { total: rollingTotal, isComplete: false, frames: scoredFrames };
    }

    rollingTotal += frameScore;
    scoredFrames.push({
      frame_number: frameNumber,
      score: frameScore,
      rollingTotal,
      isStrike: strike,
      isSpare: spare
    });

    shotIndex += frameShotCount;
  }

  return {
    total: rollingTotal,
    isComplete:
      scoredFrames.length === 10 &&
      scoredFrames.every((frame) => frame.score !== null),
    frames: scoredFrames
  };
}

function pending(frameNumber: number, strike: boolean, spare: boolean): FrameScore {
  return {
    frame_number: frameNumber,
    score: null,
    rollingTotal: null,
    isStrike: strike,
    isSpare: spare
  };
}

function flattenShots(frames: Frame[]): number[] {
  return frames.flatMap((frame) => {
    if (frame.frame_number === 10) {
      return [
        knockedDownCount(frame.shots[0].pins_standing),
        frame.shots[1]
          ? tenthFrameFollowUpPinfall(frame.shots[0].pins_standing, frame.shots[1].pins_standing)
          : undefined,
        frame.shots[2]
          ? tenthFrameFollowUpPinfall(frame.shots[1]?.pins_standing ?? ALL_PINS, frame.shots[2].pins_standing)
          : undefined
      ].filter(isNumber);
    }

    if (isStrike(frame)) return [10];

    return [
      knockedDownCount(frame.shots[0].pins_standing),
      frame.shots[1]
        ? pinsClearedBetween(frame.shots[0].pins_standing, frame.shots[1].pins_standing)
        : undefined
    ].filter(isNumber);
  });
}

function calculateTenthFrameScore(frame: Frame): number | null {
  const shotOne = knockedDownCount(frame.shots[0].pins_standing);

  if (!frame.shots[1]) return null;

  const shotTwo = tenthFrameFollowUpPinfall(
    frame.shots[0].pins_standing,
    frame.shots[1].pins_standing
  );
  const needsThirdShot = shotOne === 10 || shotOne + shotTwo === 10;

  if (!needsThirdShot) return shotOne + shotTwo;
  if (!frame.shots[2]) return null;

  return (
    shotOne +
    shotTwo +
    tenthFrameFollowUpPinfall(frame.shots[1].pins_standing, frame.shots[2].pins_standing)
  );
}

export function tenthFrameFollowUpPinfall(
  previousStandingPins: import("../types/bowling").PinNumber[],
  currentStandingPins: import("../types/bowling").PinNumber[]
): number {
  if (previousStandingPins.length === 0) {
    return knockedDownCount(currentStandingPins);
  }
  return pinsClearedBetween(previousStandingPins, currentStandingPins);
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number";
}
