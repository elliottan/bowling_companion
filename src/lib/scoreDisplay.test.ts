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

  it("tenth-frame shot 3 on fresh rack after spare is NOT a spare symbol", () => {
    // 9-leave, spare, then 9 on a fresh rack -> ["9", "/", "9"], not ["9", "/", "/"]
    // shot1 knocked 9 (pin 10 standing); shot2 spared (cleared, pins_standing=[]);
    // shot3 on fresh rack knocks 9 (pin 10 standing).
    const f = frame(10, [10 as PinNumber], [], [10 as PinNumber]);
    expect(getFrameShotSymbols(f)).toEqual(["9", "/", "9"]);
  });

  it("tenth-frame shot 3 on fresh rack after two strikes is NOT a spare symbol", () => {
    // X, X, 9 -> ["X", "X", "9"]
    const f = frame(10, [], [], [10 as PinNumber]);
    expect(getFrameShotSymbols(f)).toEqual(["X", "X", "9"]);
  });

  it("tenth-frame shot 3 IS a spare when shot 2 left pins (X 9 /)", () => {
    // Strike, 9-leave (shot2 leaves pin 10), then shot3 clears it
    // shot2 pins_standing=[10] (not empty -> not a fresh rack for shot3), shot3 clears it
    const f = frame(10, [], [10 as PinNumber], []);
    expect(getFrameShotSymbols(f)).toEqual(["X", "9", "/"]);
  });

  it("tenth-frame shot 3 is a strike on fresh rack after spare", () => {
    // 9-leave, spare, then strike on fresh rack -> ["9", "/", "X"]
    const f = frame(10, [10 as PinNumber], [], []);
    expect(getFrameShotSymbols(f)).toEqual(["9", "/", "X"]);
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
