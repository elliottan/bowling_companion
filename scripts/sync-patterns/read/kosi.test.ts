import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { KosiFormatError, parseKosi, readKosi } from "./kosi.js";
import { checkCandidate } from "../promote.js";
import { oilStats, headlineRatio } from "../../../src/lib/oilPattern.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Kegel's real High Street V2 program, kept in the repo so the pattern in the
 * catalog can always be re-derived from the file it came from rather than
 * trusted because it is already there.
 */
const PATH = resolve(HERE, "../data/programs/high-street-v2.kosi");
const HIGH_STREET_V2 = readFileSync(PATH, "utf8");

describe("parseKosi", () => {
  it("reads the header the tables then confirm", () => {
    const program = parseKosi(HIGH_STREET_V2);
    expect(program.program).toBe("1758");
    expect(program.name).toBe("High Street V2");
    expect(program.distance).toBe(44);
    expect(program.reverseDrop).toBe(35);
    expect(program.microliters).toBe(50);
  });

  it("reads six passes each way", () => {
    const { passes } = parseKosi(HIGH_STREET_V2);
    expect(passes.filter((p) => p.direction === "forward")).toHaveLength(6);
    expect(passes.filter((p) => p.direction === "reverse")).toHaveLength(6);
  });

  it("chains each pass onto the one before it, from the foul line and back from the end", () => {
    const { passes } = parseKosi(HIGH_STREET_V2);
    const forward = passes.filter((p) => p.direction === "forward");
    const reverse = passes.filter((p) => p.direction === "reverse");

    expect(forward[0].start_distance).toBe(0);
    expect(forward.at(-1)?.end_distance).toBe(44);
    forward.slice(1).forEach((p, i) => expect(p.start_distance).toBe(forward[i].end_distance));

    // The reverse table runs the other way, so its ends sit before its starts.
    expect(reverse[0].start_distance).toBe(44);
    expect(reverse.at(-1)?.end_distance).toBe(0);
    reverse.forEach((p) => expect(p.end_distance).toBeLessThan(p.start_distance));
  });

  it("converts the sheet's L/R boards to absolute ones", () => {
    const { passes } = parseKosi(HIGH_STREET_V2);
    // 2L to 2R is the full width, 9L to 9R the second forward pass.
    expect(passes[0]).toMatchObject({ left_board: 2, right_board: 38, loads: 2 });
    expect(passes[1]).toMatchObject({ left_board: 9, right_board: 31, loads: 3 });
  });

  it("carries the buffer-only passes that set the pattern distance", () => {
    const { passes } = parseKosi(HIGH_STREET_V2);
    const dry = passes.filter((p) => p.loads === 0);
    // Two forward out to 44, one back to the brush drop and one out to the foul line.
    expect(dry).toHaveLength(4);
    expect(oilStats(passes).length).toBe(44);
  });

  it("agrees with itself on every board, twice per row", () => {
    const { checks } = parseKosi(HIGH_STREET_V2);
    const boards = checks.filter((c) => c.label.includes("board"));
    expect(boards).toHaveLength(24);
    expect(boards.every((c) => c.ok)).toBe(true);
  });

  it("comes to the 25 mL the printed sheet states", () => {
    const stats = oilStats(parseKosi(HIGH_STREET_V2).passes);
    expect(stats.volumeMl).toBeCloseTo(25, 3);
    expect(stats.forwardMl).toBeCloseTo(14.75, 3);
    expect(stats.reverseMl).toBeCloseTo(10.25, 3);
    // A house shot, and it should read as one.
    expect(headlineRatio(parseKosi(HIGH_STREET_V2).passes)).toBeGreaterThan(8);
  });

  it("fails loudly rather than reading a file it does not understand", () => {
    expect(() => parseKosi("1758\nHigh Street V2\n")).toThrow(KosiFormatError);
    // A column that lost a row is a misread, not a pattern with fewer passes.
    const short = HIGH_STREET_V2.replace("\n38\n31\n30\n28\n38\n38\n", "\n38\n31\n30\n28\n38\n");
    expect(() => parseKosi(short)).toThrow(KosiFormatError);
  });

  it("catches a column read out of order, because the boards are written twice", () => {
    // Swap the second and third forward start boards in the numeric column only.
    const swapped = HIGH_STREET_V2.replace("\n2\n9\n10\n12\n2\n2\n", "\n2\n10\n9\n12\n2\n2\n");
    const failed = parseKosi(swapped).checks.filter((c) => !c.ok);
    expect(failed).toHaveLength(2);
    expect(failed[0].label).toContain("forward start board");
  });
});

describe("readKosi", () => {
  it("stages a candidate the promote gate accepts", () => {
    const { candidate, verified, checks } = readKosi(PATH, HIGH_STREET_V2, { volumeMl: 25 });
    expect(candidate.id).toBe("high-street-v2");
    expect(candidate.reader).toBe("kosi");
    expect(candidate.stated).toEqual({ distance: 44, volumeMl: 25 });
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(verified).toBe(true);
    expect(checkCandidate(candidate)).toEqual([]);
  });

  it("is only checked on its length when no printed volume is given", () => {
    const { candidate } = readKosi(PATH, HIGH_STREET_V2);
    expect(candidate.stated.volumeMl).toBeUndefined();
    expect(checkCandidate(candidate)).toEqual([]);
  });

  it("rejects a volume the tables do not come to", () => {
    const { verified, checks } = readKosi(PATH, HIGH_STREET_V2, { volumeMl: 24 });
    expect(verified).toBe(false);
    expect(checks.find((c) => !c.ok)?.label).toBe("volume oil total");
  });
});
