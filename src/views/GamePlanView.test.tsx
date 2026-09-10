import { describe, expect, it } from "vitest";
import { describeDrift } from "./GamePlanView";
import type { MovementSlot } from "../lib/briefing";

/**
 * The sentence under the movement rows is the number the reader came for, so
 * it is worth asserting on directly. The rows themselves are three medians and
 * a score, which Playwright covers on the real screen.
 */
describe("the sentence under how the session moves here", () => {
  const slot = (gameNumber: number, extra: Partial<MovementSlot> = {}): MovementSlot => ({
    gameNumber,
    games: 2,
    score: 190,
    ballName: "Phaze II",
    stance: 20,
    target: 10,
    ...extra
  });

  it("reads a higher board as left for a right-hander", () => {
    const slots = [slot(1), slot(3, { stance: 26, target: 14 })];
    expect(describeDrift(slots, "right")).toBe(
      "By game 3 you have moved 6 boards left at the stance and 4 boards left at the target."
    );
  });

  it("reads the same move as right for a left-hander", () => {
    const slots = [slot(1), slot(3, { stance: 26, target: 14 })];
    expect(describeDrift(slots, "left")).toBe(
      "By game 3 you have moved 6 boards right at the stance and 4 boards right at the target."
    );
  });

  it("names the ball you finished on when it changed", () => {
    const slots = [slot(1), slot(3, { stance: 26, ballName: "IQ Tour" })];
    expect(describeDrift(slots, "right")).toBe(
      "By game 3 you have moved 6 boards left at the stance, and onto the IQ Tour."
    );
  });

  it("says the line held when nothing moved", () => {
    expect(describeDrift([slot(1), slot(3)], "right")).toBe(
      "By game 3 you are on the same ball and the same line as game 1."
    );
  });

  it("says the ball changed on a line that did not", () => {
    const slots = [slot(1), slot(3, { ballName: "IQ Tour" })];
    expect(describeDrift(slots, "right")).toBe(
      "By game 3 you are on the IQ Tour, from the same line as game 1."
    );
  });

  it("counts one board in the singular", () => {
    const slots = [slot(1), slot(2, { stance: 19, target: 10 })];
    expect(describeDrift(slots, "right")).toBe(
      "By game 2 you have moved 1 board right at the stance."
    );
  });
});
