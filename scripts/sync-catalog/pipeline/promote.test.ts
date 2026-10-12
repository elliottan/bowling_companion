/**
 * Vitest tests for the candidate promote stage.
 * Run via: npm test
 */
import { describe, it, expect } from "vitest";

import { promoteCandidate, resolveField, identityKey, quoteContainsDate } from "./promote.js";
import { toCandidate } from "./from-seed.js";
import { baseName } from "./sources.js";
import { isCatalogBall, queueName } from "./select.js";
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

describe("parser readings", () => {
  it("stands on one source with no quote, because code cannot fabricate a number", () => {
    const r = resolveField(
      "rg",
      [{ value: 2.49, sourceUrl: aggregatorUrl, quote: "", parser: "parse-bowwwl" }],
      false
    );
    expect(r.value).toBe(2.49);
    expect(r.problems).toEqual([]);
  });

  it("still needs a source url", () => {
    const r = resolveField("rg", [{ value: 2.49, sourceUrl: "", quote: "", parser: "parse-bowwwl" }], false);
    expect(r.problems).toEqual(["rg: reading has no sourceUrl"]);
  });

  it("does not exempt a model reading sitting next to a parser one", () => {
    const r = resolveField(
      "rg",
      [
        { value: 2.49, sourceUrl: aggregatorUrl, quote: "", parser: "parse-bowwwl" },
        { value: 2.49, sourceUrl: aggregatorUrl, quote: "RG 2.49" },
      ],
      false,
      0.01
    );
    expect(r.problems.some((p) => p.includes("2 different sites"))).toBe(true);
  });
});

describe("toCandidate", () => {
  it("marks every field with the parser that produced it and drops nulls", () => {
    const c = toCandidate(
      {
        brand: "Roto Grip",
        name: "Gem",
        releaseDate: "2022-03-11",
        coverstockRaw: "MicroTrax Solid",
        factoryFinish: null,
        coreName: "Defiant LRG",
        rg: 2.47,
        diff: 0.053,
        mbDiff: 0.016,
        sourceUrls: ["https://www.bowwwl.com/bowling-ball-database/roto-grip/gem"],
      },
      "parse-bowwwl"
    );
    expect(c.official).toBe(false);
    expect(c.rg[0].parser).toBe("parse-bowwwl");
    expect(c.factoryFinish).toEqual([]);
  });

  it("promotes straight through, since a parser reading needs no quote", () => {
    const c = toCandidate(
      {
        brand: "Roto Grip",
        name: "Gem",
        releaseDate: "2022-03-11",
        coverstockRaw: "MicroTrax Solid",
        factoryFinish: null,
        coreName: "Defiant LRG",
        rg: 2.47,
        diff: 0.053,
        mbDiff: 0.016,
        sourceUrls: ["https://www.bowwwl.com/bowling-ball-database/roto-grip/gem"],
      },
      "parse-bowwwl"
    );
    expect(promoteCandidate(c, []).ok).toBe(true);
  });
});

