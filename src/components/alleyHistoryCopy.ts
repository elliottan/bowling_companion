/**
 * The words for a line, shared by the Alley report and the Start session
 * sheet (ADR-115). Kept out of the component file so it exports components
 * only.
 */
import { t } from "@lingui/core/macro";
import { formatNumber } from "../lib/format";

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
