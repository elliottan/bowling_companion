import { parseSheetBoard } from "../../../src/lib/oilPattern.js";
import { LANE_BOARDS } from "../../../src/lib/laneGeometry.js";

/**
 * Repairing a load table read by OCR (ADR-104).
 *
 * Kegel draws its load tables as pictures, so the only way to read one is OCR,
 * and OCR is the reader ADR-044 warns about: it fails plausibly. On a real
 * sheet it gets every digit right and then loses things that are one or two
 * pixels wide. Two failures repeat, and both are repairable because the table
 * says the same thing more than once:
 *
 * - **A dropped decimal point.** "15.3" comes back "153". Distances on a sheet
 *   carry exactly one decimal, so a distance with no point is missing one, and
 *   putting it back before the last digit is the only reading in range. The
 *   FEET column then proves it: END minus START has to equal FEET.
 * - **A board that gained a digit.** "7L" comes back "71L", which is not a
 *   board. CROSSED divided by LOADS is how many boards the pass covered, and a
 *   pass from nL to nR covers 41 - 2n of them, so the crossings name the board
 *   the OCR lost.
 *
 * Nothing here guesses. Every repair is derived from another column of the same
 * row, and a row that cannot be repaired is left as it was read, to fail the
 * checks in `oilPatternSheet` and be corrected by hand.
 */

/** Distances print with one decimal, so a bare integer lost its point. */
export function repairDistance(token: string): string {
  if (token.includes(".")) return token;
  const negative = token.startsWith("-");
  const digits = negative ? token.slice(1) : token;
  if (!/^\d+$/.test(digits)) return token;
  const value = Number(digits) / 10;
  return `${negative ? "-" : ""}${value.toFixed(1)}`;
}

/**
 * The board a pass started from, read back out of its crossings. A pass runs
 * nL to nR, which is board n to board LANE_BOARDS + 1 - n, so it covers
 * LANE_BOARDS + 2 - 2n boards; crossings are that times the loads.
 */
export function boardFromCrossings(crossed: number, loads: number): number | null {
  if (loads <= 0 || crossed <= 0 || crossed % loads !== 0) return null;
  const boards = crossed / loads;
  const n = (LANE_BOARDS + 2 - boards) / 2;
  return Number.isInteger(n) && n >= 1 && n <= (LANE_BOARDS + 1) / 2 ? n : null;
}

const TOKENS = 13;

/**
 * One OCR'd table line, repaired into the line the sheet prints. Returns null
 * for anything that is not a table row, so headers and stray marks fall away.
 */
export function repairOcrLine(line: string): string | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== TOKENS) return null;

  const [index, startBoard, stopBoard, loads, mics, speed, buffer, tank, crossed, ...rest] = parts;
  const [startFt, endFt, feet, toil] = rest;
  if (!/^\d{1,2}$/.test(index) || !/^\d{1,3}$/.test(loads) || !/^\d{1,4}$/.test(crossed)) return null;
  if (!/^[A-Za-z]$/.test(tank)) return null;

  // Boards first: a spurious digit makes the pass unreadable, and the crossings
  // say which board it was.
  const recovered = boardFromCrossings(Number(crossed), Number(loads));
  const fixBoard = (token: string, side: "L" | "R"): string => {
    const board = parseSheetBoard(token);
    if (board != null) return token;
    return recovered != null ? `${recovered}${side}` : token;
  };

  return [
    index,
    fixBoard(startBoard, "L"),
    fixBoard(stopBoard, "R"),
    loads,
    mics,
    speed,
    buffer,
    tank.toUpperCase(),
    crossed,
    repairDistance(startFt),
    repairDistance(endFt),
    repairDistance(feet),
    toil,
  ].join(" ");
}

/** Every line OCR produced, repaired where it is a table row. */
export function repairOcrLines(lines: readonly string[]): string[] {
  return lines.map((line) => repairOcrLine(line) ?? line);
}
