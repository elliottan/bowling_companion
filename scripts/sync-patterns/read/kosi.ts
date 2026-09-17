/**
 * Reading a Kegel KOSI program file, the machine's own copy of a pattern.
 *
 * A sheet PDF is what a bowler is handed; a KOSI file is what the lane machine
 * is loaded with, and it is the same pattern with the pictures taken off. It is
 * a flat column dump with no labels at all, which sounds like the worst case and
 * is in fact the best one: there is no layout to drift, no glyph to misread, and
 * the file states its boards TWICE, once as numbers and once in the sheet's own
 * L/R notation. Those two encodings disagreeing is a misread caught on the spot.
 *
 * So this is an ADR-044 parser reading: it reads fixed positions and fails
 * loudly. Nothing here decides whether the reading is good. That is `promote.ts`
 * (ADR-104), which re-derives the totals with no reader in the loop.
 *
 * The shape of a file, which is a header then columns of equal length:
 *
 *   1758                 program number
 *   High Street V2       name
 *   1 1 0 720 1 56 57 50 0 44 35      header, then the first column begins
 *   <forward left> <forward right> <forward loads> <forward speed>
 *   <reverse left> <reverse right> <reverse loads> <reverse speed>
 *   <forward end feet> <forward left L> <forward right R>
 *   <reverse left L> <reverse right R> <reverse end feet>
 *
 * Every column is padded out to a fixed height with blank lines, so the columns
 * are read as runs of non-empty lines rather than by counting rows.
 */
import { basename } from "node:path";

import type { SheetCheck } from "./sheet-text.js";
import type { PatternCandidate } from "../types.js";
import type { OilPass } from "../../../src/types/bowling.js";
import { oilStats, headlineRatio, parseSheetBoard } from "../../../src/lib/oilPattern.js";
import { normalizePatternName, slug } from "./read-pdf.js";

/**
 * Where the header keeps the three numbers that are not in a column.
 *
 * Fixed positions, and deliberately so: the alternative is guessing which of
 * eleven bare integers is the distance. Both the distance and the reverse brush
 * drop are checked against the tables below, so a file that numbers its header
 * differently fails here instead of being filed wrong.
 */
const HEADER_AT = { microliters: 7, distance: 9, reverseDrop: 10 } as const;
const HEADER_LENGTH = 11;
/** Header, fourteen columns, footer. */
const RUNS = 16;

export class KosiFormatError extends Error {}