describe("baseName", () => {
  it("drops a trailing colour run", () => {
    expect(baseName("Hustle Vanilla/Popsicle")).toBe("Hustle");
    expect(baseName("Tropical Surge Onyx/Mercury/Graphite")).toBe("Tropical Surge");
  });

  it("leaves a name with no slash alone", () => {
    expect(baseName("Pitch Black 78-U")).toBeNull();
  });

  it("reduces a distinct model too, which is why it is opt-in and reported", () => {
    expect(baseName("Attention 78/U")).toBe("Attention");
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

describe("isCatalogBall", () => {
  it("keeps an ordinary approved ball", () => {
    expect(isCatalogBall("Phaze Crimson", "2026-07-16")).toBe(true);
    expect(isCatalogBall("Tropical Surge Onyx/Mercury/Graphite", "2026-03-10")).toBe(true);
  });

  it("drops the light-weight-only line, which is kids' equipment", () => {
    expect(isCatalogBall("Orbit Zero (Under 13 Lb.)", "2026-03-10")).toBe(false);
    expect(isCatalogBall("Orbit SE (Special Edition) (Under 13 Lb.)", "2026-01-13")).toBe(false);
  });

  it("drops X-Outs, which publish no specs of their own", () => {
    expect(isCatalogBall("X-Out Breast Cancer (Marvel Pearl)", "2026-06-16")).toBe(false);
  });

  it("drops a row with no approval date", () => {
    expect(isCatalogBall("Big D Pro Am", null)).toBe(false);
  });
});

describe("queueName", () => {
  it("keeps what USBC put in brackets, because it is part of the name", () => {
    expect(queueName("Sigma (Tour) Pearl")).toBe("Sigma Tour Pearl");
    expect(queueName("(Covert) VIP ExJ")).toBe("Covert VIP ExJ");
    expect(queueName("Venom (Hysteria)")).toBe("Venom Hysteria");
    expect(queueName("(Max) Thrill Pearl Lime/Orange")).toBe("Max Thrill Pearl Lime/Orange");
  });

  it("leaves an unbracketed name alone", () => {
    expect(queueName("Phaze Crimson")).toBe("Phaze Crimson");
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

describe("quoteContainsDate", () => {
  it("finds a month written as a word, abbreviated, or as US numbers", () => {
    for (const quote of ["Release Date: October 2023", "Released Oct. 2023", "10/2023", "October 12, 2023", "10/12/2023", "12 October 2023"]) {
      expect(quoteContainsDate(quote, "2023-10"), quote).toBe(true);
    }
  });

  it("finds a day only when the quote states that day", () => {
    expect(quoteContainsDate("Release Date: October 12, 2023", "2023-10-12")).toBe(true);
    expect(quoteContainsDate("10/12/2023", "2023-10-12")).toBe(true);
    expect(quoteContainsDate("October 2023", "2023-10-12")).toBe(false);
    expect(quoteContainsDate("October 13, 2023", "2023-10-12")).toBe(false);
  });

  it("never reads a different month or year", () => {
    expect(quoteContainsDate("November 2023", "2023-10")).toBe(false);
    expect(quoteContainsDate("October 2024", "2023-10")).toBe(false);
    expect(quoteContainsDate("1/10/2023", "2023-10")).toBe(false);
  });

  it("takes a year from any quote that states it", () => {
    expect(quoteContainsDate("New for 2025", "2025")).toBe(true);
    expect(quoteContainsDate("12025 units", "2025")).toBe(false);
  });

  it("is what promote checks a release date reading against", () => {
    const r = resolveField(
      "releaseDate",
      [
        { value: "2023-10", sourceUrl: "https://a.example/x", quote: "Release Date: October 2023" },
        { value: "2023-10", sourceUrl: "https://b.example/x", quote: "Released 10/12/2023" },
      ],
      false
    );
    expect(r).toEqual({ value: "2023-10", problems: [], sourceUrls: ["https://a.example/x", "https://b.example/x"] });
  });
});

describe("promoting a ball read from web search (ADR-135)", () => {
  const search = (value: string | number, host: string, quote: string) => ({
    value, sourceUrl: `https://${host}/ball`, quote, via: "web-search" as const,
  });
  const candidate = {
    brand: "Hammer" as const,
    name: "Test Widow",
    official: false,
    releaseDate: [search("2024-10", "a.example", "Released October 2024"), search("2024-10", "b.example", "Release Date: 10/03/2024")],
    coverstockRaw: [search("Aggression Solid Reactive", "a.example", "HK22 Aggression Solid Reactive"), search("Aggression Solid Reactive", "b.example", "Aggression Solid Reactive Coverstock")],
    factoryFinish: [],
    coreName: [],
    rg: [search(2.5, "a.example", "RG: 2.50"), search(2.5, "b.example", "RG 2.50")],
    diff: [search(0.058, "a.example", "Diff: .058"), search(0.058, "b.example", "Differential 0.058")],
    mbDiff: [],
    productUrl: [search("https://maker.example/widow", "a.example", "https://maker.example/widow"), search("https://maker.example/widow", "b.example", "see https://maker.example/widow")],
  } as BallCandidate;

  it("promotes it on two agreeing sites, marks it as read from search, and keeps its product page", () => {
    const result = promoteCandidate(candidate, []);
    expect(result.problems).toEqual([]);
    expect(result.ball).toMatchObject({
      releaseDate: "2024-10",
      rg: 2.5,
      readVia: "web-search",
      productUrl: "https://maker.example/widow",
    });
  });

  it("refuses it on one site, however clean the reading", () => {
    const result = promoteCandidate({ ...candidate, rg: [candidate.rg[0]] }, []);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.startsWith("rg: no official source"))).toBe(true);
  });
});
