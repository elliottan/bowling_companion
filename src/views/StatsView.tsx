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
  const [selectedLanes, setSelectedLanes] = useState<string[]>([]);

  function toggleLane(lane: string) {
    setSelectedLanes((prev) =>
      prev.includes(lane) ? prev.filter((l) => l !== lane) : [...prev, lane]
    );
  }

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

  // Alley + pattern filter at the session level; lanes are applied at the
  // frame level inside the stats calculators (correct for cross-lane games).
  const filteredHistory = useMemo(() => {
    if (!filterAlley && !filterPattern) return history;
    return filterSessionsBy(history, {
      alleyName: filterAlley || undefined,
      oilPattern: filterPattern || undefined,
    });
  }, [history, filterAlley, filterPattern]);

  const stats = useMemo(
    () => calculateStats(filteredHistory, selectedLanes),
    [filteredHistory, selectedLanes]
  );
  const leaves = useMemo(
    () => calculateCommonLeaves(filteredHistory, selectedLanes),
    [filteredHistory, selectedLanes]
  );

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
          history.flatMap((s) =>
            s.games.flatMap((g) => g.lanes ?? (g.lane_number ? [g.lane_number] : []))
          )
        ),
      ].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
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

      {history.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {/* Location → Oil pattern → Lanes */}
          <select
            value={filterAlley}
            onChange={(e) => setFilterAlley(e.target.value)}
            className={selectClass}
          >
            <option value="">All locations</option>
            {allAlleys.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
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
        </div>
      )}

      {allLanes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lanes</span>
          {allLanes.map((l) => {
            const on = selectedLanes.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggleLane(l)}
                className={`h-8 rounded-md border px-3 text-xs font-semibold ${
                  on ? "border-felt-700 bg-felt-700 text-white" : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {l}
              </button>
            );
          })}
          {selectedLanes.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedLanes([])}
              className="h-8 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <Stats stats={isLoading ? EMPTY : stats} isLoading={isLoading} leaves={leaves} />
    </section>
  );
}
