/**
 * Vitest tests for the candidate promote stage.
 * Run via: npm test
 */
import { describe, it, expect } from "vitest";

import { promoteCandidate, resolveField, identityKey } from "./promote.js";
import type { BallCandidate } from "./types.js";
import type { RawBall } from "../types.js";

const officialUrl = "https://stormbowling.com/specs/phaze-vi.pdf";
const aggregatorUrl = "https://www.bowwwl.com/bowling-ball-database/storm/phaze-vi";
const otherUrl = "https://bowlingball.com/storm-phaze-vi";

function candidate(over: Partial<BallCandidate> = {}): BallCandidate {
  return {
    brand: "Storm",
    name: "Test Ball",
    official: true,
    releaseDate: [{ value: "2026-03-01", sourceUrl: officialUrl, quote: "Release date: 2026-03-01" }],
    coverstockRaw: [{ value: "R2S Solid", sourceUrl: officialUrl, quote: "Coverstock: R2S Solid" }],
    factoryFinish: [{ value: "4000 Abralon", sourceUrl: officialUrl, quote: "Finish 4000 Abralon" }],
    coreName: [{ value: "Velocity", sourceUrl: officialUrl, quote: "Core: Velocity" }],
    rg: [{ value: 2.49, sourceUrl: officialUrl, quote: "RG 2.49" }],
    diff: [{ value: 0.029, sourceUrl: officialUrl, quote: "Diff 0.029" }],
    mbDiff: [],
    ...over,
  };
}

describe("resolveField receipts", () => {
  it("refuses a value that does not appear in its own quote", () => {
    const r = resolveField("rg", [{ value: 2.5, sourceUrl: officialUrl, quote: "RG 2.49" }], true);
    expect(r.value).toBeNull();
    expect(r.problems[0]).toContain("does not appear in its quote");
  });

  it("accepts a number the source printed with different trailing zeros", () => {
    expect(resolveField("rg", [{ value: 2.5, sourceUrl: officialUrl, quote: "RG 2.50" }], true).value).toBe(2.5);
    expect(resolveField("diff", [{ value: 0.05, sourceUrl: officialUrl, quote: "Diff .050" }], true).value).toBe(0.05);
  });

  it("refuses a reading with no quote or no source", () => {
    const noQuote = resolveField("rg", [{ value: 2.49, sourceUrl: officialUrl, quote: "" }], true);
    expect(noQuote.value).toBeNull();
    expect(noQuote.problems).toEqual(["rg: reading has no quote"]);

    const noSource = resolveField("rg", [{ value: 2.49, sourceUrl: "", quote: "RG 2.49" }], true);
    expect(noSource.value).toBeNull();
    expect(noSource.problems).toEqual(["rg: reading has no sourceUrl"]);
  });

  it("treats an absent field as absent, not as a problem", () => {
    expect(resolveField("mbDiff", [], true)).toEqual({ value: null, problems: [], sourceUrls: [] });
  });
});

describe("resolveField corroboration", () => {
  it("takes one reading when the source is official", () => {
    expect(resolveField("rg", [{ value: 2.49, sourceUrl: officialUrl, quote: "RG 2.49" }], true).value).toBe(2.49);
  });

  it("needs two different sites when no source is official", () => {
    const oneSite = resolveField(
      "rg",
      [
        { value: 2.49, sourceUrl: aggregatorUrl, quote: "RG 2.49" },
        { value: 2.49, sourceUrl: aggregatorUrl + "?x=1", quote: "RG 2.49" },
      ],
      false
    );
    expect(oneSite.value).toBeNull();
    expect(oneSite.problems[0]).toContain("2 different sites");

    const twoSites = resolveField(
      "rg",
      [
        { value: 2.49, sourceUrl: aggregatorUrl, quote: "RG 2.49" },
        { value: 2.49, sourceUrl: otherUrl, quote: "RG 2.49" },
      ],
      false,
      0.01
    );
    expect(twoSites.value).toBe(2.49);
  });

  it("reports disagreement past tolerance rather than averaging it", () => {
    const r = resolveField(
      "rg",
      [
        { value: 2.49, sourceUrl: aggregatorUrl, quote: "RG 2.49" },
        { value: 2.53, sourceUrl: otherUrl, quote: "RG 2.53" },
      ],
      false,
      0.01
    );
    expect(r.value).toBeNull();
    expect(r.problems.some((p) => p.includes("sources disagree"))).toBe(true);
  });

  it("tolerates rounding-sized disagreement", () => {
    const r = resolveField(
      "rg",
      [
        { value: 2.49, sourceUrl: aggregatorUrl, quote: "RG 2.49" },
        { value: 2.5, sourceUrl: otherUrl, quote: "RG 2.50" },
      ],
      false,
      0.01
    );
    expect(r.value).toBe(2.49);
  });
});

describe("promoteCandidate", () => {
  it("promotes a clean official candidate and collects its sources", () => {
    const r = promoteCandidate(candidate(), []);
    expect(r.ok).toBe(true);
    expect(r.ball).toMatchObject({ brand: "Storm", name: "Test Ball", rg: 2.49, diff: 0.029, mbDiff: null });
    expect(r.ball?.sourceUrls).toEqual([officialUrl]);
  });

  it("refuses a ball whose name collides with the catalog, whatever its punctuation", () => {
    const existing: RawBall[] = [
      {
        brand: "Storm",
        name: "!Q Tour Edition",
        releaseDate: "2012-07-06",
        coverstockRaw: "R2S Solid Reactive",
        factoryFinish: null,
        coreName: null,
        rg: 2.49,
        diff: 0.029,
        mbDiff: null,
        sourceUrls: [aggregatorUrl],
      },
    ];
    const r = promoteCandidate(candidate({ name: "IQ Tour Edition" }), existing);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("collides"))).toBe(true);
  });

  it("refuses an out-of-range number even when it is properly quoted", () => {
    const r = promoteCandidate(
      candidate({ rg: [{ value: 1.9, sourceUrl: officialUrl, quote: "RG 1.9" }] }),
      []
    );
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("out of range"))).toBe(true);
  });

  it("refuses a candidate with no coverstock at all", () => {
    const r = promoteCandidate(candidate({ coverstockRaw: [] }), []);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain("missing coverstockRaw");
  });
});

describe("identityKey", () => {
  it("collapses punctuation, case and roman numerals", () => {
    expect(identityKey("Storm", "!Q Tour")).toBe(identityKey("storm", "IQ  Tour"));
    expect(identityKey("Storm", "Phaze V")).toBe(identityKey("Storm", "Phaze 5"));
  });

  it("keeps different balls apart", () => {
    expect(identityKey("Storm", "Phaze V")).not.toBe(identityKey("Storm", "Phaze VI"));
    expect(identityKey("Storm", "Phaze V")).not.toBe(identityKey("Motiv", "Phaze V"));
  });
});
