import { describe, expect, it } from "vitest";

import { fillRow, pageDate } from "./fill-from-seed.js";
import type { RawBall } from "../types.js";

const row = (over: Partial<RawBall> = {}): RawBall => ({
  brand: "Hammer",
  name: "Black Widow 3.0",
  releaseDate: null,
  coverstockRaw: "Aggression Solid",
  factoryFinish: null,
  coreName: null,
  rg: 2.5,
  diff: 0.058,
  mbDiff: 0.016,
  sourceUrls: ["https://a.example/x"],
  readVia: "web-search",
  ...over,
});

const page = (over: Record<string, unknown> = {}) => ({
  ...row({ readVia: undefined }),
  releaseDate: "2024-01-18",
  coverstockRaw: "HK22 - Aggression Solid Reactive",
  coreName: "Gas Mask",
  factoryFinish: "500/1000/2000 Siaair",
  sourceUrls: ["https://www.bowwwl.com/bowling-ball-database/hammer/black-widow-30"],
  weights: [{ weight: 15, rg: 2.5, diff: 0.058, mbDiff: 0.016 }],
  ...over,
});

describe("fillRow", () => {
  it("fills what the row lacks and takes the fuller coverstock name", () => {
    const r = fillRow(row(), page());
    expect(r.row).toMatchObject({
      releaseDate: "2024-01-18",
      coreName: "Gas Mask",
      factoryFinish: "500/1000/2000 Siaair",
      coverstockRaw: "HK22 - Aggression Solid Reactive",
    });
    expect(r.row.weights).toHaveLength(1);
    expect(r.row.sourceUrls).toHaveLength(2);
    expect(r.numbersAgree).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it("pins the id when it adds a date to a row that had none, so the id does not move", () => {
    const r = fillRow(row(), page());
    expect(r.row.id).toBe("hammer-black-widow-3-0");
    // A row that already has a date, or already a pinned id, is left as it is.
    expect(fillRow(row({ releaseDate: "2024-01" }), page()).row.id).toBeUndefined();
    expect(fillRow(row({ id: "keep-me" }), page()).row.id).toBe("keep-me");
  });

  it("never overwrites a number and reports the disagreement", () => {
    const r = fillRow(row(), page({ rg: 2.55 }));
    expect(r.row.rg).toBe(2.5);
    expect(r.conflicts).toEqual(["rg 2.5 in the row, 2.55 on the page"]);
    expect(r.numbersAgree).toBe(false);
  });

  it("treats a row with no mass bias against a page that has one as a correction, not agreement", () => {
    const r = fillRow(row({ mbDiff: null }), page());
    expect(r.row.mbDiff).toBe(0.016);
    expect(r.numbersAgree).toBe(false);
  });

  it("reports a page with no mass bias against a row that has one", () => {
    const r = fillRow(row(), page({ mbDiff: null }));
    expect(r.row.mbDiff).toBe(0.016);
    expect(r.conflicts[0]).toContain("mbDiff");
  });

  it("does not take a page's bare cover name over the row's own", () => {
    const r = fillRow(row({ coverstockRaw: "Alpha Premier Solid" }), page({ coverstockRaw: "Solid Reactive" }));
    expect(r.row.coverstockRaw).toBe("Alpha Premier Solid");
  });

  it("takes a classifiable cover where the row's could not be classified", () => {
    const r = fillRow(row({ coverstockRaw: "HK22C²" }), page({ coverstockRaw: "HK22C2 Hybrid Reactive" }));
    expect(r.row.coverstockRaw).toBe("HK22C2 Hybrid Reactive");
  });

  it("makes a year-only row month-precise when the page agrees on the year, and flags a different year", () => {
    expect(fillRow(row({ releaseDate: "2024" }), page()).row.releaseDate).toBe("2024-01-18");
    const r = fillRow(row({ releaseDate: "2023" }), page());
    expect(r.row.releaseDate).toBe("2023");
    expect(r.conflicts[0]).toContain("releaseDate");
  });
});

describe("pageDate", () => {
  it("reads a padded year as a year", () => {
    expect(pageDate("2019-01-01")).toBe("2019");
    expect(pageDate("2019-03-11")).toBe("2019-03-11");
    expect(pageDate(null)).toBeNull();
  });
});
