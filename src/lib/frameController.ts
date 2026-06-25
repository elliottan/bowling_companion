import { ALL_PINS, isSpare, isStrike } from "./scoring";
import { knockedDownCount } from "./pins";
import type { Frame, PinNumber, ShotMetadata } from "../types/bowling";

export type ActiveShot = 1 | 2 | 3;

export interface FrameControllerState {
  frames: Frame[];
  currentFrameNumber: number;
  currentShot: ActiveShot;
  availablePins: PinNumber[];
  standingPins: PinNumber[];
  isComplete: boolean;
  currentShotMeta: ShotMetadata;
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
    isComplete: false,
    currentShotMeta: {}
  };
}

export function updateShotMeta(
  state: FrameControllerState,
  meta: ShotMetadata
): FrameControllerState {
  return { ...state, currentShotMeta: meta };
}

export function submitShot(
  state: FrameControllerState,
  pinsStanding: PinNumber[]
): ShotSubmissionResult {
  if (state.isComplete) return { state, savedFrame: null };

  const normalized = normalizePins(pinsStanding);
  const draft = findFrame(state) ?? createDraftFrame(state.currentFrameNumber);
  const updated = applyShotToFrame(draft, state.currentShot, normalized, state.currentShotMeta);

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
        standingPins: normalized, // shot 2 starts pins-up (remaining pins standing)
        currentShotMeta: {}
      }
    };
  }

  return completeFrame(state, updated, ALL_PINS);
}

/**
 * The frame that the current live (un-submitted) shot would produce, with its
 * pins + metadata applied — for persisting in-progress work without advancing.
 * Returns null when the game is complete.
 */
