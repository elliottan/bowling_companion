import { describe, expect, it } from "vitest";
import { calculateGameScore, isSpare, isStrike } from "./scoring";
import type { Frame, PinNumber, Shot } from "../types/bowling";

const noPinsStanding: PinNumber[] = [];
const allPinsStanding: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function frame(
  frameNumber: number,
  shot1Standing: PinNumber[],
  shot2Standing?: PinNumber[],
  shot3Standing?: PinNumber[]
): Frame {
  const shots: Shot[] = [{ pins_standing: shot1Standing }];
  if (shot2Standing !== undefined) shots.push({ pins_standing: shot2Standing });
  if (shot3Standing !== undefined) shots.push({ pins_standing: shot3Standing });
  return {
    game_id: 1,
    frame_number: frameNumber,
    shots,
    is_strike: shot1Standing.length === 0,
    is_spare: shot1Standing.length !== 0 && shot2Standing?.length === 0
  };
}

describe("scoring helpers", () => {
  it("detects a strike from empty standing pins after shot one", () => {
    expect(isStrike(frame(1, noPinsStanding))).toBe(true);
  });

  it("detects a spare when the second shot clears the remaining pins", () => {
    expect(isSpare(frame(1, [7, 10], noPinsStanding))).toBe(true);
  });

  it("scores an all-open game", () => {
    const frames = Array.from({ length: 10 }, (_, index) =>
      frame(index + 1, [6, 7, 8, 9, 10], allPinsStanding)
    );

    const result = calculateGameScore(frames);

    expect(result.isComplete).toBe(true);
    expect(result.total).toBe(50);
    expect(result.frames[result.frames.length - 1].rollingTotal).toBe(50);
  });

  it("adds the next shot as spare bonus", () => {
    const frames = [
      frame(1, [8], noPinsStanding),
      frame(2, [6, 7, 8, 9, 10], allPinsStanding),
      ...Array.from({ length: 8 }, (_, index) =>
        frame(index + 3, allPinsStanding, allPinsStanding)
      )
    ];

    const result = calculateGameScore(frames);

    expect(result.frames[0].score).toBe(15);
    expect(result.total).toBe(20);
  });

  it("adds the next two shots as strike bonus", () => {
    const frames = [
      frame(1, noPinsStanding),
      frame(2, [6, 7, 8, 9, 10], [9, 10]),
      ...Array.from({ length: 8 }, (_, index) =>
        frame(index + 3, allPinsStanding, allPinsStanding)
      )
    ];

    const result = calculateGameScore(frames);

    expect(result.frames[0].score).toBe(18);
    expect(result.total).toBe(26);
  });

  it("scores a perfect game", () => {
    const frames = [
      ...Array.from({ length: 9 }, (_, index) => frame(index + 1, noPinsStanding)),
      frame(10, noPinsStanding, noPinsStanding, noPinsStanding)
    ];

    const result = calculateGameScore(frames);

    expect(result.isComplete).toBe(true);
    expect(result.total).toBe(300);
  });

  it("waits for a required tenth-frame bonus shot", () => {
    const frames = [
      ...Array.from({ length: 9 }, (_, index) =>
        frame(index + 1, allPinsStanding, allPinsStanding)
      ),
      frame(10, [10], noPinsStanding)
    ];

    const result = calculateGameScore(frames);

    expect(result.isComplete).toBe(false);
    expect(result.frames[result.frames.length - 1].score).toBeNull();
  });

  it("10th-frame strike with no follow-up shots scores null (not thrown ≠ cleared rack)", () => {
    // Frame 10 has shots[0] = strike (pins_standing: []) but shots[1] is absent.
    // shots[1] missing means "not thrown"; shots[1].pins_standing === [] means strike.
    // calculateGameScore must return null for frame 10, not a number.
    const tenthFrame: Frame = {
      game_id: 1,
      frame_number: 10,
      shots: [{ pins_standing: [] }], // one shot only — ball 2 not yet thrown
      is_strike: true,
      is_spare: false
    };
    const frames = [
      ...Array.from({ length: 9 }, (_, index) =>
        frame(index + 1, allPinsStanding, allPinsStanding)
      ),
      tenthFrame
    ];

    const result = calculateGameScore(frames);

    expect(result.isComplete).toBe(false);
    expect(result.frames[9].score).toBeNull();
  });
});
