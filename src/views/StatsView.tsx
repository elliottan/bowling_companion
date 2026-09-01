import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, MoreHorizontal, Share2, Target } from "lucide-react";
import { Stats } from "../components/Stats";
import {
  SessionFilterButton,
  SessionFilterChips,
  SessionFilterSheet
} from "../components/SessionFilterBar";
import { CollapsingHeader } from "../components/CollapsingHeader";
import { IconButton } from "../components/ui/IconButton";
import { ShareCardDialog } from "../components/ShareCardDialog";
import { AnchoredMenu, AnchoredMenuItem } from "../components/ui/AnchoredMenu";
import {
  calculateBallPerformance,
  calculateCommonLeaves,
  calculateSessionMetrics,
  calculateSessionTrend,
  calculateStats,
  type BowlingStats
} from "../lib/stats";
import { buildStatsCard, describeFilter } from "../lib/shareCard";
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
  firstBallAverage: null,
  byAlley: []
};

export function StatsView({
  onOpenSession,
  onOpenSessionGame,
  onOpenFrames,
  onOpenGameTrend
}: StatsViewProps) {
  const filters = useSessionFilters();
  const { filtered, activeLanes, isLoading } = filters;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Anchored to the control that opened it, so it needs that control's box.
  const [breakdownsAt, setBreakdownsAt] = useState<{ left: number; top: number } | null>(null);

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
  const sessionMetrics = useMemo(
    () => calculateSessionMetrics(filtered, activeLanes, handedness),
    [filtered, activeLanes, handedness]
  );
  const ballPerformance = useMemo(
    () => calculateBallPerformance(filtered, balls, activeLanes, handedness),
    [filtered, balls, activeLanes, handedness]
  );

  // The share card describes the filtered set, not the whole history: the
  // numbers on screen are the filtered ones, and a picture that silently
  // widened its scope would be a lie.
  const shareCard = useMemo(
    () =>
      buildStatsCard(
        stats,
        describeFilter({
          alley: filters.alley,
          pattern: filters.pattern,
          event: filters.event,
          gameNumber: filters.gameNumber,
          lanes: activeLanes
        })
      ),
    [stats, filters.alley, filters.pattern, filters.event, filters.gameNumber, activeLanes]
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    return el ? restoreScroll(el, "stats:scroll") : undefined;
  }, []);

  return (
    <section className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 pt-3 sm:px-6 sm:pt-5">
      <CollapsingHeader scrollerRef={scrollerRef}>
        <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Stats</h1>
        <div className="flex shrink-0 items-center gap-1">
          <SessionFilterButton filters={filters} onOpen={() => setFiltersOpen(true)} />
          {/* These used to be rows under the ball table, which is the bottom of
              a long scroll and nobody found them (ADR-063). One control, in the
              header, listing where it can go. */}
          <IconButton
            label="More"
            variant="round"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              // Right-aligned under the button: the menu is 176px wide and the
              // button sits within that of the trailing edge.
              setBreakdownsAt({ left: Math.max(8, box.right - 176), top: box.bottom + 6 });
            }}
          >
            <MoreHorizontal size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {breakdownsAt && (
        <AnchoredMenu
          left={breakdownsAt.left}
          top={breakdownsAt.top}
          onClose={() => setBreakdownsAt(null)}
        >
          <AnchoredMenuItem
            icon={LayoutGrid}
            onClick={() => {
              setBreakdownsAt(null);
              onOpenGameTrend();
            }}
          >
            Game by game
          </AnchoredMenuItem>
          <AnchoredMenuItem
            icon={Target}
            onClick={() => {
              setBreakdownsAt(null);
              onOpenFrames();
            }}
          >
            Open frames
          </AnchoredMenuItem>
          <AnchoredMenuItem
            icon={Share2}
            onClick={() => {
              setBreakdownsAt(null);
              setShareOpen(true);
            }}
          >
            Share these stats
          </AnchoredMenuItem>
        </AnchoredMenu>
      )}

        <SessionFilterChips filters={filters} />
      </CollapsingHeader>
      {filtersOpen && (
        <SessionFilterSheet filters={filters} onClose={() => setFiltersOpen(false)} />
      )}

      <ShareCardDialog open={shareOpen} card={shareCard} onClose={() => setShareOpen(false)} />

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
            sessionMetrics={sessionMetrics}
            memoryKey="history"
            onOpenSession={onOpenSession}
            onOpenGame={onOpenSessionGame}
          />

        </div>
      </div>
    </section>
  );
}
