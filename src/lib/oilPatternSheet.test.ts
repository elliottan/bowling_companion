import { describe, expect, it } from "vitest";
import { parseSheetItems, parseSheetLines, sheetLines, type SheetTextItem } from "./oilPatternSheet";
import { oilStats } from "./oilPattern";

/**
 * Chromium 6742 as its tables print, row for row. The parser is fed these as
 * lines; `sheetLines` is tested separately on positioned runs, because the two
 * jobs fail differently: one on layout, one on columns.
 */
const HEADER = [
  "Kegel Element Challenge Chromium 6742",
  "Oil Pattern Distance 42 Reverse Brush Drop 39 Oil Per Board Multi ul",
  "Forward Oil Total 15.41 mL Reverse Oil Total 10.15 mL Volume Oil Total 25.56 mL",
  "Tank Configuration N/A Tank A Conditioner Terrain Tank B Conditioner Current",
];

const FORWARD = [
  "1 2L 2R 3 50 18 4 A 111 0.0 5.1 5.1 5550",
  "2 7L 7R 2 50 18 4 A 54 5.1 10.2 5.1 2700",
  "3 9L 9R 2 45 18 3 A 46 10.2 15.3 5.1 2070",
  "4 10L 10R 2 45 18 3 A 42 15.3 20.4 5.1 1890",
  "5 10L 10R 2 40 18 3 A 42 20.4 25.5 5.1 1680",
  "6 11L 11R 2 40 18 3 A 38 25.5 30.6 5.1 1520",
  "7 2L 2R 0 40 22 3 A 0 30.6 35.0 4.4 0",
  "8 2L 2R 0 40 26 2 A 0 35.0 42.0 7.0 0",
];

const REVERSE = [
  "1 2L 2R 0 50 30 3 B 0 42.0 39.0 -3.0 0",
  "2 2L 2R 0 50 22 3 B 0 39.0 28.0 -11.0 0",
  "3 13L 13R 3 50 18 3 B 45 28.0 20.4 -7.6 2250",
  "4 12L 12R 3 50 18 3 B 51 20.4 12.8 -7.6 2550",
  "5 11L 11R 3 50 14 3 B 57 12.8 6.9 -5.9 2850",
  "6 8L 8R 2 50 14 4 B 50 6.9 3.0 -3.9 2500",
  "7 2L 2R 0 50 14 4 B 0 3.0 0.0 -3.0 0",
];

const SHEET = [...HEADER, ...FORWARD, ...REVERSE];

