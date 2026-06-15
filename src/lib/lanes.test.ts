import { describe, expect, it } from "vitest";
import { endLane, laneForFrame, nextGameStartLane, previousSameLaneFrame } from "./lanes";
import type { Frame } from "../types/bowling";

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