export function buildLiveFrame(state: FrameControllerState): Frame | null {
  if (state.isComplete) return null;
  const draft = findFrame(state) ?? createDraftFrame(state.currentFrameNumber);
  return applyShotToFrame(
    draft,
    state.currentShot,
    normalizePins(state.standingPins),
    state.currentShotMeta
  );
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
    const ap = strike ? ALL_PINS : pinsStanding;
    return {
      savedFrame: null,
      state: {
        ...state,
        frames: upsertFrame(state.frames, frame),
        currentShot: 2,
        availablePins: ap,
        standingPins: freshRackStart(ap), // fresh rack (after strike) -> all down
        currentShotMeta: {}
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
        standingPins: freshRackStart(racked), // fresh rack (after strike/spare) -> all down
        currentShotMeta: {}
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
      isComplete: true,
      currentShotMeta: {}
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
      standingPins: [], // shot 1 of a new frame starts empty (inverted input)
      isComplete: nextFrameNumber > 10,
      currentShotMeta: {}
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
    shots: [],
    is_strike: false,
    is_spare: false
  };
}

function applyShotToFrame(
  frame: Frame,
  shot: ActiveShot,
  pinsStanding: PinNumber[],
  meta: ShotMetadata
): Frame {
  const shots = [...frame.shots];
  shots[shot - 1] = { ...shots[shot - 1], pins_standing: pinsStanding, ...meta };
  return finalizeFrame({ ...frame, shots });
}

function finalizeFrame(frame: Frame): Frame {
  return { ...frame, is_strike: isStrike(frame), is_spare: isSpare(frame) };
}

function upsertFrame(frames: Frame[], frame: Frame): Frame[] {
  const next = frames.filter((f) => f.frame_number !== frame.frame_number);
  next.push(frame);
  return next.sort((a, b) => a.frame_number - b.frame_number);
}

function getDefaultPinsForShot(state: FrameControllerState): PinNumber[] {
  // Shot 1: inverted input (nothing marked standing yet).
  // Shot 2+: pins-up on a partial rack; a fresh rack (after a strike/spare) is
  // a "first ball" and starts all-down.
  return state.currentShot === 1 ? [] : freshRackStart(state.availablePins);
}

/**
 * A ball thrown at a fresh rack (all 10 available) is a "first ball" and starts
 * all-down (empty selection); a partial rack starts pins-up (remaining standing).
 */
function freshRackStart(available: PinNumber[]): PinNumber[] {
  return available.length === 10 ? [] : available;
}

function normalizePins(pins: PinNumber[]): PinNumber[] {
  const allowed = new Set(ALL_PINS);
  return [...new Set(pins)]
    .filter((p) => allowed.has(p))
    .sort((a, b) => a - b);
}

/**
 * Update a recorded shot's metadata (ball/line/notes) only. Pins are untouched,
 * so strike/spare and every other shot stay exactly as they were.
 */
export function editFrameShotMeta(
  frames: Frame[],
  frameNumber: number,
  shotIndex: number,
  meta: ShotMetadata
): Frame[] {
  const frame = frames.find((f) => f.frame_number === frameNumber);
  if (!frame || !frame.shots[shotIndex]) return frames;
  const shots = frame.shots.map((s, i) =>
    i === shotIndex ? { ...s, ...meta } : s
  );
  return upsertFrame(frames, { ...frame, shots });
}

/**
 * Update a recorded shot's pins and re-derive the frame. A first-ball strike in
 * a 1–9 frame drops the (now impossible) second shot. Game totals recompute
 * downstream from the returned frames.
 */
export function editFrameShotPins(
  frames: Frame[],
  frameNumber: number,
  shotIndex: number,
  pinsStanding: PinNumber[]
): Frame[] {
  const frame = frames.find((f) => f.frame_number === frameNumber);
  if (!frame || !frame.shots[shotIndex]) return frames;
  const normalized = normalizePins(pinsStanding);
  let shots = frame.shots.map((s, i) =>
    i === shotIndex ? { ...s, pins_standing: normalized } : s
  );

  if (frameNumber === 10) {
    // Editing any 10th-frame shot clears every shot after it; the bonus balls
    // are re-entered live from the edited shot forward.
    shots = shots.slice(0, shotIndex + 1);
  } else if (shotIndex === 0) {
    if (normalized.length === 0) {
      // First-ball strike: no second shot.
      shots = shots.slice(0, 1);
    } else {
      // Editing the first ball of a 1–9 frame forces the second shot to a spare
      // (all remaining pins cleared). This guarantees an editable second shot
      // (e.g. after un-doing a strike) and avoids stale shot-2 pins that would
      // conflict with the new first ball. Existing shot-2 metadata is kept.
      shots = [shots[0], { ...(shots[1] ?? {}), pins_standing: [] }];
    }
  }
  return upsertFrame(frames, finalizeFrame({ ...frame, shots }));
}

/**
 * Enter edit mode for one already-recorded frame: re-bowl it from shot 1.
 * The caller passes the pre-edit state into `completeEdit` to restore the live
 * position once the frame's shots are re-entered.
 */
export function beginEdit(
  state: FrameControllerState,
  frameNumber: number
): FrameControllerState {
  return {
    ...state,
    frames: state.frames.filter((f) => f.frame_number !== frameNumber),
    currentFrameNumber: frameNumber,
    currentShot: 1,
    availablePins: ALL_PINS,
    standingPins: [],
    isComplete: false,
    currentShotMeta: {}
  };
}

/**
 * Enter edit mode starting from a specific shot within an already-recorded frame.
 * Shots before shotIndex are preserved. The pin deck is pre-filled with the
 * recorded shot's pins. Editing continues forward from that shot.
 */
export function beginEditFromShot(
  state: FrameControllerState,
  frameNumber: number,
  shotIndex: number
): FrameControllerState {
  const frame = state.frames.find((f) => f.frame_number === frameNumber);
  if (!frame || !frame.shots[shotIndex]) {
    return beginEdit(state, frameNumber);
  }

  const shot = frame.shots[shotIndex];

  // Compute available pins entering this shot
  let availablePins: PinNumber[];
  if (shotIndex === 0) {
    availablePins = ALL_PINS;
  } else {
    const prevPins = frame.shots[shotIndex - 1].pins_standing;
    availablePins = prevPins.length === 0 ? ALL_PINS : prevPins;
  }

  // Keep shots before shotIndex; drop from shotIndex onwards
  const priorShots = frame.shots.slice(0, shotIndex);
  let updatedFrames: Frame[];
  if (priorShots.length > 0) {
    const partialFrame = finalizeFrame({ ...frame, shots: priorShots });
    updatedFrames = [
      ...state.frames.filter((f) => f.frame_number !== frameNumber),
      partialFrame
    ].sort((a, b) => a.frame_number - b.frame_number);
  } else {
    updatedFrames = state.frames.filter((f) => f.frame_number !== frameNumber);
  }

  return {
    ...state,
    frames: updatedFrames,
    currentFrameNumber: frameNumber,
    currentShot: (shotIndex + 1) as ActiveShot,
    availablePins,
    standingPins: shot.pins_standing, // pre-fill with recorded pins
    isComplete: false,
    currentShotMeta: {}
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
      availablePins: resumed.availablePins,
      standingPins: resumed.standingPins,
      isComplete: resumed.isComplete,
      currentShotMeta: {}
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
  const shotOne = knockedDownCount(last.shots[0]?.pins_standing ?? ALL_PINS);

  if (!last.shots[1]) {
    const ap = shotOne === 10 ? ALL_PINS : last.shots[0].pins_standing;
    return {
      ...createInitialFrameControllerState(),
      frames: ordered,
      currentFrameNumber: 10,
      currentShot: 2,
      availablePins: ap,
      standingPins: freshRackStart(ap) // fresh rack resumes all-down
    };
  }

  const shotTwo = last.shots[0].pins_standing.length === 0
    ? knockedDownCount(last.shots[1].pins_standing)
    : (() => {
        const prev = new Set(last.shots[0].pins_standing);
        const curr = new Set(last.shots[1].pins_standing);
        return [...prev].filter((p) => !curr.has(p)).length;
      })();
  const needsThird = shotOne === 10 || shotOne + shotTwo === 10;

  if (needsThird && !last.shots[2]) {
    const racked = last.shots[1].pins_standing.length === 0
      ? ALL_PINS
      : last.shots[1].pins_standing;
    return {
      ...createInitialFrameControllerState(),
      frames: ordered,
      currentFrameNumber: 10,
      currentShot: 3,
      availablePins: racked,
      standingPins: freshRackStart(racked) // fresh rack resumes all-down
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
