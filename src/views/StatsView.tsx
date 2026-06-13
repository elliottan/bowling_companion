import { useEffect, useMemo, useState } from "react";
import { Stats } from "../components/Stats";
import {
  calculateCommonLeaves,
  calculateStats,
  filterSessionsBy,
  type BowlingStats,
} from "../lib/stats";
import { getSessionHistory } from "../services/bowlingRepository";
import type { SessionSummary } from "../types/bowling";

const EMPTY: BowlingStats = {
  totalSessions: 0,
  totalGames: 0,
  completedGames: 0,
  averageScore: null,
  highGame: null,
  strikePct: null,
  sparePct: null,
  byAlley: []
};

const selectClass =
  "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-felt-700";

export function StatsView() {
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterAlley, setFilterAlley] = useState("");
  const [filterPattern, setFilterPattern] = useState("");
  const [filterLane, setFilterLane] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const h = await getSessionHistory();
        if (isMounted) setHistory(h);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load stats.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredHistory = useMemo(() => {
    if (!filterAlley && !filterPattern && !filterLane) return history;
    return filterSessionsBy(history, {
      alleyName: filterAlley || undefined,
      oilPattern: filterPattern || undefined,
      laneNumber: filterLane || undefined,
    });
  }, [history, filterAlley, filterPattern, filterLane]);

  const stats = useMemo(() => calculateStats(filteredHistory), [filteredHistory]);
  const leaves = useMemo(() => calculateCommonLeaves(filteredHistory), [filteredHistory]);

  const allAlleys = useMemo(
    () => [...new Set(history.map((s) => s.session.alley_name))].sort(),
    [history]
  );
  const allPatterns = useMemo(
    () =>
      [...new Set(history.flatMap((s) => (s.session.oil_pattern ? [s.session.oil_pattern] : [])))].sort(),
    [history]
  );
  const allLanes = useMemo(
    () =>
      [
        ...new Set(
          history.flatMap((s) => s.games.flatMap((g) => (g.lane_number ? [g.lane_number] : [])))
        ),
      ].sort(),
    [history]
  );

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-xl font-bold text-slate-950">Stats</h1>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {(allAlleys.length > 1 || allPatterns.length > 0 || allLanes.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allAlleys.length > 1 && (
            <select
              value={filterAlley}
              onChange={(e) => setFilterAlley(e.target.value)}
              className={selectClass}
            >
              <option value="">All alleys</option>
              {allAlleys.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
          {allPatterns.length > 0 && (
            <select
              value={filterPattern}
              onChange={(e) => setFilterPattern(e.target.value)}
              className={selectClass}
            >
              <option value="">All patterns</option>
              {allPatterns.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          {allLanes.length > 0 && (
            <select
              value={filterLane}
              onChange={(e) => setFilterLane(e.target.value)}
              className={selectClass}
            >
              <option value="">All lanes</option>
              {allLanes.map((l) => (
                <option key={l} value={l}>
                  Lane {l}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <Stats stats={isLoading ? EMPTY : stats} isLoading={isLoading} leaves={leaves} />
    </section>
  );
}
