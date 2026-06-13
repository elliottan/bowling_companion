import { describe, expect, it } from "vitest";
import { getFrameShotSymbols } from "./scoreDisplay";
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
