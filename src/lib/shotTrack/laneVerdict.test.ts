import { describe, expect, it } from "vitest";
import { laneVerdict, type LaneEvidence } from "./laneVerdict";

/** shot-01 as the app traced it: a good lane. */
const GOOD: LaneEvidence = {
  guess: null,
  support: { left: 0.47, right: 0.45 },
  pinsUsed: 2,
  camera: 24.4,
  kept: 9,
  dropped: 12,
  pinCheck: 0.19
};

describe("laneVerdict", () => {
  it("is sure of a lane every signal backs", () => {
    expect(laneVerdict(GOOD)).toEqual({ level: "sure", reasons: [] });
  });

  it("is sure with no evidence at all", () => {
    expect(laneVerdict({})).toEqual({ level: "sure", reasons: [] });
  });

  it("asks for a check when the foul line was guessed", () => {
    expect(laneVerdict({ ...GOOD, guess: { foul: "typical-camera" } })).toEqual({ level: "check", reasons: ["foul-guessed"] });
  });

  it("asks for a check when most found lanes disagree with the best one (shot-03)", () => {
    expect(laneVerdict({ ...GOOD, kept: 4, dropped: 18 }).reasons).toEqual(["lanes-disagree"]);
    expect(laneVerdict({ ...GOOD, kept: 2, dropped: 0 }).level).toBe("check");
    expect(laneVerdict({ ...GOOD, kept: 5, dropped: 10 }).level).toBe("sure");
    expect(laneVerdict({ ...GOOD, kept: 3, dropped: undefined }).level).toBe("sure");
  });

  it("asks for a check when the tracer's pins check is off by more than a board", () => {
    expect(laneVerdict({ ...GOOD, pinCheck: 1.43 }).reasons).toEqual(["pins-off"]);
    expect(laneVerdict({ ...GOOD, pinCheck: 1 }).level).toBe("sure");
    expect(laneVerdict({ ...GOOD, pinCheck: null }).level).toBe("sure");
  });

  it("asks for a check when the camera stands where nobody films from", () => {
    expect(laneVerdict({ ...GOOD, camera: 12 }).reasons).toEqual(["camera-unusual"]);
    expect(laneVerdict({ ...GOOD, camera: 40 }).level).toBe("check");
    expect(laneVerdict({ ...GOOD, camera: 25.8 }).level).toBe("sure");
  });

  it("takes both soft doubts to ask: no pins and a faint edge (shot-02), not either alone (shot-04)", () => {
    expect(laneVerdict({ ...GOOD, pinsUsed: 0, support: { left: 0.37, right: 0.45 } })).toEqual({ level: "check", reasons: ["no-pins", "faint-edge"] });
    expect(laneVerdict({ ...GOOD, pinsUsed: 0, support: { left: 0.64, right: 0.64 } })).toEqual({ level: "sure", reasons: ["no-pins"] });
    expect(laneVerdict({ ...GOOD, support: { left: 0.71, right: 0.38 } })).toEqual({ level: "sure", reasons: ["faint-edge"] });
  });

  it("lists the deciding doubts first", () => {
    expect(laneVerdict({ ...GOOD, pinsUsed: 0, kept: 1, dropped: 19, pinCheck: 1.4 }).reasons).toEqual(["lanes-disagree", "pins-off", "no-pins"]);
  });
});
