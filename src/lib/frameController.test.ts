import { describe, expect, it } from "vitest";
import {
  buildLiveFrame,
  createInitialFrameControllerState,
  editFrameShotMeta,
  editFrameShotPins,
  hydrateFrameController,
  submitShot,
  undoLastShot,
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

  it("hydrates a non-10th frame with only shot 1 recorded to currentShot 2 (resume mid-frame)", () => {
    // Regression: frame 1 strike, frame 2 shot 1 = 9 pins (pin 7 left standing),
    // shot 2 not yet thrown. Resuming should NOT skip to frame 3.
    const frames: Frame[] = [
      {
        game_id: 1,
        frame_number: 1,
        shots: [{ pins_standing: [] }],
        is_strike: true,
        is_spare: false
      },
      {
        game_id: 1,
        frame_number: 2,
        shots: [{ pins_standing: [7] }],
        is_strike: false,
        is_spare: false
      }
    ];

    const hydrated = hydrateFrameController(frames);

    expect(hydrated.isComplete).toBe(false);
    expect(hydrated.currentFrameNumber).toBe(2);
    expect(hydrated.currentShot).toBe(2);
    expect(hydrated.standingPins).toEqual([7]);
    expect(hydrated.availablePins).toEqual([7]);
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

describe("shot metadata", () => {
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

describe("buildLiveFrame", () => {
  it("returns a 1-shot frame with applied pins when on shot 1 with a partial leave", () => {
    const state: FrameControllerState = {
      ...createInitialFrameControllerState(),
      currentFrameNumber: 3,
      currentShot: 1,
      availablePins: ALL,
      standingPins: [7, 10] as PinNumber[],
      currentShotMeta: { ball_id: 5 }
    };
    const result = buildLiveFrame(state);
    expect(result).not.toBeNull();
    expect(result!.frame_number).toBe(3);
    expect(result!.shots).toHaveLength(1);
    expect(result!.shots[0].pins_standing).toEqual([7, 10]);
    expect(result!.shots[0].ball_id).toBe(5);
    // Original state unchanged
    expect(state.currentFrameNumber).toBe(3);
    expect(state.frames).toHaveLength(0);
  });

  it("returns a 2-shot frame when on shot 2 with existing shot 1 in state", () => {
    // Advance to shot 2 of frame 1 via submitShot, then check buildLiveFrame
    const afterShot1 = submitShot(createInitialFrameControllerState(), [10 as PinNumber]);
    // Now on shot 2 of frame 1
    const state: FrameControllerState = {
      ...afterShot1.state,
      standingPins: [],
      currentShotMeta: {}
    };
    const result = buildLiveFrame(state);
    expect(result).not.toBeNull();
    expect(result!.frame_number).toBe(1);
    expect(result!.shots).toHaveLength(2);
    expect(result!.shots[0].pins_standing).toEqual([10]);
    expect(result!.shots[1].pins_standing).toEqual([]);
  });

  it("returns null when the game is complete", () => {
    const state: FrameControllerState = {
      ...createInitialFrameControllerState(),
      isComplete: true
    };
    expect(buildLiveFrame(state)).toBeNull();
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

  it("editFrameShotPins on the frame being bowled keeps it open on ball 2 (ADR-246)", () => {
    const live: Frame = {
      game_id: 0,
      frame_number: 2,
      shots: [{ pins_standing: [7] }],
      is_strike: false,
      is_spare: false
    };
    const out = editFrameShotPins([live], 2, 0, [10]);
    expect(out[0].shots).toEqual([{ pins_standing: [10], pocket_hit: undefined, foul: undefined }]);
    expect(out[0].is_spare).toBe(false);
    const resumed = hydrateFrameController(out);
    expect(resumed.currentFrameNumber).toBe(2);
    expect(resumed.currentShot).toBe(2);
    expect(resumed.standingPins).toEqual([10]);
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

/**
 * Undo is a pop off the stack of shots, and the position afterwards is derived
 * by the same hydrate that answers "where were we" after a reload. These cases
 * are the four places that derivation could disagree with itself.
 */
describe("undoLastShot", () => {
  /** Play a list of shots from an empty game and return the stored frames. */
  function play(shots: PinNumber[][]): Frame[] {
    let state = createInitialFrameControllerState();
    for (const pins of shots) state = submitShot(state, pins).state;
    return state.frames;
  }

  it("takes back the second ball of a frame and waits for it again", () => {
    const frames = play([[3, 10], [10]]);
    const { frames: after, changedFrame, deletedFrameNumber } = undoLastShot(frames);

    expect(deletedFrameNumber).toBeNull();
    expect(changedFrame?.frame_number).toBe(1);
    expect(changedFrame?.shots).toHaveLength(1);

    const state = hydrateFrameController(after);
    expect(state.currentFrameNumber).toBe(1);
    expect(state.currentShot).toBe(2);
    expect(state.availablePins).toEqual([3, 10]);
  });

  it("takes back a strike, which empties the frame it was the whole of", () => {
    const frames = play([[3, 10], [], []]);
    const { frames: after, changedFrame, deletedFrameNumber } = undoLastShot(frames);

    expect(deletedFrameNumber).toBe(2);
    expect(changedFrame).toBeNull();
    expect(after.map((f) => f.frame_number)).toEqual([1]);
    expect(hydrateFrameController(after).currentFrameNumber).toBe(2);
  });

  it("un-finishes a game when the last ball of the tenth is taken back", () => {
    const shots: PinNumber[][] = [];
    for (let i = 0; i < 9; i++) shots.push([]); // nine strikes
    shots.push([], [], []); // tenth: strike, strike, strike
    const frames = play(shots);
    expect(hydrateFrameController(frames).isComplete).toBe(true);

    const { frames: after, changedFrame } = undoLastShot(frames);

    expect(changedFrame?.frame_number).toBe(10);
    expect(changedFrame?.shots).toHaveLength(2);
    const state = hydrateFrameController(after);
    expect(state.isComplete).toBe(false);
    expect(state.currentFrameNumber).toBe(10);
    expect(state.currentShot).toBe(3);
  });

  it("takes back the first shot of a game and leaves nothing to undo", () => {
    const frames = play([[3, 10]]);
    const { frames: after, deletedFrameNumber } = undoLastShot(frames);

    expect(deletedFrameNumber).toBe(1);
    expect(after).toEqual([]);

    // Nothing recorded: a second undo is a no-op rather than an error.
    const again = undoLastShot(after);
    expect(again.frames).toEqual([]);
    expect(again.changedFrame).toBeNull();
    expect(again.deletedFrameNumber).toBeNull();
  });

  it("re-derives the marks of the frame it rewrites", () => {
    // A spare, undone, leaves a frame that is neither a strike nor a spare.
    const frames = play([[3, 10], []]);
    const { changedFrame } = undoLastShot(frames);

    expect(changedFrame?.is_spare).toBe(false);
    expect(changedFrame?.is_strike).toBe(false);
  });
});

/**
 * A gutter ball leaves all ten available, and every "is this a fresh rack"
 * question in the app used to answer it by counting them (ADR-088).
 */
describe("the ball after a gutter", () => {
  const ALL: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  function playTo(shots: PinNumber[][]): FrameControllerState {
    let state = createInitialFrameControllerState();
    for (const pins of shots) state = submitShot(state, pins).state;
    return state;
  }

  it("opens pins-up in frames 1 to 9", () => {
    const state = playTo([ALL]);
    expect(state.currentShot).toBe(2);
    expect(state.availablePins).toEqual(ALL);
    expect(state.standingPins).toEqual(ALL);
  });

  it("opens pins-up in the 10th as well", () => {
    const nine = Array.from({ length: 9 }, () => [] as PinNumber[]);
    const state = playTo([...nine, ALL]);

    expect(state.currentFrameNumber).toBe(10);
    expect(state.currentShot).toBe(2);
    expect(state.availablePins).toEqual(ALL);
    expect(state.standingPins).toEqual(ALL);
  });

  it("resumes pins-up in the 10th after a reload", () => {
    const nine = Array.from({ length: 9 }, () => [] as PinNumber[]);
    const state = hydrateFrameController(playTo([...nine, ALL]).frames);

    expect(state.currentShot).toBe(2);
    expect(state.standingPins).toEqual(ALL);
  });

  it("still opens the 10th's bonus ball all-down after a strike", () => {
    const nine = Array.from({ length: 9 }, () => [] as PinNumber[]);
    const state = playTo([...nine, []]);

    expect(state.currentShot).toBe(2);
    expect(state.availablePins).toEqual(ALL);
    expect(state.standingPins).toEqual([]);
    expect(hydrateFrameController(state.frames).standingPins).toEqual([]);
  });

  it("scores the frame it clears as a spare", () => {
    const state = playTo([ALL, []]);
    const first = state.frames.find((f) => f.frame_number === 1);
    expect(first?.is_spare).toBe(true);
    expect(first?.is_strike).toBe(false);
  });
});

describe("editFrameShotPins and fouls (ADR-089)", () => {
  const ALL: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const base: Frame[] = [
    {
      game_id: 1,
      frame_number: 1,
      shots: [{ pins_standing: [10] }, { pins_standing: [10] }],
      is_strike: false,
      is_spare: false
    }
  ];

  it("marks a recorded shot as a foul", () => {
    const after = editFrameShotPins(base, 1, 1, [10], true);
    expect(after[0].shots[1].foul).toBe(true);
  });

  it("clears the mark when the shot is re-entered without it", () => {
    const fouled = editFrameShotPins(base, 1, 0, ALL, true);
    expect(fouled[0].shots[0].foul).toBe(true);
    expect(editFrameShotPins(fouled, 1, 0, [10])[0].shots[0].foul).toBeUndefined();
  });
});
