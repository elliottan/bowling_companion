import { describe, expect, it } from "vitest";
import { spareAimPoint } from "./spareAim";
import { PIN_POSITIONS } from "./pinGeometry";
import { LANE_BOARDS } from "./laneGeometry";

// PIN_POSITIONS is board-1-left, which equals a left-hander's line boards; a
// right-hander's boards mirror about centre (40 - board). Most cases assert the
// canonical (left) geometry; a dedicated block checks the right-hand mirror.
describe("spareAimPoint (left = canonical board space)", () => {
  it("returns undefined for an empty leave", () => {
    expect(spareAimPoint([], "left")).toBeUndefined();
  });

  it("single pin → that pin's center", () => {
    expect(spareAimPoint([10], "left")).toEqual(PIN_POSITIONS[10]);
    expect(spareAimPoint([5], "left")).toEqual(PIN_POSITIONS[5]);
  });

  it("connected pair → midpoint of the two", () => {
    const a = spareAimPoint([2, 3], "left");
    expect(a?.board).toBeCloseTo(20, 2);
    expect(a?.feet).toBeCloseTo(60.87, 2);
  });

  it("connected cluster 3-6-10 → midpoint of front pin 3 and nearest connected 6", () => {
    const a = spareAimPoint([3, 6, 10], "left");
    expect(a?.board).toBeCloseTo(28.44, 1);
    expect(a?.feet).toBeCloseTo(61.3, 1);
  });

  it("connected cluster 2-4-5 → front pin 2 paired with pocket-side neighbor 5", () => {
    const a = spareAimPoint([2, 4, 5], "left");
    expect(a?.board).toBeCloseTo(17.19, 1);
    expect(a?.feet).toBeCloseTo(61.3, 1);
  });

  it("same-row split 4-6 → full slide offset (θ≈90°)", () => {
    const a = spareAimPoint([4, 6], "left")!;
    expect(a.feet).toBeCloseTo(61.73, 2);
    const offset = PIN_POSITIONS[4].board - a.board;
    expect(offset).toBeCloseTo(6.37, 1);
  });

  it("diagonal split 2-10 → partial slide offset, less than the same-row case", () => {
    const a = spareAimPoint([2, 10], "left")!;
    expect(a.feet).toBeCloseTo(60.87, 2);
    const offset = PIN_POSITIONS[2].board - a.board;
    expect(offset).toBeGreaterThan(4.5);
    expect(offset).toBeLessThan(5.2);
  });

  it("split 4-10 offset sits between the 2-10 and same-row cases", () => {
    const o210 = PIN_POSITIONS[2].board - spareAimPoint([2, 10], "left")!.board;
    const o410 = PIN_POSITIONS[4].board - spareAimPoint([4, 10], "left")!.board;
    const o46 = PIN_POSITIONS[4].board - spareAimPoint([4, 6], "left")!.board;
    expect(o410).toBeGreaterThan(o210);
    expect(o410).toBeLessThan(o46);
  });

  it("sleeper 2-8 → front pin center (no special handling yet)", () => {
    expect(spareAimPoint([2, 8], "left")).toEqual(PIN_POSITIONS[2]);
  });
});

describe("spareAimPoint right-hand mirror", () => {
  const mirror = (b: number) => LANE_BOARDS + 1 - b;

  it("right-hander's 10-pin aims near board 3 (not the 7-pin side)", () => {
    const a = spareAimPoint([10], "right")!;
    expect(a.board).toBeCloseTo(mirror(PIN_POSITIONS[10].board), 4); // 40 - 36.875 = 3.125
    expect(a.board).toBeLessThan(5);
    expect(a.feet).toBeCloseTo(PIN_POSITIONS[10].feet, 4);
  });

  it("right-hander's 7-pin aims to the far side (board ~37)", () => {
    const a = spareAimPoint([7], "right")!;
    expect(a.board).toBeCloseTo(mirror(PIN_POSITIONS[7].board), 4); // 36.875
    expect(a.board).toBeGreaterThan(35);
  });

  it("mirror is the only difference between hands (feet identical)", () => {
    const l = spareAimPoint([3, 6, 10], "left")!;
    const r = spareAimPoint([3, 6, 10], "right")!;
    expect(r.board).toBeCloseTo(mirror(l.board), 4);
    expect(r.feet).toBeCloseTo(l.feet, 4);
  });
});
