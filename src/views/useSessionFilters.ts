import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { filterSessionsBy } from "../lib/stats";
import { getSessionHistory } from "../services/bowlingRepository";
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

  alley: string;
  setAlley: (value: string) => void;
  pattern: string;
  setPattern: (value: string) => void;
  /** Position in the night, or null for every game. */
  gameNumber: number | null;
  setGameNumber: (value: number | null) => void;
  lanes: string[];
  toggleLane: (lane: string) => void;
  clearLanes: () => void;

  allAlleys: string[];
  allPatterns: string[];
  allGameNumbers: number[];
  /** Lanes offered, which is only the ones seen at the chosen alley. */
  allLanes: string[];
  /** Of `lanes`, the ones that exist at the chosen alley. */
  activeLanes: string[];

  /** Alley, pattern and game applied. Lanes are not: they apply per frame,
   *  inside the calculators, which is correct for a game across two lanes. */
  filtered: SessionSummary[];
  /** `filtered` with the lane filter applied at session level, for the list. */
  sessionList: SessionSummary[];
  /** Whether anything is narrowing the list right now. */
  isFiltered: boolean;
  /** Completed games behind the current filter, for the cross-tab links. */
  gameCount: number;
}

export function useSessionFilters(): SessionFilters {
  const liveHistory = useLiveQuery(() => getSessionHistory());
  const history = liveHistory ?? NO_SESSIONS;
  const isLoading = liveHistory === undefined;

  const [alley, setAlley] = useRememberedState("history:alley", "");
  const [pattern, setPattern] = useRememberedState("history:pattern", "");
  const [gameNumber, setGameNumber] = useRememberedState<number | null>("history:game", null);
  const [lanes, setLanes] = useRememberedState<string[]>("history:lanes", []);

  function toggleLane(lane: string) {
    setLanes((prev) => (prev.includes(lane) ? prev.filter((l) => l !== lane) : [...prev, lane]));
  }

  const filtered = useMemo(() => {
    if (!alley && !pattern && gameNumber == null) return history;
    return filterSessionsBy(history, {
      alleyName: alley || undefined,
      oilPattern: pattern || undefined,
      gameNumber: gameNumber ?? undefined
    });
  }, [history, alley, pattern, gameNumber]);

  // Lanes are only meaningful within a location, so we offer them as a filter
  // only once an alley is picked, and only the lanes seen at that alley.
  const allLanes = useMemo(() => {
    if (!alley) return [];
    return [
      ...new Set(
        history
          .filter((s) => s.session.alley_name === alley)
          .flatMap((s) => s.games.flatMap((g) => g.lanes ?? (g.lane_number ? [g.lane_number] : [])))
      )
    ].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }, [history, alley]);

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
      s.games.some((g) =>
        (g.lanes ?? (g.lane_number ? [g.lane_number] : [])).some((l) => activeLanes.includes(l))
      )
    );
  }, [filtered, activeLanes]);

  const allAlleys = useMemo(
    () => [...new Set(history.map((s) => s.session.alley_name))].sort(),
    [history]
  );
  const allPatterns = useMemo(
    () =>
      [
        ...new Set(history.flatMap((s) => (s.session.oil_pattern ? [s.session.oil_pattern] : [])))
      ].sort(),
    [history]
  );
  // Offered from the whole history, not the filtered list: the chips must not
  // disappear as soon as one of them is picked.
  const allGameNumbers = useMemo(
    () =>
      [...new Set(history.flatMap((s) => s.games.map((g) => g.game_number)))].sort((a, b) => a - b),
    [history]
  );

  const gameCount = useMemo(
    () => sessionList.reduce((n, s) => n + s.games.length, 0),
    [sessionList]
  );

  return {
    history,
    isLoading,
    alley,
    setAlley,
    pattern,
    setPattern,
    gameNumber,
    setGameNumber,
    lanes,
    toggleLane,
    clearLanes: () => setLanes([]),
    allAlleys,
    allPatterns,
    allGameNumbers,
    allLanes,
    activeLanes,
    filtered,
    sessionList,
    isFiltered: Boolean(alley || pattern || gameNumber != null || activeLanes.length > 0),
    gameCount
  };
}
