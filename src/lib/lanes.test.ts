import { describe, expect, it } from "vitest";
import {
  endLane,
  freshRackSeedShot,
  freshRackShotIndices,
  laneForFrame,
  nextGameStartLane,
  previousGameSameLaneFrame,
  previousSameLaneFrame
} from "./lanes";
import type { Frame, Shot } from "../types/bowling";

// Frame whose first-shot intended line encodes the frame number, for assertions.
const frame = (n: number): Frame => ({
  game_id: 1,
  frame_number: n,
  shots: [{ pins_standing: [], intended: { stance: n, target: n, breakpoint: n } }],
  is_strike: false,
  is_spare: false
});

describe("laneForFrame", () => {
  it("single lane: every frame is that lane", () => {
    const g = { lanes: ["7"] };
    expect(laneForFrame(g, 1)).toBe("7");
    expect(laneForFrame(g, 10)).toBe("7");
  });

  it("falls back to legacy lane_number", () => {
    expect(laneForFrame({ lane_number: "12" }, 5)).toBe("12");
  });

  it("cross-lane alternates from start_lane", () => {
    const g = { lanes: ["11", "12"], start_lane: "11" };
    expect(laneForFrame(g, 1)).toBe("11"); // odd -> start
    expect(laneForFrame(g, 2)).toBe("12"); // even -> other
    expect(laneForFrame(g, 9)).toBe("11");
    expect(laneForFrame(g, 10)).toBe("12");
  });

  it("cross-lane respects a flipped start", () => {
    const g = { lanes: ["11", "12"], start_lane: "12" };
    expect(laneForFrame(g, 1)).toBe("12");
    expect(laneForFrame(g, 2)).toBe("11");
    expect(laneForFrame(g, 10)).toBe("11");
  });

  it("no config -> undefined", () => {
    expect(laneForFrame({}, 1)).toBeUndefined();
  });
});

describe("nextGameStartLane (flip)", () => {
  it("flips each game on a cross-lane pair", () => {
    const game1 = { lanes: ["11", "12"], start_lane: "11" };
    expect(endLane(game1)).toBe("12");
    const start2 = nextGameStartLane(game1);
    expect(start2).toBe("12");

    const game2 = { lanes: ["11", "12"], start_lane: start2 };
    expect(nextGameStartLane(game2)).toBe("11"); // game 3 starts on 11 again
  });

  it("single lane stays put", () => {
    expect(nextGameStartLane({ lanes: ["7"] })).toBe("7");
  });
});

describe("previousGameSameLaneFrame", () => {
  it("single-lane: finds the latest frame in the previous game on the same lane", () => {
    const currentGame = { lanes: ["7"] };
    const prev1 = frame(1);
    const prev5 = frame(5);
    const previousGames = [
      { game: { lanes: ["7"] }, frames: [prev1, prev5] }
    ];
    const result = previousGameSameLaneFrame(currentGame, 1, previousGames);
    expect(result?.frame_number).toBe(5); // latest in prev game
  });

  it("cross-lane: frame 1 of new game finds prev game frames on the same lane", () => {
    // New game: lanes=[11,12], start=11. Frame 1 is on lane 11.
    const currentGame = { lanes: ["11", "12"], start_lane: "11" };
    // Prev game: lanes=[11,12], start=12 (flipped). Frame 1 is on lane 12, frame 2 on lane 11.
    const prevGame = { lanes: ["11", "12"], start_lane: "12" };
    const f1 = frame(1); // lane 12 in prevGame
    const f2 = frame(2); // lane 11 in prevGame
    const previousGames = [{ game: prevGame, frames: [f1, f2] }];
    // Frame 1 of currentGame is on lane 11 -> should find f2 (lane 11 in prevGame)
    const result = previousGameSameLaneFrame(currentGame, 1, previousGames);
    expect(result?.frame_number).toBe(2);
  });

  it("returns undefined when no previous game is on the same lane", () => {
    const currentGame = { lanes: ["5"] };
    const previousGames = [
      { game: { lanes: ["7"] }, frames: [frame(1), frame(2)] }
    ];
    expect(previousGameSameLaneFrame(currentGame, 1, previousGames)).toBeUndefined();
  });

  it("newest matching game wins over older ones", () => {
    const currentGame = { lanes: ["9"] };
    const olderGame = { lanes: ["9"] };
    const newerGame = { lanes: ["9"] };
    const previousGames = [
      { game: olderGame, frames: [frame(3)] },
      { game: newerGame, frames: [frame(7)] }
    ];
    // Should return frame 7 from newerGame (last in array = newest)
    const result = previousGameSameLaneFrame(currentGame, 1, previousGames);
    expect(result?.frame_number).toBe(7);
  });

  it("returns undefined when currentGame is undefined", () => {
    expect(previousGameSameLaneFrame(undefined, 1, [{ game: { lanes: ["9"] }, frames: [frame(1)] }])).toBeUndefined();
  });

  it("returns undefined when previousGames is empty", () => {
    expect(previousGameSameLaneFrame({ lanes: ["9"] }, 1, [])).toBeUndefined();
  });
});

