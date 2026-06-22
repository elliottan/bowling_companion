import { describe, it, expect } from "vitest";
import {
  PLANE_W, PLANE_L, LANE_BOARDS, LANE_FEET,
  boardToX, feetToY, xToBoard, yToFeet
} from "./laneGeometry";

describe("board ↔ x", () => {
  it("right-hander: board 1 is the right edge, board 39 the left", () => {
    expect(boardToX(1, "right")).toBeCloseTo(PLANE_W, 5);
    expect(boardToX(LANE_BOARDS, "right")).toBeCloseTo(0, 5);
    expect(boardToX(20, "right")).toBeCloseTo(PLANE_W * (1 - 19 / 38), 5);
  });

  it("left-hander mirrors the right-hander", () => {
    expect(boardToX(1, "left")).toBeCloseTo(0, 5);
    expect(boardToX(LANE_BOARDS, "left")).toBeCloseTo(PLANE_W, 5);
  });

  it("clamps out-of-range boards onto the lane", () => {
    expect(boardToX(50, "right")).toBeCloseTo(boardToX(LANE_BOARDS, "right"), 5);
    expect(boardToX(0, "right")).toBeCloseTo(boardToX(1, "right"), 5);
  });

  it("xToBoard inverts boardToX", () => {
    for (const b of [1, 10, 17.5, 20, 39]) {
      expect(xToBoard(boardToX(b, "right"), "right")).toBeCloseTo(b, 4);
      expect(xToBoard(boardToX(b, "left"), "left")).toBeCloseTo(b, 4);
    }
  });
});

describe("feet ↔ y", () => {
  it("foul line (0 ft) is the bottom, head pin (60 ft) the top", () => {
    expect(feetToY(0)).toBeCloseTo(PLANE_L, 5);
    expect(feetToY(LANE_FEET)).toBeCloseTo(0, 5);
    expect(feetToY(30)).toBeCloseTo(PLANE_L / 2, 5);
  });

  it("yToFeet inverts feetToY", () => {
    for (const ft of [0, 15, 42, 60]) {
      expect(yToFeet(feetToY(ft))).toBeCloseTo(ft, 4);
    }
  });
});
