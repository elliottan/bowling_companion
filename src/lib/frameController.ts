import { ALL_PINS, isSpare, isStrike } from "./scoring";
import { knockedDownCount } from "./pins";
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
    standingPins: [],
    isComplete: false
  };
}

export function submitShot(
  state: FrameControllerState,
  pinsStanding: PinNumber[]
): ShotSubmissionResult {
  if (state.isComplete) return { state, savedFrame: null };

  const normalized = normalizePins(pinsStanding);
  const draft = findFrame(state) ?? createDraftFrame(state.currentFrameNumber);
  const updated = applyShotToFrame(draft, state.currentShot, normalized);

  if (state.currentFrameNumber === 10) {
    return advanceTenthFrame(state, updated, normalized);
  }

  if (state.currentShot === 1 && isStrike(updated)) {
    return completeFrame(state, updated, ALL_PINS);
  }

  if (state.currentShot === 1) {
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, updated),
        currentShot: 2,
        availablePins: normalized,
        standingPins: []
      }
    };
  }

  return completeFrame(state, updated, ALL_PINS);
}

export function resetCurrentShotPins(state: FrameControllerState): FrameControllerState {
  if (state.isComplete) return state;
  return { ...state, standingPins: getDefaultPinsForShot(state) };
}

function advanceTenthFrame(
  state: FrameControllerState,
  frame: Frame,
  pinsStanding: PinNumber[]
): ShotSubmissionResult {
  if (state.currentShot === 1) {
    const strike = isStrike(frame);
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, frame),
        currentShot: 2,
        availablePins: strike ? ALL_PINS : pinsStanding,
        standingPins: []
      }
    };
  }

  if (state.currentShot === 2) {
    const strike = isStrike(frame);
    const spare = !strike && isSpare(frame);
    const earnsThird = strike || spare;

    if (!earnsThird) {
      return finishTenth(state, frame);
    }

    const racked = pinsStanding.length === 0 ? ALL_PINS : pinsStanding;
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, frame),
        currentShot: 3,
        availablePins: racked,
        standingPins: []
      }
    };
  }

  // shot 3
  return finishTenth(state, frame);
}

function finishTenth(state: FrameControllerState, frame: Frame): ShotSubmissionResult {
  return {
    savedFrame: frame,
    state: {
      ...state,
      frames: upsertFrame(state.frames, frame),
      isComplete: true
    }
  };
}

function completeFrame(
  state: FrameControllerState,
  frame: Frame,
  nextAvailablePins: PinNumber[]
): ShotSubmissionResult {
  const nextFrameNumber = state.currentFrameNumber + 1;
  return {
    savedFrame: frame,
    state: {
      frames: upsertFrame(state.frames, frame),
      currentFrameNumber: nextFrameNumber,
      currentShot: 1,
      availablePins: nextAvailablePins,
      standingPins: [],
      isComplete: nextFrameNumber > 10
    }
  };
}

