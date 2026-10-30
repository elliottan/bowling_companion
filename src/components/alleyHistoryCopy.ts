/**
 * The words for a line and a move, shared by the Alley report, the Start
 * session sheet and the scorer's game hint (ADR-115). Kept out of the component
 * file so it exports components only.
 */
import { plural, t } from "@lingui/core/macro";
import { formatNumber } from "../lib/format";
import type { MovementSlot } from "../lib/briefing";
import type { Handedness } from "../types/bowling";

/** The ball and the boards, saying only what was recorded. */
export function describeLine(line: { ballName?: string; stance?: number; target?: number }): string {
  const { ballName } = line;
  const stance = line.stance === undefined ? undefined : formatNumber(line.stance, 1);
  const target = line.target === undefined ? undefined : formatNumber(line.target, 1);
  const boards =
    stance !== undefined && target !== undefined
      ? t({ message: `${stance} to ${target}`, comment: "A bowling line: the board the bowler stands on, then the board aimed at" })
      : stance !== undefined
        ? t({ message: `stance ${stance}`, comment: "Bowling term: the board the bowler stands on, with its number" })
        : target !== undefined
          ? t({ message: `target ${target}`, comment: "Bowling term: the board aimed at on the lane, with its number" })
          : "";
  if (ballName && boards) return t({ message: `${ballName}, ${boards}`, comment: "A ball's name, then the boards it was thrown on" });
  return ballName ?? boards;
}

/**
 * Boards and which way, in the bowler's own terms.
 *
 * Board numbers rise to the left for a right-hander and to the right for a
 * left-hander, which is the same rule the line adjusters run on
 * (`LineInput`). A higher board is not a direction on its own.
 */
export function boardsMoved(from: number, to: number, handedness: Handedness): string {
  const boards = Math.abs(to - from);
  const towardsHigher = handedness === "right" ? "left" : "right";
  const towardsLower = handedness === "right" ? "right" : "left";
  const direction = to > from ? towardsHigher : towardsLower;
  return direction === "left"
    ? plural(boards, { one: "# board left", other: "# boards left" })
    : plural(boards, { one: "# board right", other: "# boards right" });
}

/**
 * The move a bowler usually makes going into a game here, from the line they
 * typically play in the game before it. Null when the two games carry no
 * boards to compare, or the same ones. States what happened and stops, the way
 * the Alley report does.
 */
export function describeGameMove(
  slots: MovementSlot[],
  gameNumber: number,
  handedness: Handedness
): string | null {
  const before = slots.find((s) => s.gameNumber === gameNumber - 1);
  const now = slots.find((s) => s.gameNumber === gameNumber);
  if (!before || !now) return null;
  const stanceMove =
    before.stance !== undefined && now.stance !== undefined && before.stance !== now.stance
      ? boardsMoved(before.stance, now.stance, handedness)
      : null;
  const targetMove =
    before.target !== undefined && now.target !== undefined && before.target !== now.target
      ? boardsMoved(before.target, now.target, handedness)
      : null;
  if (stanceMove && targetMove) {
    return t({
      message: `Game ${gameNumber} here: you usually move ${stanceMove} at the stance and ${targetMove} at the target.`,
      comment: "Bowling terms: the stance is the board the bowler stands on, the target the board aimed at. Each move reads like 2 boards left"
    });
  }
  if (stanceMove) {
    return t({
      message: `Game ${gameNumber} here: you usually move ${stanceMove} at the stance.`,
      comment: "Bowling term: the stance is the board the bowler stands on. The move reads like 2 boards left"
    });
  }
  if (targetMove) {
    return t({
      message: `Game ${gameNumber} here: you usually move ${targetMove} at the target.`,
      comment: "Bowling term: the target is the board aimed at. The move reads like 2 boards left"
    });
  }
  return null;
}
