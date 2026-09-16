import type { OilPass } from "../types/bowling";
import { oilStats, parseSheetBoard } from "./oilPattern";

/**
 * Reading a pattern sheet (ADR-101).
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

/** One row of a load table, in the sheet's own column order. */
const ROW = new RegExp(
  [
    /^(\d{1,2})\s+/,                     // row number
    /(\d{1,2}\s*[LRlr])\s+/,             // START board
    /(\d{1,2}\s*[LRlr])\s+/,             // STOP board
    /(\d{1,3})\s+/,                      // LOADS
    /(\d{1,4})\s+/,                      // MICS
    /(\d{1,3})\s+/,                      // SPEED
    /(\d{1,2})\s+/,                      // BUFFER
    /([A-Za-z])\s+/,                     // TANK
    /(\d{1,4})\s+/,                      // CROSSED
    /(\d{1,2}(?:\.\d+)?)\s+/,            // START ft
    /(\d{1,2}(?:\.\d+)?)\s+/,            // END ft
    /(-?\d{1,2}(?:\.\d+)?)\s+/,          // FEET travelled
    /(\d{1,6})$/,                        // T.OIL
  ].map((r) => r.source).join("")
);

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
    const m = ROW.exec(line);
    if (!m) continue;
    const [, index, startBoard, stopBoard, loads, mics, speed, buffer, tank, crossed, startFt, endFt, , toil] = m;
    const left = parseSheetBoard(startBoard);
    const right = parseSheetBoard(stopBoard);
    if (left == null || right == null) continue;

    const start = Number(startFt);
    const end = Number(endFt);
    if (start === end) continue;

    const pass: OilPass = {
      // The machine only ever runs away from the foul line on a forward pass and
      // back toward it on a reverse one, so the row says which it is and the
      // parser never has to guess which table it was reading.
      direction: end > start ? "forward" : "reverse",
      left_board: Math.min(left, right),
      right_board: Math.max(left, right),
      loads: Number(loads),
      microliters: Number(mics),
      start_distance: start,
      end_distance: end,
      speed: Number(speed),
      buffer: Number(buffer),
      tank: tank.toUpperCase(),
    };
    passes.push(pass);

    // The row's own two checksums.
    const boards = pass.right_board - pass.left_board + 1;
    rowChecks.push({
      label: `Row ${index} crossings`,
      stated: Number(crossed),
      derived: pass.loads * boards,
      ok: Number(crossed) === pass.loads * boards,
    });
    rowChecks.push({
      label: `Row ${index} oil`,
      stated: Number(toil),
      derived: pass.loads * boards * pass.microliters,
      ok: Number(toil) === pass.loads * boards * pass.microliters,
    });
  }

  if (passes.length === 0) return { passes: [], checks: [], verified: false };

  const stats = oilStats(passes);
  const checks: SheetCheck[] = [];
  const compare = (label: string, stated: number | undefined, derived: number, tolerance: number) => {
    if (stated == null) return;
    checks.push({ label, stated, derived, ok: Math.abs(stated - derived) <= tolerance });
  };

  compare("Pattern distance", statedNumber(lines, /Oil Pattern Distance/i), stats.length, 0.05);
  compare("Forward oil", statedNumber(lines, /Forward Oil Total/i), stats.forwardMl, 0.005);
  compare("Reverse oil", statedNumber(lines, /Reverse Oil Total/i), stats.reverseMl, 0.005);
  compare("Total volume", statedNumber(lines, /Volume Oil Total/i), stats.volumeMl, 0.005);

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
