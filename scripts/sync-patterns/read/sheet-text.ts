import type { OilPass } from "../../../src/types/bowling.js";
import { oilStats, parseSheetBoard } from "../../../src/lib/oilPattern.js";
import { LANE_BOARDS } from "../../../src/lib/laneGeometry.js";

/**
 * Reading a pattern sheet (ADR-104).
 *
 * A Kegel-style sheet is a fixed layout of rigid numeric tables, which by
 * ADR-044 makes it a parser's document and not a model's: a parser reads a
 * fixed layout and fails loudly, a model reads it and fails plausibly. There is
 * no backend to ask a model from anyway.
 *
 * What makes it safe to parse at all is that the sheet carries its own
 * checksums. Every row prints CROSSED (loads × boards) and T.OIL (crossed ×
 * mics), and the header prints the distance and the forward, reverse and total
 * volumes. So the sheet can be checked against itself: read the rows, derive
 * those same numbers, and compare. A misread column does not produce a slightly
 * wrong pattern, it produces a arithmetic disagreement the import refuses to
 * hide. Nothing here trusts the parse on its own say-so.
 */

/** A run of text on the page, with the position pdf.js reports for it. */
export interface SheetTextItem {
  text: string;
  x: number;
  /** PDF user space, so y increases UP the page. */
  y: number;
}

export interface SheetCheck {
  label: string;
  /** What the sheet prints. */
  stated: number;
  /** What the parsed rows come to. */
  derived: number;
  ok: boolean;
}

export interface ParsedSheet {
  /** The sheet's title, offered as a prefill and always editable. */
  name?: string;
  passes: OilPass[];
  checks: SheetCheck[];
  /** Every check agreed. A sheet that does not verify is never saved silently. */
  verified: boolean;
}

/**
 * One row of a load table. Kegel prints two layouts and both are real:
 *
 * - **Crossed**, the older sheet: thirteen columns, with CROSSED and separate
 *   START, END and FEET distance columns.
 *     `1 2L 2R 3 50 18 4 A 111 0.0 5.1 5.1 5550`
 * - **Arrow**, the current pattern-library sheet: ten columns, no CROSSED, the
 *   distance written as a span, the tank as a name, and thousands grouped.
 *     `1 2L 2R 3 50 14 3 A - FIRE 0 → 4 5,550`
 *
 * Adding a layout is adding a pattern here. What a row MEANS is the same either
 * way, and so are the checks, which is why a new sheet costs a regex and not a
 * new reader (ADR-044 routing, ADR-104).
 */
export const HEADER = {
  distance: /(?:Oil Pattern Distance|\bDISTANCE)\s*:?/i,
  forward: /(?:Forward Oil Total|\bFORWARD)\s*:/i,
  reverse: /(?:Reverse Oil Total|\bREVERSE)\s*:/i,
  volume: /(?:Volume Oil Total|\bVOLUME)\s*:?/i,
} as const;

const ROW_CROSSED = new RegExp(
  [
    /^(\d{1,2})\s+/,                     // row number
    /(\d{1,2}\s*[LlRr])\s+/,             // START board
    /(\d{1,2}\s*[LlRr])\s+/,             // STOP board
    /(\d{1,3})\s+/,                      // LOADS
    /(\d{1,4})\s+/,                      // MICS
    /(\d{1,3})\s+/,                      // SPEED
    /(\d{1,2})\s+/,                      // BUFFER
    /([A-Za-z])\s+/,                      // TANK
    /(\d{1,4})\s+/,                      // CROSSED
    /(\d{1,2}(?:\.\d+)?)\s+/,            // START ft
    /(\d{1,2}(?:\.\d+)?)\s+/,            // END ft
    /(-?\d{1,2}(?:\.\d+)?)\s+/,          // FEET travelled
    /(\d{1,6})$/,                        // T.OIL
  ].map((r) => r.source).join("")
);

const ROW_ARROW = new RegExp(
  [
    /^(\d{1,2})\s+/,                     // row number
    /(\d{1,2}\s*[LlRr])\s+/,             // START board
    /(\d{1,2}\s*[LlRr])\s+/,             // STOP board
    /(\d{1,3})\s+/,                      // LOADS
    /(\d{1,4})\s+/,                      // MICS
    /(\d{1,3})\s+/,                      // SPEED
    /(\d{1,2})\s+/,                      // BUFF
    /(\S(?:.*?\S)?)\s+/,                 // TANK, a name such as "A - FIRE"
    /(\d{1,2}(?:\.\d+)?)\s*(?:→|->)\s*/, // START ft
    /(\d{1,2}(?:\.\d+)?)\s+/,            // END ft
    /([\d,]{1,9})$/,                      // T.OIL, thousands grouped
  ].map((r) => r.source).join("")
);

