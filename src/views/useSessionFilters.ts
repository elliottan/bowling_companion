import { useCallback, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { filterSessionsBy } from "../lib/stats";
import {
  buildFilterOptions,
  lanesOf,
  reconcileSelection,
  type FacetKey,
  type FilterSelection
} from "../lib/filterFacets";
import { getSessionHistory, getSessionList } from "../services/bowlingRepository";
import { useRememberedState } from "../lib/viewMemory";
import type { SessionSummary } from "../types/bowling";

/**
 * The filters History and Stats share.
 *
 * They are two tabs over one set of sessions (ADR-057), so the filter has to
 * outlive either of them: narrow the list on History, cross to Stats, and the
 * numbers are for the sessions you were just looking at. `useRememberedState`
 * already survives a tab unmount, and both tabs read the same keys, so the
 * sharing falls out of that rather than needing a store.
 *
 * The keys still say `history:` because that is where the memory was written
 * before the split, and renaming them would only lose whatever the user had
 * picked on the way past.
 *
 * It lives in `views/` because it reaches for a repository, which `lib/` is
 * not allowed to do (docs/ARCHITECTURE.md), and because both callers are
 * views.
 */

// Stable empty: `?? []` would be a new array on every render, which invalidates
// every useMemo downstream of it.
const NO_SESSIONS: SessionSummary[] = [];

export interface SessionFilters {
  /** Everything, unfiltered. The pickers are built from this. */
  history: SessionSummary[];
  isLoading: boolean;
  /** The read that failed, so a view can say so instead of showing "no sessions". */
  error: Error | null;

  alley: string;
  setAlley: (value: string) => void;
  pattern: string;
  setPattern: (value: string) => void;
  /** The session description: League, Practice, a tournament name. */
  event: string;
  setEvent: (value: string) => void;
  /** Position in the night, or null for every game. */
  gameNumber: number | null;
  setGameNumber: (value: number | null) => void;
  lanes: string[];
  toggleLane: (lane: string) => void;
  clearLanes: () => void;
  /** Everything off, in one write. Not four setters in a row: each of those
   *  writes the whole selection (it has to, to drop what no longer fits), so
   *  they would read each other's stale state and put back what the one before
   *  had just cleared. */
  clearAll: () => void;

  /** What each picker offers: only the values the *other* filters still leave
   *  reachable, so no option on screen empties the screen. The text lists are
   *  most common first (`lib/filterFacets`). */
  allAlleys: string[];
  allPatterns: string[];
  allEvents: string[];
  allGameNumbers: number[];
  /** Lanes offered, which is only the ones seen at the chosen alley. */
  allLanes: string[];
  /** Of `lanes`, the ones that exist at the chosen alley. */
  activeLanes: string[];

  /** Alley, pattern and game applied. Lanes are not: they apply per frame,
   *  inside the calculators, which is correct for a game across two lanes. */
  filtered: SessionSummary[];
  /** The same, minus the game filter. For anything that IS the game picker:
   *  narrowing it to the slot already chosen would take the picker away. */
  filteredExceptGame: SessionSummary[];
  /** `filtered` with the lane filter applied at session level, for the list. */
  sessionList: SessionSummary[];
  /** Whether anything is narrowing the list right now. */
  isFiltered: boolean;
  /** Completed games behind the current filter, for the cross-tab links. */
  gameCount: number;
}

/**
 * `frames: "unscored"` is for a caller that only lists nights: it skips the
 * frames of every game that already has a score, which is nearly all of them
 * (ADR-066). Anything that computes over shots must leave this alone.
 */
export function useSessionFilters(
  { frames = "all" }: { frames?: "all" | "unscored" } = {}
): SessionFilters {
  const load = frames === "all" ? getSessionHistory : getSessionList;
  // A failed read used to arrive as an empty list, which reads as "you have
  // never bowled". Caught here so every caller can tell the two apart.
  const [error, setError] = useState<Error | null>(null);
  const liveHistory = useLiveQuery(async () => {
    try {
      const rows = await load();
      setError(null);
      return rows;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return NO_SESSIONS;
    }
  }, [frames]);
  const history = liveHistory ?? NO_SESSIONS;
  const isLoading = liveHistory === undefined;

  const [alley, setAlleyValue] = useRememberedState("history:alley", "");
  const [pattern, setPatternValue] = useRememberedState("history:pattern", "");
  const [event, setEventValue] = useRememberedState("history:event", "");
  const [gameNumber, setGameNumberValue] = useRememberedState<number | null>("history:game", null);
  const [lanes, setLanes] = useRememberedState<string[]>("history:lanes", []);

  const selection = useMemo<FilterSelection>(
    () => ({ alley, pattern, event, gameNumber, lanes }),
    [alley, pattern, event, gameNumber, lanes]
  );

  /**
   * Write one filter, and drop whatever it just made impossible.
   *
   * Every setter goes through this. The pickers only offer options that lead
   * somewhere (`buildFilterOptions`), and this is the other half of that:
   * without it, picking a house would leave last month's pattern applied at a
   * house that has never run it, and the screen would empty with no hint as to
   * which of the two chips was the problem.
   */
  const commit = useCallback(
    (changed: FacetKey, value: FilterSelection[FacetKey]) => {
      const next = reconcileSelection(history, { ...selection, [changed]: value }, changed);
      setAlleyValue(next.alley);
      setPatternValue(next.pattern);
      setEventValue(next.event);
      setGameNumberValue(next.gameNumber);
      setLanes(next.lanes);
    },
    [history, selection, setAlleyValue, setPatternValue, setEventValue, setGameNumberValue, setLanes]
  );

  const setAlley = useCallback((value: string) => commit("alley", value), [commit]);
  const setPattern = useCallback((value: string) => commit("pattern", value), [commit]);
  const setEvent = useCallback((value: string) => commit("event", value), [commit]);
  const setGameNumber = useCallback(
    (value: number | null) => commit("gameNumber", value),
    [commit]
  );

  const toggleLane = useCallback(
    (lane: string) =>
      commit("lanes", lanes.includes(lane) ? lanes.filter((l) => l !== lane) : [...lanes, lane]),
    [commit, lanes]
  );

  const filteredExceptGame = useMemo(() => {
    if (!alley && !pattern && !event) return history;
    return filterSessionsBy(history, {
      alleyName: alley || undefined,
      oilPattern: pattern || undefined,
      event: event || undefined
    });
  }, [history, alley, pattern, event]);

  const filtered = useMemo(() => {
    if (gameNumber == null) return filteredExceptGame;
    return filterSessionsBy(filteredExceptGame, { gameNumber });
  }, [filteredExceptGame, gameNumber]);

  // Each picker offers only what the other filters leave reachable, and the
  // text lists come back most common first. See `lib/filterFacets`.
  const options = useMemo(() => buildFilterOptions(history, selection), [history, selection]);
  const allLanes = options.lanes;

  // Derived rather than reset in an effect when the location changes: a
  // selection left over from another alley simply stops applying, with no
  // extra render where the list is filtered by a lane that is not on screen.
  const activeLanes = useMemo(
    () => lanes.filter((l) => allLanes.includes(l)),
    [lanes, allLanes]
  );

  // For the session list, a lane filter keeps sessions that played a selected lane.
  const sessionList = useMemo(() => {
    if (activeLanes.length === 0) return filtered;
    return filtered.filter((s) =>
      s.games.some((g) => lanesOf(g).some((l) => activeLanes.includes(l)))
    );
  }, [filtered, activeLanes]);

  const allAlleys = options.alleys;
  const allPatterns = options.patterns;
  const allEvents = options.events;
  // A facet never narrows itself, so the chips do not disappear as soon as one
  // of them is picked.
  const allGameNumbers = options.gameNumbers;

  const gameCount = useMemo(
    () => sessionList.reduce((n, s) => n + s.games.length, 0),
    [sessionList]
  );

  return {
    history,
    isLoading,
    error,
    alley,
    setAlley,
    pattern,
    setPattern,
    event,
    setEvent,
    gameNumber,
    setGameNumber,
    lanes,
    toggleLane,
    clearLanes: () => commit("lanes", []),
    clearAll: () => {
      setAlleyValue("");
      setPatternValue("");
      setEventValue("");
      setGameNumberValue(null);
      setLanes([]);
    },
    allAlleys,
    allPatterns,
    allEvents,
    allGameNumbers,
    allLanes,
    activeLanes,
    filtered,
    filteredExceptGame,
    sessionList,
    isFiltered: Boolean(alley || pattern || event || gameNumber != null || activeLanes.length > 0),
    gameCount
  };
}
