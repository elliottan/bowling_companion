/**
 * The words for a line and a move, shared by the Alley report, the Start
 * session sheet and the scorer's game hint (ADR-115). Kept out of the component
 * file so it exports components only.
 */
import type { MovementSlot } from "../lib/briefing";
import type { Handedness } from "../types/bowling";

/** The ball and the boards, saying only what was recorded. */
export function describeLine(line: { ballName?: string; stance?: number; target?: number }): string {
  const boards =
    line.stance !== undefined && line.target !== undefined
      ? `${line.stance} to ${line.target}`
      : line.stance !== undefined
        ? `stance ${line.stance}`
        : line.target !== undefined
          ? `target ${line.target}`
          : "";
  if (line.ballName && boards) return `${line.ballName}, ${boards}`;
  return line.ballName ?? boards;
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
  const unit = boards === 1 ? "board" : "boards";
  const towardsHigher = handedness === "right" ? "left" : "right";
  const towardsLower = handedness === "right" ? "right" : "left";
  return `${boards} ${unit} ${to > from ? towardsHigher : towardsLower}`;
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
  const moves: string[] = [];
  if (before.stance !== undefined && now.stance !== undefined && before.stance !== now.stance) {
    moves.push(`${boardsMoved(before.stance, now.stance, handedness)} at the stance`);
  }
  if (before.target !== undefined && now.target !== undefined && before.target !== now.target) {
    moves.push(`${boardsMoved(before.target, now.target, handedness)} at the target`);
  }
  if (moves.length === 0) return null;
  return `Game ${gameNumber} here: you usually move ${moves.join(" and ")}.`;
}