/**
 * **Grid**, Kegel's older desktop software, captured as a picture of its own
 * table: ten columns and NO mics or tank at all.
 *     `1 2L 2R 3 18 111 0.0 5.1 5.1 5550`
 * The oil per board is not missing so much as implied: T.OIL over CROSSED is
 * what it was, and the sheet prints both.
 */
const ROW_GRID = new RegExp(
  [
    /^(\d{1,2})\s+/,                     // row number
    /(\d{1,2}\s*[LlRr])\s+/,             // Start board
    /(\d{1,2}\s*[LlRr])\s+/,             // Stop board
    /(\d{1,3})\s+/,                      // Loads
    /(\d{1,3})\s+/,                      // Speed
    /(\d{1,4})\s+/,                      // Crossed
    /(\d{1,2}(?:\.\d+)?)\s+/,            // Start ft
    /(\d{1,2}(?:\.\d+)?)\s+/,            // End ft
    /(-?\d{1,2}(?:\.\d+)?)\s+/,          // Feet travelled
    /(\d{1,6})$/,                        // T.Oil
  ].map((r) => r.source).join("")
);

/** The columns a row yields, whichever layout it was printed in. */
interface RowFields {
  index: string;
  startBoard: string;
  stopBoard: string;
  loads: string;
  mics: string;
  speed: string;
  buffer: string;
  tank: string;
  startFt: string;
  endFt: string;
  /** Absent on the arrow layout, which does not print it. */
  crossed?: string;
  toil: string;
}

function matchRow(line: string): RowFields | null {
  const crossed = ROW_CROSSED.exec(line);
  if (crossed) {
    const [, index, startBoard, stopBoard, loads, mics, speed, buffer, tank, crossings, startFt, endFt, , toil] = crossed;
    return { index, startBoard, stopBoard, loads, mics, speed, buffer, tank, startFt, endFt, crossed: crossings, toil };
  }
  const arrow = ROW_ARROW.exec(line);
  if (arrow) {
    const [, index, startBoard, stopBoard, loads, mics, speed, buffer, tank, startFt, endFt, toil] = arrow;
    return { index, startBoard, stopBoard, loads, mics, speed, buffer, tank, startFt, endFt, toil };
  }
  const grid = ROW_GRID.exec(line);
  if (grid) {
    const [, index, startBoard, stopBoard, loads, speed, crossed, startFt, endFt, , toil] = grid;
    // The oil per board, recovered: a pass laid T.OIL over CROSSED board
    // crossings. A pass that crossed nothing laid nothing, and says so.
    const crossings = Number(crossed);
    const mics = crossings > 0 ? String(Number(toil) / crossings) : "0";
    return {
      index, startBoard, stopBoard, loads, mics, speed,
      buffer: "0", tank: "", startFt, endFt, crossed, toil,
    };
  }
  return null;
}

/** Rows sit on the same line when their baselines are within this many units. */
const ROW_TOLERANCE = 2.5;

/** Group positioned text into lines, top of the page first, and read each one
 *  left to right. A table row arrives as a dozen separate runs, and only the
 *  positions say which dozen belong together. */
export function sheetLines(items: readonly SheetTextItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Array<{ y: number; parts: SheetTextItem[] }> = [];
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - item.y) <= ROW_TOLERANCE) line.parts.push(item);
    else lines.push({ y: item.y, parts: [item] });
  }
  return lines.map((l) =>
    [...l.parts].sort((a, b) => a.x - b.x).map((p) => p.text.trim()).join(" ").replace(/\s+/g, " ").trim()
  );
}

