import { describe, expect, it } from "vitest";
import { getFrameShotCells, getFrameShotSymbols } from "./scoreDisplay";
import type { Frame, PinNumber, Shot } from "../types/bowling";

function frame(
  frameNumber: number,
  shot1: PinNumber[],
  shot2?: PinNumber[],
  shot3?: PinNumber[]
): Frame {
  const shots: Shot[] = [{ pins_standing: shot1 }];
  if (shot2 !== undefined) shots.push({ pins_standing: shot2 });
  if (shot3 !== undefined) shots.push({ pins_standing: shot3 });
  return {
    game_id: 1,
    frame_number: frameNumber,
    shots,
    is_strike: shot1.length === 0,
    is_spare: shot1.length > 0 && shot2?.length === 0
  };
}

describe("score display helpers", () => {
  it("renders strike and spare symbols", () => {
    expect(getFrameShotSymbols(frame(1, []))).toEqual(["", "X"]);
    expect(getFrameShotSymbols(frame(1, [10], []))).toEqual(["9", "/"]);
  });

  it("renders tenth-frame strike chain", () => {
    expect(getFrameShotSymbols(frame(10, [], [], []))).toEqual(["X", "X", "X"]);
  });
});

describe("getFrameShotCells (shot index mapping)", () => {
  it("maps the strike X cell (frames 1-9) back to shot 0", () => {
    const cells = getFrameShotCells(frame(1, []));
    expect(cells).toEqual([
      { symbol: "", shotIndex: null },
      { symbol: "X", shotIndex: 0 }
    ]);
  });

  it("maps open-frame cells to shots 0 and 1", () => {
    const cells = getFrameShotCells(frame(1, [7, 10], [10]));
    expect(cells.map((c) => c.shotIndex)).toEqual([0, 1]);
  });

  it("frame with only shot 1 leaves the second cell empty/untappable", () => {
    const cells = getFrameShotCells(frame(2, [7, 10]));
    expect(cells[0].shotIndex).toBe(0);
    expect(cells[1].shotIndex).toBeNull();
  });

  it("tenth frame maps each present shot to its index", () => {
    const cells = getFrameShotCells(frame(10, [], [], []));
    expect(cells.map((c) => c.shotIndex)).toEqual([0, 1, 2]);
  });
});
