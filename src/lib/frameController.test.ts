import { describe, expect, it } from "vitest";
import {
  createInitialFrameControllerState,
  hydrateFrameController,
  submitShot
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
    expect(result.state.standingPins).toEqual([7, 10]);
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
    expect(state.standingPins).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

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
    expect(result.savedFrame?.shot_3_pins_standing).toBeUndefined();
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
    expect(result.savedFrame?.shot_3_pins_standing).toEqual([]);
  });

  it("hydrates a partially-filled 10th frame requiring shot 3", () => {
    // T1 regression: shot 1 strike + shot 2 strike but no shot 3 yet.
    const ninthOpenFrames: Frame[] = Array.from({ length: 9 }, (_, idx) => ({
      game_id: 1,
      frame_number: idx + 1,
      shot_1_pins_standing: ALL,
      shot_2_pins_standing: ALL,
      is_strike: false,
      is_spare: false
    }));
    const tenthPartial: Frame = {
      game_id: 1,
      frame_number: 10,
      shot_1_pins_standing: [],
      shot_2_pins_standing: [],
      is_strike: true,
      is_spare: false
    };

    const hydrated = hydrateFrameController([...ninthOpenFrames, tenthPartial]);

    expect(hydrated.isComplete).toBe(false);
    expect(hydrated.currentFrameNumber).toBe(10);
    expect(hydrated.currentShot).toBe(3);
  });

  it("hydrates a finished 10th-frame open as complete", () => {
    const frames: Frame[] = [
      ...Array.from<unknown, Frame>({ length: 9 }, (_, idx) => ({
        game_id: 1,
        frame_number: idx + 1,
        shot_1_pins_standing: ALL,
        shot_2_pins_standing: ALL,
        is_strike: false,
        is_spare: false
      })),
      {
        game_id: 1,
        frame_number: 10,
        shot_1_pins_standing: [10] as PinNumber[],
        shot_2_pins_standing: [10] as PinNumber[],
        is_strike: false,
        is_spare: false
      }
    ];

    const hydrated = hydrateFrameController(frames);
    expect(hydrated.isComplete).toBe(true);
  });
});
