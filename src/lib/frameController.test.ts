import { describe, expect, it } from "vitest";
import {
  beginEdit,
  completeEdit,
  createInitialFrameControllerState,
  hydrateFrameController,
  submitShot,
  type FrameControllerState
} from "./frameController";
import type { Frame, PinNumber } from "../types/bowling";

const ALL: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("frameController", () => {
  it("advances to the next frame after a strike", () => {
    const result = submitShot(createInitialFrameControllerState(), []);

    expect(result.savedFrame?.is_strike).toBe(true);
    expect(result.state.currentFrameNumber).toBe(2);
    expect(result.state.currentShot).toBe(1);
  });

  it("moves from shot one to shot two for an open first shot", () => {
    const result = submitShot(createInitialFrameControllerState(), [7, 10]);

    expect(result.savedFrame).toBeNull();
    expect(result.state.currentFrameNumber).toBe(1);
    expect(result.state.currentShot).toBe(2);
    // Inverted: nothing marked standing yet for shot 2; only [7,10] tappable.
    expect(result.state.standingPins).toEqual([]);
    expect(result.state.availablePins).toEqual([7, 10]);
  });

  it("starts each shot with no pins marked standing (inverted input)", () => {
    const init = createInitialFrameControllerState();
    expect(init.standingPins).toEqual([]);
    expect(init.availablePins).toEqual(ALL);

    const result = submitShot(init, []);
    expect(result.savedFrame?.is_strike).toBe(true);
    expect(result.state.currentFrameNumber).toBe(2);
    expect(result.state.standingPins).toEqual([]);
  });

  it("detects a spare and advances after shot two", () => {
    const afterShotOne = submitShot(createInitialFrameControllerState(), [7, 10]);
    const afterShotTwo = submitShot(afterShotOne.state, []);

    expect(afterShotTwo.savedFrame?.is_spare).toBe(true);
    expect(afterShotTwo.state.currentFrameNumber).toBe(2);
  });

  it("allows three shots in the tenth after a strike", () => {
    let state = createInitialFrameControllerState();

    for (let frame = 1; frame < 10; frame += 1) {
      state = submitShot(state, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).state;
      state = submitShot(state, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).state;
    }

    state = submitShot(state, []).state;
    expect(state.currentFrameNumber).toBe(10);
    expect(state.currentShot).toBe(2);
    expect(state.standingPins).toEqual([]);

    state = submitShot(state, []).state;
    expect(state.currentShot).toBe(3);

    const result = submitShot(state, []);
    expect(result.state.isComplete).toBe(true);
  });

  it("finishes the tenth after an open frame", () => {
    let state = createInitialFrameControllerState();

    for (let frame = 1; frame < 10; frame += 1) {
      state = submitShot(state, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).state;
      state = submitShot(state, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).state;
    }

    state = submitShot(state, [7, 10]).state;
    const result = submitShot(state, [10]);

    expect(result.state.isComplete).toBe(true);
    expect(result.savedFrame?.shots[2]?.pins_standing).toBeUndefined();
  });

  it("saves the 10th-frame shot 3 after a strike chain", () => {
    let state = createInitialFrameControllerState();

    for (let frame = 1; frame < 10; frame += 1) {
      state = submitShot(state, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).state;
      state = submitShot(state, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).state;
    }

    state = submitShot(state, []).state; // 10th shot 1 strike
    state = submitShot(state, []).state; // shot 2 strike
    const result = submitShot(state, []); // shot 3 strike

    expect(result.state.isComplete).toBe(true);
    expect(result.savedFrame?.shots[2]?.pins_standing).toEqual([]);
  });

  it("hydrates a partially-filled 10th frame requiring shot 3", () => {
    // T1 regression: shot 1 strike + shot 2 strike but no shot 3 yet.
    const ninthOpenFrames: Frame[] = Array.from({ length: 9 }, (_, idx) => ({
      game_id: 1,
      frame_number: idx + 1,
      shots: [{ pins_standing: ALL }, { pins_standing: ALL }],
      is_strike: false,
      is_spare: false
    }));
    const tenthPartial: Frame = {
      game_id: 1,
      frame_number: 10,
      shots: [{ pins_standing: [] }, { pins_standing: [] }],
      is_strike: true,
      is_spare: false
    };

    const hydrated = hydrateFrameController([...ninthOpenFrames, tenthPartial]);

    expect(hydrated.isComplete).toBe(false);
    expect(hydrated.currentFrameNumber).toBe(10);
    expect(hydrated.currentShot).toBe(3);
  });

  it("hydrates a 10th-frame single-strike (shot 2 not thrown) to currentShot 2", () => {
    // shots[1] absent = ball 2 not thrown. Must not conflate with shots[1].pins_standing === []
    // (which would mean a second consecutive strike).
    const frames: Frame[] = [
      ...Array.from<unknown, Frame>({ length: 9 }, (_, idx) => ({
        game_id: 1,
        frame_number: idx + 1,
        shots: [{ pins_standing: ALL }, { pins_standing: ALL }],
        is_strike: false,
        is_spare: false
      })),
      {
        game_id: 1,
        frame_number: 10,
        shots: [{ pins_standing: [] }], // strike on ball 1, ball 2 not thrown
        is_strike: true,
        is_spare: false
      }
    ];

    const hydrated = hydrateFrameController(frames);

    expect(hydrated.isComplete).toBe(false);
    expect(hydrated.currentFrameNumber).toBe(10);
    expect(hydrated.currentShot).toBe(2);
    expect(hydrated.availablePins).toEqual(ALL); // fresh rack after a strike
  });

  it("hydrates a finished 10th-frame open as complete", () => {
    const frames: Frame[] = [
      ...Array.from<unknown, Frame>({ length: 9 }, (_, idx) => ({
        game_id: 1,
        frame_number: idx + 1,
        shots: [{ pins_standing: ALL }, { pins_standing: ALL }],
        is_strike: false,
        is_spare: false
      })),
      {
        game_id: 1,
        frame_number: 10,
        shots: [{ pins_standing: [10] as PinNumber[] }, { pins_standing: [10] as PinNumber[] }],
        is_strike: false,
        is_spare: false
      }
    ];

    const hydrated = hydrateFrameController(frames);
    expect(hydrated.isComplete).toBe(true);
  });
});

