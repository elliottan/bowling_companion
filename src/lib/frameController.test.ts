import { describe, expect, it } from "vitest";
import {
  beginEdit,
  beginEditFromShot,
  completeEdit,
  createInitialFrameControllerState,
  editFrameShotMeta,
  editFrameShotPins,
  hydrateFrameController,
  submitShot,
  updateShotMeta,
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
    // Shot 2 starts pins-up: remaining standing pins are pre-populated.
    expect(result.state.standingPins).toEqual([7, 10]);
    expect(result.state.availablePins).toEqual([7, 10]);
  });

  it("starts shot 1 of each frame with no pins marked standing (inverted input)", () => {
    const init = createInitialFrameControllerState();
    expect(init.standingPins).toEqual([]);
    expect(init.availablePins).toEqual(ALL);

    const result = submitShot(init, []);
    expect(result.savedFrame?.is_strike).toBe(true);
    expect(result.state.currentFrameNumber).toBe(2);
    // Next frame shot 1 starts empty.
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

    state = submitShot(state, []).state; // 10th shot 1 strike
    expect(state.currentFrameNumber).toBe(10);
    expect(state.currentShot).toBe(2);
    // Fresh rack after a strike is a "first ball" → starts all-down.
    expect(state.availablePins).toEqual(ALL);
    expect(state.standingPins).toEqual([]);

    state = submitShot(state, []).state; // shot 2 strike
    expect(state.currentShot).toBe(3);
    // Fresh rack again → shot 3 starts all-down.
    expect(state.standingPins).toEqual([]);

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
    // Fresh rack (both strikes) → shot 3 resumes all-down.
    expect(hydrated.standingPins).toEqual([]);
  });

  it("hydrates a 10th-frame single-strike (shot 2 not thrown) to currentShot 2", () => {
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
    expect(hydrated.standingPins).toEqual([]); // shot 2 resumes all-down
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

  it("submitShot records ball_id and intended line on the saved shot", () => {
    let state = createInitialFrameControllerState();
    const meta = { ball_id: 42, intended: { stance: 35, target: 20, breakpoint: 5 } };
    state = updateShotMeta(state, meta);
    const result = submitShot(state, []); // strike

    expect(result.savedFrame?.shots[0].ball_id).toBe(42);
    expect(result.savedFrame?.shots[0].intended).toEqual({ stance: 35, target: 20, breakpoint: 5 });
  });

  it("currentShotMeta resets after recording a shot", () => {
    let state = createInitialFrameControllerState();
    state = updateShotMeta(state, { ball_id: 42 });
    const result = submitShot(state, []); // strike

    expect(result.state.currentShotMeta).toEqual({});
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

describe("beginEditFromShot", () => {
  function buildState(): FrameControllerState {
    let state = createInitialFrameControllerState();
    state = submitShot(state, []).state; // F1 strike
    state = submitShot(state, [10 as PinNumber]).state; // F2 shot1: leaves pin 10
    state = submitShot(state, []).state; // F2 shot2: spare
    state = submitShot(state, [9 as PinNumber, 10 as PinNumber]).state; // F3 shot1: 8 pins down
    state = submitShot(state, [9 as PinNumber, 10 as PinNumber]).state; // F3 shot2: open
    return state;
  }

  it("editing from shot 1 drops the frame and starts fresh with pre-filled pins", () => {
    const state = buildState(); // at frame 4
    const editing = beginEditFromShot(state, 2, 0);

    expect(editing.currentFrameNumber).toBe(2);
    expect(editing.currentShot).toBe(1);
    expect(editing.availablePins).toEqual(ALL);
    // Pre-filled with the recorded shot 1 pins_standing = [10] (9 pins knocked)
    expect(editing.standingPins).toEqual([10]);
    expect(editing.isComplete).toBe(false);
    // Frame 3 still present after editing frame 2 from shot 1
    expect(editing.frames.find((f) => f.frame_number === 3)).toBeDefined();
  });

  it("editing from shot 2 preserves shot 1 and pre-fills shot 2 pins", () => {
    const state = buildState();
    const editing = beginEditFromShot(state, 2, 1);

    expect(editing.currentFrameNumber).toBe(2);
    expect(editing.currentShot).toBe(2);
    // availablePins = shot1.pins_standing = [10]
    expect(editing.availablePins).toEqual([10]);
    // standingPins pre-filled with recorded shot 2 pins_standing = [] (spare cleared all)
    expect(editing.standingPins).toEqual([]);
    // Shot 1 still in frame 2
    const f2 = editing.frames.find((f) => f.frame_number === 2);
    expect(f2?.shots).toHaveLength(1);
    expect(f2?.shots[0].pins_standing).toEqual([10]);
    // Frame 3 still present
    expect(editing.frames.find((f) => f.frame_number === 3)).toBeDefined();
  });

  it("completing an edit from shot 2 snaps back to live position", () => {
    const state = buildState(); // live = frame 4, shot 1
    const editing = beginEditFromShot(state, 2, 1);
    // Re-bowl shot 2 of frame 2 as an open (leave pin 10 up)
    const submission = submitShot(editing, [10 as PinNumber]);
    expect(submission.savedFrame).not.toBeNull();

    const merged = completeEdit(submission, state);
    expect(merged.state.currentFrameNumber).toBe(4); // back to live
    expect(merged.state.currentShot).toBe(1);
    const f2 = merged.state.frames.find((f) => f.frame_number === 2);
    expect(f2?.is_spare).toBe(false);
    expect(f2?.shots[1].pins_standing).toEqual([10]);
    // Frame 3 preserved
    expect(merged.state.frames.find((f) => f.frame_number === 3)).toBeDefined();
  });

  it("falls back to beginEdit if frame or shot not found", () => {
    const state = createInitialFrameControllerState();
    const editing = beginEditFromShot(state, 5, 0);
    // No frame 5 in frames, so falls back: drops all, goes to frame 5 shot 1
    expect(editing.currentFrameNumber).toBe(5);
    expect(editing.currentShot).toBe(1);
  });
});

describe("fresh-rack pin defaults (10th frame)", () => {
  const tenthShot1: FrameControllerState = {
    ...createInitialFrameControllerState(),
    currentFrameNumber: 10,
    currentShot: 1,
    availablePins: ALL,
    standingPins: []
  };

  it("ball 2 after a strike starts all-down (fresh rack)", () => {
    const r = submitShot(tenthShot1, []); // strike
    expect(r.state.currentShot).toBe(2);
    expect(r.state.availablePins).toEqual(ALL);
    expect(r.state.standingPins).toEqual([]);
  });

  it("ball 2 after an open shot starts pins-up (partial rack)", () => {
    const r = submitShot(tenthShot1, [7]); // left the 7
    expect(r.state.currentShot).toBe(2);
    expect(r.state.standingPins).toEqual([7]);
  });

  it("ball 3 after a spare starts all-down (fresh rack)", () => {
    const afterOpen = submitShot(tenthShot1, [7]); // shot 1 leaves the 7
    const afterSpare = submitShot(afterOpen.state, []); // shot 2 spare
    expect(afterSpare.state.currentShot).toBe(3);
    expect(afterSpare.state.availablePins).toEqual(ALL);
    expect(afterSpare.state.standingPins).toEqual([]);
  });
});

describe("editFrameShot* helpers", () => {
  const twoShotFrame: Frame = {
    game_id: 0,
    frame_number: 3,
    shots: [
      { pins_standing: [7], intended: { target: 10 }, notes: "first" },
      { pins_standing: [7], notes: "second" }
    ],
    is_strike: false,
    is_spare: false
  };

  it("editFrameShotMeta changes only that shot, leaves pins + other shots intact", () => {
    const out = editFrameShotMeta([twoShotFrame], 3, 0, {
      ball_id: 5,
      intended: { target: 12 },
      actual: undefined,
      notes: "edited"
    });
    const f = out.find((x) => x.frame_number === 3)!;
    expect(f.shots[0].notes).toBe("edited");
    expect(f.shots[0].ball_id).toBe(5);
    expect(f.shots[0].pins_standing).toEqual([7]); // pins untouched
    expect(f.shots[1].notes).toBe("second"); // other shot untouched
    expect(f.shots).toHaveLength(2);
  });

  it("editFrameShotPins turning shot 1 into a strike drops the second shot", () => {
    const out = editFrameShotPins([twoShotFrame], 3, 0, []);
    const f = out.find((x) => x.frame_number === 3)!;
    expect(f.is_strike).toBe(true);
    expect(f.shots).toHaveLength(1);
  });

  it("editFrameShotPins marks the second shot as a spare when the first ball is edited", () => {
    const out = editFrameShotPins([twoShotFrame], 3, 0, [7, 10]);
    const f = out.find((x) => x.frame_number === 3)!;
    expect(f.shots).toHaveLength(2);
    expect(f.shots[0].pins_standing).toEqual([7, 10]);
    expect(f.shots[1].pins_standing).toEqual([]); // forced to a spare
    expect(f.shots[1].notes).toBe("second"); // existing shot-2 metadata preserved
    expect(f.is_spare).toBe(true);
  });

  it("editFrameShotPins turning a recorded strike into a non-strike adds an editable spare second shot", () => {
    const strikeFrame: Frame = {
      game_id: 0,
      frame_number: 3,
      shots: [{ pins_standing: [] }],
      is_strike: true,
      is_spare: false
    };
    const out = editFrameShotPins([strikeFrame], 3, 0, [10]);
    const f = out.find((x) => x.frame_number === 3)!;
    expect(f.shots).toHaveLength(2);
    expect(f.shots[0].pins_standing).toEqual([10]);
    expect(f.shots[1].pins_standing).toEqual([]);
    expect(f.is_strike).toBe(false);
    expect(f.is_spare).toBe(true);
  });

  it("editFrameShotPins clears subsequent shots when a 10th-frame shot is edited", () => {
    const tenth: Frame = {
      game_id: 0,
      frame_number: 10,
      shots: [{ pins_standing: [] }, { pins_standing: [7] }, { pins_standing: [] }],
      is_strike: true,
      is_spare: false
    };
    // Editing shot 2 (index 1) drops shot 3 (index 2).
    const out = editFrameShotPins([tenth], 10, 1, [3]);
    const f = out.find((x) => x.frame_number === 10)!;
    expect(f.shots).toHaveLength(2);
    expect(f.shots[1].pins_standing).toEqual([3]);
    // Editing shot 1 (index 0) drops every later shot.
    const out2 = editFrameShotPins([tenth], 10, 0, [7]);
    expect(out2.find((x) => x.frame_number === 10)!.shots).toHaveLength(1);
  });
});