/** A labelled figure from the header block, e.g. "Forward Oil Total 15.41 mL". */
function statedNumber(lines: readonly string[], label: RegExp): number | undefined {
  for (const line of lines) {
    const at = line.search(label);
    if (at < 0) continue;
    const after = line.slice(at).replace(label, "");
    const m = /(-?\d+(?:\.\d+)?)/.exec(after);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function parseSheetLines(lines: readonly string[]): ParsedSheet {
  const passes: OilPass[] = [];
  const rowChecks: SheetCheck[] = [];

  for (const line of lines) {
    const row = matchRow(line);
    if (!row) continue;
    const left = parseSheetBoard(row.startBoard);
    const right = parseSheetBoard(row.stopBoard);
    if (left == null || right == null) continue;

    const start = Number(row.startFt);
    const end = Number(row.endFt);
    if (start === end) continue;

    const pass: OilPass = {
      // The machine only ever runs away from the foul line on a forward pass and
      // back toward it on a reverse one, so the row says which it is and the
      // parser never has to guess which table it was reading.
      direction: end > start ? "forward" : "reverse",
      left_board: Math.min(left, right),
      right_board: Math.max(left, right),
      loads: Number(row.loads),
      microliters: Number(row.mics),
      start_distance: start,
      end_distance: end,
      speed: Number(row.speed),
      buffer: Number(row.buffer),
      tank: row.tank.toUpperCase(),
    };
    // A misread board is the commonest way a scan goes wrong, and CROSSED says
    // how wide the pass really was: crossings over loads is the board count.
    // The correction is only taken when T.OIL then agrees, so it is confirmed by
    // a third column rather than assumed. Mercury 4940 needed exactly this: OCR
    // read a stop board of 7R as 8R, one board narrow and 90 microlitres light.
    const crossings = row.crossed != null ? Number(row.crossed) : null;
    if (crossings != null && pass.loads > 0 && crossings % pass.loads === 0) {
      const wanted = crossings / pass.loads;
      const read = pass.right_board - pass.left_board + 1;
      const toilStated = Number(row.toil.replace(/,/g, ""));
      if (wanted !== read && wanted >= 1) {
        const corrected = pass.left_board + wanted - 1;
        if (corrected <= LANE_BOARDS && pass.loads * wanted * pass.microliters === toilStated) {
          pass.right_board = corrected;
        }
      }
    }

    passes.push(pass);

    const boards = pass.right_board - pass.left_board + 1;
    // CROSSED is only on the older layout. Where it is printed it is checked;
    // where it is not, T.OIL still pins the same three numbers together.
    if (row.crossed != null) {
      rowChecks.push({
        label: `Row ${row.index} crossings`,
        stated: Number(row.crossed),
        derived: pass.loads * boards,
        ok: Number(row.crossed) === pass.loads * boards,
      });
    }
    const toil = Number(row.toil.replace(/,/g, ""));
    rowChecks.push({
      label: `Row ${row.index} oil`,
      stated: toil,
      derived: pass.loads * boards * pass.microliters,
      ok: toil === pass.loads * boards * pass.microliters,
    });
  }

  if (passes.length === 0) return { passes: [], checks: [], verified: false };

  const stats = oilStats(passes);
  const checks: SheetCheck[] = [];
  const compare = (label: string, stated: number | undefined, derived: number, tolerance: number) => {
    if (stated == null) return;
    checks.push({ label, stated, derived, ok: Math.abs(stated - derived) <= tolerance });
  };

  // Both sheets label the same four numbers differently. The colon is what
  // keeps the short labels honest: "FORWARD:" is the total, "FORWARD LOADS
  // DATA" is a heading, and "Reverse Brush Drop:" is neither.
  compare("Pattern distance", statedNumber(lines, HEADER.distance), stats.length, 0.05);
  compare("Forward oil", statedNumber(lines, HEADER.forward), stats.forwardMl, 0.005);
  compare("Reverse oil", statedNumber(lines, HEADER.reverse), stats.reverseMl, 0.005);
  compare("Total volume", statedNumber(lines, HEADER.volume), stats.volumeMl, 0.005);

  // The printed track zone ratios are deliberately NOT checked. They sit in a
  // footer table whose labels and values are on different lines, so matching a
  // ratio to its zone by text position is guesswork, and a check that misreads
  // is worse than no check: it blocks a sheet that parsed perfectly. The row
  // checksums already verify every number that feeds them, twice per row.

  const all = [...rowChecks, ...checks];
  return {
    name: sheetTitle(lines),
    passes,
    checks: all,
    verified: all.length > 0 && all.every((c) => c.ok),
  };
}

export function parseSheetItems(items: readonly SheetTextItem[]): ParsedSheet {
  return parseSheetLines(sheetLines(items));
}

const LABEL_WORDS =
  /oil|tank|volume|forward|reverse|conditioner|buffer|ratio|cleaner|start|stop|loads|mics|speed|crossed|distance|pattern|^\d/i;

/** The sheet's title: the first line at the top that is not part of the header
 *  block of labels. A wrong guess costs nothing, the field stays editable. */
function sheetTitle(lines: readonly string[]): string | undefined {
  for (const line of lines.slice(0, 6)) {
    const text = line.trim();
    if (text.length < 4 || text.length > 80) continue;
    if (LABEL_WORDS.test(text)) continue;
    return text;
  }
  return undefined;
}