/** Contiguous runs of non-empty lines, which is what a column is. */
function runs(text: string): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line) {
      current.push(line);
    } else if (current.length > 0) {
      out.push(current);
      current = [];
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

const numbers = (column: readonly string[], what: string): number[] =>
  column.map((value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new KosiFormatError(`${what}: ${value} is not a number`);
    return n;
  });

/**
 * A file that is not one of these, or is one with its columns rearranged, is
 * not read on a best effort. It throws, and the run says which file.
 */
export interface KosiProgram {
  program: string;
  name: string;
  microliters: number;
  distance: number;
  reverseDrop: number;
  passes: OilPass[];
  checks: SheetCheck[];
}

export function parseKosi(text: string): KosiProgram {
  const blocks = runs(text);
  if (blocks.length !== RUNS) {
    throw new KosiFormatError(`expected ${RUNS} blocks of values, found ${blocks.length}`);
  }

  const [title, headerAndFirst, ...rest] = blocks;
  if (title.length !== 2) throw new KosiFormatError("expected a program number and a name");
  const [program, rawName] = title;

  // Every column is one pass per row, and nothing separates the header from the
  // first of them, so the columns that follow say where the header ends.
  const columns = rest.slice(0, 13);
  const passCount = columns[0].length;
  if (columns.some((c) => c.length !== passCount)) {
    throw new KosiFormatError(
      `columns disagree on how many passes there are: ${columns.map((c) => c.length).join(", ")}`
    );
  }
  if (headerAndFirst.length !== HEADER_LENGTH + passCount) {
    throw new KosiFormatError(
      `header is ${headerAndFirst.length - passCount} values, expected ${HEADER_LENGTH}`
    );
  }

  const header = numbers(headerAndFirst.slice(0, HEADER_LENGTH), "header");
  const [
    forwardRight, forwardLoads, forwardSpeed,
    reverseLeft, reverseRight, reverseLoads, reverseSpeed,
    forwardEnd, forwardLeftSheet, forwardRightSheet,
    reverseLeftSheet, reverseRightSheet, reverseEnd,
  ] = columns;
  const forwardLeft = headerAndFirst.slice(HEADER_LENGTH);

  const microliters = header[HEADER_AT.microliters];
  const distance = header[HEADER_AT.distance];
  const reverseDrop = header[HEADER_AT.reverseDrop];

  const checks: SheetCheck[] = [];
  const check = (label: string, stated: number, derived: number, tolerance = 0.001) =>
    checks.push({ label, stated, derived, ok: Math.abs(stated - derived) <= tolerance });

  /**
   * The file's own checksum, and the reason a KOSI read can be trusted at all:
   * each board is written once as a number and once as the sheet writes it. A
   * column read out of order shows up here rather than on the lane.
   */
  const boards = (
    plain: readonly string[],
    sheet: readonly string[],
    what: string
  ): number[] =>
    numbers(plain, what).map((board, i) => {
      const fromSheet = parseSheetBoard(sheet[i]);
      if (fromSheet == null) throw new KosiFormatError(`${what} row ${i + 1}: ${sheet[i]} is not a board`);
      check(`${what} row ${i + 1}`, fromSheet, board);
      return board;
    });

  const fwdLeft = boards(forwardLeft, forwardLeftSheet, "forward start board");
  const fwdRight = boards(forwardRight, forwardRightSheet, "forward stop board");
  const revLeft = boards(reverseLeft, reverseLeftSheet, "reverse start board");
  const revRight = boards(reverseRight, reverseRightSheet, "reverse stop board");

  const fwdLoads = numbers(forwardLoads, "forward loads");
  const revLoads = numbers(reverseLoads, "reverse loads");
  const fwdSpeed = numbers(forwardSpeed, "forward speed");
  const revSpeed = numbers(reverseSpeed, "reverse speed");
  const fwdEnd = numbers(forwardEnd, "forward distance");
  const revEnd = numbers(reverseEnd, "reverse distance");

  /**
   * A column holds where each pass ENDS. A pass starts where the one before it
   * stopped, forward from the foul line and reverse from the far end of the
   * pattern, which is exactly how a sheet prints the pair of tables.
   */
  const chain = (ends: readonly number[], from: number): Array<[number, number]> =>
    ends.map((end, i) => [i === 0 ? from : ends[i - 1], end]);

  const passes: OilPass[] = [
    ...chain(fwdEnd, 0).map(([start, end], i): OilPass => ({
      direction: "forward",
      left_board: fwdLeft[i],
      right_board: fwdRight[i],
      loads: fwdLoads[i],
      microliters,
      start_distance: start,
      end_distance: end,
      speed: fwdSpeed[i],
      tank: "A",
    })),
    ...chain(revEnd, distance).map(([start, end], i): OilPass => ({
      direction: "reverse",
      left_board: revLeft[i],
      right_board: revRight[i],
      loads: revLoads[i],
      microliters,
      start_distance: start,
      end_distance: end,
      speed: revSpeed[i],
      tank: "B",
    })),
  ];

  // The header's distance against the tables, which is what pins the header
  // positions above to something other than a guess.
  check("oil pattern distance", distance, Math.max(...fwdEnd));
  // The reverse brush drop is where the reverse table starts laying oil: the
  // machine travels back from the end of the pattern with the head up.
  const firstReverseLoad = revLoads.findIndex((l) => l > 0);
  if (firstReverseLoad > 0) {
    check("reverse brush drop", reverseDrop, revEnd[firstReverseLoad - 1], 0.05);
  }

  return {
    program,
    name: normalizePatternName(rawName),
    microliters,
    distance,
    reverseDrop,
    passes,
    checks,
  };
}

export interface KosiReading {
  candidate: PatternCandidate;
  checks: SheetCheck[];
  verified: boolean;
}

/**
 * Stage one program file.
 *
 * `volumeMl` is the total the PRINTED sheet states, passed in because the
 * program file does not carry one. It is the only check on the loads and the
 * oil per board, so a program read without it is a pattern the promote stage
 * can only check the length of.
 */
export function readKosi(
  path: string,
  text: string,
  opts: { vendor?: string; sourceUrl?: string; volumeMl?: number } = {}
): KosiReading {
  const program = parseKosi(text);
  const stats = oilStats(program.passes);
  const name = program.name || normalizePatternName(basename(path));

  const checks = [...program.checks];
  if (opts.volumeMl != null) {
    checks.push({
      label: "volume oil total",
      stated: opts.volumeMl,
      derived: stats.volumeMl,
      ok: Math.abs(opts.volumeMl - stats.volumeMl) <= 0.005,
    });
  }

  return {
    candidate: {
      id: slug(name),
      name,
      vendor: opts.vendor ?? "kegel",
      sourceUrl: opts.sourceUrl,
      reader: "kosi",
      passes: program.passes,
      stated: { distance: program.distance, volumeMl: opts.volumeMl },
      note:
        `${basename(path)} · program ${program.program} · ${stats.length} ft · ` +
        `${program.microliters} ul per board · ${headlineRatio(program.passes)?.toFixed(2) ?? "?"}:1`,
    },
    checks,
    verified: checks.every((c) => c.ok),
  };
}
