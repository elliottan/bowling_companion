import { describe, expect, it } from "vitest";
import { parseSheetItems, parseSheetLines, sheetLines, type SheetTextItem } from "./sheet-text.js";
import { oilStats } from "../../../src/lib/oilPattern.js";

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

// Kegel prints more than one layout and all of them are real sheets. Each is
// checked against the totals its own header prints, which is what lets a new
// layout be a regex rather than a new reader (ADR-104).
describe("Big Ben, the arrow layout", () => {
  const SHEET = [
    "BIG BEN",
    "DISTANCE: 44 FEET VOLUME: 24.7 mL",
    "RATIO: 7.33:1 FORWARD: 16.22 mL",
    "DROP BRUSH: 39 FEET REVERSE: 8.48 mL",
    "FORWARD LOADS DATA",
    "# START STOP LOADS MICS SPEED BUFF TANK DISTANCE T.OIL",
    "1 2L 2R 3 50 14 3 A - FIRE 0 → 4 5,550",
    "2 9L 9R 2 50 14 3 A - FIRE 4 → 8 2,300",
    "3 10L 10R 3 45 18 3 A - FIRE 8 → 15 2,835",
    "4 11L 11R 3 45 18 3 A - FIRE 15 → 23 2,565",
    "5 12L 12R 3 45 18 3 A - FIRE 23 → 31 2,295",
    "6 13L 13R 1 45 18 3 A - FIRE 31 → 33 675",
    "7 2L 2R 0 45 22 3 A - FIRE 33 → 39 0",
    "8 2L 2R 0 45 26 2 A - FIRE 39 → 44 0",
    "REVERSE LOADS DATA",
    "1 2L 2R 0 40 30 1 A - FIRE 39 → 36 0",
    "2 12L 12R 1 40 26 3 A - FIRE 36 → 32 680",
    "3 11L 11R 2 40 22 3 A - FIRE 32 → 26 1,520",
    "4 10L 10R 3 40 22 3 A - FIRE 26 → 17 2,520",
    "5 9L 9R 3 40 18 4 A - FIRE 17 → 9 2,760",
    "6 8L 8R 1 40 14 4 A - FIRE 9 → 7 1,000",
    "7 2L 2R 0 40 14 4 A - FIRE 7 → 0 0",
  ];

  it("reads a tank that is a name and an oil total with a comma in it", () => {
    const parsed = parseSheetLines(SHEET);
    expect(parsed.passes).toHaveLength(15);
    expect(parsed.passes[0]).toMatchObject({ tank: "A - FIRE", microliters: 50 });
  });

  it("comes to the totals the sheet prints", () => {
    const stats = oilStats(parseSheetLines(SHEET).passes);
    expect(stats.forwardMl).toBeCloseTo(16.22, 2);
    expect(stats.reverseMl).toBeCloseTo(8.48, 2);
    expect(stats.volumeMl).toBeCloseTo(24.7, 2);
    expect(stats.length).toBe(44);
  });

  it("verifies, and is not fooled by a heading that reads like a total", () => {
    const parsed = parseSheetLines(SHEET);
    // "FORWARD LOADS DATA" is a heading; only "FORWARD:" is the number.
    expect(parsed.checks.find((c) => c.label === "Forward oil")).toMatchObject({
      stated: 16.22, ok: true,
    });
    expect(parsed.verified).toBe(true);
  });
});

describe("Stonehenge, the grid layout", () => {
  // Kegel's older software, captured as a picture of its own table: no mics
  // column at all, because T.OIL over CROSSED is what it was.
  const SHEET = [
    "R - Stonehenge",
    "Oil Pattern Distance: 40 Feet Reverse Brush Drop: 40 Feet Oil Per Board: 50 uL",
    "Forward Oil Total: 15.95 mL Reverse Oil Total: 7.8 mL Volume Oil Total: 23.75 mL",
    "1 2L 2R 3 18 111 0.0 5.1 5.1 5550",
    "2 7L 7R 1 18 27 5.1 7.6 2.5 1350",
    "3 9L 9R 2 18 46 7.6 12.7 5.1 2300",
    "4 10L 10R 3 18 63 12.7 20.3 7.6 3150",
    "5 11L 11R 2 18 38 20.3 25.4 5.1 1900",
    "6 12L 12R 2 18 34 25.4 30.5 5.1 1700",
    "7 2L 2R 0 22 0 30.5 36.0 5.5 0",
    "8 2L 2R 0 30 0 36.0 40.0 4.0 0",
    "1 2L 2R 0 30 0 40.0 28.0 -12.0 0",
    "2 12L 12R 2 18 34 28.0 22.9 -5.1 1700",
    "3 11L 11R 2 18 38 22.9 17.8 -5.1 1900",
    "4 10L 10R 4 18 84 17.8 7.6 -10.2 4200",
    "5 2L 2R 0 14 0 7.6 0.0 -7.6 0",
  ];

  it("recovers the oil per board the sheet never prints", () => {
    const parsed = parseSheetLines(SHEET);
    expect(parsed.passes).toHaveLength(13);
    // 5550 over 111 crossings is 50 microlitres a board.
    expect(parsed.passes[0].microliters).toBe(50);
  });

  it("comes to the totals the sheet prints, and verifies", () => {
    const parsed = parseSheetLines(SHEET);
    const stats = oilStats(parsed.passes);
    expect(stats.forwardMl).toBeCloseTo(15.95, 2);
    expect(stats.reverseMl).toBeCloseTo(7.8, 2);
    expect(stats.volumeMl).toBeCloseTo(23.75, 2);
    expect(stats.length).toBe(40);
    expect(parsed.verified).toBe(true);
  });
});
