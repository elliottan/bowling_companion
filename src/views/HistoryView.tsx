import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SessionHistory } from "../components/SessionHistory";
import { Stats } from "../components/Stats";
import { SwipePanes } from "../components/SwipePanes";
import {
  calculateBallUsage,
  calculateCommonLeaves,
  calculateStats,
  filterSessionsBy,
  type BowlingStats
} from "../lib/stats";
import { getSessionHistory } from "../services/bowlingRepository";
import { getBalls } from "../services/ballRepository";
import type { Ball, SessionSummary } from "../types/bowling";

interface HistoryViewProps {
  onOpenSession: (sessionId: number) => void;
  activeSessionId: number | null;
  onSessionDeleted?: (sessionId: number) => void;
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
  "h-8 max-w-[46%] rounded-full border border-slate-300 bg-white px-3 text-xs font-medium outline-none focus:border-felt-700";

export function HistoryView({ onOpenSession, activeSessionId, onSessionDeleted }: HistoryViewProps) {
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
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

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [h, b] = await Promise.all([getSessionHistory(), getBalls()]);
      setHistory(h);
      setBalls(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load history.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
  const ballUsage = useMemo(
    () => calculateBallUsage(filteredHistory, balls, selectedLanes),
    [filteredHistory, balls, selectedLanes]
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
  // Lanes are only meaningful within a location, so we offer them as a filter
  // only once an alley is picked — and only the lanes seen at that alley.
  const allLanes = useMemo(() => {
    if (!filterAlley) return [];
    return [
      ...new Set(
        history
          .filter((s) => s.session.alley_name === filterAlley)
          .flatMap((s) =>
            s.games.flatMap((g) => g.lanes ?? (g.lane_number ? [g.lane_number] : []))
          )
      )
    ].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }, [history, filterAlley]);

  // Drop any selected lane when the location changes (a lane from another alley
  // would otherwise stay selected and filter everything out).
  useEffect(() => {
    setSelectedLanes([]);
  }, [filterAlley]);

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
    <section className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 pt-5 sm:px-6 sm:pt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-950">History</h1>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          {(["sessions", "stats"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPane(p)}
              className={`h-7 rounded-md px-3 text-xs font-semibold capitalize ${
                pane === p ? "bg-white text-felt-700 shadow-sm" : "text-slate-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {history.length > 0 && (
        <div className="mb-3 flex gap-2">
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
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Lanes</span>
          {allLanes.map((l) => {
            const on = selectedLanes.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggleLane(l)}
                className={`h-7 rounded-md border px-2.5 text-xs font-semibold ${
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
              className="h-7 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <SwipePanes
        className="-mx-3 min-h-0 flex-1 sm:-mx-6"
        index={PANES.indexOf(pane)}
        onIndexChange={(i) => setPane(PANES[i])}
        panes={[
          <div key="sessions" className="px-3 pb-5 sm:px-6 sm:pb-8">
            <SessionHistory
              sessions={sessionList.slice(0, visibleCount)}
              isLoading={isLoading}
              onOpenSession={onOpenSession}
              activeSessionId={activeSessionId}
              onSessionChanged={() => void load()}
              onSessionDeleted={onSessionDeleted}
            />
            <div ref={sentinelRef} className="h-6" aria-hidden="true" />
          </div>,
          <div key="stats" className="px-3 pb-5 sm:px-6 sm:pb-8">
            <Stats stats={isLoading ? EMPTY : stats} isLoading={isLoading} leaves={leaves} ballUsage={ballUsage} />
          </div>
        ]}
      />
    </section>
  );
}