describe("frame editing", () => {
  function playOpen(state: FrameControllerState, s1: PinNumber[], s2: PinNumber[]) {
    state = submitShot(state, s1).state;
    return submitShot(state, s2).state;
  }

  it("re-bowls one past frame without disturbing later frames", () => {
    let state = createInitialFrameControllerState();
    state = submitShot(state, []).state; // F1 strike
    state = playOpen(state, [10], [10]); // F2 = 9 (open)
    state = playOpen(state, [9, 10], [9, 10]); // F3 = 8 (open)
    expect(state.currentFrameNumber).toBe(4);

    const editing = beginEdit(state, 2);
    expect(editing.currentFrameNumber).toBe(2);
    expect(editing.currentShot).toBe(1);

    const edited = submitShot(editing, [10]).state; // F2 shot1: 9
    const result = completeEdit(submitShot(edited, []), state); // F2 shot2: spare

    expect(result.state.currentFrameNumber).toBe(4); // live position restored
    const f2 = result.state.frames.find((f) => f.frame_number === 2);
    const f3 = result.state.frames.find((f) => f.frame_number === 3);
    expect(f2?.is_spare).toBe(true);
    expect(f3).toBeDefined();
  });

  it("editing the 10th re-derives completion", () => {
    let state = createInitialFrameControllerState();
    for (let n = 1; n < 10; n += 1) state = playOpen(state, [10], [10]);
    state = submitShot(state, [10]).state; // 10th shot1 = 9
    state = submitShot(state, [10]).state; // 10th shot2 = open
    expect(state.isComplete).toBe(true);

    const editing = beginEdit(state, 10);
    const afterFirst = submitShot(editing, []); // 10th shot1 strike
    const result = completeEdit(afterFirst, state);
    expect(result.state.isComplete).toBe(false); // now needs bonus shots
    expect(result.state.currentFrameNumber).toBe(10);
  });
});