describe("previousSameLaneFrame", () => {
  const frames = [1, 2, 3, 4, 5].map(frame);

  it("single lane: takes the immediately previous frame", () => {
    const g = { lanes: ["7"] };
    expect(previousSameLaneFrame(g, 4, frames)?.frame_number).toBe(3);
    expect(previousSameLaneFrame(g, 1, frames)?.frame_number).toBeUndefined();
  });

  it("no game / standalone: takes the immediately previous frame", () => {
    expect(previousSameLaneFrame(undefined, 3, frames)?.frame_number).toBe(2);
  });

  it("cross-lane: frame N takes from N-2; frames 1 and 2 have none", () => {
    const g = { lanes: ["11", "12"], start_lane: "11" };
    expect(previousSameLaneFrame(g, 1, frames)).toBeUndefined();
    expect(previousSameLaneFrame(g, 2, frames)).toBeUndefined();
    expect(previousSameLaneFrame(g, 3, frames)?.frame_number).toBe(1);
    expect(previousSameLaneFrame(g, 4, frames)?.frame_number).toBe(2);
    expect(previousSameLaneFrame(g, 5, frames)?.frame_number).toBe(3);
  });
});

// Shot builder: pins_standing empty = cleared the deck (strike, or a spare
// conversion). `label` rides along on `intended.stance` for assertions.
const shot = (label: number, pinsStanding: Shot["pins_standing"]): Shot => ({
  pins_standing: pinsStanding,
  intended: { stance: label }
});

describe("freshRackShotIndices", () => {
  it("frames 1-9: only index 0, regardless of a second (spare/open) shot", () => {
    expect(freshRackShotIndices([shot(1, [])])).toEqual([0]); // strike
    expect(freshRackShotIndices([shot(1, [7]), shot(2, [])])).toEqual([0]); // spare
    expect(freshRackShotIndices([shot(1, [7]), shot(2, [7])])).toEqual([0]); // open
  });

  it("10th X-X-X: all three balls are fresh-rack", () => {
    const shots = [shot(1, []), shot(2, []), shot(3, [])];
    expect(freshRackShotIndices(shots)).toEqual([0, 1, 2]);
  });

  it("10th spare then strike (9/ X): ball 1 and ball 3 are fresh-rack, ball 2 is not", () => {
    // ball1 leaves a 9 (pins_standing=[10] i.e. one pin up), ball2 converts the
    // spare (pins_standing=[]), ball3 is the fresh-rack bonus strike.
    const shots = [shot(1, [10]), shot(2, []), shot(3, [])];
    expect(freshRackShotIndices(shots)).toEqual([0, 2]);
  });

  it("10th leave -> spare -> ball 3: indices [0, 2]", () => {
    const shots = [shot(1, [10]), shot(2, []), shot(3, [7])];
    expect(freshRackShotIndices(shots)).toEqual([0, 2]);
  });

  it("10th open (no bonus ball): only index 0", () => {
    const shots = [shot(1, [7]), shot(2, [4])];
    expect(freshRackShotIndices(shots)).toEqual([0]);
  });
});

describe("freshRackSeedShot", () => {
  it("10th, leave -> spare, seeding ball 3: returns ball 1 (confirmed edge case)", () => {
    const ball1 = shot(1, [10]);
    const ball2 = shot(2, []);
    const result = freshRackSeedShot(undefined, 10, [ball1, ball2], [], []);
    expect(result).toBe(ball1);
  });

  it("10th, strike on ball 1, seeding ball 2: returns ball 1", () => {
    const ball1 = shot(1, []);
    const result = freshRackSeedShot(undefined, 10, [ball1], [], []);
    expect(result).toBe(ball1);
  });

  it("10th, strike-strike, seeding ball 3: returns ball 2", () => {
    const ball1 = shot(1, []);
    const ball2 = shot(2, []);
    const result = freshRackSeedShot(undefined, 10, [ball1, ball2], [], []);
    expect(result).toBe(ball2);
  });

  it("frame 5 shot 1, single-lane game: returns previous frame's first shot (parity w/ previousSameLaneFrame)", () => {
    const g = { lanes: ["7"] };
    const frames = [1, 2, 3, 4].map(frame);
    const result = freshRackSeedShot(g, 5, [], frames, []);
    expect(result).toBe(frames[3].shots[0]); // frame 4
  });

  it("cross-lane pair: skips to two frames back per previousSameLaneFrame semantics", () => {
    const g = { lanes: ["11", "12"], start_lane: "11" };
    const frames = [1, 2, 3, 4].map(frame);
    const result = freshRackSeedShot(g, 5, [], frames, []);
    expect(result).toBe(frames[2].shots[0]); // frame 3, not frame 4
  });

  it("frames 1-2 with no prior same-lane frame in this game: falls through to previousGameSameLaneFrame", () => {
    const g = { lanes: ["7"] };
    const prevGameFrame = frame(9);
    const previousGames = [{ game: { lanes: ["7"] }, frames: [prevGameFrame] }];
    const result = freshRackSeedShot(g, 1, [], [], previousGames);
    expect(result).toBe(prevGameFrame.shots[0]);
  });

  it("nothing anywhere (first game, first lane pair): undefined", () => {
    const g = { lanes: ["7"] };
    expect(freshRackSeedShot(g, 1, [], [], [])).toBeUndefined();
  });

  it("a fresh-rack shot with intended: undefined is still returned as the seed", () => {
    const ball1: Shot = { pins_standing: [] }; // strike, no intended recorded
    const result = freshRackSeedShot(undefined, 10, [ball1], [], []);
    expect(result).toBe(ball1);
    expect(result?.intended).toBeUndefined();
  });
});
