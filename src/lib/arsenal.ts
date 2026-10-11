import type { Ball } from "../types/bowling";

/** The balls in the bag, the ones a shot or a spare ball is chosen from. A
 *  retired ball (ADR-133) is left out here and kept everywhere a ball already
 *  thrown is named. */
export function activeBalls<T extends Pick<Ball, "retired">>(balls: readonly T[]): T[] {
  return balls.filter((b) => !b.retired);
}
