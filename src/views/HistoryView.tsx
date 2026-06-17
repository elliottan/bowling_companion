import { useEffect, useMemo, useRef, useState } from "react";
import { SessionHistory } from "../components/SessionHistory";
import { Stats } from "../components/Stats";
import { SwipePanes } from "../components/SwipePanes";
import {
  calculateCommonLeaves,
  calculateStats,
  filterSessionsBy,
  type BowlingStats
} from "../lib/stats";
import { getSessionHistory } from "../services/bowlingRepository";
import type { SessionSummary } from "../types/bowling";

interface HistoryViewProps {
  onOpenSession: (sessionId: number) => void;
  activeSessionId: number | null;
}

type Pane = "sessions" | "stats";

const PAGE = 15; // sessions loaded per infinite-scroll step
const PANES: Pane[] = ["sessions", "stats"];

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

export function HistoryView({ onOpenSession, activeSessionId }: HistoryViewProps) {
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pane, setPane] = useState<Pane>("sessions");

  const [filterAlley, setFilterAlley] = useState("");
  const [filterPattern, setFilterPattern] = useState("");
  const [selectedLanes, setSelectedLanes] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
        if (isMounted) setError(err instanceof Error ? err.message : "Unable to load history.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // Alley + pattern filter at the session level; lanes apply at the frame level
  // inside the stats calculators (correct for cross-lane games).
  const filteredHistory = useMemo(() => {
    if (!filterAlley && !filterPattern) return history;
    return filterSessionsBy(history, {
      alleyName: filterAlley || undefined,
      oilPattern: filterPattern || undefined
    });
  }, [history, filterAlley, filterPattern]);

  // For the session list, a lane filter keeps sessions that played a selected lane.
  const sessionList = useMemo(() => {
    if (selectedLanes.length === 0) return filteredHistory;
    return filteredHistory.filter((s) =>
      s.games.some((g) =>
        (g.lanes ?? (g.lane_number ? [g.lane_number] : [])).some((l) => selectedLanes.includes(l))
      )
    );
  }, [filteredHistory, selectedLanes]);

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
        )
      ].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    [history]
  );

  // Reset the window whenever the filtered list changes.
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [sessionList]);

  // Infinite scroll: load PAGE more when the sentinel scrolls into view.
  useEffect(() => {
    if (pane !== "sessions") return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((c) => (c < sessionList.length ? c + PAGE : c));
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [pane, sessionList.length]);

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-xl font-bold text-slate-950">History</h1>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {history.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <select value={filterAlley} onChange={(e) => setFilterAlley(e.target.value)} className={selectClass}>
            <option value="">All locations</option>
            {allAlleys.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select value={filterPattern} onChange={(e) => setFilterPattern(e.target.value)} className={selectClass}>
            <option value="">All patterns</option>
            {allPatterns.map((p) => (
              <option key={p} value={p}>{p}</option>
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

      {/* Sessions / Stats toggle */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {(["sessions", "stats"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPane(p)}
            className={`h-9 rounded-md text-sm font-semibold capitalize ${
              pane === p ? "bg-white text-felt-700 shadow-sm" : "text-slate-600"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <SwipePanes
        className="min-h-[70vh]"
        index={PANES.indexOf(pane)}
        onIndexChange={(i) => setPane(PANES[i])}
        panes={[
          <div key="sessions">
            <SessionHistory
              sessions={sessionList.slice(0, visibleCount)}
              isLoading={isLoading}
              onOpenSession={onOpenSession}
              activeSessionId={activeSessionId}
            />
            <div ref={sentinelRef} className="h-6" aria-hidden="true" />
          </div>,
          <Stats key="stats" stats={isLoading ? EMPTY : stats} isLoading={isLoading} leaves={leaves} />
        ]}
      />
    </section>
  );
}
