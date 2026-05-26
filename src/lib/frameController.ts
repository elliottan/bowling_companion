import { ALL_PINS, isSpare, isStrike, knockedDownCount } from "./scoring";
import type { Frame, PinNumber } from "../types/bowling";

export type ActiveShot = 1 | 2 | 3;

export interface FrameControllerState {
  frames: Frame[];
  currentFrameNumber: number;
  currentShot: ActiveShot;
  availablePins: PinNumber[];
  standingPins: PinNumber[];
  isComplete: boolean;
}

export interface ShotSubmissionResult {
  state: FrameControllerState;
  savedFrame: Frame | null;
}

export function createInitialFrameControllerState(): FrameControllerState {
  return {
    frames: [],
    currentFrameNumber: 1,
    currentShot: 1,
    availablePins: ALL_PINS,
    standingPins: ALL_PINS,
    isComplete: false
  };
}

export function submitShot(
  state: FrameControllerState,
  pinsStanding: PinNumber[]
): ShotSubmissionResult {
  if (state.isComplete) {
    return { state, savedFrame: null };
  }

  const normalizedPins = normalizePins(pinsStanding);
  const draftFrame = findFrame(state) ?? createDraftFrame(state.currentFrameNumber);
  const updatedFrame = applyShotToFrame(draftFrame, state.currentShot, normalizedPins);

  if (state.currentFrameNumber === 10) {
    return advanceTenthFrame(state, updatedFrame, normalizedPins);
  }

  if (state.currentShot === 1 && isStrike(updatedFrame)) {
    return completeFrame(state, finalizeFrame(updatedFrame), ALL_PINS);
  }

  if (state.currentShot === 1) {
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, updatedFrame),
        currentShot: 2,
        availablePins: normalizedPins,
        standingPins: normalizedPins
      }
    };
  }

  return completeFrame(state, finalizeFrame(updatedFrame), ALL_PINS);
}

export function resetCurrentShotPins(state: FrameControllerState) {
  if (state.isComplete) {
    return state;
  }

  return {
    ...state,
    standingPins: getDefaultPinsForShot(state)
  };
}

function advanceTenthFrame(
  state: FrameControllerState,
  frame: Frame,
  pinsStanding: PinNumber[]
): ShotSubmissionResult {
  if (state.currentShot === 1) {
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, frame),
        currentShot: 2,
        availablePins: isStrike(frame) ? ALL_PINS : pinsStanding,
        standingPins: isStrike(frame) ? ALL_PINS : pinsStanding
      }
    };
  }

  if (state.currentShot === 2) {
    const firstShotWasStrike = isStrike(frame);
    const secondShotEarnedSpare = !firstShotWasStrike && isSpare(frame);
    const earnsThirdShot = firstShotWasStrike || secondShotEarnedSpare;

    if (earnsThirdShot) {
      return {
        savedFrame: null,
        state: {
          ...state,
          frames: upsertFrame(state.frames, frame),
          currentShot: 3,
          availablePins: pinsStanding.length === 0 ? ALL_PINS : pinsStanding,
          standingPins: pinsStanding.length === 0 ? ALL_PINS : pinsStanding
        }
      };
    }

    return {
      savedFrame: finalizeFrame(frame),
      state: {
        ...state,
        frames: upsertFrame(state.frames, finalizeFrame(frame)),
        isComplete: true
      }
    };
  }

  return {
    savedFrame: finalizeFrame(frame),
    state: {
      ...state,
      frames: upsertFrame(state.frames, finalizeFrame(frame)),
      isComplete: true
    }
  };
}

function completeFrame(
  state: FrameControllerState,
  frame: Frame,
  nextStandingPins: PinNumber[]
): ShotSubmissionResult {
  const nextFrameNumber = state.currentFrameNumber + 1;

  return {
    savedFrame: frame,
    state: {
      frames: upsertFrame(state.frames, frame),
      currentFrameNumber: nextFrameNumber,
      currentShot: 1,
      availablePins: nextStandingPins,
      standingPins: nextStandingPins,
      isComplete: nextFrameNumber > 10
    }
  };
}

function findFrame(state: FrameControllerState) {
  return state.frames.find((frame) => frame.frame_number === state.currentFrameNumber);
}

function createDraftFrame(frameNumber: number): Frame {
  return {
    game_id: 0,
    frame_number: frameNumber,
    shot_1_pins_standing: ALL_PINS,
    is_strike: false,
    is_spare: false
  };
}

function applyShotToFrame(frame: Frame, shot: ActiveShot, pinsStanding: PinNumber[]) {
  const updatedFrame: Frame = {
    ...frame,
    ...(shot === 1 ? { shot_1_pins_standing: pinsStanding } : {}),
    ...(shot === 2 ? { shot_2_pins_standing: pinsStanding } : {}),
    ...(shot === 3 ? { shot_3_pins_standing: pinsStanding } : {})
  };

  return finalizeFrame(updatedFrame);
}

function finalizeFrame(frame: Frame): Frame {
  return {
    ...frame,
    is_strike: isStrike(frame),
    is_spare: isSpare(frame)
  };
}

function upsertFrame(frames: Frame[], frame: Frame) {
  const nextFrames = frames.filter((item) => item.frame_number !== frame.frame_number);
  nextFrames.push(frame);

  return nextFrames.sort((first, second) => first.frame_number - second.frame_number);
}

function getDefaultPinsForShot(state: FrameControllerState) {
  const frame = findFrame(state);

  if (!frame || state.currentShot === 1) {
    return ALL_PINS;
  }

  if (state.currentShot === 2) {
    return isStrike(frame) ? ALL_PINS : frame.shot_1_pins_standing;
  }

  if (!frame.shot_2_pins_standing || knockedDownCount(frame.shot_2_pins_standing) === 10) {
    return ALL_PINS;
  }

  return frame.shot_2_pins_standing;
}

function normalizePins(pins: PinNumber[]) {
  const allowedPins = new Set(ALL_PINS);

  return [...new Set(pins)]
    .filter((pin) => allowedPins.has(pin))
    .sort((first, second) => first - second);
}
