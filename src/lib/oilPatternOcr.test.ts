import { describe, expect, it } from "vitest";
import { boardFromCrossings, repairDistance, repairOcrLine, repairOcrLines } from "./oilPatternOcr";
import { parseSheetLines } from "./oilPatternSheet";
import { oilStats, headlineRatio } from "./oilPattern";

/**
 * Verbatim tesseract output for the two table images of Kegel's Chromium 6742,
 * at 6x with the page binarised. Not an imagined failure: this is what the real
 * sheet actually produced, dropped decimals, spurious digits and all.
 */
const OCR_FORWARD = [
  "AR  LA 5 BB BBR A R 5AR BR B 71L",
  "1 2L 2R 3 50 18 4 A 111 0.0 5.1 5.1 5550",
  "2 71L 71R 2 50 18 4 A 54 5.1 10.2 5.14 2700",
  "3 9L 09R 2 45 18 3 A 46 10.2 153 5.1 2070",
  "4 10L 10R 2 45 18 3 A 42 153 204 5.1 1890",
  "5 10L 10R 2 40 18 3 A 42 20.4 255 5.1 1680",
  "6 11L 11R 2 40 18 3 A 38 25.5 30.6 5.1 1520",
  "7 2L 2R 0 40 22 3 A 0 30.6 350 44 0",
  "8 2L 2R 0 40 26 2 A 0 35.0 420 7.0 0",
];

const OCR_REVERSE = [
  "AR  LA 5 BB BBR A R 5AR BR B 71L",
  "1 2L 2R 0 50 30 3 B 0 42.0 39.0 -3.0 0",
  "2 2L 2R 0 50 22 3 B 0 39.0 28.0 -11.0 0",
  "3 13L 13R 3 50 18 3 B 45 28.0 204 -7.6 2250",
  "4 12L 12R 3 50 18 3 B 51 204 128 -7.6 2550",
  "5 11L 11R 3 50 14 3 B 57 128 6.9 -5.9 2850",
  "6 8L 8R 2 50 14 4 B 50 69 3.0 -3.9 2500",
  "7 2L 2R 0 50 14 4 B 0 3.0 0.0 -3.0 0",
];

// The header comes from the PDF's text layer, not from OCR, so it is reliable
// and it is what the OCR'd rows are checked against.
const HEADER = [
  "Kegel Element Challenge Chromium 6742",
  "Oil Pattern Distance 42 Reverse Brush Drop 39 Oil Per Board Multi ul",
  "Forward Oil Total 15.41 mL Reverse Oil Total 10.15 mL Volume Oil Total 25.56 mL",
];

describe("repairDistance", () => {
  it("puts back the decimal point OCR drops", () => {
    expect(repairDistance("153")).toBe("15.3");
    expect(repairDistance("420")).toBe("42.0");
    expect(repairDistance("69")).toBe("6.9");
    expect(repairDistance("0")).toBe("0.0");
  });

  it("leaves a distance that kept its point", () => {
    expect(repairDistance("10.2")).toBe("10.2");
    expect(repairDistance("-11.0")).toBe("-11.0");
  });

  it("keeps the sign on a reverse pass", () => {
    expect(repairDistance("-59")).toBe("-5.9");
  });

  it("leaves anything that is not a number alone", () => {
    expect(repairDistance("A")).toBe("A");
  });
});

describe("boardFromCrossings", () => {
  it("names the board a pass ran from", () => {
    expect(boardFromCrossings(111, 3)).toBe(2);  // 2L to 2R, 37 boards
    expect(boardFromCrossings(54, 2)).toBe(7);   // 7L to 7R, 27 boards
    expect(boardFromCrossings(46, 2)).toBe(9);
    expect(boardFromCrossings(45, 3)).toBe(13);
  });

  it("says nothing rather than guessing when the arithmetic does not work out", () => {
    expect(boardFromCrossings(0, 0)).toBeNull();
    expect(boardFromCrossings(50, 3)).toBeNull(); // not a whole number of boards
    expect(boardFromCrossings(4, 2)).toBeNull();  // no such pass
  });
});

describe("repairOcrLine", () => {
  it("recovers a board that OCR gave an extra digit", () => {
    const line = repairOcrLine("2 71L 71R 2 50 18 4 A 54 5.1 10.2 5.14 2700")!;
    expect(line).toContain("7L 7R");
  });

  it("leaves a board OCR read correctly, even an odd looking one", () => {
    // "09R" is board 9 from the right, which parses, so it is not touched.
    expect(repairOcrLine("3 9L 09R 2 45 18 3 A 46 10.2 153 5.1 2070")).toContain("9L 09R");
  });

  it("is not a table row, so says so", () => {
    expect(repairOcrLine("AR  LA 5 BB BBR A R 5AR BR B 71L")).toBeNull();
    expect(repairOcrLine("Forward Oil Total 15.41 mL")).toBeNull();
  });
});

// The whole point. OCR output that is visibly wrong in five places still has to
// come out as the pattern the sheet prints, and prove it against the header.
describe("Chromium 6742, read by OCR and repaired", () => {
  const lines = [...HEADER, ...repairOcrLines([...OCR_FORWARD, ...OCR_REVERSE])];
  const parsed = parseSheetLines(lines);

  it("reads all fifteen passes", () => {
    expect(parsed.passes).toHaveLength(15);
    expect(parsed.passes.filter((p) => p.direction === "forward")).toHaveLength(8);
    expect(parsed.passes.filter((p) => p.direction === "reverse")).toHaveLength(7);
  });

  it("comes to the totals the sheet prints, and says so", () => {
    const stats = oilStats(parsed.passes);
    expect(stats.forwardMl).toBeCloseTo(15.41, 2);
    expect(stats.reverseMl).toBeCloseTo(10.15, 2);
    expect(stats.volumeMl).toBeCloseTo(25.56, 2);
    expect(stats.length).toBe(42);
    expect(headlineRatio(parsed.passes)).toBeCloseTo(6.71, 2);
    expect(parsed.verified).toBe(true);
  });

  it("recovers every distance whose decimal point OCR lost", () => {
    const byStart = (ft: number) => parsed.passes.find((p) => p.start_distance === ft);
    expect(byStart(15.3)).toBeDefined();  // read as "153"
    expect(byStart(20.4)).toBeDefined();  // read as "204"
    expect(byStart(35)?.end_distance).toBe(42); // read as "420"
    expect(byStart(6.9)?.end_distance).toBe(3); // read as "69"
  });

  it("recovers the pass whose board OCR mangled", () => {
    const seven = parsed.passes.find((p) => p.left_board === 7);
    expect(seven).toMatchObject({ right_board: 33, loads: 2, microliters: 50 });
  });
});

// Without the repair the same OCR is not quietly wrong, it is caught.
describe("the same OCR without repair", () => {
  const parsed = parseSheetLines([...HEADER, ...OCR_FORWARD, ...OCR_REVERSE]);

  it("loses rows and fails its checks rather than importing a wrong pattern", () => {
    expect(parsed.passes.length).toBeLessThan(15);
    expect(parsed.verified).toBe(false);
  });
});