function findFrame(state: FrameControllerState): Frame | undefined {
  return state.frames.find((f) => f.frame_number === state.currentFrameNumber);
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

function applyShotToFrame(frame: Frame, shot: ActiveShot, pinsStanding: PinNumber[]): Frame {
  const updated: Frame = {
    ...frame,
    ...(shot === 1 ? { shot_1_pins_standing: pinsStanding } : {}),
    ...(shot === 2 ? { shot_2_pins_standing: pinsStanding } : {}),
    ...(shot === 3 ? { shot_3_pins_standing: pinsStanding } : {})
  };
  return finalizeFrame(updated);
}

function finalizeFrame(frame: Frame): Frame {
  return { ...frame, is_strike: isStrike(frame), is_spare: isSpare(frame) };
}

function upsertFrame(frames: Frame[], frame: Frame): Frame[] {
  const next = frames.filter((f) => f.frame_number !== frame.frame_number);
  next.push(frame);
  return next.sort((a, b) => a.frame_number - b.frame_number);
}

function getDefaultPinsForShot(_state: FrameControllerState): PinNumber[] {
  // Inverted input: a reset clears all marks (nothing standing yet).
  return [];
}

function normalizePins(pins: PinNumber[]): PinNumber[] {
  const allowed = new Set(ALL_PINS);
  return [...new Set(pins)]
    .filter((p) => allowed.has(p))
    .sort((a, b) => a - b);
}

/**
 * Enter edit mode for one already-recorded frame: re-bowl it from shot 1.
 * Frames keep their stored shots; only the chosen frame is re-captured. The
 * caller passes the pre-edit state into `completeEdit` to restore the live
 * position once the frame's shots are re-entered.
 */
export function beginEdit(
  state: FrameControllerState,
  frameNumber: number
): FrameControllerState {
  // Drop the edited frame so it is re-bowled fresh — otherwise stale shot 2/3
  // data would survive a from-shot-1 re-entry.
  return {
    ...state,
    frames: state.frames.filter((f) => f.frame_number !== frameNumber),
    currentFrameNumber: frameNumber,
    currentShot: 1,
    availablePins: ALL_PINS,
    standingPins: [],
    isComplete: false
  };
}

/**
 * Finish an in-progress edit. `editResult` is the result of the final
 * `submitShot` during editing; `liveState` is the controller state captured
 * before the edit began. Returns the merged frames with the live position
 * re-derived from the full frame set (reusing the hydrate rules).
 */
export function completeEdit(
  editResult: ShotSubmissionResult,
  liveState: FrameControllerState
): ShotSubmissionResult {
  const frames = editResult.state.frames;
  const resumed = hydrateFrameController(frames);

  return {
    savedFrame: editResult.savedFrame,
    state: {
      ...liveState,
      frames,
      currentFrameNumber: resumed.currentFrameNumber,
      currentShot: resumed.currentShot,
      availablePins: ALL_PINS,
      standingPins: [],
      isComplete: resumed.isComplete
    }
  };
}

/**
 * Rebuild controller state from persisted frames (mid-game resume).
 * Handles 10th-frame correctly: if shot 2 saved but third shot still required,
 * keeps `currentShot=3` instead of marking complete.
 */
export function hydrateFrameController(frames: Frame[]): FrameControllerState {
  if (frames.length === 0) return createInitialFrameControllerState();

  const ordered = [...frames].sort((a, b) => a.frame_number - b.frame_number);
  const last = ordered[ordered.length - 1];

  // Non-10th: a saved frame is complete; move to next.
  if (last.frame_number < 10) {
    return {
      ...createInitialFrameControllerState(),
      frames: ordered,
      currentFrameNumber: last.frame_number + 1,
      currentShot: 1
    };
  }

  // 10th frame logic
  const shotOne = knockedDownCount(last.shot_1_pins_standing);

  if (!last.shot_2_pins_standing) {
    return {
      ...createInitialFrameControllerState(),
      frames: ordered,
      currentFrameNumber: 10,
      currentShot: 2,
      availablePins: shotOne === 10 ? ALL_PINS : last.shot_1_pins_standing,
      standingPins: []
    };
  }

  const shotTwo = last.shot_1_pins_standing.length === 0
    ? knockedDownCount(last.shot_2_pins_standing)
    : (() => {
        const prev = new Set(last.shot_1_pins_standing);
        const curr = new Set(last.shot_2_pins_standing);
        return [...prev].filter((p) => !curr.has(p)).length;
      })();
  const needsThird = shotOne === 10 || shotOne + shotTwo === 10;

  if (needsThird && !last.shot_3_pins_standing) {
    const racked = last.shot_2_pins_standing.length === 0
      ? ALL_PINS
      : last.shot_2_pins_standing;
    return {
      ...createInitialFrameControllerState(),
      frames: ordered,
      currentFrameNumber: 10,
      currentShot: 3,
      availablePins: racked,
      standingPins: []
    };
  }

  return {
    ...createInitialFrameControllerState(),
    frames: ordered,
    currentFrameNumber: 10,
    currentShot: 3,
    isComplete: true
  };
}
