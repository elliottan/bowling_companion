import type { Game, SessionSummary } from "../types/bowling";

/**
 * What the filter pickers offer, and how they react to each other.
 *
 * A picker built from the whole history offers answers that do not exist: pick
 * the house you bowl once a year and the pattern list still names every pattern
 * you have ever seen, most of which were somewhere else. Every one of those is a
 * tap that empties the screen. So each list is built from the sessions that
 * match the *other* filters, which leaves only the options that lead somewhere.
 *
 * A facet is never narrowed by itself. Narrowing the alley list to the alley
 * already picked would leave one option and no way back, and the game chips
 * would vanish the moment one of them was chosen.
 *
 * Text lists come back most common first, because the answer you want is nearly
 * always the house you bowl weekly rather than the one you visited once
 * (equal counts fall back to alphabetical, so the order is stable). Game and
 * lane numbers stay in number order: they are read as a sequence, and a row of
 * chips reading 3, 1, 2 is a puzzle rather than a filter.
 */

export interface FilterSelection {
  alley: string;
  pattern: string;
  event: string;
  gameNumber: number | null;
  lanes: string[];
}

export type FacetKey = keyof FilterSelection;

export const EMPTY_SELECTION: FilterSelection = {
  alley: "",
  pattern: "",
  event: "",
  gameNumber: null,
  lanes: []
};

export interface FilterOptions {
  alleys: string[];
  patterns: string[];
  events: string[];
  gameNumbers: number[];
  /** Only offered once an alley is picked: lane 7 at one house has nothing to
   *  do with lane 7 at another, so the chips would be filtering by a coincidence. */
  lanes: string[];
}

/** The lanes a game was played on, across both the old single-lane column and
 *  the list that replaced it. */
export function lanesOf(game: Pick<Game, "lanes" | "lane_number">): string[] {
  return game.lanes ?? (game.lane_number ? [game.lane_number] : []);
}

function sameText(a: string | null | undefined, b: string): boolean {
  return (a ?? "").toLowerCase() === b.toLowerCase();
}

function isSet(value: FilterSelection[FacetKey]): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== "" && value !== null;
}

/**
 * The sessions a selection keeps, ignoring the named facets.
 *
 * Game and lane are matched at session level ("a night that played game 3"),
 * not by cutting the games out of it: this answers which options exist, and a
 * night is still a night that played game 3 whatever else it played.
 */
export function sessionsMatching(
  history: SessionSummary[],
  selection: FilterSelection,
  ignore: FacetKey[] = []
): SessionSummary[] {
  const skip = new Set(ignore);
  return history.filter((s) => {
    if (!skip.has("alley") && selection.alley && !sameText(s.session.alley_name, selection.alley)) {
      return false;
    }
    if (!skip.has("pattern") && selection.pattern && !sameText(s.session.oil_pattern, selection.pattern)) {
      return false;
    }
    if (!skip.has("event") && selection.event && !sameText(s.session.description, selection.event)) {
      return false;
    }
    if (
      !skip.has("gameNumber") &&
      selection.gameNumber != null &&
      !s.games.some((g) => g.game_number === selection.gameNumber)
    ) {
      return false;
    }
    if (
      !skip.has("lanes") &&
      selection.lanes.length > 0 &&
      !s.games.some((g) => lanesOf(g).some((l) => selection.lanes.includes(l)))
    ) {
      return false;
    }
    return true;
  });
}

/** Most common first, then alphabetical so equal counts do not shuffle. */
function byCountThenName(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value);
}

function countSessions(
  sessions: SessionSummary[],
  valueOf: (s: SessionSummary) => string | null | undefined
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const value = valueOf(s)?.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Numeric where both sides are numbers, so lane 10 follows lane 9 rather than
 *  lane 1, and a lettered lane still sorts somewhere stable. */
function byLaneOrder(a: string, b: string): number {
  return Number(a) - Number(b) || a.localeCompare(b);
}

export function buildFilterOptions(
  history: SessionSummary[],
  selection: FilterSelection
): FilterOptions {
  // Lanes are left out of the alley question: they only mean anything inside an
  // alley, so letting them narrow the alley list would hide every other house
  // behind a lane number that was never about them.
  const forAlley = sessionsMatching(history, selection, ["alley", "lanes"]);
  const forPattern = sessionsMatching(history, selection, ["pattern"]);
  const forEvent = sessionsMatching(history, selection, ["event"]);
  const forGame = sessionsMatching(history, selection, ["gameNumber"]);
  const forLanes = selection.alley ? sessionsMatching(history, selection, ["lanes"]) : [];

  const gameCounts = new Map<number, number>();
  for (const s of forGame) {
    for (const g of s.games) gameCounts.set(g.game_number, (gameCounts.get(g.game_number) ?? 0) + 1);
  }

  const laneCounts = new Set<string>();
  for (const s of forLanes) {
    for (const g of s.games) for (const l of lanesOf(g)) laneCounts.add(l);
  }

  return {
    alleys: byCountThenName(countSessions(forAlley, (s) => s.session.alley_name)),
    patterns: byCountThenName(countSessions(forPattern, (s) => s.session.oil_pattern)),
    events: byCountThenName(countSessions(forEvent, (s) => s.session.description)),
    gameNumbers: [...gameCounts.keys()].sort((a, b) => a - b),
    lanes: [...laneCounts].sort(byLaneOrder)
  };
}

/**
 * A selection with whatever the change just made impossible taken off it.
 *
 * Hiding the options that lead nowhere is only half of it: the filters already
 * applied can be the ones that no longer fit, and leaving them on strands the
 * reader on an empty screen with a chip they have to work out for themselves.
 * So picking a house drops the pattern you only ever saw at the other one.
 *
 * The facet that changed is kept, and the rest are offered back in a fixed
 * order, each kept only if the combination still matches a session. Fixed
 * order because the result has to be the same whichever way the same change
 * arrives.
 */
export function reconcileSelection(
  history: SessionSummary[],
  next: FilterSelection,
  changed: FacetKey
): FilterSelection {
  let result: FilterSelection = { ...EMPTY_SELECTION, [changed]: next[changed] };

  for (const key of ["alley", "pattern", "event", "gameNumber", "lanes"] as FacetKey[]) {
    if (key === changed || !isSet(next[key])) continue;

    if (key === "lanes") {
      // Part of a lane selection can survive a change that the rest of it does
      // not, so these are filtered rather than dropped whole.
      const lanes = next.lanes.filter(
        (l) => sessionsMatching(history, { ...result, lanes: [l] }).length > 0
      );
      if (lanes.length > 0) result = { ...result, lanes };
      continue;
    }

    const candidate = { ...result, [key]: next[key] } as FilterSelection;
    if (sessionsMatching(history, candidate).length > 0) result = candidate;
  }

  return result;
}
