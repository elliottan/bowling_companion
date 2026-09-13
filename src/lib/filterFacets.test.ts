import { describe, expect, it } from "vitest";
import {
  buildFilterOptions,
  EMPTY_SELECTION,
  reconcileSelection,
  sessionsMatching,
  type FilterSelection
} from "./filterFacets";
import type { Frame, Game, SessionSummary } from "../types/bowling";

let nextId = 1;

function game(gameNumber: number, lanes: string[]): Game & { frames: Frame[] } {
  return {
    id: nextId++,
    session_id: 1,
    game_number: gameNumber,
    lanes,
    start_lane: lanes[0],
    frames: []
  };
}

function session(
  alley: string,
  opts: {
    pattern?: string;
    event?: string;
    games?: number[];
    lanes?: string[];
  } = {}
): SessionSummary {
  const lanes = opts.lanes ?? ["1", "2"];
  return {
    session: {
      id: nextId++,
      date: "2026-06-01",
      alley_name: alley,
      oil_pattern: opts.pattern,
      description: opts.event
    },
    games: (opts.games ?? [1, 2, 3]).map((n) => game(n, lanes))
  };
}

function select(partial: Partial<FilterSelection>): FilterSelection {
  return { ...EMPTY_SELECTION, ...partial };
}

/** Two houses that share nothing but the bowler. */
const HISTORY: SessionSummary[] = [
  session("Alpha Lanes", { pattern: "Chameleon", event: "League", lanes: ["5", "6"] }),
  session("Alpha Lanes", { pattern: "Chameleon", event: "League", lanes: ["5", "6"] }),
  session("Alpha Lanes", { pattern: "Scorpion", event: "Practice", lanes: ["7", "8"] }),
  session("Beta Lanes", { pattern: "Wolf", event: "Open", lanes: ["3", "4"], games: [1, 2] })
];

describe("what the pickers offer", () => {
  it("offers only the patterns the chosen alley has run", () => {
    const options = buildFilterOptions(HISTORY, select({ alley: "Alpha Lanes" }));
    expect(options.patterns).toEqual(["Chameleon", "Scorpion"]);
    expect(options.events).toEqual(["League", "Practice"]);
  });

  it("does not narrow a facet by itself, so the other alleys stay reachable", () => {
    const options = buildFilterOptions(HISTORY, select({ alley: "Alpha Lanes" }));
    expect(options.alleys).toEqual(["Alpha Lanes", "Beta Lanes"]);
  });

  it("orders the text lists most common first", () => {
    const options = buildFilterOptions(HISTORY, EMPTY_SELECTION);
    // Alpha three nights, Beta one. Alphabetical would agree here, so the
    // patterns are the real assertion: Chameleon twice, the rest once each.
    expect(options.alleys).toEqual(["Alpha Lanes", "Beta Lanes"]);
    expect(options.patterns).toEqual(["Chameleon", "Scorpion", "Wolf"]);
  });

  it("keeps game and lane numbers in number order", () => {
    const options = buildFilterOptions(HISTORY, select({ alley: "Alpha Lanes" }));
    expect(options.gameNumbers).toEqual([1, 2, 3]);
    expect(options.lanes).toEqual(["5", "6", "7", "8"]);
  });

  it("narrows the lanes to the pattern as well as the alley", () => {
    const options = buildFilterOptions(
      HISTORY,
      select({ alley: "Alpha Lanes", pattern: "Scorpion" })
    );
    expect(options.lanes).toEqual(["7", "8"]);
  });

  it("offers no lanes until an alley is picked, lane 7 being two lanes", () => {
    expect(buildFilterOptions(HISTORY, EMPTY_SELECTION).lanes).toEqual([]);
  });

  it("drops a game number no session in the slice ever played", () => {
    const options = buildFilterOptions(HISTORY, select({ alley: "Beta Lanes" }));
    expect(options.gameNumbers).toEqual([1, 2]);
  });
});

describe("what a change takes off the selection", () => {
  it("drops a pattern the newly chosen house has never run", () => {
    const next = reconcileSelection(
      HISTORY,
      select({ alley: "Beta Lanes", pattern: "Chameleon" }),
      "alley"
    );
    expect(next).toEqual(select({ alley: "Beta Lanes" }));
  });

  it("keeps everything that still fits", () => {
    const next = reconcileSelection(
      HISTORY,
      select({ alley: "Alpha Lanes", pattern: "Chameleon", event: "League", lanes: ["5"] }),
      "pattern"
    );
    expect(next).toEqual(
      select({ alley: "Alpha Lanes", pattern: "Chameleon", event: "League", lanes: ["5"] })
    );
  });

  it("keeps the lanes that survive a change and drops only the rest", () => {
    const next = reconcileSelection(
      HISTORY,
      select({ alley: "Alpha Lanes", pattern: "Scorpion", lanes: ["5", "7"] }),
      "pattern"
    );
    expect(next.lanes).toEqual(["7"]);
  });

  it("never drops the filter that was just set", () => {
    const next = reconcileSelection(
      HISTORY,
      select({ alley: "Beta Lanes", gameNumber: 3 }),
      "gameNumber"
    );
    expect(next.gameNumber).toBe(3);
    expect(next.alley).toBe("");
  });
});

describe("sessionsMatching", () => {
  it("keeps a night that played the game asked for, whole", () => {
    const kept = sessionsMatching(HISTORY, select({ gameNumber: 3 }));
    expect(kept).toHaveLength(3);
    expect(kept[0].games).toHaveLength(3);
  });

  it("ignores the facets it is told to", () => {
    expect(sessionsMatching(HISTORY, select({ alley: "Beta Lanes" }), ["alley"])).toHaveLength(4);
  });
});
