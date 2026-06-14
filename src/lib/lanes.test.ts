import { describe, expect, it } from "vitest";
import { endLane, laneForFrame, nextGameStartLane } from "./lanes";

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
