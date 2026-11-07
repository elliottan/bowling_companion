import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  fold,
  highlightParts,
  matchScore,
  searchIndex,
  searchSuggestions,
  type SearchSources
} from "./search";
import type { OilPattern, SessionSummary } from "../types/bowling";
import type { CatalogBall } from "../types/catalog";

function session(id: number, alley: string, pattern?: string, description?: string): SessionSummary {
  return {
    session: { id, date: "2026-10-01", alley_name: alley, oil_pattern: pattern, description },
    games: []
  };
}

const PATTERNS: OilPattern[] = [
  { id: 1, name: "Kegel Route 66", distance: 40 },
  { id: 2, name: "Beaten Path" }
];

const CATALOG = [
  {
    id: "storm-physix-2020",
    brand: "Storm",
    name: "Physix",
    releaseYear: 2020,
    coreName: "Atomic",
    imageThumb: "/catalog/img/physix-thumb.webp"
  }
] as unknown as CatalogBall[];

function sources(overrides: Partial<SearchSources> = {}): SearchSources {
  return {
    sessions: [
      session(1, "Pinecrest Lanes", "Kegel Route 66", "League"),
      session(2, "Pinecrest Lanes", "Kegel Route 66"),
      session(3, "Bowlero", "Beaten Path")
    ],
    patterns: PATTERNS,
    balls: [{ id: 7, name: "My Phaze", is_spare_ball: false }],
    catalog: CATALOG,
    screens: [{ screen: "spares", title: "Spare lines" }],
    ...overrides
  };
}

describe("matchScore", () => {
  it("ranks a whole name over a start, a word, and letters inside", () => {
    expect(matchScore("Route 66", "route 66")).toBe(100);
    expect(matchScore("Route 66", "rou")).toBeGreaterThan(matchScore("Kegel Route 66", "rou"));
    expect(matchScore("Kegel Route 66", "rou")).toBeGreaterThan(matchScore("Detour", "our"));
    expect(matchScore("Detour", "xyz")).toBe(0);
  });

  it("finds a name however its maker spaced or hyphened it", () => {
    expect(matchScore("Hy-Road", "hyroad")).toBeGreaterThan(0);
  });

  it("matches every word of a query, wherever each is", () => {
    expect(matchScore("Storm Physix", "phys storm")).toBeGreaterThan(0);
    expect(matchScore("Storm Physix", "phys hammer")).toBe(0);
  });

  it("ignores accents and case", () => {
    expect(fold("  Café ")).toBe("cafe");
    expect(matchScore("Café Lanes", "cafe")).toBe(85);
  });

  it("answers nothing for an empty query", () => {
    expect(matchScore("Anything", "   ")).toBe(0);
  });
});

describe("the search index", () => {
  it("offers the sessions bowled on a pattern when the pattern is searched", () => {
    const results = searchIndex(buildSearchIndex(sources()), "route 66");
    const all = [results.top, ...results.sections.flatMap((s) => s.items)].filter(Boolean);
    const sessions = all.find((i) => i!.target.kind === "sessions");
    expect(sessions?.target).toEqual({ kind: "sessions", facet: "pattern", value: "Kegel Route 66" });
    expect(sessions?.subtitle).toBe("2 sessions");
    expect(all.some((i) => i!.target.kind === "pattern")).toBe(true);
  });

  it("counts an alley's sessions once per spelling, case aside", () => {
    const index = buildSearchIndex(sources({ sessions: [session(1, "Bowlero"), session(2, "bowlero ")] }));
    const alleys = index.filter((i) => i.key.startsWith("sessions:alley"));
    expect(alleys).toHaveLength(1);
    expect(alleys[0].subtitle).toBe("2 sessions");
  });

  it("leads with the bowler's own sessions, before the catalog and the guides", () => {
    const { sections } = searchIndex(buildSearchIndex(sources()), "p");
    const order = sections.map((s) => s.section);
    expect(order.indexOf("sessions")).toBeLessThan(order.indexOf("catalog"));
  });

  it("finds a guide's term by its own name, by an alias, and by either half", () => {
    const index = buildSearchIndex(sources());
    const term = (q: string) => {
      const r = searchIndex(index, q);
      return [r.top, ...(r.sections.find((s) => s.section === "terms")?.items ?? [])].filter(
        (i): i is NonNullable<typeof i> => i?.section === "terms"
      );
    };
    expect(term("brooklyn")[0]?.target).toEqual({ kind: "guide", guideId: "strike-words" });
    expect(term("bird dog").some((i) => i.title === "Messenger")).toBe(true);
    // "PAP, the positive axis point", found by its second half.
    expect(term("positive axis").some((i) => i.title.startsWith("PAP"))).toBe(true);
  });

  it("puts a strong match on top, and only once", () => {
    const results = searchIndex(buildSearchIndex(sources()), "brooklyn");
    expect(results.top?.title).toBe("Brooklyn");
    const again = results.sections.flatMap((s) => s.items).filter((i) => i === results.top);
    expect(again).toHaveLength(0);
  });

  it("has no top hit when nothing matches well", () => {
    expect(searchIndex(buildSearchIndex(sources()), "ix").top).toBeNull();
  });

  it("finds a catalog ball by its core, below one whose name matched", () => {
    const index = buildSearchIndex(sources());
    const hit = searchIndex(index, "atomic").sections.find((s) => s.section === "catalog")?.items[0];
    expect(hit?.target).toEqual({ kind: "catalog-ball", catalogId: "storm-physix-2020" });
    expect(hit?.subtitle).toBe("Storm · 2020");
  });

  it("cuts a section at the limit and says how many more it found", () => {
    const many = Array.from({ length: 8 }, (_, i) => session(i + 1, `Lanes ${i + 1}`));
    const { top, sections } = searchIndex(buildSearchIndex(sources({ sessions: many })), "lanes", 5);
    const own = sections.find((s) => s.section === "sessions")!;
    // One of the eight leads as the top hit, so its section holds the rest.
    expect(top?.section).toBe("sessions");
    expect(own.items).toHaveLength(5);
    expect(own.more).toBe(2);
  });

  it("finds a screen by its name", () => {
    const { sections, top } = searchIndex(buildSearchIndex(sources()), "spare lines");
    const all = [top, ...sections.flatMap((s) => s.items)];
    expect(all.some((i) => i?.target.kind === "screen")).toBe(true);
  });
});

describe("highlightParts", () => {
  it("splits a title around what was typed, as written", () => {
    expect(highlightParts("Kegel Route 66", "route")).toEqual(["Kegel ", "Route", " 66"]);
  });

  it("draws nothing where the query is not in the title as typed", () => {
    expect(highlightParts("Hy-Road", "hyroad")).toBeNull();
    expect(highlightParts("Anything", "")).toBeNull();
  });
});

describe("searchSuggestions", () => {
  it("offers the most bowled pattern and alley, then the guide words", () => {
    const out = searchSuggestions(sources().sessions, ["Pocket", "Brooklyn"]);
    expect(out).toEqual(["Kegel Route 66", "Pinecrest Lanes", "Pocket", "Brooklyn"]);
  });

  it("offers only the guide words before there is any history", () => {
    expect(searchSuggestions([], ["Pocket", "pocket", "Turkey"], 6)).toEqual(["Pocket", "Turkey"]);
  });

  it("stops at the limit", () => {
    expect(searchSuggestions([], ["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
});