describe("parseSheetLines", () => {
  it("reads every row of both tables", () => {
    const parsed = parseSheetLines(SHEET);
    expect(parsed.passes).toHaveLength(15);
    expect(parsed.passes.filter((p) => p.direction === "forward")).toHaveLength(8);
    expect(parsed.passes.filter((p) => p.direction === "reverse")).toHaveLength(7);
  });

  it("takes direction from the travel, not from which table the row was in", () => {
    const parsed = parseSheetLines(SHEET);
    // Reverse row 1 runs 42.0 back to 39.0 and is the only pass reaching 42.
    const back = parsed.passes.find((p) => p.start_distance === 42);
    expect(back?.direction).toBe("reverse");
    expect(back?.end_distance).toBe(39);
  });

  it("converts the sheet's board notation", () => {
    const [first] = parseSheetLines(SHEET).passes;
    expect(first.left_board).toBe(2);   // 2L
    expect(first.right_board).toBe(38); // 2R
  });

  it("carries speed, buffer and tank through", () => {
    const [first] = parseSheetLines(SHEET).passes;
    expect(first).toMatchObject({ speed: 18, buffer: 4, tank: "A" });
  });

  it("derives the totals the sheet prints", () => {
    const stats = oilStats(parseSheetLines(SHEET).passes);
    expect(stats.forwardMl).toBeCloseTo(15.41, 2);
    expect(stats.reverseMl).toBeCloseTo(10.15, 2);
    expect(stats.volumeMl).toBeCloseTo(25.56, 2);
    expect(stats.length).toBe(42);
  });

  it("verifies against the sheet's own checksums, two per row plus the totals", () => {
    const parsed = parseSheetLines(SHEET);
    expect(parsed.verified).toBe(true);
    expect(parsed.checks.filter((c) => c.label.startsWith("Row "))).toHaveLength(30);
    expect(parsed.checks.map((c) => c.label)).toContain("Pattern distance");
    expect(parsed.checks.map((c) => c.label)).toContain("Total volume");
    expect(parsed.checks.every((c) => c.ok)).toBe(true);
  });

  it("offers the title as a prefill", () => {
    expect(parseSheetLines(SHEET).name).toBe("Kegel Element Challenge Chromium 6742");
  });

  // The point of the checksums: a misread column has to surface as arithmetic
  // that does not add up, never as a slightly wrong pattern that saves quietly.
  it("refuses to verify when a row's crossings do not match its boards", () => {
    const bent = SHEET.map((l) => (l.startsWith("1 2L 2R 3 50") ? l.replace(" 111 ", " 99 ") : l));
    const parsed = parseSheetLines(bent);
    expect(parsed.passes).toHaveLength(15); // it still reads
    expect(parsed.verified).toBe(false);    // and still refuses
    const failed = parsed.checks.find((c) => !c.ok)!;
    expect(failed.label).toBe("Row 1 crossings");
    expect(failed).toMatchObject({ stated: 99, derived: 111 });
  });

  it("refuses to verify when the rows do not add up to the printed volume", () => {
    const bent = SHEET.map((l) => l.replace("Volume Oil Total 25.56", "Volume Oil Total 30.00"));
    const parsed = parseSheetLines(bent);
    expect(parsed.verified).toBe(false);
    expect(parsed.checks.find((c) => c.label === "Total volume")).toMatchObject({
      stated: 30, ok: false,
    });
  });

  it("finds nothing in a document that is not a load table", () => {
    const parsed = parseSheetLines(["A shopping list", "milk 2", "bread 1"]);
    expect(parsed.passes).toEqual([]);
    expect(parsed.verified).toBe(false);
  });
});

describe("sheetLines", () => {
  // pdf.js reports each cell as its own run with a position; only the positions
  // say which runs are one row. y increases UP the page.
  const cells = (y: number, texts: string[]): SheetTextItem[] =>
    texts.map((text, i) => ({ text, x: i * 20, y }));

  it("groups runs into lines, top of the page first", () => {
    const items = [
      ...cells(700, ["Kegel", "Chromium", "6742"]),
      ...cells(600, ["1", "2L", "2R"]),
      ...cells(580, ["2", "7L", "7R"]),
    ];
    expect(sheetLines(items)).toEqual(["Kegel Chromium 6742", "1 2L 2R", "2 7L 7R"]);
  });

  it("reads a row left to right however the runs arrive", () => {
    const scrambled: SheetTextItem[] = [
      { text: "2R", x: 60, y: 600 },
      { text: "1", x: 10, y: 600 },
      { text: "2L", x: 35, y: 600 },
    ];
    expect(sheetLines(scrambled)).toEqual(["1 2L 2R"]);
  });

  it("keeps runs on one line when their baselines differ by a hair", () => {
    const items: SheetTextItem[] = [
      { text: "1", x: 10, y: 600 },
      { text: "2L", x: 35, y: 601.4 }, // same row, sub-point drift
      { text: "2R", x: 60, y: 599.2 },
    ];
    expect(sheetLines(items)).toEqual(["1 2L 2R"]);
  });

  it("parses a sheet end to end from positioned runs", () => {
    const items = SHEET.flatMap((line, row) =>
      line.split(" ").map((text, i) => ({ text, x: i * 18, y: 800 - row * 12 }))
    );
    const parsed = parseSheetItems(items);
    expect(parsed.verified).toBe(true);
    expect(parsed.passes).toHaveLength(15);
  });
});
