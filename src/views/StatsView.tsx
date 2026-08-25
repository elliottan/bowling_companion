import { useEffect, useMemo, useRef } from "react";
import { ChevronRight, History, LayoutGrid, Target } from "lucide-react";
import { Stats } from "../components/Stats";
import { SessionFilterBar } from "../components/SessionFilterBar";
import { IconButton } from "../components/ui/IconButton";
import { GROUP_HEADING } from "../components/ui/typography";
import {
  calculateBallPerformance,
  calculateCommonLeaves,
  calculateSessionTrend,
  calculateStats,
  type BowlingStats
} from "../lib/stats";
import { getBalls } from "../services/ballRepository";
import { useLiveQuery } from "dexie-react-hooks";
import { useHandedness } from "../lib/handednessContext";
import { rememberScroll, restoreScroll } from "../lib/viewMemory";
import { useSessionFilters } from "./useSessionFilters";
import type { Ball } from "../types/bowling";

interface StatsViewProps {
  onOpenSession: (sessionId: number) => void;
  /** Open one game of a session directly, from a stats drill-down, carrying
   *  the ball it was about. */
  onOpenSessionGame?: (sessionId: number, gameId: number, ballId?: number) => void;
  /** Cross to the History tab, carrying the filter that is on screen. */
  onViewSessions: () => void;
  onOpenFrames: () => void;
  onOpenGameTrend: () => void;
}

const NO_BALLS: Ball[] = [];

const EMPTY: BowlingStats = {
  totalSessions: 0,
  totalGames: 0,
  completedGames: 0,
  averageScore: null,
  highGame: null,
  lowGame: null,
  strikePct: null,
  sparePct: null,
  pocketPct: null,
  carryPct: null,
  byAlley: []
};

export function StatsView({
  onOpenSession,
  onOpenSessionGame,
  onViewSessions,
  onOpenFrames,
  onOpenGameTrend
}: StatsViewProps) {
  const filters = useSessionFilters();
  const { filtered, activeLanes, isLoading, history } = filters;

  const liveBalls = useLiveQuery(() => getBalls());
  const balls = liveBalls ?? NO_BALLS;
  const handedness = useHandedness();

  const stats = useMemo(
    () => calculateStats(filtered, activeLanes, handedness),
    [filtered, activeLanes, handedness]
  );
  const leaves = useMemo(
    () => calculateCommonLeaves(filtered, activeLanes),
    [filtered, activeLanes]
  );
  const sessionTrend = useMemo(
    () => calculateSessionTrend(filtered, activeLanes),
    [filtered, activeLanes]
  );
  const ballPerformance = useMemo(
    () => calculateBallPerformance(filtered, balls, activeLanes, handedness),
    [filtered, balls, activeLanes, handedness]
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    return el ? restoreScroll(el, "stats:scroll") : undefined;
  }, []);

  return (
    <section className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 pt-3 sm:px-6 sm:pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Stats</h1>
        {/* The twin of History's own crossing control (ADR-057). */}
        <IconButton label="View sessions" variant="round" onClick={onViewSessions}>
          <History size={20} aria-hidden="true" />
        </IconButton>
      </div>

      <SessionFilterBar filters={filters} />

      <div
        ref={scrollerRef}
        onScroll={(e) => rememberScroll("stats:scroll", e.currentTarget.scrollTop)}
        className="-mx-3 min-h-0 flex-1 overflow-y-auto overscroll-contain sm:-mx-6"
      >
        <div className="px-3 pb-5 sm:px-6 sm:pb-8">
          <Stats
            stats={isLoading ? EMPTY : stats}
            isLoading={isLoading}
            leaves={leaves}
            ballPerformance={ballPerformance}
            sessionTrend={sessionTrend}
            memoryKey="history"
            onOpenSession={onOpenSession}
            onOpenGame={onOpenSessionGame}
          />

          {history.length > 0 && (
            <div className="mt-3">
              <h2 className={`${GROUP_HEADING} mb-2`}>Break it down</h2>
              <div className="space-y-2">
                <AnalysisRow
                  icon={Target}
                  title="Open frames"
                  detail="How often you go open, and on what"
                  onClick={onOpenFrames}
                />
                <AnalysisRow
                  icon={LayoutGrid}
                  title="Game by game"
                  detail="First game against last, on the same night"
                  onClick={onOpenGameTrend}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** A list row that opens a deeper cut of the same filtered sessions. One tap
 *  target, per docs/DESIGN-LANGUAGE.md §4. */
function AnalysisRow({
  icon: Icon,
  title,
  detail,
  onClick
}: {
  icon: typeof Target;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-edge bg-surface p-3 text-left shadow-sm hover:border-accent-fill"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-secondary">{detail}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
    </button>
  );
}
